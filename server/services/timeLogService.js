const db = require("../db");

/*
 * Time Log
 *
 * Source: time_entries (see db/index.js). Members add entries from their
 * own "Time Log" page: project, optional cluster, task (or a typed
 * Miscellaneous task), work date and time. A task can be logged any number
 * of times. Miscellaneous entries live only here and never create a task.
 *
 * Managers see every entry on the admin Time Log page, filtered by work
 * date (IST calendar days, stored as a DATE), and can edit or delete them.
 * Members never see their old entries.
 */

const IST = "Asia/Kolkata";
const MAX_MINUTES = 24 * 60; // one entry is at most one full day
const MAX_TITLE = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Today as YYYY-MM-DD in IST.
function istToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function readWorkDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw httpError(400, "Select the date you worked on this.");
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw httpError(400, "Select a valid date.");
  }
  if (value > istToday()) {
    throw httpError(400, "The date can't be in the future.");
  }
  return value;
}

function readMinutes(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw httpError(400, "Enter the time taken (at least 1 minute).");
  }
  if (minutes > MAX_MINUTES) {
    throw httpError(400, "One entry can't be more than 24 hours.");
  }
  return minutes;
}

function readTitle(value) {
  const title = String(value ?? "").trim();
  if (!title) throw httpError(400, "Enter the task name.");
  if (title.length > MAX_TITLE) throw httpError(400, "The task name is too long.");
  return title;
}

const sameId = (a, b) => a !== null && a !== undefined && String(a) === String(b);

/* ------------------------------------------------------------------ */
/* Member: form options                                                */
/* ------------------------------------------------------------------ */

/*
 * Projects the member can log time on: projects they are a member of, plus
 * projects where they have an assigned task (stand-alone tasks can be given
 * to anyone). Archived and trashed projects are left out.
 *
 * Tasks: tasks and sub tasks assigned to the member that are not Done yet.
 * Once the manager marks a task Done it no longer shows up here.
 *
 * Clusters: only clusters that hold at least one of those tasks. A sub task
 * belongs to its own cluster, or its main task's cluster.
 */
async function getMemberOptions(memberId) {
  const { rows: tasks } = await db.query(
    `
      SELECT
        t.id,
        t.title,
        t.stage,
        t.project_id,
        t.parent_task_id,
        pt.title AS parent_title,
        coalesce(t.cluster_id, pt.cluster_id) AS cluster_id
      FROM tasks t
      JOIN task_assignees ta ON ta.task_id = t.id AND ta.member_id::text = $1
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN tasks pt ON pt.id = t.parent_task_id
      WHERE lower(trim(coalesce(t.stage, ''))) <> 'done'
        AND p.status <> 'archived'
        AND p.trashed_at IS NULL
      ORDER BY coalesce(pt.title, t.title), t.parent_task_id NULLS FIRST, t.title
    `,
    [String(memberId)],
  );

  const { rows: projects } = await db.query(
    `
      SELECT p.id, p.name, p.client_name
      FROM projects p
      WHERE p.status <> 'archived'
        AND p.trashed_at IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id AND pm.member_id::text = $1
          )
          OR EXISTS (
            SELECT 1 FROM tasks t
            JOIN task_assignees ta ON ta.task_id = t.id
            WHERE t.project_id = p.id AND ta.member_id::text = $1
          )
        )
      ORDER BY lower(p.name)
    `,
    [String(memberId)],
  );

  const clusterIds = [...new Set(tasks.map((t) => t.cluster_id).filter((id) => id != null).map(String))];
  const { rows: clusters } = clusterIds.length
    ? await db.query(
        `SELECT id, name, project_id FROM clusters WHERE id::text = ANY($1::text[]) ORDER BY lower(name)`,
        [clusterIds],
      )
    : { rows: [] };

  return { projects, clusters, tasks, today: istToday() };
}

/* ------------------------------------------------------------------ */
/* Member: add an entry                                                */
/* ------------------------------------------------------------------ */

async function createEntry(memberId, body = {}) {
  const isMisc = body.is_misc === true || body.is_misc === "true";
  const workDate = readWorkDate(body.work_date);
  const minutes = readMinutes(body.minutes);

  if (body.project_id === undefined || body.project_id === null || body.project_id === "") {
    throw httpError(400, "Select a project.");
  }

  // Same rules as the form options: never trust ids from the client.
  const options = await getMemberOptions(memberId);
  const project = options.projects.find((p) => sameId(p.id, body.project_id));
  if (!project) throw httpError(403, "You can't log time on this project.");

  let taskId = null;
  let clusterId = null;
  let title;

  if (isMisc) {
    title = readTitle(body.task_name);
  } else {
    if (body.task_id === undefined || body.task_id === null || body.task_id === "") {
      throw httpError(400, "Select a task.");
    }
    const task = options.tasks.find((t) => sameId(t.id, body.task_id));
    if (!task || !sameId(task.project_id, project.id)) {
      throw httpError(403, "This task isn't assigned to you, or it is already Done.");
    }
    taskId = task.id;
    clusterId = task.cluster_id ?? null;
    title = task.title;
  }

  const { rows } = await db.query(
    `
      INSERT INTO time_entries
        (member_id, project_id, cluster_id, task_id, task_title, is_misc, minutes, work_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, project_id, task_id, task_title, is_misc, minutes,
                to_char(work_date, 'YYYY-MM-DD') AS work_date
    `,
    [memberId, project.id, clusterId, taskId, title, isMisc, minutes, workDate],
  );

  return rows[0];
}

/* ------------------------------------------------------------------ */
/* Admin: queries                                                      */
/* ------------------------------------------------------------------ */

// $1 = from (YYYY-MM-DD or null), $2 = to (YYYY-MM-DD or null): work dates.
const RANGE = `
  ($1::date IS NULL OR e.work_date >= $1::date)
  AND ($2::date IS NULL OR e.work_date <= $2::date)
`;

// Everything the admin page shows for one entry. Uses the live task title
// when the task still exists, otherwise the copy saved with the entry.
const ENTRY_COLUMNS = `
  e.id,
  e.member_id,
  m.name AS member_name,
  e.project_id,
  p.name AS project_name,
  p.client_name,
  p.status AS project_status,
  e.cluster_id,
  c.name AS cluster_name,
  e.task_id,
  coalesce(t.title, e.task_title) AS task_title,
  t.parent_task_id,
  pt.title AS parent_title,
  t.stage AS task_stage,
  (e.task_id IS NULL AND NOT e.is_misc) AS task_deleted,
  e.is_misc,
  e.minutes,
  to_char(e.work_date, 'YYYY-MM-DD') AS work_date,
  e.created_at
`;

const ENTRY_JOINS = `
  JOIN projects p ON p.id = e.project_id
  LEFT JOIN members m ON m.id = e.member_id
  LEFT JOIN clusters c ON c.id = e.cluster_id
  LEFT JOIN tasks t ON t.id = e.task_id
  LEFT JOIN tasks pt ON pt.id = t.parent_task_id
`;

// A "task" for counting: a real task id, or a Miscellaneous name.
const TASK_KEY = `
  CASE WHEN e.is_misc THEN 'misc:' || lower(e.task_title)
       WHEN e.task_id IS NOT NULL THEN 'task:' || e.task_id::text
       ELSE 'gone:' || lower(e.task_title) END
`;

const TOTALS = `
  coalesce(SUM(e.minutes), 0)::int AS total_minutes,
  coalesce(SUM(e.minutes) FILTER (WHERE e.is_misc), 0)::int AS misc_minutes,
  COUNT(*)::int AS entry_count,
  COUNT(DISTINCT ${TASK_KEY})::int AS task_count,
  to_char(MAX(e.work_date), 'YYYY-MM-DD') AS last_logged_on
`;

async function getProjects({ from, to }) {
  const { rows } = await db.query(
    `
      SELECT
        p.id, p.name, p.client_name, p.status,
        ${TOTALS},
        COUNT(DISTINCT e.member_id)::int AS member_count
      FROM time_entries e
      JOIN projects p ON p.id = e.project_id
      WHERE ${RANGE}
      GROUP BY p.id
      ORDER BY total_minutes DESC, p.name ASC
    `,
    [from, to],
  );

  return { projects: rows };
}

async function getProjectDetail(projectId, { from, to }) {
  const { rows: projectRows } = await db.query(
    `SELECT id, name, client_name, status FROM projects WHERE id::text = $1 LIMIT 1`,
    [String(projectId)],
  );

  if (!projectRows[0]) throw httpError(404, "Project not found");

  const { rows: entries } = await db.query(
    `
      SELECT ${ENTRY_COLUMNS}
      FROM time_entries e
      ${ENTRY_JOINS}
      WHERE ${RANGE}
        AND e.project_id::text = $3
      ORDER BY e.work_date DESC, e.created_at DESC
    `,
    [from, to, String(projectId)],
  );

  return { project: projectRows[0], entries };
}

async function getMembers({ from, to }) {
  const { rows } = await db.query(
    `
      SELECT
        m.id, m.name, m.email, m.avatar_url, m.role, m.active,
        ${TOTALS},
        COUNT(DISTINCT e.project_id)::int AS project_count
      FROM time_entries e
      JOIN members m ON m.id = e.member_id
      WHERE ${RANGE}
      GROUP BY m.id
      ORDER BY total_minutes DESC, m.name ASC
    `,
    [from, to],
  );

  return { members: rows };
}

async function getMemberDetail(memberId, { from, to }) {
  const { rows: memberRows } = await db.query(
    `
      SELECT id, name, email, avatar_url, role, active
      FROM members
      WHERE id::text = $1
      LIMIT 1
    `,
    [String(memberId)],
  );

  if (!memberRows[0]) throw httpError(404, "Member not found");

  const { rows: entries } = await db.query(
    `
      SELECT ${ENTRY_COLUMNS}
      FROM time_entries e
      ${ENTRY_JOINS}
      WHERE ${RANGE}
        AND e.member_id::text = $3
      ORDER BY e.work_date DESC, e.created_at DESC
    `,
    [from, to, String(memberId)],
  );

  return { member: memberRows[0], entries };
}

/* ------------------------------------------------------------------ */
/* Admin: edit / delete                                                */
/* ------------------------------------------------------------------ */

// Managers can change the date and time of any entry, and the task name of
// a Miscellaneous entry. Project / task stay as the member logged them.
async function updateEntry(entryId, body = {}) {
  const { rows: found } = await db.query(
    `SELECT id, is_misc FROM time_entries WHERE id::text = $1 LIMIT 1`,
    [String(entryId)],
  );
  const entry = found[0];
  if (!entry) throw httpError(404, "Entry not found");

  const workDate = readWorkDate(body.work_date);
  const minutes = readMinutes(body.minutes);
  const title = entry.is_misc && body.task_name !== undefined ? readTitle(body.task_name) : null;

  const { rows } = await db.query(
    `
      UPDATE time_entries
      SET work_date = $2,
          minutes = $3,
          task_title = coalesce($4, task_title),
          updated_at = NOW()
      WHERE id::text = $1
      RETURNING id, minutes, task_title, to_char(work_date, 'YYYY-MM-DD') AS work_date
    `,
    [String(entryId), workDate, minutes, title],
  );

  return rows[0];
}

async function deleteEntry(entryId) {
  const { rowCount } = await db.query(`DELETE FROM time_entries WHERE id::text = $1`, [
    String(entryId),
  ]);
  if (!rowCount) throw httpError(404, "Entry not found");
  return { ok: true };
}

module.exports = {
  getMemberOptions,
  createEntry,
  getProjects,
  getProjectDetail,
  getMembers,
  getMemberDetail,
  updateEntry,
  deleteEntry,
};
