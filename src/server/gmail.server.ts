// Server-only Gmail helpers, calling the Gmail REST API directly with an
// access token minted from the user's own stored refresh token.
import { googleAccessToken } from "@/server/googleOAuth.server";
import { analyzeDocumentLayout, supportsDocumentIntelligence } from "@/lib/azure.server";
import type { GmailDealCandidate } from "@/lib/types";

export const GMAIL_API_BASE_URL = "https://gmail.googleapis.com";
/** Row key in `app_user_connections` — one connection per user per provider. */
export const GMAIL_CONNECTOR_ID = "google_mail";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

/** Largest scan a user can ask for. Mirrored by the DB check constraint on
 *  `profiles.gmail_scan_limit` and by the validator on `scanGmailInbox`. */
export const MAX_SCAN_MESSAGES = 100;

/** Only decks — Gmail search keeps the scan tight and cheap. */
export const DEAL_QUERY =
  "has:attachment (filename:pdf OR filename:pptx OR filename:ppt OR filename:docx) newer_than:365d -in:spam -in:trash";

export type { GmailDealCandidate } from "@/lib/types";

type GmailPart = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
};

async function gmail<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gmail request failed [${res.status}]: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as T;
}

export async function gmailProfile(refreshToken: string) {
  const accessToken = await googleAccessToken(refreshToken);
  return gmail<{ emailAddress: string; messagesTotal: number }>(
    accessToken,
    "/gmail/v1/users/me/profile",
  );
}

function header(headers: { name: string; value: string }[] | undefined, name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function flatten(part: GmailPart | undefined): GmailPart[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flatten)];
}

function splitFrom(from: string) {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: (match[1] ?? "").trim(), email: (match[2] ?? "").trim() };
  return { name: "", email: from.trim() };
}

function base64UrlToBase64(value: string) {
  return value.replace(/-/g, "+").replace(/_/g, "/");
}

/**
 * Reads recent deck-bearing messages from the connected mailbox and turns each
 * attachment into extracted text ready to become a deal.
 */
export async function scanGmailForDecks(
  refreshToken: string,
  options: { max?: number; skipMessageIds?: string[] } = {},
): Promise<{ scanned: number; candidates: GmailDealCandidate[] }> {
  const max = Math.min(Math.max(options.max ?? 10, 1), MAX_SCAN_MESSAGES);
  const skip = new Set(options.skipMessageIds ?? []);
  const accessToken = await googleAccessToken(refreshToken);

  const list = await gmail<{ messages?: { id: string }[] }>(
    accessToken,
    `/gmail/v1/users/me/messages?maxResults=${Math.min(max * 2, 500)}&q=${encodeURIComponent(
      DEAL_QUERY,
    )}`,
  );
  const ids = (list.messages ?? []).map((m) => m.id).filter((id) => !skip.has(id));

  const candidates: GmailDealCandidate[] = [];
  for (const id of ids) {
    if (candidates.length >= max) break;
    const message = await gmail<{
      id: string;
      snippet?: string;
      internalDate?: string;
      payload?: GmailPart;
    }>(accessToken, `/gmail/v1/users/me/messages/${id}?format=full`);

    const headers = message.payload?.headers;
    const attachment = flatten(message.payload).find(
      (part) =>
        part.filename &&
        part.body?.attachmentId &&
        supportsDocumentIntelligence(part.mimeType ?? "", part.filename),
    );
    if (!attachment?.body?.attachmentId || !attachment.filename) continue;

    const from = splitFrom(header(headers, "From"));
    const base: GmailDealCandidate = {
      messageId: message.id,
      subject: header(headers, "Subject") || "(no subject)",
      from: from.email,
      fromName: from.name,
      receivedAt: Number(message.internalDate ?? Date.now()),
      snippet: message.snippet ?? "",
      filename: attachment.filename,
      deckText: "",
    };

    try {
      const file = await gmail<{ data?: string }>(
        accessToken,
        `/gmail/v1/users/me/messages/${message.id}/attachments/${attachment.body.attachmentId}`,
      );
      if (!file.data) throw new Error("Attachment came back empty.");
      base.deckText = await analyzeDocumentLayout(base64UrlToBase64(file.data));
    } catch (error) {
      base.extractionError = error instanceof Error ? error.message : "Could not read attachment";
    }
    candidates.push(base);
  }

  return { scanned: ids.length, candidates };
}
