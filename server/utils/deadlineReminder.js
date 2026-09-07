const db = require('../db');
// createNotification import removed with the alerts below (see chat).
// Note (pre-existing, not caused by this change): checkDeadlines() is
// exported here but nothing in server/index.js actually calls or
// schedules it — unlike scheduleDailyReminders() in dailyReminder.js,
// which IS wired up. Worth deciding whether to wire this one up too
// when you rebuild deadline alerts. Re-import createNotification from
// './pushNotify' when re-adding an alert here.

async function checkDeadlines() {
  try {
    // Multi-assignee: JOIN task_assignees fans out one row per (task,
    // assignee) pair on purpose here — every assigned person should get
    // their own reminder.
    // Tasks due tomorrow
    const { rows: dueTomorrow } = await db.query(`
      SELECT t.id, t.title, ta.member_id AS assignee_id, p.name as project_name
      FROM tasks t
      JOIN task_assignees ta ON ta.task_id = t.id
      JOIN projects p ON t.project_id = p.id
      WHERE t.stage NOT IN ('Done')
        AND t.due_date = CURRENT_DATE + INTERVAL '1 day'
    `);

    // NOTIFICATION REMOVED (see chat) — was: "⏰ ... is due tomorrow!"
    // sent to each assignee here. Query above is untouched so this can
    // be reconnected by adding the createNotification call back in.

    // Tasks that became overdue today
    const { rows: overdueToday } = await db.query(`
      SELECT t.id, t.title, ta.member_id AS assignee_id, p.name as project_name
      FROM tasks t
      JOIN task_assignees ta ON ta.task_id = t.id
      JOIN projects p ON t.project_id = p.id
      WHERE t.stage NOT IN ('Done')
        AND t.due_date = CURRENT_DATE - INTERVAL '1 day'
    `);

    // NOTIFICATION REMOVED (see chat) — was: "🚨 ... is overdue!" sent
    // to each assignee here. Query above is untouched so this can be
    // reconnected by adding the createNotification call back in.

    console.log(`[Deadline Check] due tomorrow: ${dueTomorrow.length}, overdue: ${overdueToday.length}`);
  } catch (e) {
    console.error('[Deadline Check] error:', e.message);
  }
}

module.exports = { checkDeadlines };