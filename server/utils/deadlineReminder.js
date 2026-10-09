'use strict';

const db = require('../db');
const { createNotification } = require('./pushNotify');

/*
 * Deadline reminders for task assignees.
 *
 * Env (see server/.env.example):
 *   DEADLINE_REMINDERS_ENABLED=true   turn it on (default OFF, so deploying
 *                                     this does not start sending anything)
 *   DEADLINE_REMINDER_HOUR=9          default hour of day, Asia/Kolkata (0-23),
 *                                     for members who did not choose their own
 *   DEADLINE_REMINDERS_DRY_RUN=true   only log who would be notified
 *   REMINDER_OFF_DAYS=sun             the days the office is closed
 *                                     (mon..sun, comma-separated). Default sun
 *
 * Who gets a reminder: every active assignee of a leaf task (a sub task,
 * or a main task with no sub tasks) that is not Done and not In Review
 * (In Review is waiting for the manager) and whose due date is
 *   - tomorrow            -> "⏰ Task Due Tomorrow"
 *   - today               -> "⏰ Task Due Today"
 *   - yesterday           -> "🚨 Task Overdue" (first overdue day only)
 * Tasks in archived projects are skipped.
 *
 * When: the job runs every hour. A member is picked from their reminder
 * hour onwards: the hour they chose in Account settings -> Notifications,
 * or DEADLINE_REMINDER_HOUR. Members are left out, in the query itself, when
 * they paused all notifications, switched that reminder off, or chose to
 * skip days off and today is one (member_notification_prefs,
 * member_notification_type_prefs). A member with no saved preferences is
 * picked from DEADLINE_REMINDER_HOUR, every day.
 *
 * Days off are REMINDER_OFF_DAYS, the same for everyone. A member turns
 * "skip days off" on or off for themselves; that switch is the column
 * member_notification_prefs.skip_weekends (the name is older than the
 * setting: it means "skip days off", whichever days those are).
 *
 * Skipping days off moves reminders, it does not drop them. For a member
 * who skips days off (and only for them):
 *   - the last working day before one or more days off also sends
 *     "⏰ Task Due <weekday>" for tasks due on those days off and on the
 *     first working day after them (the "due tomorrow" reminders they
 *     would have got on the days off), and
 *   - the first working day after also sends "🚨 Task Overdue" for tasks
 *     whose overdue reminder fell on one of those days off and that are
 *     still not done.
 * With only Sunday off: Saturday also sends "Task Due Monday", and Monday
 * also sends overdue for tasks that were due on Saturday.
 * See offDayCatchUpDays().
 *
 * Days are calendar days (YYYY-MM-DD). "Today" is today's date in
 * Asia/Kolkata. due_date normally holds the picked calendar date at
 * midnight, and its date part is read in SQL (due_date::date), so neither
 * the Node TZ nor pg's date parsing affects which day a task is due.
 *
 * No duplicates: every reminder has a stable eventKey
 * (deadline-reminder:<kind>:<taskId>:<today>), saved as the notification's
 * dedupe_key, which is unique per member. That is what makes the hourly
 * run safe: every later run that day (the next hour, a restart, a second
 * server) finds the reminder already saved and never sends it twice.
 */

const TIME_ZONE = 'Asia/Kolkata';
const LOG = '[deadlineReminder]';
const DEFAULT_HOUR = 9;
// Give initDB time to finish before the run at start-up.
const START_UP_DELAY_MS = 30_000;

function readSettings() {
  const hour = Number.parseInt(process.env.DEADLINE_REMINDER_HOUR, 10);

  return {
    enabled: process.env.DEADLINE_REMINDERS_ENABLED === 'true',
    dryRun: process.env.DEADLINE_REMINDERS_DRY_RUN === 'true',
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_HOUR,
  };
}

// Index = Date#getUTCDay().
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// The order days off are reported in ("sat, sun", not "sun, sat").
const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DEFAULT_OFF_DAYS = ['sun'];

// The last bad REMINDER_OFF_DAYS value warned about, so the hourly job does
// not repeat the same warning every run.
let warnedOffDays = null;

/*
 * The days the office is closed, as weekday names in week order.
 *
 * REMINDER_OFF_DAYS: weekday names mon..sun, comma-separated. Not set: "sun".
 * An empty or invalid value (an unknown name, or all seven days, which would
 * leave no working day to move a reminder to) also gives "sun", with a
 * warning in the log.
 */
function readOffDays() {
  const raw = process.env.REMINDER_OFF_DAYS;

  if (raw === undefined) return DEFAULT_OFF_DAYS;

  const names = raw
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  const valid =
    names.length > 0 &&
    names.every((name) => WEEKDAYS.includes(name)) &&
    new Set(names).size < WEEKDAYS.length;

  if (!valid) {
    if (warnedOffDays !== raw) {
      warnedOffDays = raw;
      console.warn(
        `${LOG} REMINDER_OFF_DAYS="${raw}" is not valid (weekday names mon..sun, comma-separated, leaving at least one working day). Using "sun".`,
      );
    }
    return DEFAULT_OFF_DAYS;
  }

  return WEEK_ORDER.filter((name) => names.includes(name));
}

// Is this calendar day (YYYY-MM-DD) one of the days off?
function isOffDay(day, offDays = readOffDays()) {
  return offDays.includes(WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]);
}

// Calendar day (YYYY-MM-DD), hour (0-23) and "is today a day off" in
// Asia/Kolkata.
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

  const day = `${parts.year}-${parts.month}-${parts.day}`;

  return {
    day,
    hour: Number(parts.hour),
    offDay: isOffDay(day),
  };
}

function addDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/*
 * Extra due days looked at today for members who skip days off, on top of
 * yesterday / today / tomorrow, so the reminders they miss on the days off
 * reach them on a working day instead. Worked out from the days off, for
 * any set of them:
 *
 *   ahead   Today is followed by k days off. Their "due tomorrow" reminders
 *           are sent today: tasks due on those days off and on the first
 *           working day after them. Tomorrow is covered already, so the
 *           extra days are today+2 .. today+k+1.
 *   behind  Today follows k days off. The overdue reminders that fell on
 *           them are sent today: tasks due the day before each of those
 *           days. Yesterday is covered already, so the extra days are
 *           today-(k+1) .. today-2.
 *
 * Only Sunday off:       Saturday -> Monday;          Monday -> Saturday.
 * Saturday + Sunday off: Friday -> Sunday and Monday; Monday -> Friday and
 *                        Saturday.
 * A day with a working day on both sides adds nothing, and neither does a
 * day off itself.
 */
function offDayCatchUpDays(today, offDays = readOffDays()) {
  // On a day off nothing is sent to these members at all.
  if (isOffDay(today, offDays)) return [];

  let ahead = 0;
  while (ahead < 7 && isOffDay(addDays(today, ahead + 1), offDays)) ahead += 1;

  let behind = 0;
  while (behind < 7 && isOffDay(addDays(today, -(behind + 1)), offDays)) behind += 1;

  const days = [];
  for (let i = behind + 1; i >= 2; i -= 1) days.push(addDays(today, -i));
  for (let i = 2; i <= ahead + 1; i += 1) days.push(addDays(today, i));
  return days;
}

// "Monday" for a calendar day (YYYY-MM-DD).
function weekdayName(day) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

// `type` is also the member's preference key for this reminder. The query
// in runDeadlineReminders joins the member's setting on the same two keys
// (due before today -> task_overdue, otherwise task_due_reminder): keep
// them in step.
function buildReminder(row, days) {
  const title = `"${row.title}"`;

  // Due after tomorrow: only the catch-up before days off, for a member who
  // skips them (see offDayCatchUpDays). The title names the day it is due.
  if (row.due_day > days.tomorrow) {
    const weekday = weekdayName(row.due_day);

    return {
      kind: 'due_ahead',
      type: 'task_due_reminder',
      title: `⏰ Task Due ${weekday}`,
      body: `${title} is due on ${weekday}.`,
    };
  }

  // Due before yesterday: only the catch-up after days off, for a member
  // who skips them (its overdue reminder fell on a day off).
  if (row.due_day < days.yesterday) {
    return {
      kind: 'overdue',
      type: 'task_overdue',
      title: '🚨 Task Overdue',
      body: `${title} was due on ${weekdayName(row.due_day)} and is now overdue.`,
    };
  }

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
  const now = kolkataNow(options.now);
  const today = now.day;
  const days = {
    yesterday: addDays(today, -1),
    today,
    tomorrow: addDays(today, 1),
  };
  const onlyTaskIds = Array.isArray(options.onlyTaskIds)
    ? options.onlyTaskIds.map(String)
    : null;

  /*
   * skip_reason: why this member's notification settings hold the reminder
   * back right now (NULL = send it). A real run keeps only the rows with no
   * reason, so muted members are never picked; a dry run ($8) also gets the
   * held-back rows, to log who was skipped and why.
   *
   * $5: today is a day off. $9: the extra due days of the catch-up around
   * days off. Both count only for members who skip days off (the column
   * skip_weekends); everyone else keeps yesterday / today / tomorrow, every
   * day.
   */
  const { rows } = await db.query(
    `SELECT r.*
     FROM (
       SELECT
         t.id AS task_id,
         t.title,
         t.project_id,
         t.due_date::date::text AS due_day,
         ta.member_id,
         m.name AS member_name,
         CASE
           WHEN COALESCE(np.pause_all, false)
             THEN 'paused all notifications'
           WHEN COALESCE(ntp.enabled, true) = false
             THEN 'turned this reminder off'
           WHEN $5::boolean AND COALESCE(np.skip_weekends, false)
             THEN 'skips days off'
           WHEN COALESCE(np.reminder_hour, $6::int) > $7::int
             THEN 'reminder hour ' || COALESCE(np.reminder_hour, $6::int) || ':00 not reached'
         END AS skip_reason
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN task_assignees ta ON ta.task_id = t.id
       JOIN members m ON m.id = ta.member_id
       LEFT JOIN member_notification_prefs np ON np.member_id = m.id
       LEFT JOIN member_notification_type_prefs ntp
              ON ntp.member_id = m.id
             AND ntp.type = CASE
                   WHEN t.due_date::date < $2::date THEN 'task_overdue'
                   ELSE 'task_due_reminder'
                 END
       WHERE m.active = true
         AND p.status <> 'archived'
         AND COALESCE(t.stage, '') NOT IN ('Done', 'In Review')
         AND (
           t.due_date::date IN ($1::date, $2::date, $3::date)
           OR (
             COALESCE(np.skip_weekends, false)
             AND t.due_date::date = ANY($9::date[])
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM tasks s WHERE s.parent_task_id = t.id
         )
         AND ($4::text[] IS NULL OR t.id::text = ANY($4::text[]))
     ) r
     WHERE $8::boolean OR r.skip_reason IS NULL
     ORDER BY r.due_day, r.task_id, r.member_id`,
    [
      days.yesterday,
      days.today,
      days.tomorrow,
      onlyTaskIds,
      now.offDay,
      settings.hour,
      now.hour,
      dryRun,
      offDayCatchUpDays(today),
    ],
  );

  const reminders = rows
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

  // Held back by the member's notification settings (dry runs only; a real
  // run never gets these rows).
  const held = reminders.filter((c) => c.row.skip_reason);
  const candidates = reminders.filter((c) => !c.row.skip_reason);

  // Reminders already saved today (an earlier hour, a restart, other server).
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

  for (const { row, reminder } of held) {
    console.log(
      `${LOG} [dry run] would skip member ${row.member_id} (${row.member_name}): ` +
        `${reminder.title} [task ${row.task_id}, due ${row.due_day}] — ${row.skip_reason}`,
    );
  }

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
    // blocks a duplicate if two runs overlap. It applies the member's
    // delivery choice (push / in-app / both) for this reminder type.
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
    `${LOG} ${dryRun ? '[dry run] ' : ''}${today} ${String(now.hour).padStart(2, '0')}:00 IST: ` +
      `${sent} reminder(s) ${dryRun ? 'would be sent' : 'sent'}, ${skipped} already sent earlier` +
      `${dryRun ? `, ${held.length} held back by notification settings` : ''}.`,
  );

  return {
    today,
    hour: now.hour,
    dryRun,
    sent,
    skipped,
    held: held.length,
    candidates: candidates.length,
  };
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

function scheduleDeadlineReminders() {
  const settings = readSettings();
  // Read here too, so a bad REMINDER_OFF_DAYS is reported at start-up even
  // while the reminders are off (the Notifications card uses it as well).
  const offDays = readOffDays();

  if (!settings.enabled) {
    console.log(`${LOG} Off (set DEADLINE_REMINDERS_ENABLED=true to turn on).`);
    return null;
  }

  const cron = require('node-cron');

  // Every hour, on the hour. Each member is picked from their own reminder
  // hour onwards; the dedupe key stops a second reminder later that day.
  const job = cron.schedule(
    '0 * * * *',
    () => runOnce({ dryRun: settings.dryRun }),
    { timezone: TIME_ZONE },
  );

  console.log(
    `${LOG} ✅ Scheduled hourly; default reminder hour ${String(settings.hour).padStart(2, '0')}:00 IST; ` +
      `days off: ${offDays.join(', ')}` +
      `${settings.dryRun ? ' (dry run: nothing will be sent)' : ''}.`,
  );

  // Once shortly after start-up too, so a restart during the day does not
  // wait for the next full hour. Reminders already sent today are skipped
  // by their dedupe key.
  const timer = setTimeout(() => {
    runOnce({ dryRun: settings.dryRun });
  }, START_UP_DELAY_MS);
  timer.unref?.();

  return job;
}

module.exports = {
  scheduleDeadlineReminders,
  runDeadlineReminders,
  runOnce,
  kolkataNow,
  readSettings,
  readOffDays,
  isOffDay,
  offDayCatchUpDays,
};
