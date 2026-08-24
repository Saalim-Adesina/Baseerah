// Gmail connection state, shared by the settings panel, the pipeline strip and
// the onboarding step. Kept out of the component file so React Fast Refresh can
// still hot-swap those components (a module that exports both loses that).
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getGmailStatus, startGmailConnect } from "@/lib/gmail.functions";

export type GmailStatus = {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
};

/**
 * Reads the Gmail connection once and keeps it in component state. Exposed so
 * the pipeline strip and the settings panel show the same thing.
 */
export function useGmailStatus() {
  const load = useServerFn(getGmailStatus);
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setStatus(await load());
    } catch (error) {
      // A failed status read must not break the page it sits on — the connect
      // button stays available and the real error surfaces when it is used.
      console.error(error);
      setStatus({ connected: false, email: null, connectedAt: null });
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}

/** Sends the browser to Google's consent screen. */
export function useGmailConnect() {
  const start = useServerFn(startGmailConnect);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { authorizationUrl } = await start();
      window.location.href = authorizationUrl;
    } catch (error) {
      setConnecting(false);
      toast.error(error instanceof Error ? error.message : "Could not start the Gmail connect");
    }
  }, [start]);

  return { connect, connecting };
}
