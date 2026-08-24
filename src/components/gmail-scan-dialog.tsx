import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { scanGmailInbox } from "@/lib/gmail.functions";
import { createDeal, listImportedGmailMessageIds } from "@/lib/deals.functions";
import { getMySettings, DEFAULT_SCAN_LIMIT } from "@/lib/settings.functions";
import { scanInBatches, type ScanProgress } from "@/lib/gmail-scan";
import type { GmailDealCandidate } from "@/lib/types";

const PERSONAL_MAIL_DOMAINS = /^(gmail|outlook|hotmail|yahoo|proton|protonmail|icloud|me)$/i;

/** Best guess at a company name from the message, for the user to correct later. */
function companyFrom(candidate: GmailDealCandidate) {
  const domain = candidate.from.split("@")[1]?.split(".")[0] ?? "";
  const fromDomain = domain && !PERSONAL_MAIL_DOMAINS.test(domain) ? domain : "";
  return candidate.fromName.trim() || fromDomain || candidate.subject.trim() || candidate.filename;
}

export function GmailScanDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}) {
  const scan = useServerFn(scanGmailInbox);
  const loadSettings = useServerFn(getMySettings);
  const loadImported = useServerFn(listImportedGmailMessageIds);
  const create = useServerFn(createDeal);

  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  // Closing the dialog abandons a scan in flight: the outstanding request still
  // resolves on the server, its result is simply dropped.
  useEffect(() => {
    if (!open) abortRef.current?.abort();
    return () => abortRef.current?.abort();
  }, [open]);

  const run = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setProgress(null);
    try {
      const [settings, alreadyImported] = await Promise.all([
        loadSettings().catch(() => ({ gmailScanLimit: DEFAULT_SCAN_LIMIT })),
        loadImported().catch(() => [] as string[]),
      ]);

      await scanInBatches({
        scan: (input) => scan(input),
        target: settings.gmailScanLimit,
        alreadyImported,
        onProgress: setProgress,
        signal: controller.signal,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(error instanceof Error ? error.message : "The inbox scan failed");
      }
    } finally {
      setRunning(false);
    }
  }, [loadImported, loadSettings, scan]);

  useEffect(() => {
    if (open && !progress && !running) void run();
    // Deliberately keyed on `open` alone: this kicks off one scan per opening,
    // and `run` resetting `progress` would otherwise retrigger it forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const importCandidate = async (candidate: GmailDealCandidate) => {
    setImporting(candidate.messageId);
    try {
      await create({
        data: {
          deal: {
            company: companyFrom(candidate),
            website: "",
            oneLiner: candidate.subject,
            sector: "",
            geography: "",
            round: "Seed",
            raising: "",
            valuation: "",
            traction: "",
            unitEconomics: "",
            competition: "",
            founders: [],
            meetingNotes: "",
            personalBias: "",
            deckText: candidate.deckText,
            deckFileName: candidate.filename,
            status: "new",
          },
          gmailMessageId: candidate.messageId,
        },
      });
      setImported((previous) => new Set(previous).add(candidate.messageId));
      onImported?.();
      toast.success(`${companyFrom(candidate)} added to pipeline`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this deal");
    } finally {
      setImporting(null);
    }
  };

  const candidates = progress?.candidates ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Decks in your inbox</DialogTitle>
          <DialogDescription>
            {running
              ? `Reading your mailbox in batches — ${candidates.length} found so far.`
              : candidates.length === 0
                ? "No new deck attachments found. Decks already imported are skipped."
                : `${candidates.length} deck attachment(s) found.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {candidates.map((candidate) => {
            const done = imported.has(candidate.messageId);
            return (
              <div key={candidate.messageId} className="panel px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{companyFrom(candidate)}</p>
                    <p className="truncate text-xs text-muted-foreground">{candidate.subject}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {candidate.filename} · {candidate.from}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={done ? "outline" : "default"}
                    disabled={done || importing === candidate.messageId}
                    onClick={() => void importCandidate(candidate)}
                  >
                    {importing === candidate.messageId ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {done ? "Imported" : "Import"}
                  </Button>
                </div>
                {candidate.extractionError ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--signal-weak)]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Could not read the attachment: {candidate.extractionError}. It can still be
                    imported and filled in by hand.
                  </p>
                ) : null}
              </div>
            );
          })}

          {running ? (
            <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanned {progress?.scanned ?? 0} of up to {progress?.target ?? "…"} messages
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {imported.size} imported
          </Badge>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void run()} disabled={running}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Scan again
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
