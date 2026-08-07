import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set your password — Baseerah" },
      {
        name: "description",
        content:
          "Set a password to claim the Baseerah screening account attached to your subscription email.",
      },
      { property: "og:title", content: "Set your password — Baseerah" },
      {
        property: "og:description",
        content: "Claim the account attached to your subscription email.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) setReady(true);
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password set. Welcome back.");
      navigate({ to: "/pipeline" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-20">
      <section className="panel px-6 py-7">
        <h1 className="text-2xl">Set your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your subscription email already has an account here. Choose a password to take control
          of it — no second account needed.
        </p>

        {ready ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Open this page from the link in your email to set a password.
          </p>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Link to="/auth" search={{ mode: "signin" }} className="hover:underline">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
