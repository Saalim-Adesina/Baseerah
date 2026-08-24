// Server-only — never import in the browser.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { connectionEncryptionKey, KEY_VERSION } from "@/server/appSecrets";

/**
 * Encrypts provider refresh tokens at rest with AES-256-GCM.
 *
 * The ciphertext is bound to the row it belongs to via GCM's additional
 * authenticated data. Without that binding, a ciphertext copied from one row to
 * another still decrypts, so anyone who could write to the table could point
 * their own row at another user's token and read that mailbox. AAD turns that
 * into a decryption failure.
 *
 * Stored layout: version(1) || iv(12) || authTag(16) || ciphertext
 */
const VERSION_BYTES = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type ConnectionScope = {
  userId: string;
  connectorId: string;
};

/** The AAD: which row this ciphertext is valid for. */
function aad(scope: ConnectionScope): Buffer {
  return Buffer.from(`v${KEY_VERSION}:${scope.userId}:${scope.connectorId}`, "utf8");
}

export function encryptConnectionKey(plaintext: string, scope: ConnectionScope): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", connectionEncryptionKey(), iv);
  cipher.setAAD(aad(scope));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([KEY_VERSION]), iv, cipher.getAuthTag(), ct]).toString(
    "base64",
  );
}

export function decryptConnectionKey(stored: string, scope: ConnectionScope): string {
  const buf = Buffer.from(stored, "base64");
  if (buf.length <= VERSION_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error("Stored connection key is malformed.");
  }

  const version = buf[0];
  if (version !== KEY_VERSION) {
    // Rotating the scheme forces a reconnect rather than failing obscurely
    // deep inside the cipher.
    throw new Error(
      `Stored connection key uses key version ${version}, this build expects ${KEY_VERSION}. Reconnect the account.`,
    );
  }

  const iv = buf.subarray(VERSION_BYTES, VERSION_BYTES + IV_BYTES);
  const tag = buf.subarray(VERSION_BYTES + IV_BYTES, VERSION_BYTES + IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(VERSION_BYTES + IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", connectionEncryptionKey(), iv);
  decipher.setAAD(aad(scope));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
