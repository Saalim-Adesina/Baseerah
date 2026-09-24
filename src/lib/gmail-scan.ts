import type { GmailDealCandidate } from "@/lib/types";

/**
 * One scan pass costs a Document Intelligence analysis per attachment, and that
 * call polls for up to four minutes (`azure.server.ts`). Vercel caps a function
 * at 300s, so a single request for 100 messages cannot finish. Instead the
 * client walks the mailbox in small batches and carries the message ids it has
 * already seen into the next request via `skipMessageIds`.
 */
export const SCAN_BATCH_SIZE = 10;

/** Hard stop so a mailbox with nothing but unsupported attachments terminates. */
const MAX_EMPTY_PASSES = 2;

export type ScanProgress = {
  /** Candidates found so far, in the order Gmail returned them. */
  candidates: GmailDealCandidate[];
  /** Messages the server has walked across every pass. */
  scanned: number;
  /** Ceiling the user asked for. */
  target: number;
  done: boolean;
};

type ScanBatch = (input: {
  data: { max: number; skipMessageIds: string[] };
}) => Promise<{ scanned: number; candidates: GmailDealCandidate[] }>;

/**
 * Walks the mailbox in batches until `target` candidates are collected or the
 * mailbox runs dry. `alreadyImported` seeds the skip list so a re-scan does not
 * re-extract decks that are already deals.
 */
export async function scanInBatches(options: {
  scan: ScanBatch;
  target: number;
  alreadyImported?: string[];
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
}): Promise<ScanProgress> {
  const { scan, target, onProgress, signal } = options;

  const seen = new Set(options.alreadyImported ?? []);
  const candidates: GmailDealCandidate[] = [];
  let scanned = 0;
  let emptyPasses = 0;

  while (candidates.length < target) {
    if (signal?.aborted) break;

    const remaining = target - candidates.length;
    const batch = await scan({
      data: {
        max: Math.min(SCAN_BATCH_SIZE, remaining),
        // The server caps this at 500 ids; past that the oldest are the least
        // useful to protect, so keep the most recently seen.
        skipMessageIds: [...seen].slice(-500),
      },
    });

    scanned += batch.scanned;
    for (const candidate of batch.candidates) {
      if (seen.has(candidate.messageId)) continue;
      seen.add(candidate.messageId);
      candidates.push(candidate);
    }

    onProgress?.({ candidates: [...candidates], scanned, target, done: false });

    // A pass that returns no new candidates means the query is exhausted. Two
    // in a row is the stop condition — one alone can happen when every message
    // in a batch carried an unsupported attachment.
    if (batch.candidates.length === 0) {
      emptyPasses += 1;
      if (emptyPasses >= MAX_EMPTY_PASSES) break;
    } else {
      emptyPasses = 0;
    }

    // Nothing left to page through.
    if (batch.scanned === 0) break;
  }

  const result: ScanProgress = { candidates, scanned, target, done: true };
  onProgress?.(result);
  return result;
}
