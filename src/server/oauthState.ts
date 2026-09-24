// Server-only — never import in the browser.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { oauthStateSigningKey } from "@/server/appSecrets";

/**
 * Signed OAuth `state`, so the redirect can be validated without a session
 * store: the value carries the user id and a nonce, HMAC'd with a signing key
 * derived for this purpose alone — deliberately not the same key that encrypts
 * stored refresh tokens.
 */
const STATE_TTL_MS = 15 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", oauthStateSigningKey()).update(payload).digest("base64url");
}

export function signOAuthState(userId: string): string {
  const payload = `${userId}.${Date.now()}.${randomBytes(9).toString("base64url")}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyOAuthState(state: string, userId: string): boolean {
  const dot = state.lastIndexOf(".");
  if (dot === -1) return false;

  const payload = Buffer.from(state.slice(0, dot), "base64url").toString();
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(state.slice(dot + 1));
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;

  const [stateUserId, issuedAt] = payload.split(".");
  if (stateUserId !== userId) return false;
  return Number(issuedAt) > Date.now() - STATE_TTL_MS;
}
