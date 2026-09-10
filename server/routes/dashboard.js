const router = require("express").Router();
const db = require("../db");
const { auth } = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  if (req.user.role === "manager") {
    const [
      projects,
      tasksByStage,
      overdue,
      clusterRework,
      workload,
      totalProjectsCount,
      totalMainTasksCount,
      overdueCount,
    ] = await Promise.all([
      db.query(`SELECT id,name,status,
        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND stage='Done') as done_tasks
        FROM projects p WHERE status!='archived' ORDER BY created_at DESC LIMIT 10`),
      db.query(
        `SELECT stage, COUNT(*) as count FROM tasks WHERE parent_task_id IS NULL GROUP BY stage ORDER BY count DESC`,
      ),
      // Multi-assignee: LEFT JOIN LATERAL keeps this one row per task
      // (no fan-out) while showing every assignee's name, comma-joined.
      db.query(`SELECT t.id,t.title,t.due_date,t.stage,t.project_id,p.name as project_name, assignee_agg.assignee_name
        FROM tasks t JOIN projects p ON t.project_id=p.id
        LEFT JOIN LATERAL (
          SELECT STRING_AGG(m.name, ', ' ORDER BY m.name) AS assignee_name
          FROM task_assignees ta JOIN members m ON m.id=ta.member_id WHERE ta.task_id=t.id
        ) assignee_agg ON true
        WHERE t.due_date < NOW() AND t.stage NOT IN ('Done') ORDER BY t.due_date`),
      db.query(
        `SELECT id,name,rework_count,status FROM clusters WHERE rework_count > 0
           UNION ALL
           SELECT t.id, t.title as name, t.rework_count, t.stage as status FROM tasks t
           WHERE t.rework_count > 0 AND t.parent_task_id IS NOT NULL
           ORDER BY rework_count DESC LIMIT 5`,
      ),
      db.query(`SELECT m.id,m.name,m.avatar_url,COUNT(DISTINCT t.id) as task_count FROM members m
        LEFT JOIN task_assignees ta ON ta.member_id = m.id
        LEFT JOIN tasks t ON t.id = ta.task_id AND t.stage NOT IN ('Done')
        WHERE m.role='member' AND m.active=true GROUP BY m.id,m.name,m.avatar_url`),
      // Exact counts for the overview stat cards — never limited, always live.
      db.query(`SELECT COUNT(*) as count FROM projects WHERE status!='archived'`),
      db.query(`SELECT COUNT(*) as count FROM tasks WHERE parent_task_id IS NULL`),
      db.query(
        `SELECT COUNT(*) as count FROM tasks WHERE due_date < NOW() AND stage NOT IN ('Done')`,
      ),
    ]);
    return res.json({
      projects: projects.rows,
      tasks_by_stage: tasksByStage.rows,
      overdue_tasks: overdue.rows,
      cluster_rework: clusterRework.rows,
      workload: workload.rows,
      total_projects: parseInt(totalProjectsCount.rows[0].count),
      total_main_tasks: parseInt(totalMainTasksCount.rows[0].count),
      overdue_count: parseInt(overdueCount.rows[0].count),
    });
  } else {
    // Multi-assignee: each task/subtask is checked independently via EXISTS
    // against its own row in task_assignees, so a member only ever sees
    // the specific tasks/subtasks THEY are assigned to — this is what
    // keeps a subtask assigned only to a co-worker out of your list.
    const [myTasks, overdue, recentComments] = await Promise.all([
      db.query(
        `SELECT t.*,p.name as project_name FROM tasks t JOIN projects p ON t.project_id=p.id
        WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
          AND t.stage NOT IN ('Done') ORDER BY t.due_date NULLS LAST`,
        [req.user.id],
      ),
      db.query(
        `SELECT t.id,t.title,t.due_date,t.project_id,p.name as project_name FROM tasks t
        JOIN projects p ON t.project_id=p.id
        WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
          AND t.due_date < NOW() AND t.stage NOT IN ('Done')
        ORDER BY t.due_date`,
        [req.user.id],
      ),
      db.query(
        `SELECT tc.*,m.name as author_name,t.title as task_title FROM task_comments tc
        JOIN members m ON tc.author_id=m.id JOIN tasks t ON tc.task_id=t.id
        WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
        ORDER BY tc.created_at DESC LIMIT 5`,
        [req.user.id],
      ),
    ]);
    return res.json({
      my_tasks: myTasks.rows,
      overdue_tasks: overdue.rows,
      recent_comments: recentComments.rows,
    });
  }
});

// Full active-task list for one member — used by the Team Workload
// dropdown on the manager dashboard when a member row is expanded.
router.get("/members/:id/tasks", auth, async (req, res) => {
  const tasks = await db.query(
    `SELECT t.id,t.title,t.stage,t.due_date,t.project_id,p.name as project_name
     FROM tasks t JOIN projects p ON t.project_id=p.id
     WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
       AND t.stage NOT IN ('Done')
     ORDER BY t.due_date NULLS LAST`,
    [req.params.id],
  );
  res.json({ tasks: tasks.rows });
});

// Main-task list for the "Total Tasks" / "Completed Tasks" stat-card
// modals on the manager dashboard. ?stage=Done for completed only,
// omitted for all main tasks.
router.get("/tasks", auth, async (req, res) => {
  const { stage } = req.query;
  const params = [];
  let query = `SELECT t.id,t.title,t.stage,t.due_date,t.project_id,p.name as project_name
    FROM tasks t JOIN projects p ON t.project_id=p.id
    WHERE t.parent_task_id IS NULL`;
  if (stage) {
    params.push(stage);
    query += ` AND t.stage = $${params.length}`;
  }
  query += ` ORDER BY t.due_date NULLS LAST`;
  const tasks = await db.query(query, params);
  res.json({ tasks: tasks.rows });
});

module.exports = router;