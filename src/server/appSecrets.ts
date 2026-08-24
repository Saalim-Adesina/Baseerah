// Server-only — never import in the browser.
import { createHash, hkdfSync } from "node:crypto";

/**
 * One root secret, several purpose-bound subkeys.
 *
 * `APP_USER_CONNECTION_KEY_SECRET` used to be handed directly to both
 * `createCipheriv` and `createHmac`. Reusing one key across two primitives is a
 * cryptographic smell an assessor will flag, and it means a weakness in either
 * construction implicates the other. HKDF gives each use its own key derived
 * from the same configured secret, so nothing about deployment changes.
 */
const ROOT_ENV = "APP_USER_CONNECTION_KEY_SECRET";

/** Bumped only if the derivation scheme itself changes. */
export const KEY_VERSION = 1;

function rootSecret(): Buffer {
  const raw = process.env[ROOT_ENV];
  if (!raw) throw new Error(`${ROOT_ENV} is not set`);

  const decoded = Buffer.from(raw.trim(), "base64");
  // `Buffer.from(..., "base64")` never throws — it silently drops anything it
  // cannot decode. A truncated or mistyped secret would otherwise sail through
  // and produce a short, weak key at request time.
  if (decoded.length < 32) {
    throw new Error(
      `${ROOT_ENV} must decode to at least 32 bytes (got ${decoded.length}). ` +
        "Generate one with: openssl rand -base64 32",
    );
  }
  return decoded;
}

/**
 * Derives a 32-byte key bound to `purpose`. Different purposes cannot produce
 * the same key, so a ciphertext or signature from one context is useless in
 * another.
 */
function subkey(purpose: string): Buffer {
  const salt = createHash("sha256").update(`baseerah:v${KEY_VERSION}`).digest();
  return Buffer.from(hkdfSync("sha256", rootSecret(), salt, purpose, 32));
}

/** AES-256-GCM key for provider refresh tokens at rest. */
export function connectionEncryptionKey(): Buffer {
  return subkey("connection-key-encryption");
}

/** HMAC-SHA256 key for signing the OAuth `state` parameter. */
export function oauthStateSigningKey(): Buffer {
  return subkey("oauth-state-signing");
}
