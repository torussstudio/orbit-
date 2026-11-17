const crypto = require("crypto");

/*
 * Encrypts credential values at rest (AES-256-GCM).
 *
 * Opt-in: set CREDENTIAL_ENC_KEY in the server env to a 32-byte key
 * (64 hex characters or 44 base64 characters). Generate one with:
 *   node -e "console.log(crypto.randomBytes(32).toString('hex'))"
 *
 * Without a key nothing changes: values are stored and read as plain
 * text, exactly as before. Values written while a key is set look like
 * "enc:v1:<iv>:<tag>:<data>"; anything without that prefix is treated
 * as legacy plain text, so old rows keep working until they are
 * migrated with scripts/encrypt-credentials.js.
 *
 * Keep the key safe and back it up: encrypted values cannot be
 * recovered without it.
 */

const PREFIX = "enc:v1:";

function getKey() {
  const raw = (process.env.CREDENTIAL_ENC_KEY || "").trim();
  if (!raw) return null;

  let key = null;
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) key = b;
  }

  if (!key) {
    console.error(
      "[credentials] CREDENTIAL_ENC_KEY must be 32 bytes (64 hex chars or base64). Encryption is OFF.",
    );
  }
  return key;
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function encryptValue(plain) {
  const key = getKey();
  if (!key || typeof plain !== "string" || isEncrypted(plain)) return plain;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

function decryptValue(stored) {
  if (!isEncrypted(stored)) return stored;

  const key = getKey();
  if (!key) return "[encrypted - CREDENTIAL_ENC_KEY is not set]";

  try {
    const [iv, tag, data] = stored.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "[could not decrypt - wrong CREDENTIAL_ENC_KEY]";
  }
}

module.exports = { encryptValue, decryptValue, isEncrypted, encryptionEnabled: () => !!getKey() };
