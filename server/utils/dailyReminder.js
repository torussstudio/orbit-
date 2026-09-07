'use strict';

const db = require('../db');
// createNotification/sendToMany import removed with the sends below
// (see chat). Runner + cron schedule + queries still run — re-import
// from './pushNotify' when re-adding a digest send here.

// ─── Members: one digest notification per member ──────────────────
async function remindMembers() {
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
    WHERE
      m.role = 'member'
      AND t.stage NOT IN ('Done')
    GROUP BY ta.member_id
    HAVING COUNT(*) > 0
  `);

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
      console.log(`[dailyReminder] (send disabled) member ${row.user_id}: ${title} — ${body}`);
      notified++;
    } catch (err) {
      console.error(`[dailyReminder] Member notify failed userId=${row.user_id}:`, err.message);
    }
  }
  return notified;
}

// ─── Managers: one summary notification per manager ───────────────
async function remindManagers() {
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

  const { rows: managers } = await db.query(
    `SELECT id FROM members WHERE role = 'manager'`
  );

  if (!managers.length) return 0;

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
  console.log(`[dailyReminder] (send disabled) ${managerIds.length} manager(s): ${title} — ${body}`);
  return managerIds.length;
}

// ─── Main runner ──────────────────────────────────────────────────
async function runDailyReminders() {
  console.log('[dailyReminder] ⏰ Running daily reminders…');
  try {
    const [m, mg] = await Promise.all([remindMembers(), remindManagers()]);
    console.log(`[dailyReminder] ✅ Done — ${m} member(s), ${mg} manager(s) notified.`);
  } catch (err) {
    console.error('[dailyReminder] ❌ Error:', err.message);
  }
}

// ─── Scheduler: runs every day at 09:00 ──────────────────────────
function scheduleDailyReminders() {
  try {
    const cron = require('node-cron');
    cron.schedule('0 9 * * *', runDailyReminders, {
      timezone: process.env.TZ || 'Asia/Kolkata',
    });
    console.log('[dailyReminder] ✅ Cron scheduled — daily reminders at 09:00 IST.');
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