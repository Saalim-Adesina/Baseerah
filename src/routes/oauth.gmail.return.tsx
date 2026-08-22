import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { completeGmailConnect } from "@/lib/gmail.functions";

/**
 * Google redirects here after the Gmail consent screen. The URL is registered
 * as the OAuth client's authorized redirect URI, so the path must stay
 * `/oauth/gmail/return` (see GMAIL_RETURN_PATH).
 */
export const Route = createFileRoute("/oauth/gmail/return")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search["code"] === "string" ? search["code"] : undefined,
    state: typeof search["state"] === "string" ? search["state"] : undefined,
    error: typeof search["error"] === "string" ? search["error"] : undefined,
  }),
  component: GmailReturnPage,
});

function GmailReturnPage() {
  const { code, state, error } = useSearch({ from: "/oauth/gmail/return" });
  const navigate = useNavigate();
  const complete = useServerFn(completeGmailConnect);
  const [message, setMessage] = useState("Finishing the Gmail connection…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      if (error) {
        toast.error(
          error === "access_denied" ? "Gmail connection cancelled." : `Google returned: ${error}`,
        );
        navigate({ to: "/pipeline", replace: true });
        return;
      }
      if (!code || !state) {
        toast.error("Google did not return an authorization code.");
        navigate({ to: "/pipeline", replace: true });
        return;
      }

      try {
        const result = await complete({ data: { code, state } });
        if (cancelled) return;
        toast.success(result.email ? `Gmail connected as ${result.email}.` : "Gmail connected.");
      } catch (err) {
        if (cancelled) return;
        setMessage("Could not connect Gmail.");
        toast.error(err instanceof Error ? err.message : "Could not connect Gmail.");
      }
      navigate({ to: "/pipeline", replace: true });
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [code, state, error, complete, navigate]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-5">
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
