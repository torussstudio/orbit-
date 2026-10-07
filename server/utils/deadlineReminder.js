'use strict';

const db = require('../db');
const { createNotification } = require('./pushNotify');

/*
 * Daily deadline reminders for task assignees.
 *
 * Env (see server/.env.example):
 *   DEADLINE_REMINDERS_ENABLED=true   turn it on (default OFF, so deployinga
 *                                     this does not start sending anything)
 *   DEADLINE_REMINDER_HOUR=9          hour of day, Asia/Kolkata (0-23)
 *   DEADLINE_REMINDERS_DRY_RUN=true   only log who would be notified
 *
 * Who gets a reminder: every active assignee of a leaf task (a sub task,
 * or a main task with no sub tasks) that is not Done and not In Review
 * (In Review is waiting for the manager) and whose due date is
 *   - tomorrow            -> "⏰ Task Due Tomorrow"
 *   - today               -> "⏰ Task Due Today"
 *   - yesterday           -> "🚨 Task Overdue" (first overdue day only)
 * Tasks in archived projects are skipped.
 *
 * Days are calendar days (YYYY-MM-DD). "Today" is today's date in
 * Asia/Kolkata. due_date normally holds the picked calendar date at
 * midnight, and its date part is read in SQL (due_date::date), so neither
 * the Node TZ nor pg's date parsing affects which day a task is due.
 *
 * No duplicates: every reminder has a stable eventKey
 * (deadline-reminder:<kind>:<taskId>:<today>), saved as the notification's
 * dedupe_key, which is unique per member. Re-running on the same day
 * (restart, catch-up, a second server) never sends the same reminder twice.
 */

const TIME_ZONE = 'Asia/Kolkata';
const LOG = '[deadlineReminder]';
const DEFAULT_HOUR = 9;
// Give initDB time to finish before the start-up catch-up run.
const CATCH_UP_DELAY_MS = 30_000;

function readSettings() {
  const hour = Number.parseInt(process.env.DEADLINE_REMINDER_HOUR, 10);

  return {
    enabled: process.env.DEADLINE_REMINDERS_ENABLED === 'true',
    dryRun: process.env.DEADLINE_REMINDERS_DRY_RUN === 'true',
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_HOUR,
  };
}

// Calendar day (YYYY-MM-DD) and hour (0-23) in Asia/Kolkata.
function kolkataNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

function addDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function eventKeyPrefix(today) {
  return `deadline-reminder:%:${today}`;
}

function buildReminder(row, days) {
  const title = `"${row.title}"`;

  if (row.due_day === days.tomorrow) {
    return {
      kind: 'due_tomorrow',
      type: 'task_due_reminder',
      title: '⏰ Task Due Tomorrow',
      body: `${title} is due tomorrow.`,
    };
  }

  if (row.due_day === days.today) {
    return {
      kind: 'due_today',
      type: 'task_due_reminder',
      title: '⏰ Task Due Today',
      body: `${title} is due today.`,
    };
  }

  if (row.due_day === days.yesterday) {
    return {
      kind: 'overdue',
      type: 'task_overdue',
      title: '🚨 Task Overdue',
      body: `${title} was due yesterday and is now overdue.`,
    };
  }

  return null;
}

/*
 * One reminder run.
 *
 * options.now          Date used as "now" (tests)
 * options.dryRun       log only, send nothing
 * options.onlyTaskIds  limit the run to these task ids (tests only)
 */
async function runDeadlineReminders(options = {}) {
  const settings = readSettings();
  const dryRun = options.dryRun ?? settings.dryRun;
  const today = kolkataNow(options.now).day;
  const days = {
    yesterday: addDays(today, -1),
    today,
    tomorrow: addDays(today, 1),
  };
  const onlyTaskIds = Array.isArray(options.onlyTaskIds)
    ? options.onlyTaskIds.map(String)
    : null;

  const { rows } = await db.query(
    `SELECT
       t.id AS task_id,
       t.title,
       t.project_id,
       t.due_date::date::text AS due_day,
       ta.member_id,
       m.name AS member_name
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN task_assignees ta ON ta.task_id = t.id
     JOIN members m ON m.id = ta.member_id
     WHERE m.active = true
       AND p.status <> 'archived'
       AND COALESCE(t.stage, '') NOT IN ('Done', 'In Review')
       AND t.due_date::date IN ($1::date, $2::date, $3::date)
       AND NOT EXISTS (
         SELECT 1 FROM tasks s WHERE s.parent_task_id = t.id
       )
       AND ($4::text[] IS NULL OR t.id::text = ANY($4::text[]))
     ORDER BY t.due_date, t.id, ta.member_id`,
    [days.yesterday, days.today, days.tomorrow, onlyTaskIds],
  );

  const candidates = rows
    .map((row) => {
      const reminder = buildReminder(row, days);
      return reminder
        ? {
            row,
            reminder,
            eventKey: `deadline-reminder:${reminder.kind}:${row.task_id}:${today}`,
          }
        : null;
    })
    .filter(Boolean);

  // Reminders already saved today (earlier run, restart, other server).
  const { rows: existing } = candidates.length
    ? await db.query(
        `SELECT member_id::text AS member_id, dedupe_key
         FROM notifications
         WHERE dedupe_key = ANY($1::text[])`,
        [[...new Set(candidates.map((c) => c.eventKey))]],
      )
    : { rows: [] };

  const alreadySent = new Set(
    existing.map((r) => `${r.member_id}|${r.dedupe_key}`),
  );

  let sent = 0;
  let skipped = 0;

  for (const { row, reminder, eventKey } of candidates) {
    if (alreadySent.has(`${row.member_id}|${eventKey}`)) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(
        `${LOG} [dry run] would notify member ${row.member_id} (${row.member_name}): ` +
          `${reminder.title} — ${reminder.body} [task ${row.task_id}, due ${row.due_day}]`,
      );
      sent += 1;
      continue;
    }

    // createNotification's ON CONFLICT (member_id, dedupe_key) also
    // blocks a duplicate if two runs overlap.
    const notification = await createNotification(
      row.member_id,
      reminder.title,
      reminder.body,
      {
        type: reminder.type,
        entityId: row.task_id,
        entityType: 'task',
        eventKey,
        url: `/projects/${row.project_id}/tasks/${row.task_id}`,
      },
    );

    if (notification) sent += 1;
  }

  console.log(
    `${LOG} ${dryRun ? '[dry run] ' : ''}${today}: ` +
      `${sent} reminder(s) ${dryRun ? 'would be sent' : 'sent'}, ${skipped} already sent earlier.`,
  );

  return { today, dryRun, sent, skipped, candidates: candidates.length };
}

// Has any reminder already been saved today? (Used by the start-up
// catch-up; a day with nothing due simply runs again, which is harmless
// because of the eventKey.)
async function remindersSentToday(today) {
  const { rows } = await db.query(
    `SELECT 1 FROM notifications WHERE dedupe_key LIKE $1 LIMIT 1`,
    [eventKeyPrefix(today)],
  );
  return rows.length > 0;
}

let running = null;

// Never two runs at the same time in one process.
function runOnce(options) {
  if (!running) {
    running = runDeadlineReminders(options)
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

async function catchUp(settings, now = new Date()) {
  const { day, hour } = kolkataNow(now);

  if (hour < settings.hour) return { ran: false, reason: 'before reminder hour' };

  if (!settings.dryRun && (await remindersSentToday(day))) {
    console.log(`${LOG} Catch-up: today's reminders were already sent.`);
    return { ran: false, reason: 'already sent today' };
  }

  console.log(`${LOG} Catch-up: past ${settings.hour}:00 IST, running today's reminders now.`);
  const result = await runOnce({ dryRun: settings.dryRun, now });
  return { ran: true, result };
}

function scheduleDeadlineReminders() {
  const settings = readSettings();

  if (!settings.enabled) {
    console.log(`${LOG} Off (set DEADLINE_REMINDERS_ENABLED=true to turn on).`);
    return null;
  }

  const cron = require('node-cron');

  const job = cron.schedule(
    `0 ${settings.hour} * * *`,
    () => runOnce({ dryRun: settings.dryRun }),
    { timezone: TIME_ZONE },
  );

  console.log(
    `${LOG} ✅ Scheduled daily at ${String(settings.hour).padStart(2, '0')}:00 IST` +
      `${settings.dryRun ? ' (dry run: nothing will be sent)' : ''}.`,
  );

  const timer = setTimeout(() => {
    catchUp(settings).catch((err) => {
      console.error(`${LOG} catch-up error:`, err.message);
    });
  }, CATCH_UP_DELAY_MS);
  timer.unref?.();

  return job;
}

module.exports = {
  scheduleDeadlineReminders,
  runDeadlineReminders,
  catchUp,
  kolkataNow,
  readSettings,
};
