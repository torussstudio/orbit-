const db = require("../db");
const { LIST_SAFETY_LIMIT, TOTAL_COLUMN, splitTotal } = require("../utils/listLimit");

/*
 * Member dashboard: "My Task Progress" card.
 *
 * Every task / sub task assigned to the member, in projects that are not in
 * the trash:
 *  - open tasks (not Done) always count, in their current stage;
 *  - Done tasks count only for the period they were completed in (this week
 *    from Monday, this month from the 1st, IST days). The completion day is
 *    the last "moved to Done" activity, or updated_at for older tasks.
 *
 * Buckets: Done, In Review, In Progress, Todo, and Rework (= a task the
 * admin sent back that is waiting in Todo). Any custom stage counts as
 * In Progress. Overdue and due today are open tasks by due date (IST), and
 * are already inside their stage, so the card shows them separately.
 */
const TASK_PROGRESS_SQL = `
  WITH b AS (
    SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today
  ),
  mine AS (
    SELECT
      t.stage,
      COALESCE(t.rework_count, 0) AS rework_count,
      t.due_date::date AS due,
      CASE WHEN t.stage = 'Done' THEN (
        COALESCE(
          (SELECT MAX(a.created_at) FROM task_activity a
            WHERE a.task_id = t.id AND a.meta->>'to' = 'Done'),
          t.updated_at
        ) AT TIME ZONE 'Asia/Kolkata'
      )::date END AS done_on
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.member_id = $1)
      AND p.trashed_at IS NULL
  )
  SELECT
    m.stage,
    m.rework_count,
    to_char(m.due, 'YYYY-MM-DD') AS due,
    to_char(m.done_on, 'YYYY-MM-DD') AS done_on,
    to_char(b.today, 'YYYY-MM-DD') AS today,
    to_char(date_trunc('month', b.today)::date, 'YYYY-MM-DD') AS month_start,
    to_char(b.today - (EXTRACT(ISODOW FROM b.today)::int - 1), 'YYYY-MM-DD') AS week_start
  FROM mine m CROSS JOIN b
  WHERE m.stage <> 'Done'
     OR m.done_on >= LEAST(date_trunc('month', b.today)::date,
                           b.today - (EXTRACT(ISODOW FROM b.today)::int - 1))
`;

function emptyProgress() {
  return { done: 0, review: 0, in_progress: 0, todo: 0, rework: 0, overdue: 0, due_today: 0 };
}

function summarizeTaskProgress(rows) {
  const week = emptyProgress();
  const month = emptyProgress();
  const today = rows[0]?.today || null;

  for (const r of rows) {
    if (r.stage === "Done") {
      if (r.done_on >= r.month_start) month.done += 1;
      if (r.done_on >= r.week_start) week.done += 1;
      continue;
    }

    let bucket = "in_progress";
    if (r.stage === "In Review") bucket = "review";
    else if (r.stage === "Todo") bucket = r.rework_count > 0 ? "rework" : "todo";

    for (const p of [week, month]) {
      p[bucket] += 1;
      if (r.due && r.due < r.today) p.overdue += 1;
      if (r.due && r.due === r.today) p.due_today += 1;
    }
  }

  return { today, week, month };
}

/*
 * Admin Members page: the same numbers as the member's own card, for every
 * active member (role member). One query, grouped in JS.
 */
const TEAM_PROGRESS_SQL = `
  WITH b AS (
    SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today
  ),
  rows AS (
    SELECT
      ta.member_id,
      t.stage,
      COALESCE(t.rework_count, 0) AS rework_count,
      t.due_date::date AS due,
      CASE WHEN t.stage = 'Done' THEN (
        COALESCE(
          (SELECT MAX(a.created_at) FROM task_activity a
            WHERE a.task_id = t.id AND a.meta->>'to' = 'Done'),
          t.updated_at
        ) AT TIME ZONE 'Asia/Kolkata'
      )::date END AS done_on
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id
    JOIN projects p ON p.id = t.project_id
    JOIN members m ON m.id = ta.member_id
    WHERE p.trashed_at IS NULL
      AND m.active = true
      AND m.role = 'member'
  )
  SELECT
    r.member_id,
    r.stage,
    r.rework_count,
    to_char(r.due, 'YYYY-MM-DD') AS due,
    to_char(r.done_on, 'YYYY-MM-DD') AS done_on,
    to_char(b.today, 'YYYY-MM-DD') AS today,
    to_char(date_trunc('month', b.today)::date, 'YYYY-MM-DD') AS month_start,
    to_char(b.today - (EXTRACT(ISODOW FROM b.today)::int - 1), 'YYYY-MM-DD') AS week_start
  FROM rows r CROSS JOIN b
  WHERE r.stage <> 'Done'
     OR r.done_on >= LEAST(date_trunc('month', b.today)::date,
                           b.today - (EXTRACT(ISODOW FROM b.today)::int - 1))
`;

async function getTeamProgress() {
  const [{ rows: members }, { rows }] = await Promise.all([
    db.query(
      `SELECT id, name, email, avatar_url
         FROM members
        WHERE active = true AND role = 'member'
        ORDER BY name`,
    ),
    db.query(TEAM_PROGRESS_SQL),
  ]);

  const byMember = new Map();
  for (const r of rows) {
    const key = String(r.member_id);
    if (!byMember.has(key)) byMember.set(key, []);
    byMember.get(key).push(r);
  }

  return {
    members: members.map((m) => {
      const { week, month } = summarizeTaskProgress(byMember.get(String(m.id)) || []);
      return { id: m.id, name: m.name, email: m.email, avatar_url: m.avatar_url, week, month };
    }),
  };
}

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
    const [myTasks, overdue, recentComments, progressRows] = await Promise.all([
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
          -- Overdue = due before today (IST). A task due today is not overdue
          -- yet (same rule as the My Task Progress card).
          AND t.due_date::date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
          AND t.stage NOT IN ('Done')
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
      db.query(TASK_PROGRESS_SQL, [user.id]),
    ]);
    return {
      my_tasks: myTasks.rows,
      overdue_tasks: overdue.rows,
      recent_comments: recentComments.rows,
      task_progress: summarizeTaskProgress(progressRows.rows),
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

module.exports = { getDashboardData, getMemberTasks, getTasksList, getMyTasks, getTeamProgress };