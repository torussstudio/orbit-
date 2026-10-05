'use strict';

/*
 * Measures the round trip of a trivial query from where this runs to the
 * database, through the app's own pool settings.
 *
 *   node scripts/db-latency.js          (from the server folder)
 *
 * Read-only: it sends "SELECT 1" and nothing else. It is never loaded by
 * the app, and DB_SKIP_INIT stops server/db from preparing the schema, so
 * no other statement is sent.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.DB_SKIP_INIT = 'true';

const db = require('../db');

const RUNS = 20;

function percentile(sorted, p) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function main() {
  const client = await db.connect();

  try {
    // Warm-up: the first query on a new connection includes its set-up.
    await client.query('SELECT 1');

    const times = [];
    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      await client.query('SELECT 1');
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
    }

    times.sort((a, b) => a - b);
    const fmt = (n) => n.toFixed(1);

    console.log(`SELECT 1 x ${RUNS} (after 1 warm-up)`);
    console.log(`median: ${fmt(percentile(times, 50))} ms`);
    console.log(`p95:    ${fmt(percentile(times, 95))} ms`);
    console.log(`min:    ${fmt(times[0])} ms   max: ${fmt(times[times.length - 1])} ms`);
  } finally {
    client.release();
    await db.end();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('db-latency failed:', err.message);
    process.exit(1);
  },
);
