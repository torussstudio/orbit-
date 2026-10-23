'use strict';

/*
 * Orbit AI: readable text of Knowledge board files.
 *
 * Notes already live in the database (knowledge_notes). Files (PDF, TXT,
 * Markdown) live on the file host, so their text is pulled out once and kept
 * in ai_knowledge_text, where the assistant's knowledge search can read it.
 * The text is extracted by this server: no AI tokens are spent on it.
 *
 *   indexFile(file, buffer?)  right after an upload (buffer in memory), or
 *                             later by downloading file_url
 *   start()                   background backfill for files uploaded before
 *                             this existed, and retries of failed ones
 *
 * Images and zips are not read (their name is still searchable).
 * Set AI_KNOWLEDGE_INDEX=off to switch the background job off.
 */

const db = require('../../db');

const READABLE = new Set(['application/pdf', 'text/plain', 'text/markdown']);
const MAX_DOWNLOAD = 20 * 1024 * 1024; // same as the upload limit
const MAX_TEXT = 300_000; // characters kept per file
const DOWNLOAD_TIMEOUT_MS = 30_000;
const BATCH = 25; // files per background run
const RETRY_FAILED_AFTER_HOURS = 24;

const isReadable = (mime) => READABLE.has(String(mime || '').toLowerCase());

function clean(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
}

let unpdf = null;
async function pdfText(buffer) {
  // unpdf is ESM only; loaded the first time a PDF is read.
  unpdf = unpdf || (await import('unpdf'));
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
  try {
    const { text } = await unpdf.extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n\n') : text;
  } finally {
    pdf.destroy?.();
  }
}

async function extractText(buffer, mime) {
  const type = String(mime || '').toLowerCase();
  if (type === 'application/pdf') return clean(await pdfText(buffer));
  if (type === 'text/plain' || type === 'text/markdown') return clean(Buffer.from(buffer).toString('utf8'));
  return '';
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const size = Number(res.headers.get('content-length') || 0);
    if (size > MAX_DOWNLOAD) throw new Error('file too large');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD) throw new Error('file too large');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function save(file, status, content = '', error = null) {
  await db.query(
    `INSERT INTO ai_knowledge_text (file_id, project_id, status, content, chars, error, extracted_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (file_id) DO UPDATE
       SET project_id = EXCLUDED.project_id, status = EXCLUDED.status, content = EXCLUDED.content,
           chars = EXCLUDED.chars, error = EXCLUDED.error, extracted_at = NOW()`,
    [String(file.id), file.project_id == null ? null : String(file.project_id), status, content, content.length, error],
  );
}

// Never throws; the result is only logged.
async function indexFile(file, buffer = null) {
  if (!file?.id) return 'skipped';
  try {
    if (!isReadable(file.mime_type)) {
      await save(file, 'skipped');
      return 'skipped';
    }
    const data = buffer || (await download(file.file_url));
    const text = await extractText(data, file.mime_type);
    await save(file, text ? 'ok' : 'empty', text);
    return text ? 'ok' : 'empty';
  } catch (err) {
    const message = String(err?.message || err).slice(0, 300);
    await save(file, 'failed', '', message).catch(() => {});
    console.error(`[ai-knowledge] could not read file ${file.id}: ${message}`);
    return 'failed';
  }
}

// Files with no text yet (or a failed read older than a day), oldest first.
async function backfill() {
  let rows;
  try {
    ({ rows } = await db.query(
      `SELECT f.id, f.project_id, f.file_url, f.mime_type
         FROM knowledge_files f
         LEFT JOIN ai_knowledge_text x ON x.file_id = f.id::text
        WHERE lower(f.mime_type) = ANY($1::text[])
          AND (x.file_id IS NULL
               OR (x.status = 'failed' AND x.extracted_at < NOW() - make_interval(hours => $2)))
        ORDER BY f.created_at ASC
        LIMIT $3`,
      [[...READABLE], RETRY_FAILED_AFTER_HOURS, BATCH],
    ));
  } catch (err) {
    // Table not ready yet on a first boot; the next run picks it up.
    console.error('[ai-knowledge] backfill skipped:', err.message);
    return { done: 0 };
  }
  const counts = { ok: 0, empty: 0, failed: 0, skipped: 0 };
  for (const file of rows) counts[await indexFile(file)] += 1;
  if (rows.length) console.log(`[ai-knowledge] read ${rows.length} file(s): ${JSON.stringify(counts)}`);
  return { done: rows.length, counts, more: rows.length === BATCH };
}

let started = false;
function start() {
  if (started || process.env.AI_KNOWLEDGE_INDEX === 'off' || process.env.NODE_ENV === 'test') return;
  started = true;
  const run = async () => {
    // Keep going in batches while there is a backlog, a pause between each.
    for (let i = 0; i < 40; i += 1) {
      const { more } = await backfill();
      if (!more) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  };
  setTimeout(run, 30_000).unref();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}

module.exports = { indexFile, extractText, backfill, start, isReadable };
