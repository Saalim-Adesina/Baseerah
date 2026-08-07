// A new deploy replaces the hashed JS chunks, so a tab that still holds the old
// HTML fails with "Importing a module script failed" / "Failed to fetch
// dynamically imported module" and shows a blank screen. Recover by reloading
// once (guarded by sessionStorage so a genuine failure can't loop).

const RELOAD_KEY = "baseerah:stale-chunk-reloaded";

const STALE_PATTERNS = [
  "importing a module script failed",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "'text/html' is not a valid javascript mime type",
  "expected a javascript module script",
];

export function isStaleChunkError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  ).toLowerCase();
  return STALE_PATTERNS.some((pattern) => message.includes(pattern));
}

export function reloadOnceForStaleChunk(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleChunkError(error)) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function clearStaleChunkReloadFlag() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}
