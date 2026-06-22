const db = require('../db');
const { createNotification } = require('./pushNotify');

async function checkDeadlines() {
  try {
    // Tasks due tomorrow
    const { rows: dueTomorrow } = await db.query(`
      SELECT t.id, t.title, t.assignee_id, p.name as project_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.assignee_id IS NOT NULL
        AND t.stage NOT IN ('Done')
        AND t.due_date = CURRENT_DATE + INTERVAL '1 day'
    `);

    for (const task of dueTomorrow) {
      await createNotification(
        task.assignee_id,
        `⏰ Task "${task.title}" in "${task.project_name}" is due tomorrow!`
      );
    }

    // Tasks that became overdue today
    const { rows: overdueToday } = await db.query(`
      SELECT t.id, t.title, t.assignee_id, p.name as project_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.assignee_id IS NOT NULL
        AND t.stage NOT IN ('Done')
        AND t.due_date = CURRENT_DATE - INTERVAL '1 day'
    `);

    for (const task of overdueToday) {
      await createNotification(
        task.assignee_id,
        `🚨 Task "${task.title}" in "${task.project_name}" is overdue!`
      );
    }

    console.log(`[Deadline Check] due tomorrow: ${dueTomorrow.length}, overdue: ${overdueToday.length}`);
  } catch (e) {
    console.error('[Deadline Check] error:', e.message);
  }
}

module.exports = { checkDeadlines };