// scripts/clear-main-task-assignees.js
//
// One-off cleanup: removes ALL assignees from every MAIN task
// (parent_task_id IS NULL), across every project. Sub-task assignees
// (parent_task_id IS NOT NULL) are left untouched.
//
// This only deletes rows in task_assignees — it doesn't touch the
// tasks table, task_activity, or anything else.

require("dotenv").config();
const db = require("../db");

async function run() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows: countRows } = await client.query(
      `SELECT COUNT(DISTINCT ta.task_id) AS main_tasks_with_assignees
       FROM task_assignees ta
       JOIN tasks t ON t.id = ta.task_id
       WHERE t.parent_task_id IS NULL`
    );

    const { rowCount: deletedRows } = await client.query(
      `DELETE FROM task_assignees
       WHERE task_id IN (SELECT id FROM tasks WHERE parent_task_id IS NULL)`
    );

    await client.query("COMMIT");
    console.log(
      `Done. ${countRows[0].main_tasks_with_assignees} main task(s) had assignees; removed ${deletedRows} assignee row(s) total.`
    );
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Failed, rolled back — nothing was changed:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    process.exit();
  }
}

run();