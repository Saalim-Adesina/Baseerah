import { describe, expect, it, vi } from "vitest";
import { SCAN_BATCH_SIZE, scanInBatches } from "@/lib/gmail-scan";
import type { GmailDealCandidate } from "@/lib/types";

function candidate(id: string): GmailDealCandidate {
  return {
    messageId: id,
    subject: `Deck ${id}`,
    from: `founder@${id}.com`,
    fromName: id,
    receivedAt: 0,
    snippet: "",
    filename: `${id}.pdf`,
    deckText: "content",
  };
}

/** A mailbox that hands out candidates in pages, honouring the skip list. */
function mailbox(ids: string[]) {
  return vi.fn(async ({ data }: { data: { max: number; skipMessageIds: string[] } }) => {
    const skip = new Set(data.skipMessageIds);
    const available = ids.filter((id) => !skip.has(id));
    const page = available.slice(0, data.max);
    return { scanned: page.length, candidates: page.map(candidate) };
  });
}

describe("scanInBatches", () => {
  it("walks a large mailbox in batches rather than one request", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `m${i}`);
    const scan = mailbox(ids);

    const result = await scanInBatches({ scan, target: 100 });

    expect(result.candidates).toHaveLength(100);
    // 100 messages at 10 per pass — never one oversized request.
    expect(scan).toHaveBeenCalledTimes(100 / SCAN_BATCH_SIZE);
    for (const call of scan.mock.calls) {
      expect(call[0].data.max).toBeLessThanOrEqual(SCAN_BATCH_SIZE);
    }
  });

  it("carries seen ids forward so a batch never re-extracts a deck", async () => {
    const scan = mailbox(Array.from({ length: 25 }, (_, i) => `m${i}`));

    const result = await scanInBatches({ scan, target: 25 });

    expect(new Set(result.candidates.map((c) => c.messageId)).size).toBe(25);
    // The second pass must already know about the first pass's messages.
    expect(scan.mock.calls[1]?.[0].data.skipMessageIds).toHaveLength(SCAN_BATCH_SIZE);
  });

  it("seeds the skip list with deals that were already imported", async () => {
    const scan = mailbox(["a", "b", "c"]);

    const result = await scanInBatches({ scan, target: 10, alreadyImported: ["a", "b"] });

    expect(result.candidates.map((c) => c.messageId)).toEqual(["c"]);
    expect(scan.mock.calls[0]?.[0].data.skipMessageIds).toEqual(["a", "b"]);
  });

  it("stops when the mailbox runs dry instead of looping to the target", async () => {
    const scan = mailbox(["a", "b"]);

    const result = await scanInBatches({ scan, target: 100 });

    expect(result.candidates).toHaveLength(2);
    expect(result.done).toBe(true);
    // One productive pass, then the stop condition — not ten empty ones.
    expect(scan.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("terminates on a mailbox that only returns unsupported attachments", async () => {
    const scan = vi.fn(async () => ({ scanned: 5, candidates: [] }));

    const result = await scanInBatches({ scan, target: 100 });

    expect(result.candidates).toHaveLength(0);
    expect(scan.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("never asks for more than the remaining target", async () => {
    const scan = mailbox(Array.from({ length: 50 }, (_, i) => `m${i}`));

    await scanInBatches({ scan, target: 15 });

    const requested = scan.mock.calls.map((call) => call[0].data.max);
    expect(requested).toEqual([SCAN_BATCH_SIZE, 5]);
  });

  it("reports progress after every pass", async () => {
    const scan = mailbox(Array.from({ length: 20 }, (_, i) => `m${i}`));
    const onProgress = vi.fn();

    await scanInBatches({ scan, target: 20, onProgress });

    // Two passes plus the final report.
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls.at(-1)?.[0].done).toBe(true);
    expect(onProgress.mock.calls[0]?.[0].done).toBe(false);
  });

  it("stops early when aborted", async () => {
    const controller = new AbortController();
    const scan = vi.fn(async ({ data }: { data: { max: number; skipMessageIds: string[] } }) => {
      controller.abort();
      return {
        scanned: data.max,
        candidates: Array.from({ length: data.max }, (_, i) => candidate(`x${i}`)),
      };
    });

    const result = await scanInBatches({ scan, target: 100, signal: controller.signal });

    expect(scan).toHaveBeenCalledTimes(1);
    expect(result.candidates).toHaveLength(SCAN_BATCH_SIZE);
  });
});
