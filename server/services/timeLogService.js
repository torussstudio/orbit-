const db = require("../db");

/*
 * Time Log (manager only)
 *
 * Time source: tasks.time_taken (minutes), entered when a task / sub task
 * is moved to In Review.
 *
 * "Completed" = stage is Done. The date a task was completed is kept in
 * tasks.completed_at, set by a database trigger (below), so every way a
 * task can reach Done (stage buttons, review modal, board drag, parent
 * stage recompute) is covered without touching taskService.
 *
 * Date filters are calendar days in IST (Asia/Kolkata).
 *
 * Counting rule (same as the Projects page):
 *  - a task with no sub tasks counts as 1
 *  - a task with sub tasks is not counted itself, only its sub tasks are
 * Time is the sum of every completed task's own time_taken, so a main task
 * and its sub tasks are never counted twice.
 */

const IST = "Asia/Kolkata";

/* ------------------------------------------------------------------ */
/* Schema: completed_at column + trigger + one-time backfill           */
/* ------------------------------------------------------------------ */

const BACKFILL_NAME = "timelog_backfill_completed_at";

async function setupSchema() {
  await db.query(
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
  );

  // Done           -> completed_at = now (kept if it was already Done)
  // anything else  -> completed_at = NULL (rework clears it; the next
  //                   Done gets a new date)
  await db.query(`
    CREATE OR REPLACE FUNCTION orbit_set_task_completed_at()
    RETURNS trigger AS $$
    BEGIN
      IF lower(trim(coalesce(NEW.stage, ''))) = 'done' THEN
        IF TG_OP = 'INSERT' THEN
          NEW.completed_at := coalesce(NEW.completed_at, NOW());
        ELSIF lower(trim(coalesce(OLD.stage, ''))) <> 'done' THEN
          NEW.completed_at := NOW();
        ELSE
          NEW.completed_at := coalesce(NEW.completed_at, OLD.completed_at, NOW());
        END IF;
      ELSE
        NEW.completed_at := NULL;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await db.query(`
    CREATE OR REPLACE TRIGGER trg_tasks_completed_at
    BEFORE INSERT OR UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION orbit_set_task_completed_at()
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
    ON tasks (completed_at)
    WHERE completed_at IS NOT NULL
  `);

  // Same table db.js uses, so the backfill runs exactly once.
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      run_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const { rows } = await db.query(
    `SELECT 1 FROM schema_migrations WHERE name = $1`,
    [BACKFILL_NAME],
  );

  if (rows.length === 0) {
    // Tasks already Done before this feature: use the last "moved to Done"
    // activity, otherwise updated_at, otherwise created_at.
    await db.query(`
      UPDATE tasks t
      SET completed_at = coalesce(
        (
          SELECT MAX(a.created_at)
          FROM task_activity a
          WHERE a.task_id = t.id
            AND lower(trim(coalesce(a.meta->>'to', ''))) = 'done'
        ),
        t.updated_at,
        t.created_at
      )
      WHERE lower(trim(coalesce(t.stage, ''))) = 'done'
        AND t.completed_at IS NULL
    `);

    await db.query(
      `INSERT INTO schema_migrations (name, run_at) VALUES ($1, NOW())
       ON CONFLICT (name) DO NOTHING`,
      [BACKFILL_NAME],
    );
  }
}

let schemaReady = null;

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = setupSchema().catch((err) => {
      // Try again on the next request.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

// Install the trigger shortly after boot (db.js creates the tables first),
// so tasks completed before anyone opens Time Log still get their date.
setTimeout(() => {
  ensureSchema().catch((err) =>
    console.error("[time-log] schema setup failed:", err.message),
  );
}, 3000);

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

// $1 = from (YYYY-MM-DD or null), $2 = to (YYYY-MM-DD or null), both IST days.
const DONE_CTE = `
  done AS (
    SELECT
      t.id,
      t.project_id,
      t.parent_task_id,
      t.title,
      t.time_taken,
      t.rework_count,
      t.completed_at,
      NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_task_id = t.id) AS is_leaf
    FROM tasks t
    WHERE lower(trim(coalesce(t.stage, ''))) = 'done'
      AND t.completed_at IS NOT NULL
      AND ($1::date IS NULL OR t.completed_at >= ($1::date::timestamp AT TIME ZONE '${IST}'))
      AND ($2::date IS NULL OR t.completed_at < (($2::date + 1)::timestamp AT TIME ZONE '${IST}'))
  )
`;

const ASSIGNEES = `
  coalesce(
    (
      SELECT json_agg(json_build_object('id', m.id, 'name', m.name) ORDER BY m.name)
      FROM task_assignees ta
      JOIN members m ON m.id = ta.member_id
      WHERE ta.task_id = d.id
    ),
    '[]'::json
  ) AS assignees
`;

const TOTALS = `
  coalesce(SUM(coalesce(d.time_taken, 0)), 0)::int AS total_minutes,
  (COUNT(*) FILTER (WHERE d.is_leaf))::int AS task_count,
  (COUNT(*) FILTER (WHERE d.is_leaf AND coalesce(d.time_taken, 0) = 0))::int AS unlogged_count,
  MAX(d.completed_at) AS last_completed_at
`;

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

async function getProjects({ from, to }) {
  await ensureSchema();

  const { rows } = await db.query(
    `
      WITH ${DONE_CTE}
      SELECT
        p.id, p.name, p.client_name, p.status,
        ${TOTALS},
        (
          SELECT COUNT(DISTINCT ta.member_id)
          FROM task_assignees ta
          JOIN done d2 ON d2.id = ta.task_id
          WHERE d2.project_id = p.id
        )::int AS member_count
      FROM projects p
      JOIN done d ON d.project_id = p.id
      GROUP BY p.id
      ORDER BY total_minutes DESC, p.name ASC
    `,
    [from, to],
  );

  return { projects: rows };
}

async function getProjectDetail(projectId, { from, to }) {
  await ensureSchema();

  const { rows: projectRows } = await db.query(
    `SELECT id, name, client_name, status FROM projects WHERE id::text = $1 LIMIT 1`,
    [String(projectId)],
  );

  if (!projectRows[0]) throw notFound("Project not found");

  const { rows: tasks } = await db.query(
    `
      WITH ${DONE_CTE}
      SELECT
        d.id, d.title, d.parent_task_id, pt.title AS parent_title,
        d.time_taken, d.rework_count, d.completed_at, d.is_leaf,
        ${ASSIGNEES}
      FROM done d
      LEFT JOIN tasks pt ON pt.id = d.parent_task_id
      WHERE d.project_id::text = $3
      ORDER BY d.completed_at DESC
    `,
    [from, to, String(projectId)],
  );

  return { project: projectRows[0], tasks };
}

async function getMembers({ from, to }) {
  await ensureSchema();

  const { rows } = await db.query(
    `
      WITH ${DONE_CTE}
      SELECT
        m.id, m.name, m.email, m.avatar_url, m.role, m.active,
        ${TOTALS},
        COUNT(DISTINCT d.project_id)::int AS project_count
      FROM members m
      JOIN task_assignees ta ON ta.member_id = m.id
      JOIN done d ON d.id = ta.task_id
      GROUP BY m.id
      ORDER BY total_minutes DESC, m.name ASC
    `,
    [from, to],
  );

  return { members: rows };
}

async function getMemberDetail(memberId, { from, to }) {
  await ensureSchema();

  const { rows: memberRows } = await db.query(
    `
      SELECT id, name, email, avatar_url, role, active
      FROM members
      WHERE id::text = $1
      LIMIT 1
    `,
    [String(memberId)],
  );

  if (!memberRows[0]) throw notFound("Member not found");

  const { rows: tasks } = await db.query(
    `
      WITH ${DONE_CTE}
      SELECT
        d.id, d.title, d.parent_task_id, pt.title AS parent_title,
        d.time_taken, d.rework_count, d.completed_at, d.is_leaf,
        p.id AS project_id, p.name AS project_name,
        p.client_name, p.status AS project_status,
        ${ASSIGNEES}
      FROM done d
      JOIN task_assignees ta ON ta.task_id = d.id AND ta.member_id::text = $3
      JOIN projects p ON p.id = d.project_id
      LEFT JOIN tasks pt ON pt.id = d.parent_task_id
      ORDER BY d.completed_at DESC
    `,
    [from, to, String(memberId)],
  );

  return { member: memberRows[0], tasks };
}

module.exports = {
  ensureSchema,
  getProjects,
  getProjectDetail,
  getMembers,
  getMemberDetail,
};