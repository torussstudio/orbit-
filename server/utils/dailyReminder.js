'use strict';

const db = require('../db');
const { createNotification, sendToMany } = require('./pushNotify');

// ─── Members: one digest notification per member ──────────────────
async function remindMembers() {
  const { rows } = await db.query(`
    SELECT
      t.assignee_id                                        AS user_id,
      COUNT(*)                                             AS total_pending,
      COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE)   AS overdue,
      COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE)   AS due_today
    FROM tasks t
    JOIN members m ON m.id = t.assignee_id
    WHERE
      m.role = 'member'
      AND t.stage NOT IN ('Done')
      AND t.assignee_id IS NOT NULL
    GROUP BY t.assignee_id
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

      await createNotification(row.user_id, title, body, { url: '/tasks' });
      notified++;
    } catch (err) {
      console.error(`[dailyReminder] Member notify failed userId=${row.user_id}:`, err.message);
    }
  }
  return notified;
}

// ─── Managers: one summary notification per manager ───────────────
async function remindManagers() {
  const { rows: stats } = await db.query(`
    SELECT
      COUNT(*)                                            AS total_pending,
      COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE)  AS overdue,
      COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE)  AS due_today,
      COUNT(DISTINCT t.assignee_id)
        FILTER (WHERE t.assignee_id IS NOT NULL)          AS members_with_tasks
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
  await sendToMany(managerIds, title, body, { url: '/tasks' });
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