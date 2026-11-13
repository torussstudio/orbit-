const db = require("../db");
const { LEAF_TASK, IN_LIVE_PROJECT } = require("../utils/taskScope");
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
      AND ${LEAF_TASK}
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
      AND ${LEAF_TASK}
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

const TODAY_IST = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`;
const WEEK_START_IST = `(${TODAY_IST} - (EXTRACT(ISODOW FROM ${TODAY_IST})::int - 1))`;
const HEALTH_RANK = { behind: 0, at_risk: 1, on_hold: 2, on_track: 3, no_tasks: 4, completed: 5 };
// Every live project is returned (the card scrolls); the query below caps it.
const PROJECT_HEALTH_LIMIT = 50;

/*
 * Project health for the manager dashboard, from the project's own data:
 *  - completed / on hold: the project's status;
 *  - behind:  the project end date has passed and tasks are still open;
 *  - at risk: some open task is overdue, or the end date is within 7 days
 *             and less than half the tasks are done;
 *  - on track: anything else (no tasks yet shows as "no_tasks").
 * `today` and `end_date` are IST 'YYYY-MM-DD' strings, so they compare as text.
 */
function projectHealth(p, today) {
  if (p.status === "completed") return "completed";
  if (p.status === "on_hold") return "on_hold";
  const total = Number(p.total_tasks) || 0;
  const done = Number(p.done_tasks) || 0;
  const open = total - done;
  if (total === 0) return "no_tasks";
  if (p.end_date && p.end_date < today && open > 0) return "behind";
  if (Number(p.overdue_tasks) > 0) return "at_risk";
  if (p.end_date && open > 0) {
    const daysLeft = Math.round((Date.parse(p.end_date) - Date.parse(today)) / 86400000);
    if (daysLeft <= 7 && done / total < 0.5) return "at_risk";
  }
  return "on_track";
}

async function getDashboardData(user) {
  if (user.role === "manager") {
    // Five round trips, so one dashboard load fits in the pool (max 5)
    // without waiting. The stage breakdown, the three totals and the 14-day
    // activity series travel together as one multi-statement query, and so
    // do the "needs attention" counts, the deadlines, the activity feed and
    // the on-time rate: each statement still returns its own result, in the
    // same order.
    const [
      projects, stageAndTotals, overdue, extras, workload,
    ] = await Promise.all([
      db.query(`SELECT p.id, p.name, p.status,
          to_char(p.end_date, 'YYYY-MM-DD') AS end_date,
          COUNT(t.id)::int AS total_tasks,
          COUNT(t.id) FILTER (WHERE t.stage = 'Done')::int AS done_tasks,
          COUNT(t.id) FILTER (
            WHERE t.stage NOT IN ('Done') AND t.due_date::date < ${TODAY_IST}
          )::int AS overdue_tasks,
          COALESCE(SUM(t.rework_count), 0)::int AS rework_total
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id AND ${LEAF_TASK}
        WHERE p.status != 'archived' AND p.trashed_at IS NULL
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 50`),
      db.query(
        `SELECT t.stage, COUNT(*) as count FROM tasks t JOIN projects p ON p.id = t.project_id
           WHERE p.trashed_at IS NULL AND ${LEAF_TASK} GROUP BY t.stage ORDER BY count DESC;
         SELECT COUNT(*) as count FROM projects WHERE status!='archived';
         SELECT COUNT(*) as count FROM tasks t JOIN projects p ON p.id = t.project_id
           WHERE p.trashed_at IS NULL AND ${LEAF_TASK};
         SELECT COUNT(*) as count FROM tasks t JOIN projects p ON p.id = t.project_id
           WHERE p.trashed_at IS NULL AND ${LEAF_TASK} AND t.due_date::date < ${TODAY_IST} AND t.stage NOT IN ('Done');
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
            -- Leave out main tasks that have sub tasks (their stage only
            -- mirrors the sub tasks, so their events would count twice).
            AND (a.entity_type <> 'task' OR a.entity_id IS NULL OR a.entity_id NOT IN (
              SELECT parent_task_id::text FROM tasks WHERE parent_task_id IS NOT NULL
            ))
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
        -- Overdue = due before today (IST), like the member dashboard: a task due
        -- today is not overdue yet.
        WHERE t.due_date::date < ${TODAY_IST} AND t.stage NOT IN ('Done') AND p.trashed_at IS NULL AND ${LEAF_TASK}
        ORDER BY t.due_date`),
      db.query(
        // 1. "Needs your attention" counts and the on-time rate's inputs.
        `SELECT
           to_char(${TODAY_IST}, 'YYYY-MM-DD') AS today,
           (SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
             WHERE p.trashed_at IS NULL AND COALESCE(p.status, '') <> 'archived'
               AND ${LEAF_TASK} AND lower(trim(coalesce(t.stage, ''))) = 'in review')::int AS in_review,
           (SELECT MAX(${TODAY_IST} - (COALESCE(
                     (SELECT MAX(a.created_at) FROM task_activity a
                       WHERE a.task_id = t.id AND a.meta->>'to' = t.stage),
                     t.updated_at) AT TIME ZONE 'Asia/Kolkata')::date)
              FROM tasks t JOIN projects p ON p.id = t.project_id
             WHERE p.trashed_at IS NULL AND COALESCE(p.status, '') <> 'archived'
               AND ${LEAF_TASK} AND lower(trim(coalesce(t.stage, ''))) = 'in review')::int AS oldest_review_days,
           (SELECT COUNT(*) FROM task_requests WHERE status = 'pending')::int AS pending_requests,
           (SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
             WHERE p.trashed_at IS NULL AND COALESCE(p.status, '') <> 'archived'
               AND ${LEAF_TASK} AND t.stage NOT IN ('Done')
               AND NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id))::int AS unassigned,
           (SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
             WHERE p.trashed_at IS NULL AND COALESCE(p.status, '') <> 'archived'
               AND ${LEAF_TASK} AND t.stage NOT IN ('Done')
               AND t.due_date::date = ${TODAY_IST})::int AS due_today,
           (SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
             WHERE p.trashed_at IS NULL AND COALESCE(p.status, '') <> 'archived'
               AND ${LEAF_TASK} AND t.stage NOT IN ('Done')
               AND t.due_date::date = ${TODAY_IST} + 1)::int AS due_tomorrow,
           -- Overdue tasks with an assignee who has not given a reason yet
           -- (same rule as the overdue-reasons page: In Review is not late).
           (SELECT COUNT(DISTINCT t.id)
              FROM tasks t
              JOIN projects p ON p.id = t.project_id
              JOIN task_assignees ta ON ta.task_id = t.id
              JOIN members m ON m.id = ta.member_id AND m.active = true
              LEFT JOIN task_delay_reasons r
                     ON r.task_id = t.id AND r.member_id = ta.member_id
                    AND r.due_day = t.due_date::date
             WHERE t.due_date IS NOT NULL
               AND t.due_date::date < ${TODAY_IST}
               AND lower(trim(coalesce(t.stage, ''))) NOT IN ('done', 'in review')
               AND COALESCE(p.status, '') <> 'archived'
               AND ${LEAF_TASK} AND ${IN_LIVE_PROJECT}
               AND (r.id IS NULL OR r.decision = 'ask_again'))::int AS overdue_no_reason;

         -- 2. Tasks due in the next 7 days (today included), per day and project.
         SELECT to_char(t.due_date::date, 'YYYY-MM-DD') AS day,
                p.id AS project_id, p.name AS project_name, COUNT(*)::int AS count
           FROM tasks t JOIN projects p ON p.id = t.project_id
          WHERE p.trashed_at IS NULL AND COALESCE(p.status, '') <> 'archived'
            AND ${LEAF_TASK} AND t.stage NOT IN ('Done')
            AND t.due_date::date BETWEEN ${TODAY_IST} AND ${TODAY_IST} + 6
          GROUP BY 1, 2, 3
          ORDER BY 1, 3;

         -- 3. Latest team activity: stage moves, new tasks and comments.
         (SELECT CASE WHEN a.meta->>'to' IS NOT NULL THEN 'stage' ELSE 'created' END AS kind,
                 a.created_at AS at, m.name AS actor_name,
                 t.id AS task_id, t.title AS task_title,
                 p.id AS project_id, p.name AS project_name,
                 a.meta->>'to' AS to_stage
            FROM task_activity a
            JOIN tasks t ON t.id = a.task_id
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN members m ON m.id = a.actor_id
           WHERE (a.meta->>'to' IS NOT NULL OR a.action ILIKE 'Created%')
             AND p.trashed_at IS NULL AND ${LEAF_TASK}
           ORDER BY a.created_at DESC LIMIT 12)
         UNION ALL
         (SELECT 'comment' AS kind, c.created_at AS at, m.name AS actor_name,
                 t.id AS task_id, t.title AS task_title,
                 p.id AS project_id, p.name AS project_name,
                 NULL AS to_stage
            FROM task_comments c
            JOIN tasks t ON t.id = c.task_id
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN members m ON m.id = c.author_id
           WHERE p.trashed_at IS NULL
           ORDER BY c.created_at DESC LIMIT 12)
         ORDER BY at DESC
         LIMIT 12;

         -- 4. On-time delivery: tasks finished in the last 30 days that had a
         -- due date, and how many were finished on or before it. The finish
         -- day is the last "moved to Done" activity (updated_at for old tasks).
         WITH fin AS (
           SELECT t.due_date::date AS due,
                  (COALESCE(
                     (SELECT MAX(a.created_at) FROM task_activity a
                       WHERE a.task_id = t.id AND a.meta->>'to' = 'Done'),
                     t.updated_at) AT TIME ZONE 'Asia/Kolkata')::date AS done_on
             FROM tasks t JOIN projects p ON p.id = t.project_id
            WHERE t.stage = 'Done' AND t.due_date IS NOT NULL
              AND p.trashed_at IS NULL AND ${LEAF_TASK}
         )
         SELECT COUNT(*) FILTER (WHERE done_on <= due)::int AS on_time,
                COUNT(*)::int AS total
           FROM fin
          WHERE done_on >= ${TODAY_IST} - 29`,
      ),
      // Per active member: open tasks, overdue ones, and logged minutes today
      // and this week (Monday on, IST). Minutes are scalar subqueries so the
      // task join cannot multiply them.
      db.query(`SELECT m.id, m.name, m.avatar_url,
          COUNT(DISTINCT t.id) AS task_count,
          COUNT(DISTINCT t.id) FILTER (WHERE t.due_date::date < ${TODAY_IST}) AS overdue_count,
          (SELECT COALESCE(SUM(e.minutes), 0)::int FROM time_entries e
             WHERE e.member_id = m.id AND e.work_date::date = ${TODAY_IST}) AS today_minutes,
          (SELECT COALESCE(SUM(e.minutes), 0)::int FROM time_entries e
             WHERE e.member_id = m.id
               AND e.work_date::date >= ${WEEK_START_IST}
               AND e.work_date::date <= ${TODAY_IST}) AS week_minutes
        FROM members m
        LEFT JOIN task_assignees ta ON ta.member_id = m.id
        LEFT JOIN tasks t ON t.id = ta.task_id AND t.stage NOT IN ('Done') AND ${LEAF_TASK} AND ${IN_LIVE_PROJECT}
        WHERE m.role='member' AND m.active=true GROUP BY m.id,m.name,m.avatar_url`),
    ]);
    const [
      tasksByStage, totalProjectsCount, totalMainTasksCount, overdueCount, activity,
    ] = stageAndTotals;
    const [attentionRes, deadlinesRes, feedRes, onTimeRes] = extras;
    const attn = attentionRes.rows[0] || {};
    const onTime = onTimeRes.rows[0] || { on_time: 0, total: 0 };
    const today = attn.today || null;

    // Health per project, risky first, then newest first (the query is
    // already newest first and Array.sort is stable).
    const healthProjects = projects.rows
      .map((p) => ({ ...p, health: projectHealth(p, today) }))
      .sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health])
      .slice(0, PROJECT_HEALTH_LIMIT);

    return {
      projects: healthProjects,
      tasks_by_stage: tasksByStage.rows,
      overdue_tasks: overdue.rows,
      workload: workload.rows,
      // Everything the "Needs your attention" card shows.
      attention: {
        overdue_no_reason: attn.overdue_no_reason || 0,
        in_review: attn.in_review || 0,
        oldest_review_days: attn.oldest_review_days ?? null,
        pending_requests: attn.pending_requests || 0,
        unassigned: attn.unassigned || 0,
        due_today: attn.due_today || 0,
        due_tomorrow: attn.due_tomorrow || 0,
      },
      // IST today and the next 7 days of deadlines: [{ day, project_id, project_name, count }]
      today,
      deadlines: deadlinesRes.rows,
      // Newest first: [{ kind: 'stage'|'created'|'comment', at, actor_name,
      //   task_id, task_title, project_id, project_name, to_stage }]
      feed: feedRes.rows,
      on_time: { on_time: onTime.on_time, total: onTime.total },
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
          AND t.stage NOT IN ('Done') AND ${LEAF_TASK} AND p.trashed_at IS NULL ORDER BY t.due_date NULLS LAST`,
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
          AND ${LEAF_TASK}
          AND p.trashed_at IS NULL
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

/*
 * Member activity heatmap (GitHub-style): how many things the member did on
 * each IST day over the last HEATMAP_DAYS days. It tracks task activity: the
 * task actions the member performed (create, stage change, ...) and their
 * task comments. Sundays (the office's weekly day off) are left out, and so
 * are days with nothing (the client fills those in as empty squares).
 */
const HEATMAP_DAYS = 371; // 53 weeks

async function getActivityHeatmap(memberId) {
  const { rows } = await db.query(
    `WITH w AS (
       SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today,
              (NOW() AT TIME ZONE 'Asia/Kolkata')::date - ${HEATMAP_DAYS - 1} AS start_day
     ),
     ev AS (
       SELECT (a.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day
         FROM task_activity a, w
        WHERE a.actor_id = $1
          AND a.created_at >= (w.start_day::timestamp AT TIME ZONE 'Asia/Kolkata')
       UNION ALL
       SELECT (c.created_at AT TIME ZONE 'Asia/Kolkata')::date
         FROM task_comments c, w
        WHERE c.author_id = $1
          AND c.created_at >= (w.start_day::timestamp AT TIME ZONE 'Asia/Kolkata')
     )
     SELECT to_char(w.today, 'YYYY-MM-DD') AS today,
            to_char(g.day, 'YYYY-MM-DD') AS day,
            g.n
       FROM w
       LEFT JOIN (
         SELECT day, COUNT(*)::int AS n FROM ev
          WHERE EXTRACT(ISODOW FROM day) <> 7
          GROUP BY day
       ) g ON true
      ORDER BY g.day`,
    [memberId],
  );

  const days = rows.filter((r) => r.day).map((r) => ({ day: r.day, count: r.n }));
  return {
    today: rows[0]?.today || null,
    days,
    total: days.reduce((sum, d) => sum + d.count, 0),
  };
}

/*
 * Member dashboard "Time logged": the member's own time entries for the last
 * TIME_SUMMARY_DAYS days (IST), minutes summed per work_date. Days with
 * nothing are left out; the client fills them in.
 */
const TIME_SUMMARY_DAYS = 42;

async function getTimeSummary(memberId) {
  const { rows } = await db.query(
    `WITH w AS (
       SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today
     )
     SELECT to_char(w.today, 'YYYY-MM-DD') AS today,
            to_char(g.day, 'YYYY-MM-DD') AS day,
            g.minutes
       FROM w
       LEFT JOIN (
         SELECT e.work_date::date AS day, SUM(e.minutes)::int AS minutes
           FROM time_entries e, w
          WHERE e.member_id = $1
            AND e.work_date >= w.today - ${TIME_SUMMARY_DAYS - 1}
            AND e.work_date <= w.today
          GROUP BY e.work_date
       ) g ON true
      ORDER BY g.day`,
    [memberId],
  );

  return {
    today: rows[0]?.today || null,
    days: rows.filter((r) => r.day).map((r) => ({ day: r.day, minutes: r.minutes })),
  };
}

async function getMemberTasks(memberId) {
  const tasks = await db.query(
    `SELECT t.id,t.title,t.stage,t.due_date,t.project_id,p.name as project_name
     FROM tasks t JOIN projects p ON t.project_id=p.id
     WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
       AND t.stage NOT IN ('Done')
       AND ${LEAF_TASK}
       AND p.trashed_at IS NULL
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
      COALESCE(time_totals.logged_minutes, 0)::int AS logged_minutes,
      COALESCE(time_totals.my_logged_minutes, 0)::int AS my_logged_minutes,
      COUNT(*) OVER() AS ${TOTAL_COLUMN}
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     LEFT JOIN tasks pt ON pt.id = t.parent_task_id
     LEFT JOIN clusters c ON c.id = t.cluster_id
     LEFT JOIN clusters pc ON pc.id = pt.cluster_id
     LEFT JOIN LATERAL (
       SELECT
         SUM(e.minutes) AS logged_minutes,
         SUM(e.minutes) FILTER (WHERE e.member_id = $1) AS my_logged_minutes
       FROM time_entries e
       WHERE e.task_id = t.id
     ) time_totals ON true
     WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=$1)
       AND ${LEAF_TASK}
       AND p.trashed_at IS NULL
     ORDER BY t.due_date NULLS LAST
     LIMIT $2`,
    [userId, LIST_SAFETY_LIMIT],
  );
  return splitTotal(tasks.rows);
}

module.exports = { getDashboardData, getMemberTasks, getTasksList, getMyTasks, getTeamProgress, getActivityHeatmap, getTimeSummary };
