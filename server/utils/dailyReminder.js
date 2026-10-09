'use strict';

const db = require('../db');
const { kolkataNow, readSettings } = require('./deadlineReminder');
// createNotification/sendToMany import removed with the sends below
// (see chat). Runner + cron schedule + queries still run — re-import
// from './pushNotify' when re-adding a digest send here.

// ─── Notification preferences ─────────────────────────────────────
// The digest follows the member's settings (Account settings ->
// Notifications), with the type key 'daily_digest': not picked when they
// paused all notifications, switched the digest off, or skip days off and
// today is one (REMINDER_OFF_DAYS; the switch is the column skip_weekends).
// Each member is picked in exactly one run a
// day: the run at their reminder hour (their own, or DEADLINE_REMINDER_HOUR).
// A member with no saved preferences is picked at DEADLINE_REMINDER_HOUR,
// every day. The job runs every hour for that reason.
//
// Joined on the members row `m`. Parameters: $1 default hour, $2 the hour
// now, $3 today is a day off (all Asia/Kolkata).
const PREFS_JOIN = `
    LEFT JOIN member_notification_prefs np ON np.member_id = m.id
    LEFT JOIN member_notification_type_prefs ntp
           ON ntp.member_id = m.id AND ntp.type = 'daily_digest'`;

const PREFS_FILTER = `
      COALESCE(np.pause_all, false) = false
      AND COALESCE(ntp.enabled, true) = true
      AND COALESCE(np.reminder_hour, $1::int) = $2::int
      AND NOT ($3::boolean AND COALESCE(np.skip_weekends, false))`;

function prefsParams(now) {
  return [readSettings().hour, now.hour, now.offDay];
}

// ─── Members: one digest notification per member ──────────────────
async function remindMembers(now) {
  // Multi-assignee: fan out one row per (task, assignee) pair here on
  // purpose — each assigned member gets counted for their own digest.
  const { rows } = await db.query(`
    SELECT
      ta.member_id                                        AS user_id,
      COUNT(*)                                             AS total_pending,
      COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE)   AS overdue,
      COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE)   AS due_today
    FROM tasks t
    JOIN task_assignees ta ON ta.task_id = t.id
    JOIN members m ON m.id = ta.member_id
    ${PREFS_JOIN}
    WHERE
      m.role = 'member'
      AND t.stage NOT IN ('Done')
      AND ${PREFS_FILTER}
    GROUP BY ta.member_id
    HAVING COUNT(*) > 0
  `, prefsParams(now));

  let notified = 0;
  for (const row of rows) {
    try {
      const total    = Number(row.total_pending);
      const overdue  = Number(row.overdue);
      const dueToday = Number(row.due_today);

      let title = '📋 Daily Task Reminder';
      let body;

      if (overdue > 0 && dueToday > 0) {
        body = `You have ${total} pending task${total > 1 ? 's' : ''}: ${overdue} overdue and ${dueToday} due today.`;
      } else if (overdue > 0) {
        body = `You have ${overdue} overdue task${overdue > 1 ? 's' : ''}. Please review your progress.`;
      } else if (dueToday > 0) {
        body = `You have ${dueToday} task${dueToday > 1 ? 's' : ''} due today. You've got this!`;
      } else {
        body = `You have ${total} pending task${total > 1 ? 's' : ''}. Keep pushing forward!`;
      }

      // NOTIFICATION REMOVED (see chat) — was: createNotification(...)
      // sending the digest below. Query + message-building logic above
      // is untouched; logging instead of sending so pipeline health is
      // still visible while this is disconnected.
      // When re-adding the send: pass type 'daily_digest' and an eventKey
      // such as `daily-digest:${now.day}`, so the member's delivery choice
      // applies and a restart cannot send the digest twice.
      console.log(`[dailyReminder] (send disabled) member ${row.user_id}: ${title} — ${body}`);
      notified++;
    } catch (err) {
      console.error(`[dailyReminder] Member notify failed userId=${row.user_id}:`, err.message);
    }
  }
  return notified;
}

// ─── Managers: one summary notification per manager ───────────────
async function remindManagers(now) {
  // Managers whose settings pick them in this run (see PREFS_FILTER).
  const { rows: managers } = await db.query(
    `SELECT m.id
       FROM members m
       ${PREFS_JOIN}
      WHERE m.role = 'manager'
        AND ${PREFS_FILTER}`,
    prefsParams(now),
  );

  if (!managers.length) return 0;

  // Task counts (total/overdue/due_today) must stay scoped to DISTINCT
  // tasks — no task_assignees join in this main query, or a task with
  // 2+ assignees would get counted twice. members_with_tasks is pulled
  // from a separate subquery for exactly that reason.
  const { rows: stats } = await db.query(`
    SELECT
      COUNT(*)                                            AS total_pending,
      COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE)  AS overdue,
      COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE)  AS due_today,
      (
        SELECT COUNT(DISTINCT ta.member_id)
        FROM task_assignees ta
        JOIN tasks t2 ON t2.id = ta.task_id
        WHERE t2.stage NOT IN ('Done')
      ) AS members_with_tasks
    FROM tasks t
    WHERE t.stage NOT IN ('Done')
  `);

  const s        = stats[0];
  const total    = Number(s.total_pending);
  const overdue  = Number(s.overdue);
  const dueToday = Number(s.due_today);
  const members  = Number(s.members_with_tasks);

  const title = '📊 Daily Team Summary';
  let body;

  if (total === 0) {
    body = 'Great news — no pending tasks across the team today! 🎉';
  } else {
    const parts = [`${total} pending task${total !== 1 ? 's' : ''} across ${members} member${members !== 1 ? 's' : ''}`];
    if (overdue > 0)  parts.push(`${overdue} overdue ⚠️`);
    if (dueToday > 0) parts.push(`${dueToday} due today`);
    body = parts.join(' · ');
  }

  const managerIds = managers.map((m) => m.id);
  // NOTIFICATION REMOVED (see chat) — was: sendToMany(managerIds, title,
  // body, ...). Stats/message-building above untouched; logging instead
  // of sending so pipeline health is still visible while disconnected.
  // When re-adding the send: type 'daily_digest' and a per-day eventKey,
  // as for the member digest above.
  console.log(`[dailyReminder] (send disabled) ${managerIds.length} manager(s): ${title} — ${body}`);
  return managerIds.length;
}

// ─── Main runner ──────────────────────────────────────────────────
// options.now: Date used as "now" (tests).
async function runDailyReminders(options = {}) {
  const now = kolkataNow(options.now);
  try {
    const [m, mg] = await Promise.all([remindMembers(now), remindManagers(now)]);
    // The job runs every hour and most hours pick nobody: only the hours
    // that did are logged.
    if (m + mg > 0) {
      console.log(`[dailyReminder] ✅ ${String(now.hour).padStart(2, '0')}:00 IST — ${m} member(s), ${mg} manager(s) notified.`);
    }
    return { members: m, managers: mg };
  } catch (err) {
    console.error('[dailyReminder] ❌ Error:', err.message);
    return null;
  }
}

// ─── Scheduler: runs every hour, each member at their reminder hour ─
function scheduleDailyReminders() {
  try {
    const cron = require('node-cron');
    cron.schedule('0 * * * *', () => runDailyReminders(), {
      timezone: process.env.TZ || 'Asia/Kolkata',
    });
    console.log(`[dailyReminder] ✅ Cron scheduled — hourly, default reminder hour ${String(readSettings().hour).padStart(2, '0')}:00 IST.`);
  } catch (_) {
    // node-cron not installed — use 24h interval fallback
    console.warn('[dailyReminder] node-cron not found — using 24h interval fallback.');
    setTimeout(() => {
      runDailyReminders();
      setInterval(runDailyReminders, 24 * 60 * 60 * 1000);
    }, 30_000);
  }
}

module.exports = { scheduleDailyReminders, runDailyReminders };
