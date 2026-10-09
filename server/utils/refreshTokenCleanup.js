'use strict';

const db = require('../db');
const { computeRefreshExpiry } = require('./jwt');

/*
 * Daily cleanup of refresh-token rows that can never be used again.
 *
 * Env (see server/.env.example):
 *   REFRESH_TOKEN_CLEANUP_ENABLED=true   turn it on (default OFF, so deploying
 *                                        this does not start deleting anything)
 *   REFRESH_TOKEN_CLEANUP_DRY_RUN=true   only log how many rows would be deleted
 *   REFRESH_TOKEN_RETENTION_DAYS=30      how long a dead row is kept (see below)
 *
 * Every refresh rotates the token: the old row is revoked and a new one is
 * added, and nothing ever removed the old rows. A row is deleted when
 *   - it has expired, AND
 *   - it expired, or was revoked, longer ago than the retention window.
 *
 * Retention window = the larger of REFRESH_TOKEN_RETENTION_DAYS and
 * (refresh-token lifetime + 30 days). It must be longer than the lifetime:
 * refresh-token reuse detection (findRefreshTokenByJti in authService) needs
 * the row of an old token for as long as that token could still be sent.
 * Each run logs which of the two applied.
 *
 * An active session's newest row is not revoked and not expired, and every
 * row deleted here is expired, so it can never be deleted. refresh_tokens has
 * no foreign key other than member_id (replaced_by is plain text), so there
 * is no row another row depends on.
 *
 * Rows go in batches of BATCH_SIZE, one statement each, so a large first run
 * never holds a long lock on the table.
 */

const TIME_ZONE = 'Asia/Kolkata';
const LOG = '[refreshTokenCleanup]';
const DEFAULT_RETENTION_DAYS = 30;
// Kept on top of the refresh-token lifetime before a row may go.
const SAFETY_MARGIN_DAYS = 30;
const BATCH_SIZE = 1000;
// Stops one run after this many batches (500,000 rows); the rest goes the
// next night.
const MAX_BATCHES = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
// Give initDB time to finish before the start-up dry run.
const DRY_RUN_DELAY_MS = 30_000;

function readSettings() {
  const days = Number.parseInt(process.env.REFRESH_TOKEN_RETENTION_DAYS, 10);

  return {
    enabled: process.env.REFRESH_TOKEN_CLEANUP_ENABLED === 'true',
    dryRun: process.env.REFRESH_TOKEN_CLEANUP_DRY_RUN === 'true',
    retentionDays: Number.isInteger(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS,
  };
}

/*
 * How many days a dead row is kept, and which rule gave that number.
 * Returns null when the refresh-token lifetime cannot be read
 * (JWT_REFRESH_EXPIRES_IN is not something like "30d"); nothing is deleted
 * then.
 */
function retentionWindow(settings = readSettings()) {
  const expiry = computeRefreshExpiry();
  if (!expiry) return null;

  const lifetimeDays = Math.ceil((expiry.getTime() - Date.now()) / DAY_MS);
  const minimumDays = lifetimeDays + SAFETY_MARGIN_DAYS;

  if (settings.retentionDays >= minimumDays) {
    return {
      days: settings.retentionDays,
      lifetimeDays,
      rule: 'REFRESH_TOKEN_RETENTION_DAYS',
    };
  }

  return {
    days: minimumDays,
    lifetimeDays,
    rule: `refresh-token lifetime ${lifetimeDays}d + ${SAFETY_MARGIN_DAYS}d (longer than REFRESH_TOKEN_RETENTION_DAYS=${settings.retentionDays})`,
  };
}

/*
 * One cleanup run.
 *
 * options.dryRun        count only, delete nothing
 * options.onlyMemberId  limit the run to one member's rows (tests only)
 */
async function runRefreshTokenCleanup(options = {}) {
  const settings = readSettings();
  const dryRun = options.dryRun ?? settings.dryRun;
  const startedAt = Date.now();

  const window = retentionWindow(settings);
  if (!window) {
    console.error(
      `${LOG} Skipped: the refresh-token lifetime (JWT_REFRESH_EXPIRES_IN) could not be read, so no safe retention window is known.`,
    );
    return null;
  }

  const onlyMemberId = options.onlyMemberId ?? null;
  const params = onlyMemberId === null ? [window.days] : [window.days, onlyMemberId];

  // "expires_at < NOW()" on every row: nothing that could still be used,
  // and so no active session's newest row, can match.
  const deadRows = `
    expires_at < NOW()
    AND (
      expires_at < NOW() - make_interval(days => $1)
      OR revoked_at < NOW() - make_interval(days => $1)
    )
    ${onlyMemberId === null ? '' : 'AND member_id = $2'}
  `;

  let rows = 0;
  let batches = 0;

  if (dryRun) {
    const { rows: counted } = await db.query(
      `SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE ${deadRows}`,
      params,
    );
    rows = counted[0].n;
  } else {
    for (;;) {
      const { rowCount } = await db.query(
        `DELETE FROM refresh_tokens
         WHERE id IN (
           SELECT id FROM refresh_tokens WHERE ${deadRows} LIMIT ${BATCH_SIZE}
         )`,
        params,
      );

      rows += rowCount;
      batches += 1;

      if (rowCount < BATCH_SIZE || batches >= MAX_BATCHES) break;
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log(
    `${LOG} ${dryRun ? '[dry run] ' : ''}` +
      `${rows} row(s) ${dryRun ? 'would be deleted' : `deleted in ${batches} batch(es)`}, ` +
      `${durationMs} ms. Kept: ${window.days} days, from ${window.rule}.`,
  );

  return {
    dryRun,
    rows,
    batches,
    durationMs,
    retentionDays: window.days,
    rule: window.rule,
  };
}

let running = null;

// Never two runs at the same time in one process.
function runOnce(options) {
  if (!running) {
    running = runRefreshTokenCleanup(options)
      .catch((err) => {
        console.error(`${LOG} error:`, err.message);
        return null;
      })
      .finally(() => {
        running = null;
      });
  }
  return running;
}

function scheduleRefreshTokenCleanup() {
  const settings = readSettings();

  if (!settings.enabled) {
    console.log(`${LOG} Off (set REFRESH_TOKEN_CLEANUP_ENABLED=true to turn on).`);
    return null;
  }

  const cron = require('node-cron');

  const job = cron.schedule(
    '30 3 * * *',
    () => runOnce({ dryRun: settings.dryRun }),
    { timezone: TIME_ZONE },
  );

  const window = retentionWindow(settings);

  console.log(
    `${LOG} ✅ Scheduled daily at 03:30 IST` +
      `${window ? `, keeping dead rows ${window.days} days (${window.rule})` : ''}` +
      `${settings.dryRun ? ' (dry run: nothing will be deleted)' : ''}.`,
  );

  // Dry run only: count once shortly after start-up too, so the number can
  // be read from the log without waiting for 03:30. Real deletes only ever
  // happen in the nightly run.
  if (settings.dryRun) {
    const timer = setTimeout(() => {
      runOnce({ dryRun: true });
    }, DRY_RUN_DELAY_MS);
    timer.unref?.();
  }

  return job;
}

module.exports = {
  scheduleRefreshTokenCleanup,
  runRefreshTokenCleanup,
  runOnce,
  retentionWindow,
  readSettings,
};
