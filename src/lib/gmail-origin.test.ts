import { afterEach, describe, expect, it } from "vitest";
import {
  allowedOrigins,
  assertOAuthOriginUsable,
  GMAIL_RETURN_PATH,
  isLoopback,
  redirectUri,
  resolveAppOrigin,
} from "@/server/appOrigin";

const BOTH = "https://baseerah.dev,https://test.baseerah.dev";

/**
 * `resolveAppOrigin` decides the OAuth redirect URI, and Google matches that
 * byte for byte. When it is wrong the failure surfaces at Google's consent
 * screen, which makes it look like a console misconfiguration rather than a
 * local one — so the precedence is worth pinning down.
 *
 * Both inputs are injected here rather than read from the ambient request and
 * `process.env`, so the ordering is tested directly.
 */

describe("resolveAppOrigin precedence", () => {
  it("uses localhost even when PUBLIC_APP_URL points at staging", () => {
    // The trap: a staging value left in .env.local silently sending the consent
    // callback to staging while you are testing locally.
    expect(
      resolveAppOrigin({
        requestOrigin: "http://localhost:3000",
        configured: "https://test.baseerah.dev",
      }),
    ).toBe("http://localhost:3000");
  });

  it("treats 127.0.0.1 and ::1 as local too", () => {
    expect(
      resolveAppOrigin({
        requestOrigin: "http://127.0.0.1:3000",
        configured: "https://baseerah.dev",
      }),
    ).toBe("http://127.0.0.1:3000");
    expect(
      resolveAppOrigin({ requestOrigin: "http://[::1]:3000", configured: "https://baseerah.dev" }),
    ).toBe("http://[::1]:3000");
  });

  it("pins the configured origin in hosting", () => {
    // Behind a proxy the request origin can be an internal hostname, which is
    // exactly why PUBLIC_APP_URL has to win there.
    expect(
      resolveAppOrigin({ requestOrigin: "http://10.0.0.7", configured: "https://baseerah.dev" }),
    ).toBe("https://baseerah.dev");
  });

  it("serves production and staging from one config value", () => {
    // The point of the allowlist: each environment answers on its own hostname
    // and gets its own redirect URI, with no per-environment editing.
    expect(resolveAppOrigin({ requestOrigin: "https://baseerah.dev", configured: BOTH })).toBe(
      "https://baseerah.dev",
    );
    expect(resolveAppOrigin({ requestOrigin: "https://test.baseerah.dev", configured: BOTH })).toBe(
      "https://test.baseerah.dev",
    );
  });

  it("falls back to the first allowlist entry for an unrecognised host", () => {
    // A forged Host header must never produce an unregistered redirect URI —
    // Google would reject it anyway, but echoing it back is the wrong shape.
    expect(
      resolveAppOrigin({ requestOrigin: "https://attacker.example", configured: BOTH }),
    ).toBe("https://baseerah.dev");
  });

  it("tolerates whitespace and trailing slashes in the list", () => {
    expect(
      resolveAppOrigin({
        requestOrigin: "https://test.baseerah.dev",
        configured: " https://baseerah.dev/ ,  https://test.baseerah.dev/// ",
      }),
    ).toBe("https://test.baseerah.dev");
  });

  it("strips trailing slashes so the URI matches Google byte for byte", () => {
    expect(
      resolveAppOrigin({ requestOrigin: "http://10.0.0.7", configured: "https://baseerah.dev/" }),
    ).toBe("https://baseerah.dev");
    expect(
      resolveAppOrigin({ requestOrigin: "http://10.0.0.7", configured: "https://baseerah.dev///" }),
    ).toBe("https://baseerah.dev");
  });

  it("falls back to the request origin when nothing is pinned", () => {
    const preview = "https://deal-oracle-abc123.vercel.app";
    expect(resolveAppOrigin({ requestOrigin: preview, configured: undefined })).toBe(preview);
    expect(resolveAppOrigin({ requestOrigin: preview, configured: "   " })).toBe(preview);
  });

  it("refuses to guess when there is no request and no config", () => {
    expect(() => resolveAppOrigin({ requestOrigin: null, configured: undefined })).toThrow(
      /must start from an app request/,
    );
  });
});

describe("redirectUri", () => {
  it("is the exact string that must be registered in the Google console", () => {
    expect(redirectUri({ requestOrigin: null, configured: "https://test.baseerah.dev" })).toBe(
      "https://test.baseerah.dev/oauth/gmail/return",
    );
    expect(redirectUri({ requestOrigin: "http://localhost:3000", configured: undefined })).toBe(
      "http://localhost:3000/oauth/gmail/return",
    );
  });

  it("does not double the slash when the configured origin has one", () => {
    expect(redirectUri({ requestOrigin: null, configured: "https://baseerah.dev/" })).toBe(
      "https://baseerah.dev/oauth/gmail/return",
    );
  });

  it("uses the path the callback route is mounted at", () => {
    expect(GMAIL_RETURN_PATH).toBe("/oauth/gmail/return");
  });
});

describe("isLoopback", () => {
  it("recognises the local forms and nothing else", () => {
    expect(isLoopback("http://localhost:3000")).toBe(true);
    expect(isLoopback("http://127.0.0.1:3000")).toBe(true);
    expect(isLoopback("http://[::1]:3000")).toBe(true);
    expect(isLoopback("https://baseerah.dev")).toBe(false);
    expect(isLoopback("https://test.baseerah.dev")).toBe(false);
    // Not a loopback host, despite the substring — this would be a real bypass
    // if the check were done with `includes`.
    expect(isLoopback("https://localhost.attacker.com")).toBe(false);
  });
});

describe("assertOAuthOriginUsable", () => {
  const original = process.env["ALLOW_LOCAL_OAUTH"];
  afterEach(() => {
    if (original === undefined) delete process.env["ALLOW_LOCAL_OAUTH"];
    else process.env["ALLOW_LOCAL_OAUTH"] = original;
  });

  it("refuses localhost with an instruction, not a Google error", () => {
    delete process.env["ALLOW_LOCAL_OAUTH"];
    expect(() => assertOAuthOriginUsable("http://localhost:3000")).toThrow(/connect from staging/i);
  });

  it("allows any deployed origin", () => {
    expect(() => assertOAuthOriginUsable("https://test.baseerah.dev")).not.toThrow();
    expect(() => assertOAuthOriginUsable("https://baseerah.dev")).not.toThrow();
  });

  it("honours the explicit opt-in", () => {
    process.env["ALLOW_LOCAL_OAUTH"] = "true";
    expect(() => assertOAuthOriginUsable("http://localhost:3000")).not.toThrow();
  });

  it("only accepts the exact opt-in value", () => {
    process.env["ALLOW_LOCAL_OAUTH"] = "1";
    expect(() => assertOAuthOriginUsable("http://localhost:3000")).toThrow();
  });
});

describe("allowedOrigins", () => {
  it("parses a comma-separated list", () => {
    expect(allowedOrigins(BOTH)).toEqual(["https://baseerah.dev", "https://test.baseerah.dev"]);
  });

  it("normalises whitespace and trailing slashes", () => {
    expect(allowedOrigins("  https://a.dev/ , https://b.dev//  ")).toEqual([
      "https://a.dev",
      "https://b.dev",
    ]);
  });

  it("is empty for empty, blank or missing config", () => {
    expect(allowedOrigins(undefined)).toEqual([]);
    expect(allowedOrigins("")).toEqual([]);
    expect(allowedOrigins("   ,  ,")).toEqual([]);
  });
});
