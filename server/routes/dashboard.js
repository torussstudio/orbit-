const router = require("express").Router();
const db = require("../db");
const { auth } = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  if (req.user.role === "manager") {
    const [projects, tasksByStage, overdue, clusterRework, workload] =
      await Promise.all([
        db.query(`SELECT id,name,status,
        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND stage='Done') as done_tasks
        FROM projects p WHERE status!='archived' ORDER BY created_at DESC LIMIT 10`),
        db.query(
          `SELECT stage, COUNT(*) as count FROM tasks GROUP BY stage ORDER BY count DESC`,
        ),
        db.query(`SELECT t.id,t.title,t.due_date,t.stage,p.name as project_name,m.name as assignee_name
        FROM tasks t JOIN projects p ON t.project_id=p.id LEFT JOIN members m ON t.assignee_id=m.id
        WHERE t.due_date < NOW() AND t.stage NOT IN ('Done') ORDER BY t.due_date LIMIT 10`),
        db.query(
          `SELECT id,name,rework_count,status FROM clusters WHERE rework_count > 0 ORDER BY rework_count DESC LIMIT 5`,
        ),
        db.query(`SELECT m.id,m.name,COUNT(t.id) as task_count FROM members m
        LEFT JOIN tasks t ON t.assignee_id=m.id AND t.stage NOT IN ('Done')
        WHERE m.role='member' AND m.active=true GROUP BY m.id,m.name`),
      ]);
    return res.json({
      projects: projects.rows,
      tasks_by_stage: tasksByStage.rows,
      overdue_tasks: overdue.rows,
      cluster_rework: clusterRework.rows,
      workload: workload.rows,
    });
  } else {
    const [myTasks, overdue, recentComments] = await Promise.all([
      db.query(
        `SELECT t.*,p.name as project_name FROM tasks t JOIN projects p ON t.project_id=p.id
        WHERE t.assignee_id=$1 AND t.stage NOT IN ('Done') ORDER BY t.due_date NULLS LAST`,
        [req.user.id],
      ),
      db.query(
        `SELECT t.id,t.title,t.due_date,p.name as project_name FROM tasks t
        JOIN projects p ON t.project_id=p.id
        WHERE t.assignee_id=$1 AND t.due_date < NOW() AND t.stage NOT IN ('Done')
        ORDER BY t.due_date`,
        [req.user.id],
      ),
      db.query(
        `SELECT tc.*,m.name as author_name,t.title as task_title FROM task_comments tc
        JOIN members m ON tc.author_id=m.id JOIN tasks t ON tc.task_id=t.id
        WHERE t.assignee_id=$1 ORDER BY tc.created_at DESC LIMIT 5`,
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

module.exports = router;
