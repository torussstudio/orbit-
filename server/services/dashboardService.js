const db = require("../db");
const { LIST_SAFETY_LIMIT, TOTAL_COLUMN, splitTotal } = require("../utils/listLimit");

async function getDashboardData(user) {
  if (user.role === "manager") {
    // Five round trips instead of eight, so one dashboard load fits in the
    // pool (max 5) without waiting. The stage breakdown, the three totals and
    // the 14-day activity series travel together as one multi-statement
    // query: each statement still returns its own result, in the same order.
    const [
      projects, stageAndTotals, overdue, clusterRework, workload,
    ] = await Promise.all([
      db.query(`SELECT id,name,status,
        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND stage='Done') as done_tasks
        FROM projects p WHERE status!='archived' ORDER BY created_at DESC LIMIT 10`),
      db.query(
        `SELECT stage, COUNT(*) as count FROM tasks WHERE parent_task_id IS NULL GROUP BY stage ORDER BY count DESC;
         SELECT COUNT(*) as count FROM projects WHERE status!='archived';
         SELECT COUNT(*) as count FROM tasks WHERE parent_task_id IS NULL;
         SELECT COUNT(*) as count FROM tasks WHERE due_date < NOW() AND stage NOT IN ('Done');
         SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
                COUNT(*) FILTER (WHERE a.event_type = 'task_created')     AS created,
                COUNT(*) FILTER (WHERE a.event_type = 'task_completed')   AS completed,
                COUNT(*) FILTER (WHERE a.event_type = 'comment_added')    AS comments,
                COUNT(*) FILTER (WHERE a.event_type = 'task_in_progress') AS in_progress,
                COUNT(*) FILTER (WHERE a.event_type = 'task_in_review')   AS in_review,
                COUNT(*) FILTER (WHERE a.event_type = 'task_rework')      AS rework,
                COUNT(*) FILTER (WHERE a.event_type IN
                  ('project_created', 'project_updated', 'project_archived')) AS projects
           FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') d
           LEFT JOIN activity_log a
             ON a.created_at >= d::timestamptz
            AND a.created_at <  d::timestamptz + interval '1 day'
           GROUP BY d
           ORDER BY d`,
      ),
      db.query(`SELECT t.id,t.title,t.due_date,t.stage,t.project_id,t.parent_task_id,p.name as project_name, assignee_agg.assignee_name,
        (SELECT title FROM tasks pt WHERE pt.id = t.parent_task_id) as parent_title
        FROM tasks t JOIN projects p ON t.project_id=p.id
        LEFT JOIN LATERAL (
          SELECT STRING_AGG(m.name, ', ' ORDER BY m.name) AS assignee_name
          FROM task_assignees ta JOIN members m ON m.id=ta.member_id WHERE ta.task_id=t.id
        ) assignee_agg ON true
        WHERE t.due_date < NOW() AND t.stage NOT IN ('Done') ORDER BY t.due_date`),
      db.query(`SELECT id,name,rework_count,status FROM clusters WHERE rework_count > 0
         UNION ALL
         SELECT t.id, t.title as name, t.rework_count, t.stage as status FROM tasks t
         WHERE t.rework_count > 0 AND t.parent_task_id IS NOT NULL
         ORDER BY rework_count DESC LIMIT 5`),
      db.query(`SELECT m.id,m.name,m.avatar_url,COUNT(DISTINCT t.id) as task_count FROM members m
        LEFT JOIN task_assignees ta ON ta.member_id = m.id
        LEFT JOIN tasks t ON t.id = ta.task_id AND t.stage NOT IN ('Done')
        WHERE m.role='member' AND m.active=true GROUP BY m.id,m.name,m.avatar_url`),
    ]);
    const [
      tasksByStage, totalProjectsCount, totalMainTasksCount, overdueCount, activity,
    ] = stageAndTotals;
    return {
      projects: projects.rows,
      tasks_by_stage: tasksByStage.rows,
      overdue_tasks: overdue.rows,
      cluster_rework: clusterRework.rows,
      workload: workload.rows,
      total_projects: parseInt(totalProjectsCount.rows[0].count),
      total_main_tasks: parseInt(totalMainTasksCount.rows[0].count),
      overdue_count: parseInt(overdueCount.rows[0].count),
      // Last 14 days (today included), zero-filled:
      // [{ day, created, completed, comments, in_progress, in_review, rework, projects }]
      activity: activity.rows.map((r) => ({
        day: r.day,
        created: Number(r.created),
        completed: Number(r.completed),
        comments: Number(r.comments),
        in_progress: Number(r.in_progress),
        in_review: Number(r.in_review),
        rework: Number(r.rework),
        projects: Number(r.projects),
      })),
    };
  } else {
    const [myTasks, overdue, recentComments] = await Promise.all([
      db.query(
        `SELECT t.*,p.name as project_name FROM tasks t JOIN projects p ON t.project_id=p.id
        WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
          AND t.stage NOT IN ('Done') ORDER BY t.due_date NULLS LAST`,
        [user.id],
      ),
      db.query(
        `SELECT t.id,t.title,t.due_date,t.project_id,p.name as project_name FROM tasks t
        JOIN projects p ON t.project_id=p.id
        WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
          AND t.due_date < NOW() AND t.stage NOT IN ('Done')
        ORDER BY t.due_date`,
        [user.id],
      ),
      db.query(
        `SELECT tc.*,m.name as author_name,t.title as task_title FROM task_comments tc
        JOIN members m ON tc.author_id=m.id JOIN tasks t ON tc.task_id=t.id
        WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
        ORDER BY tc.created_at DESC LIMIT 5`,
        [user.id],
      ),
    ]);
    return {
      my_tasks: myTasks.rows,
      overdue_tasks: overdue.rows,
      recent_comments: recentComments.rows,
    };
  }
}

async function getMemberTasks(memberId) {
  const tasks = await db.query(
    `SELECT t.id,t.title,t.stage,t.due_date,t.project_id,p.name as project_name
     FROM tasks t JOIN projects p ON t.project_id=p.id
     WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
       AND t.stage NOT IN ('Done')
     ORDER BY t.due_date NULLS LAST`,
    [memberId],
  );
  return tasks.rows;
}

async function getTasksList(stage) {
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
  return tasks.rows;
}

// Returns { rows, total }: rows are capped at LIST_SAFETY_LIMIT, total is
// the real number of tasks assigned to the user.
async function getMyTasks(userId) {
  const tasks = await db.query(
    `SELECT t.*, p.name AS project_name,
      p.milanote_url AS project_milanote_url,
      p.docs_url AS project_docs_url,
      pt.title AS parent_title,
      COALESCE(c.name, pc.name) AS cluster_name,
      COUNT(*) OVER() AS ${TOTAL_COLUMN}
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     LEFT JOIN tasks pt ON pt.id = t.parent_task_id
     LEFT JOIN clusters c ON c.id = t.cluster_id
     LEFT JOIN clusters pc ON pc.id = pt.cluster_id
     WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
     ORDER BY t.due_date NULLS LAST
     LIMIT $2`,
    [userId, LIST_SAFETY_LIMIT],
  );
  return splitTotal(tasks.rows);
}

module.exports = { getDashboardData, getMemberTasks, getTasksList, getMyTasks };