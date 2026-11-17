/*
 * One-time migration: encrypts existing plain-text credential values.
 *
 *   1. TAKE A DATABASE BACKUP FIRST.
 *   2. Set CREDENTIAL_ENC_KEY in server/.env (see utils/credentialCrypto.js).
 *   3. Run from the server folder:
 *        node scripts/encrypt-credentials.js          (dry run, changes nothing)
 *        node scripts/encrypt-credentials.js --apply  (encrypts)
 *
 * Safe to re-run: already-encrypted rows are skipped.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const db = require("../db");
const { encryptValue, isEncrypted, encryptionEnabled } = require("../utils/credentialCrypto");

(async () => {
  if (!encryptionEnabled()) {
    console.error("CREDENTIAL_ENC_KEY is missing or invalid. Nothing done.");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  const { rows } = await db.query("SELECT id, value FROM credential_entries");
  const todo = rows.filter((r) => !isEncrypted(r.value));

  console.log(`${rows.length} entries, ${todo.length} still plain text.`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to encrypt them.");
    process.exit(0);
  }

  for (const r of todo) {
    await db.query("UPDATE credential_entries SET value=$1 WHERE id=$2", [
      encryptValue(r.value),
      r.id,
    ]);
  }

  console.log(`Encrypted ${todo.length} entries.`);
  process.exit(0);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
