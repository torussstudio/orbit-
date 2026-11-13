'use strict';

/*
 * Work-streak milestone notifications.
 *
 * A member's streak is the number of working days in a row (Monday to
 * Saturday, Sunday never breaks or adds to it) on which they did task
 * activity: a task action (create, stage change, ...) or a task comment.
 * It is the same streak the dashboard heatmap shows.
 *
 * When a member's streak, counting today, reaches a milestone (MILESTONES)
 * they get one notification: the bell plus a push, following their settings
 * (type 'streak_milestone', row "Work streak milestone" in Account settings ->
 * Notifications).
 *
 * The job runs at minute 15 of every hour from FROM_HOUR to TO_HOUR (IST),
 * so the notification arrives within the hour of the activity that reached
 * the milestone. Safe to run any number of times: eventKey
 * `streak:<milestone>:<day>` makes a repeat a no-op for that member and day.
 * Not run on the office's days off.
 *
 *   STREAK_MILESTONES_ENABLED=false   switch the job off (default: on)
 *   STREAK_MILESTONES_FROM_HOUR=9     first hour of day, 0-23, Asia/Kolkata
 *   STREAK_MILESTONES_TO_HOUR=22      last hour of day, 0-23, Asia/Kolkata
 */

const db = require('../db');
const { createNotification } = require('./pushNotify');
const { kolkataNow } = require('./deadlineReminder');

const LOG = '[streakMilestones]';
const TIME_ZONE = 'Asia/Kolkata';
const IST = 'Asia/Kolkata';
// Keep in step with MILESTONES in client/src/components/progress/ActivityHeatmap.jsx.
const MILESTONES = [5, 10, 25, 50, 100, 150, 200, 250, 300];
// Look this far back when counting a streak (longer than the biggest milestone).
const LOOKBACK_DAYS = 400;
const PUSH_TTL_SECONDS = 6 * 60 * 60;

function enabled() {
  return String(process.env.STREAK_MILESTONES_ENABLED ?? 'true').toLowerCase() !== 'false';
}

function hourFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const hour = Number(raw);
  if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return hour;
  console.warn(`${LOG} ${name}="${raw}" is not an hour from 0 to 23. Using ${fallback}.`);
  return fallback;
}

const dayOfWeek = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

function previousDay(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// Working days in a row ending today. `days` is a Set of YYYY-MM-DD with activity.
function streakEndingToday(today, days) {
  let streak = 0;
  for (let day = today, guard = 0; guard < LOOKBACK_DAYS; day = previousDay(day), guard += 1) {
    if (dayOfWeek(day) === 0) continue; // Sunday: skipped
    if (!days.has(day)) break;
    streak += 1;
  }
  return streak;
}

// options.now: Date used as "now" (tests). options.force: ignore the day off.
async function runStreakMilestones(options = {}) {
  const now = kolkataNow(options.now);

  if (now.offDay && !options.force) {
    return { sent: 0, skipped: 'off-day' };
  }

  try {
    // Only members with task activity today can have just reached a
    // milestone, so only their history is read.
    const { rows } = await db.query(
      `WITH active AS (
         SELECT a.actor_id AS member_id
           FROM task_activity a
          WHERE a.actor_id IS NOT NULL
            AND (a.created_at AT TIME ZONE '${IST}')::date = $1::date
         UNION
         SELECT c.author_id
           FROM task_comments c
          WHERE (c.created_at AT TIME ZONE '${IST}')::date = $1::date
       ),
       ev AS (
         SELECT a.actor_id AS member_id, (a.created_at AT TIME ZONE '${IST}')::date AS day
           FROM task_activity a
          WHERE a.actor_id IN (SELECT member_id FROM active)
            AND a.created_at >= (($1::date - ${LOOKBACK_DAYS})::timestamp AT TIME ZONE '${IST}')
         UNION
         SELECT c.author_id, (c.created_at AT TIME ZONE '${IST}')::date
           FROM task_comments c
          WHERE c.author_id IN (SELECT member_id FROM active)
            AND c.created_at >= (($1::date - ${LOOKBACK_DAYS})::timestamp AT TIME ZONE '${IST}')
       )
       SELECT ev.member_id, to_char(ev.day, 'YYYY-MM-DD') AS day
         FROM ev
         JOIN members m ON m.id = ev.member_id
        WHERE m.active = true AND m.role = 'member'`,
      [now.day],
    );

    const byMember = new Map();
    for (const row of rows) {
      const key = String(row.member_id);
      if (!byMember.has(key)) byMember.set(key, { id: row.member_id, days: new Set() });
      byMember.get(key).days.add(row.day);
    }

    let sent = 0;
    for (const { id, days } of byMember.values()) {
      const streak = streakEndingToday(now.day, days);
      if (!MILESTONES.includes(streak)) continue;

      const notification = await createNotification(
        id,
        'Work streak milestone',
        `${streak} working days in a row with task activity. Keep it going!`,
        {
          type: 'streak_milestone',
          url: '/',
          streak,
          eventKey: `streak:${streak}:${now.day}`,
          // One at a time on the device; replacing it is silent.
          tag: 'orbit-streak',
          renotify: false,
        },
        { push: { ttl: PUSH_TTL_SECONDS, urgency: 'normal', topic: 'orbitstreak' } },
      );
      if (notification) sent += 1;
    }

    if (sent) console.log(`${LOG} ${now.day} - ${sent} milestone notification(s) sent.`);
    return { sent, checked: byMember.size };
  } catch (err) {
    console.error(`${LOG} failed:`, err.message);
    return null;
  }
}

function scheduleStreakMilestones() {
  if (!enabled()) {
    console.log(`${LOG} off (STREAK_MILESTONES_ENABLED=false).`);
    return;
  }

  const fromHour = hourFromEnv('STREAK_MILESTONES_FROM_HOUR', 9);
  const toHour = hourFromEnv('STREAK_MILESTONES_TO_HOUR', 22);

  try {
    const cron = require('node-cron');
    cron.schedule(`15 ${fromHour}-${toHour} * * *`, () => runStreakMilestones(), { timezone: TIME_ZONE });
    console.log(`${LOG} scheduled at minute 15, ${String(fromHour).padStart(2, '0')}:00-${String(toHour).padStart(2, '0')}:00 IST.`);
  } catch (_) {
    console.warn(`${LOG} node-cron not found - checking every hour instead.`);
    setInterval(() => {
      const { hour } = kolkataNow();
      if (hour >= fromHour && hour <= toHour) runStreakMilestones();
    }, 60 * 60 * 1000).unref?.();
  }
}

module.exports = {
  scheduleStreakMilestones,
  runStreakMilestones,
  streakEndingToday,
  MILESTONES,
};
