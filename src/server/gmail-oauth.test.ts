import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 32-byte base64 key, test-only.
const TEST_SECRET = Buffer.alloc(32, 7).toString("base64");

vi.mock("@/lib/azure.server", () => ({
  analyzeDocumentLayout: vi.fn(async (base64Source: string) => {
    if (base64Source.includes("BROKEN")) throw new Error("Document Intelligence failed");
    return "# Acme Robotics\n\nSeed round, $2M ARR.";
  }),
  supportsDocumentIntelligence: (mime: string, filename: string) =>
    mime === "application/pdf" || /\.(pdf|pptx|docx)$/i.test(filename),
}));

beforeEach(() => {
  process.env["APP_USER_CONNECTION_KEY_SECRET"] = TEST_SECRET;
  process.env["GOOGLE_OAUTH_CLIENT_ID"] = "test-client.apps.googleusercontent.com";
  process.env["GOOGLE_OAUTH_CLIENT_SECRET"] = "test-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("oauth state", () => {
  it("round-trips for the issuing user", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauthState");
    const state = signOAuthState("user-1");
    expect(verifyOAuthState(state, "user-1")).toBe(true);
  });

  it("rejects another user's state", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauthState");
    expect(verifyOAuthState(signOAuthState("user-1"), "user-2")).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauthState");
    const state = signOAuthState("user-1");
    const tampered = state.slice(0, state.lastIndexOf(".")) + ".deadbeef";
    expect(verifyOAuthState(tampered, "user-1")).toBe(false);
  });

  it("rejects a state older than the TTL", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauthState");
    const state = signOAuthState("user-1");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60 * 1000);
    expect(verifyOAuthState(state, "user-1")).toBe(false);
  });
});

describe("connection key encryption", () => {
  const scope = { userId: "user-1", connectorId: "google_mail" };

  it("round-trips a refresh token", async () => {
    const { encryptConnectionKey, decryptConnectionKey } = await import("./connectionKeyCrypto");
    const token = "1//0gRefreshTokenValue";
    const stored = encryptConnectionKey(token, scope);
    expect(stored).not.toContain(token);
    expect(decryptConnectionKey(stored, scope)).toBe(token);
  });

  it("refuses a tampered ciphertext", async () => {
    const { encryptConnectionKey, decryptConnectionKey } = await import("./connectionKeyCrypto");
    const stored = Buffer.from(encryptConnectionKey("secret-token", scope), "base64");
    stored.writeUInt8(stored.readUInt8(stored.length - 1) ^ 0xff, stored.length - 1);
    expect(() => decryptConnectionKey(stored.toString("base64"), scope)).toThrow();
  });

  it("refuses a ciphertext lifted into another user's row", async () => {
    // Without AAD this decrypts cleanly, and anyone able to write the table
    // could point their own row at someone else's mailbox token.
    const { encryptConnectionKey, decryptConnectionKey } = await import("./connectionKeyCrypto");
    const stored = encryptConnectionKey("victim-refresh-token", scope);
    expect(() =>
      decryptConnectionKey(stored, { userId: "attacker", connectorId: "google_mail" }),
    ).toThrow();
  });

  it("refuses a ciphertext reused for a different connector", async () => {
    const { encryptConnectionKey, decryptConnectionKey } = await import("./connectionKeyCrypto");
    const stored = encryptConnectionKey("token", scope);
    expect(() =>
      decryptConnectionKey(stored, { userId: scope.userId, connectorId: "other_provider" }),
    ).toThrow();
  });

  it("rejects a root secret that is too short to be a 256-bit key", async () => {
    const previous = process.env["APP_USER_CONNECTION_KEY_SECRET"];
    process.env["APP_USER_CONNECTION_KEY_SECRET"] = Buffer.from("tooshort").toString("base64");
    try {
      const { encryptConnectionKey } = await import("./connectionKeyCrypto");
      expect(() => encryptConnectionKey("token", scope)).toThrow(/at least 32 bytes/);
    } finally {
      process.env["APP_USER_CONNECTION_KEY_SECRET"] = previous;
    }
  });

  it("does not sign OAuth state with the encryption key", async () => {
    // Purpose-bound subkeys: the two derivations must not collide.
    const { connectionEncryptionKey, oauthStateSigningKey } = await import("./appSecrets");
    expect(connectionEncryptionKey().equals(oauthStateSigningKey())).toBe(false);
  });
});

describe("google authorize url", () => {
  it("requests offline access with the Gmail scopes", async () => {
    const { googleAuthorizeUrl } = await import("./googleOAuth.server");
    const { GMAIL_SCOPES } = await import("./gmail.server");

    const url = new URL(
      googleAuthorizeUrl({
        redirectUri: "https://app.example.com/oauth/gmail/return",
        scopes: GMAIL_SCOPES,
        state: "signed-state",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/oauth/gmail/return");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
  });

  it("exchanges a code for a refresh token", async () => {
    const { exchangeGoogleCode } = await import("./googleOAuth.server");
    const fetchMock = vi.fn(async () =>
      Response.json({ refresh_token: "1//refresh", access_token: "ya29.access", expires_in: 3599 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeGoogleCode(
      "code-123",
      "https://app.example.com/oauth/gmail/return",
    );
    expect(result.refreshToken).toBe("1//refresh");

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = new URLSearchParams(call[1].body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-123");
    expect(body.get("client_secret")).toBe("test-secret");
  });

  it("fails loudly when Google omits the refresh token", async () => {
    const { exchangeGoogleCode } = await import("./googleOAuth.server");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "ya29.access" })),
    );
    await expect(exchangeGoogleCode("code", "https://app.example.com/x")).rejects.toThrow(
      /did not return a refresh token/,
    );
  });
});

type GmailMessage = {
  id: string;
  subject: string;
  from: string;
  filename: string;
  attachmentData: string;
};

function gmailFetchStub(messages: GmailMessage[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "ya29.access", expires_in: 3599 });
    }
    if (url.includes("/messages?")) {
      return Response.json({ messages: messages.map((m) => ({ id: m.id })) });
    }
    if (url.includes("/attachments/")) {
      const id = url.split("/messages/")[1]!.split("/")[0]!;
      return Response.json({ data: messages.find((m) => m.id === id)!.attachmentData });
    }
    if (url.includes("/messages/")) {
      const id = url.split("/messages/")[1]!.split("?")[0]!;
      const message = messages.find((m) => m.id === id)!;
      return Response.json({
        id: message.id,
        snippet: "Deck attached",
        internalDate: "1786930000000",
        payload: {
          headers: [
            { name: "Subject", value: message.subject },
            { name: "From", value: message.from },
          ],
          parts: [
            {
              filename: message.filename,
              mimeType: "application/pdf",
              body: { attachmentId: `att-${message.id}`, size: 1024 },
            },
          ],
        },
      });
    }
    throw new Error(`unexpected gmail call: ${url}`);
  });
}

describe("gmail deck scan", () => {
  const messages: GmailMessage[] = [
    {
      id: "m1",
      subject: "Acme Robotics — seed deck",
      from: '"Layla Hassan" <layla@acme.example>',
      filename: "acme-seed.pdf",
      attachmentData: "QUJD",
    },
    {
      id: "m2",
      subject: "Nova Labs deck",
      from: "founder@nova.example",
      filename: "nova.pdf",
      attachmentData: "BROKEN",
    },
  ];

  it("turns deck attachments into deal candidates", async () => {
    vi.stubGlobal("fetch", gmailFetchStub(messages));
    const { scanGmailForDecks } = await import("./gmail.server");

    const { scanned, candidates } = await scanGmailForDecks("1//refresh", { max: 5 });

    expect(scanned).toBe(2);
    expect(candidates).toHaveLength(2);

    const acme = candidates[0]!;
    expect(acme.subject).toBe("Acme Robotics — seed deck");
    expect(acme.from).toBe("layla@acme.example");
    expect(acme.fromName).toBe("Layla Hassan");
    expect(acme.filename).toBe("acme-seed.pdf");
    expect(acme.deckText).toContain("Acme Robotics");
    expect(acme.extractionError).toBeUndefined();
  });

  it("records extraction failures instead of dropping the candidate", async () => {
    vi.stubGlobal("fetch", gmailFetchStub(messages));
    const { scanGmailForDecks } = await import("./gmail.server");

    const { candidates } = await scanGmailForDecks("1//refresh", { max: 5 });
    const nova = candidates.find((c) => c.messageId === "m2")!;
    expect(nova.deckText).toBe("");
    expect(nova.extractionError).toMatch(/Document Intelligence failed/);
  });

  it("skips message ids already imported", async () => {
    vi.stubGlobal("fetch", gmailFetchStub(messages));
    const { scanGmailForDecks } = await import("./gmail.server");

    const { candidates } = await scanGmailForDecks("1//refresh", { skipMessageIds: ["m1"] });
    expect(candidates.map((c) => c.messageId)).toEqual(["m2"]);
  });

  it("surfaces Gmail API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com/token")) {
          return Response.json({ access_token: "ya29.access", expires_in: 3599 });
        }
        return new Response("insufficient authentication scopes", { status: 403 });
      }),
    );
    const { scanGmailForDecks } = await import("./gmail.server");
    await expect(scanGmailForDecks("1//refresh")).rejects.toThrow(/Gmail request failed \[403\]/);
  });
});
