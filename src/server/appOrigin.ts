// Server-only — never import in the browser.
import { getRequest } from "@tanstack/react-start/server";

/** Path Google redirects back to — must match the console's authorized URI. */
export const GMAIL_RETURN_PATH = "/oauth/gmail/return";

/** Loopback hosts are only ever reachable from the machine running the server. */
export function isLoopback(origin: string) {
  const { hostname } = new URL(origin);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * The origins this deployment is allowed to send an OAuth callback to.
 *
 * `PUBLIC_APP_URL` accepts a comma-separated list, so one value covers both
 * `https://baseerah.dev` and `https://test.baseerah.dev` and the same config
 * works in either environment without being edited.
 */
export function allowedOrigins(configured?: string | undefined): string[] {
  return (configured ?? "")
    .split(",")
    .map((v) => v.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Resolves the origin used to build the OAuth redirect URI. Google matches that
 * URI byte for byte, so it has to be the origin the browser is actually on.
 *
 * Precedence, in order:
 *
 *  1. A loopback request origin. Wins over everything, so a deployed value in
 *     `.env.local` cannot send a local consent callback to a deployed host.
 *  2. The request origin, when it appears in the `PUBLIC_APP_URL` allowlist.
 *     This is what lets production and staging share one config: each answers
 *     on its own hostname and gets its own redirect URI.
 *  3. The first allowlist entry. Reached when the request arrives on a hostname
 *     we do not recognise — a proxy's internal name, or a spoofed Host header.
 *     Falling back to a known origin rather than echoing an unknown one means a
 *     forged Host can never produce an unregistered redirect URI.
 *  4. The request origin, when nothing is configured at all.
 *
 * Split out of `gmail.functions.ts` so it can be tested directly: that module is
 * client-bundled, so anything exported from it ships to the browser.
 */
export function resolveAppOrigin(
  options: { requestOrigin?: string | null; configured?: string | undefined } = {},
) {
  const requestOrigin =
    options.requestOrigin !== undefined ? options.requestOrigin : currentRequestOrigin();
  const configured =
    options.configured !== undefined ? options.configured : process.env["PUBLIC_APP_URL"];

  if (requestOrigin && isLoopback(requestOrigin)) return requestOrigin;

  const allowed = allowedOrigins(configured);
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  if (allowed.length > 0) return allowed[0]!;

  if (requestOrigin) return requestOrigin;
  throw new Error("OAuth must start from an app request.");
}

function currentRequestOrigin(): string | null {
  const request = getRequest();
  return request ? new URL(request.url).origin : null;
}

/**
 * This project tests OAuth on a deployed staging origin, not on localhost — see
 * `docs/development-workflow.md`. Without this guard, connecting from localhost
 * produces a bare `redirect_uri_mismatch` at Google's consent screen, which
 * reads as a console misconfiguration rather than as "you are on the wrong
 * environment".
 *
 * Set `ALLOW_LOCAL_OAUTH=true` in `.env.local` to opt back in, having first
 * registered `http://localhost:3000/oauth/gmail/return` in the Google console.
 */
export function assertOAuthOriginUsable(origin: string) {
  if (!isLoopback(origin)) return;
  if (process.env["ALLOW_LOCAL_OAUTH"] === "true") return;

  throw new Error(
    "Gmail connect does not run against localhost in this project — the OAuth callback " +
      "needs a deployed origin Google has registered. Deploy and connect from staging. " +
      "To override, register the localhost redirect URI in the Google console and set " +
      "ALLOW_LOCAL_OAUTH=true in .env.local.",
  );
}

/** The full redirect URI Google must have registered for this environment. */
export function redirectUri(options?: {
  requestOrigin?: string | null;
  configured?: string | undefined;
}) {
  return new URL(GMAIL_RETURN_PATH, `${resolveAppOrigin(options)}/`).toString();
}
