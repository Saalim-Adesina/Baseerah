/**
 * Client-side error reporting hook.
 *
 * Vendor-neutral: errors go to the console, plus an optional
 * `window.__reportClientError` sink. Wire that sink to Sentry (or whatever
 * you pick) in `__root.tsx` if you want remote capture — nothing here talks
 * to a hosted service on its own.
 */
declare global {
  interface Window {
    __reportClientError?: (payload: {
      message: string;
      stack?: string;
      route?: string;
      context?: Record<string, unknown>;
    }) => void;
  }
}

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[client error]", message, { route: window.location.pathname, ...context });

  window.__reportClientError?.({
    message,
    ...(stack !== undefined && { stack }),
    route: window.location.pathname,
    context,
  });
}
