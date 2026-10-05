'use strict';

/*
 * One-off: shrink profile photos that are stored as large data URLs in
 * members.avatar_url (same result the browser now produces before upload:
 * longest side 256 px, JPEG).
 *
 *   node scripts/reencode-avatars.js            dry run (default). SELECT only.
 *   node scripts/reencode-avatars.js --apply    writes a backup file, then
 *                                               updates the rows in ONE
 *                                               transaction.
 *   --backup-dir <folder>   where the backup JSON goes (default: this folder)
 *
 * What it prints per member: id, format, pixel size and byte size before and
 * after. It never prints image data.
 *
 * --apply
 *   1. writes every original value to avatar-backup-<time>.json BEFORE any
 *      change (keep that file private: it contains the photos, and do not
 *      commit it);
 *   2. BEGIN; one "UPDATE members SET avatar_url = ... WHERE id = ... AND
 *      avatar_url = <the value that was read>" per photo; COMMIT.
 *      Only avatar_url is touched. If a photo changed since it was read, or
 *      anything fails, everything is rolled back and nothing changes.
 *
 * Needs the dev dependency "jimp" (npm install in the server folder). The
 * production image is built with "npm ci --omit=dev", so run this from a
 * machine that has the dev dependencies, with DATABASE_URL set.
 * Take a database backup before --apply.
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// Only this script's own statements are sent (see server/db/index.js).
process.env.DB_SKIP_INIT = 'true';

const MAX_SIDE = 256;
const JPEG_QUALITY = 82;
// Photos already at or below this size and within MAX_SIDE are left alone.
const SMALL_ENOUGH_CHARS = 60 * 1024;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const backupDirIndex = args.indexOf('--backup-dir');
const BACKUP_DIR = backupDirIndex >= 0 && args[backupDirIndex + 1]
  ? path.resolve(args[backupDirIndex + 1])
  : __dirname;

let Jimp;
try {
  Jimp = require('jimp');
} catch {
  console.error('This script needs "jimp". Run "npm install" in the server folder (it is a dev dependency).');
  process.exit(1);
}

const db = require('../db');

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+=*)$/i;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function reencode(dataUrl) {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return { skip: 'not a base64 image data URL' };

  const mime = match[1].toLowerCase();
  let image;
  try {
    image = await Jimp.read(Buffer.from(match[2], 'base64'));
  } catch (err) {
    return { skip: `cannot read this ${mime} image (${err.message})`, mime };
  }

  const before = { width: image.bitmap.width, height: image.bitmap.height };
  const longest = Math.max(before.width, before.height);

  if (longest <= MAX_SIDE && dataUrl.length <= SMALL_ENOUGH_CHARS) {
    return { skip: 'already small', mime, before };
  }

  if (longest > MAX_SIDE) {
    image.scaleToFit(MAX_SIDE, MAX_SIDE, Jimp.RESIZE_BICUBIC);
  }

  // JPEG has no transparency: put the photo on white first.
  const canvas = new Jimp(image.bitmap.width, image.bitmap.height, 0xffffffff);
  canvas.composite(image, 0, 0);
  canvas.quality(JPEG_QUALITY);

  const buffer = await canvas.getBufferAsync(Jimp.MIME_JPEG);
  const next = `data:image/jpeg;base64,${buffer.toString('base64')}`;

  if (next.length >= dataUrl.length) {
    return { skip: 'the re-encoded photo would not be smaller', mime, before };
  }

  return {
    mime,
    before,
    after: { width: canvas.bitmap.width, height: canvas.bitmap.height },
    next,
  };
}

async function main() {
  console.log(APPLY ? 'MODE: APPLY (rows will be updated)' : 'MODE: DRY RUN (read-only, nothing is changed)');

  const { rows } = await db.query(
    `SELECT id, avatar_url
       FROM members
      WHERE avatar_url LIKE 'data:image/%'
      ORDER BY id`,
  );

  console.log(`Members with a stored photo: ${rows.length}`);

  const changes = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (const row of rows) {
    const result = await reencode(row.avatar_url);
    const beforeChars = row.avatar_url.length;
    totalBefore += beforeChars;

    if (result.skip) {
      totalAfter += beforeChars;
      const size = result.before ? ` ${result.before.width}x${result.before.height}` : '';
      console.log(`member ${row.id}: ${result.mime || 'unknown'}${size} ${kb(beforeChars)} -> unchanged (${result.skip})`);
      continue;
    }

    totalAfter += result.next.length;
    changes.push({ id: row.id, original: row.avatar_url, next: result.next });
    console.log(
      `member ${row.id}: ${result.mime} ${result.before.width}x${result.before.height} ${kb(beforeChars)} -> ` +
        `image/jpeg ${result.after.width}x${result.after.height} ${kb(result.next.length)}`,
    );
  }

  console.log(`Total stored photo text: ${kb(totalBefore)} -> ${kb(totalAfter)} (${changes.length} photo(s) to change)`);

  if (!APPLY) {
    console.log('Dry run finished. Nothing was changed. Use --apply after a database backup.');
    return;
  }

  if (changes.length === 0) {
    console.log('Nothing to change.');
    return;
  }

  // 1. Backup first. If this fails, no row is touched.
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(
    BACKUP_DIR,
    `avatar-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(
    backupFile,
    JSON.stringify(changes.map(({ id, original }) => ({ id, avatar_url: original })), null, 2),
    { flag: 'wx' },
  );
  console.log(`Backup written: ${backupFile} (contains the original photos; keep it private)`);

  // 2. One transaction, avatar_url only.
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    for (const change of changes) {
      const { rowCount } = await client.query(
        'UPDATE members SET avatar_url = $1 WHERE id = $2 AND avatar_url = $3',
        [change.next, change.id, change.original],
      );

      if (rowCount !== 1) {
        throw new Error(`member ${change.id}: the photo changed since it was read (or the member is gone)`);
      }
    }

    await client.query('COMMIT');
    console.log(`Done: ${changes.length} photo(s) updated.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Rolled back, nothing was changed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('reencode-avatars failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end().catch(() => {}));
