'use strict';

/*
 * Daily "log in to Orbit" reminder.
 *
 * Every day at LOGIN_REMINDER_HOUR (default 11:00, Asia/Kolkata) each active
 * member gets one push. Not sent on the office's days off (REMINDER_OFF_DAYS,
 * default Sunday, same setting the other reminders use).
 *
 * The text depends on the member's tasks:
 *   - tasks due today and/or overdue -> says how many
 *   - nothing due                    -> one of GENERIC, rotating by day
 *
 * Delivery follows the member's settings (type 'login_reminder', row "Daily
 * login reminder" in Account settings -> Notifications): "Pause all" or the
 * off switch stops it. It is push only (see decideDelivery in pushNotify.js),
 * so it never fills the bell list.
 *
 * Safe to run twice: eventKey `login-reminder:<day>` makes a repeat (a
 * restart, two server processes) a no-op for that member.
 *
 *   LOGIN_REMINDER_ENABLED=false   switch the job off (default: on)
 *   LOGIN_REMINDER_HOUR=11         hour of day, 0-23, Asia/Kolkata
 */

const db = require('../db');
const { createNotification } = require('./pushNotify');
const { kolkataNow } = require('./deadlineReminder');

const LOG = '[loginReminder]';
const TIME_ZONE = 'Asia/Kolkata';
const TITLE = 'Orbit';
// A reminder that could not be delivered by 2 p.m. is no use: the push
// service drops it instead of delivering it hours late.
const PUSH_TTL_SECONDS = 3 * 60 * 60;

const GENERIC = [
  "Good morning! Log in to Orbit and check what's on for today.",
  'Start your day on Orbit. Review your tasks and messages.',
  'Quick check-in: open Orbit and update your task status.',
  'Tasks and messages may be waiting for you on Orbit.',
  "Don't forget to log your time and update your tasks today.",
  'A minute on Orbit now keeps the team on track. Log in and catch up.',
];

function enabled() {
  return String(process.env.LOGIN_REMINDER_ENABLED ?? 'true').toLowerCase() !== 'false';
}

function reminderHour() {
  const raw = process.env.LOGIN_REMINDER_HOUR;
  if (raw === undefined || raw === '') return 11;
  const hour = Number(raw);
  if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return hour;
  console.warn(`${LOG} LOGIN_REMINDER_HOUR="${raw}" is not an hour from 0 to 23. Using 11.`);
  return 11;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The text for one member. `day` is YYYY-MM-DD (Asia/Kolkata).
function messageFor({ overdue, dueToday }, day) {
  if (dueToday > 0 && overdue > 0) {
    return `You have ${plural(dueToday, 'task')} due today and ${overdue} overdue. Open Orbit to update them.`;
  }
  if (overdue > 0) {
    return `You have ${plural(overdue, 'overdue task')}. Open Orbit to review and update.`;
  }
  if (dueToday > 0) {
    return `You have ${plural(dueToday, 'task')} due today. Open Orbit to update your progress.`;
  }
  const dayNumber = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return GENERIC[dayNumber % GENERIC.length];
}

// options.now: Date used as "now" (tests). options.force: ignore the day off.
async function runLoginReminders(options = {}) {
  const now = kolkataNow(options.now);

  if (now.offDay && !options.force) {
    console.log(`${LOG} ${now.day} is a day off - nothing sent.`);
    return { sent: 0, skipped: 'off-day' };
  }

  try {
    // Counts are per distinct task and assignee, as in the daily digest.
    const { rows } = await db.query(
      `SELECT m.id,
              COALESCE(c.overdue, 0)   AS overdue,
              COALESCE(c.due_today, 0) AS due_today
         FROM members m
         LEFT JOIN (
           SELECT ta.member_id,
                  COUNT(*) FILTER (WHERE t.due_date < $1::date)  AS overdue,
                  COUNT(*) FILTER (WHERE t.due_date = $1::date)  AS due_today
             FROM tasks t
             JOIN task_assignees ta ON ta.task_id = t.id
            WHERE t.stage NOT IN ('Done')
            GROUP BY ta.member_id
         ) c ON c.member_id = m.id
        WHERE m.active = true`,
      [now.day],
    );

    let sent = 0;
    const BATCH = 10;
    for (let i = 0; i < rows.length; i += BATCH) {
      const results = await Promise.all(
        rows.slice(i, i + BATCH).map((row) =>
          createNotification(
            row.id,
            TITLE,
            messageFor({ overdue: Number(row.overdue), dueToday: Number(row.due_today) }, now.day),
            {
              type: 'login_reminder',
              url: '/',
              eventKey: `login-reminder:${now.day}`,
              // One reminder at a time on the device; replacing is silent.
              tag: 'orbit-login-reminder',
              renotify: false,
            },
            { push: { ttl: PUSH_TTL_SECONDS, urgency: 'normal', topic: 'orbitlogin' } },
          ),
        ),
      );
      sent += results.filter(Boolean).length;
    }

    console.log(`${LOG} ${now.day} ${String(now.hour).padStart(2, '0')}:00 IST - ${sent} of ${rows.length} active member(s) notified.`);
    return { sent, total: rows.length };
  } catch (err) {
    console.error(`${LOG} failed:`, err.message);
    return null;
  }
}

function scheduleLoginReminders() {
  if (!enabled()) {
    console.log(`${LOG} off (LOGIN_REMINDER_ENABLED=false).`);
    return;
  }

  const hour = reminderHour();

  try {
    const cron = require('node-cron');
    cron.schedule(`0 ${hour} * * *`, () => runLoginReminders(), { timezone: TIME_ZONE });
    console.log(`${LOG} scheduled daily at ${String(hour).padStart(2, '0')}:00 IST.`);
  } catch (_) {
    // node-cron missing: look every 10 minutes. Within the reminder hour the
    // first run sends; later ones are no-ops because of the eventKey.
    console.warn(`${LOG} node-cron not found - checking every 10 minutes instead.`);
    setInterval(() => {
      if (kolkataNow().hour === hour) runLoginReminders();
    }, 10 * 60 * 1000).unref?.();
  }

  // The server was restarted during the reminder hour, after 11:00: send now
  // (members who already got it today are skipped by the eventKey).
  setTimeout(() => {
    if (kolkataNow().hour === hour) runLoginReminders();
  }, 45_000).unref?.();
}

module.exports = { scheduleLoginReminders, runLoginReminders, messageFor, GENERIC };
