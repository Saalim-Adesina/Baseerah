import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { PasswordChecklist } from "@/components/password-checklist";
import { passwordError } from "@/lib/password";

import { checkEmailForSignup, syncMySubscriptionFromPolar } from "@/lib/account-link.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Create your angel investor account — Baseerah" },
      {
        name: "description",
        content:
          "Sign up to screen your angel deal inbox: forward decks, get thesis-scored triage and pass the rest politely.",
      },
      { property: "og:title", content: "Create your angel investor account — Baseerah" },
      {
        property: "og:description",
        content: "Screen hundreds of inbound decks a month against your personal angel thesis.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "signin" ? ("signin" as const) : ("signup" as const),
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(mode !== "signin");

  // The header links to /auth?mode=signin and /auth?mode=signup. When the page
  // is already mounted, the search param change must drive the form.
  useEffect(() => {
    setIsSignUp(mode !== "signin");
    setClaimNotice(null);
    setFormError(null);
  }, [mode]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function sendReset(target: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password link sent — check your email to set a password.");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      if (isSignUp) {
        // Password rules apply to new accounts only: existing passwords
        // predate them and must still be able to sign in.
        const invalid = passwordError(password);
        if (invalid) {
          setFormError(invalid);
          return;
        }
        // Email is the primary key across billing and the app: never let a
        // second account be created for an email that already has either.
        const check = await checkEmailForSignup({ data: { email } });
        if (check.action !== "signup") {
          setIsSignUp(false);
          setClaimNotice(check.message);
          setFormError(check.message);
          if (check.action === "reset") await sendReset(email);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
            data: { investor_type: "angel" },
          },
        });
        if (error) throw error;
        // Verification happens at the end of onboarding, not before it: if the
        // signup didn't return a session, sign in straight away so the guided
        // setup isn't skipped.
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInError) {
            toast.success("Check your email to confirm your account.");
            return;
          }
        }
        toast.success("Welcome aboard.");
        navigate({ to: "/onboarding" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/pipeline" });
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    // The Lovable auth broker only accepts hosted origins, so a local dev server
    // cannot use it. Locally, go straight to the backend's own Google flow.
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    if (isLocal) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/pipeline` },
      });
      if (error) {
        setFormError(
          "Google sign-in isn't configured for localhost. Use email and password locally, or add Google OAuth credentials in Lovable Cloud Auth Settings.",
        );
      }
      return;
    }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setFormError("Google sign-in failed. Try again or use your email address.");
      return;
    }
    if (result.redirected) return;

    // Google can create the account without passing through the signup gate,
    // so reconcile against Polar by email right away: if this person already
    // bought a plan, their subscription links to this account instead of
    // leaving an orphan on the billing side.
    try {
      await syncMySubscriptionFromPolar();
    } catch {
      // Billing sync is best effort — the billing page retries on every visit.
    }
    navigate({ to: "/pipeline" });
  }

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center px-5 py-16">
      <section className="panel px-6 py-7">
        <h1 className="text-2xl">{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignUp
            ? "Set up your screening desk in a couple of minutes."
            : "Sign in to your screening desk."}
        </p>

        <Button variant="outline" className="mt-6 w-full" onClick={handleGoogle} type="button">
          Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or email{" "}
          <span className="h-px flex-1 bg-border" />
        </div>

        {claimNotice ? (
          <div className="mb-5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm">
            {claimNotice}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourfund.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {isSignUp ? (
              <div className="pt-1.5">
                <PasswordChecklist value={password} />
              </div>
            ) : null}
          </div>

          {!isSignUp ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                if (!email) {
                  toast.error("Enter your email first.");
                  return;
                }
                void sendReset(email);
              }}
            >
              Forgot or never set a password?
            </button>
          ) : null}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Working…" : isSignUp ? "Create account" : "Sign in"}
          </Button>

          {formError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          ) : null}
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {isSignUp ? "Already screening with Baseerah?" : "New here?"}{" "}
          <button
            type="button"
            className="cursor-pointer text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setClaimNotice(null);
              setFormError(null);
              setIsSignUp((value) => !value);
            }}
          >
            {isSignUp ? "Sign in" : "Create an account"}
          </button>
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">
            Back to overview
          </Link>
        </p>
      </section>
    </main>
  );
}
