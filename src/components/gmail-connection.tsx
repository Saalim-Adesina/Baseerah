import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, MailCheck, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { disconnectGmail } from "@/lib/gmail.functions";
import { useGmailConnect, useGmailStatus } from "@/hooks/use-gmail";
import {
  DEFAULT_SCAN_LIMIT,
  SCAN_LIMIT_CHOICES,
  getMySettings,
  saveMySettings,
} from "@/lib/settings.functions";

/** Full connection panel: connect/disconnect plus the scan size preference. */
export function GmailConnectionPanel() {
  const { status, loading, refresh } = useGmailStatus();
  const { connect, connecting } = useGmailConnect();
  const revoke = useServerFn(disconnectGmail);
  const loadSettings = useServerFn(getMySettings);
  const persistSettings = useServerFn(saveMySettings);

  const [scanLimit, setScanLimit] = useState<number>(DEFAULT_SCAN_LIMIT);
  const [savingLimit, setSavingLimit] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await loadSettings();
        setScanLimit(settings.gmailScanLimit);
      } catch (error) {
        console.error(error);
      }
    })();
  }, [loadSettings]);

  const changeLimit = async (next: number) => {
    const previous = scanLimit;
    setScanLimit(next);
    setSavingLimit(true);
    try {
      await persistSettings({ data: { gmailScanLimit: next } });
      toast.success(`Scans will read up to ${next} messages`);
    } catch (error) {
      setScanLimit(previous);
      toast.error(error instanceof Error ? error.message : "Could not save the scan size");
    } finally {
      setSavingLimit(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await revoke();
      toast.success("Gmail disconnected");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect Gmail");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="panel px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {status?.connected ? (
            <MailCheck className="mt-0.5 h-5 w-5 text-[var(--signal-strong)]" />
          ) : (
            <Mail className="mt-0.5 h-5 w-5 text-primary" />
          )}
          <div>
            <p className="label-caps">Deal inbox</p>
            {loading ? (
              <p className="mt-1 text-sm text-muted-foreground">Checking connection…</p>
            ) : status?.connected ? (
              <>
                <p className="mt-1 font-mono text-sm">{status.email ?? "Connected"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Baseerah reads deck attachments from this mailbox. Read-only — nothing is sent,
                  deleted or modified.
                </p>
              </>
            ) : (
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Connect the mailbox your deals arrive in. Baseerah reads recent messages with deck
                attachments and turns them into scored deals.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status?.connected ? (
            <>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                Connected
              </Badge>
              <Button variant="outline" size="sm" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unplug className="mr-1 h-3.5 w-3.5" />
                )}
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={connect} disabled={connecting || loading}>
              {connecting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Connect Gmail
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="label-caps">Messages per scan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            How far back a scan reads. Larger scans take longer — they run in batches so a long scan
            can't time out.
          </p>
        </div>
        <Select
          value={String(scanLimit)}
          onValueChange={(value) => void changeLimit(Number(value))}
          disabled={savingLimit}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCAN_LIMIT_CHOICES.map((choice) => (
              <SelectItem key={choice} value={String(choice)}>
                {choice}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
