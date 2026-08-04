import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Join a screening team — Meridian" },
      {
        name: "description",
        content:
          "Accept your Meridian seat invitation and join your fund's shared deal screening pipeline.",
      },
      { property: "og:title", content: "Join a screening team — Meridian" },
      {
        property: "og:description",
        content: "Accept your seat and join the shared deal screening pipeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitePage,
});

type Preview = {
  email: string;
  role: string;
  status: string;
  owner_name: string | null;
};

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [{ data: pv }, { data: auth }] = await Promise.all([
        supabase.rpc("team_invite_preview", { _token: token }),
        supabase.auth.getUser(),
      ]);
      if (!active) return;
      setPreview((pv as unknown as Preview | null) ?? null);
      setSessionEmail(auth.user?.email ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const accept = useCallback(async () => {
    const { data, error } = await supabase.rpc("accept_team_invite", { _token: token });
    if (error) {
      toast.error(error.message);
      return false;
    }
    const res = data as unknown as { ok: boolean; reason?: string; invited_email?: string };
    if (!res?.ok) {
      toast.error(
        res?.reason === "email_mismatch"
          ? `This invite is for ${res.invited_email}. Sign in with that address.`
          : res?.reason === "invalid_token"
            ? "This invite link is no longer valid."
            : "Sign in to accept this invite.",
      );
      return false;
    }
    toast.success("Seat claimed — welcome to the pipeline.");
    void navigate({ to: "/pipeline" });
    return true;
  }, [token, navigate]);

  // Already signed in with the invited address — claim it immediately.
  useEffect(() => {
    if (!loading && preview && sessionEmail?.toLowerCase() === preview.email.toLowerCase()) {
      void accept();
    }
  }, [loading, preview, sessionEmail, accept]);

  async function createAccountAndAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    if (password.length < 8) {
      toast.error("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: preview.email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/invite/${token}`,
        data: { full_name: fullName || null, investor_type: "angel" },
      },
    });
    if (error) {
      setBusy(false);
      if (error.message.toLowerCase().includes("registered")) {
        toast.error("You already have an account — sign in to claim this seat.");
        void navigate({ to: "/auth", search: { mode: "signin" } });
        return;
      }
      toast.error(error.message);
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) await accept();
    else toast.success("Check your inbox to confirm your email, then reopen this invite link.");
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-5 py-12">
      <p className="label-caps">Team invitation</p>
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Checking your invite…</p>
      ) : !preview ? (
        <>
          <h1 className="mt-1 text-4xl">Invite not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link has expired or the seat was released. Ask the account owner to send a fresh
            invite.
          </p>
          <Link to="/" className="mt-6 text-sm text-primary underline">
            Back to Meridian
          </Link>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-4xl">
            Join {preview.owner_name ?? "the team"} on Meridian
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You've been given a <span className="text-foreground">{preview.role}</span> seat for{" "}
            <span className="text-foreground">{preview.email}</span>. Accept to screen deals in the
            same pipeline.
          </p>

          {sessionEmail && sessionEmail.toLowerCase() !== preview.email.toLowerCase() ? (
            <div className="panel mt-6 px-5 py-5 text-sm text-muted-foreground">
              You're signed in as {sessionEmail}. This invite belongs to {preview.email} — sign out
              and sign back in with that address.
              <Button
                variant="outline"
                className="mt-4"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setSessionEmail(null);
                }}
              >
                Sign out
              </Button>
            </div>
          ) : sessionEmail ? (
            <Button className="mt-6" onClick={() => void accept()}>
              Accept seat
            </Button>
          ) : (
            <form onSubmit={createAccountAndAccept} className="panel mt-6 space-y-4 px-5 py-5">
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  className="mt-1"
                  value={fullName}
                  maxLength={100}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div>
                <Label htmlFor="password">Create a password</Label>
                <Input
                  id="password"
                  type="password"
                  className="mt-1"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Accept seat &amp; create account
              </Button>
              <p className="text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link to="/auth" search={{ mode: "signin" }} className="text-primary underline">
                  Sign in
                </Link>{" "}
                with {preview.email}, then reopen this link.
              </p>
            </form>
          )}
        </>
      )}
    </main>
  );
}
