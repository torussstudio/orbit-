const db = require("../db");
const { LEAF_TASK, IN_LIVE_PROJECT } = require("../utils/taskScope");
const { createNotification } = require("../utils/pushNotify");

/*
 * Member Activity report (managers only).
 *
 * Per member, for an IST date range (both ends optional), how many:
 *   - created   : sub tasks the member created, plus task requests the member
 *                 sent (any status)
 *   - in_review : tasks the member moved to In Review
 *   - done      : tasks marked Done          (credited to the task's assignee)
 *   - rework    : tasks sent to Rework       (credited to the task's assignee)
 *
 * Done and Rework are manager decisions, so they are credited to whoever the
 * task is assigned to, not to the manager who clicked the button. A request
 * counts once, on the day it was sent; the task a manager makes when approving
 * it is not counted again.
 *
 * Sources: task_activity (actor_id, action, meta {from,to}, created_at) for
 * create / stage changes, and task_requests (requested_by, task_id, status).
 *
 * Counting rules:
 *   - An item counts once per metric per IST day ("unique per day"). The range
 *     total is the sum of those daily unique counts.
 *   - Task metrics only count leaf tasks (a sub task, or a task without sub
 *     tasks). A main task with sub tasks only mirrors them, so counting it
 *     would double up. Tasks in trashed projects are left out.
 *   - Requests are not tasks, so the leaf / project rules do not apply to them.
 */

const IST = "Asia/Kolkata";
const CREATE_ACTIONS = ["Created task", "[Sub Task] Created sub task"];
const STAGE_ACTIONS = ["Stage changed", "[Sub Task] Stage changed"];
const METRIC_KEYS = ["created", "in_review", "done", "rework"];

const zeroCounts = () => Object.fromEntries(METRIC_KEYS.map((k) => [k, 0]));

// $1 = from (date|null), $2 = to (date|null), $3 = create actions, $4 = stage actions
const rangeSql = (col) => `
  AND ($1::date IS NULL OR ${col} >= ($1::date)::timestamp AT TIME ZONE '${IST}')
  AND ($2::date IS NULL OR ${col} <  (($2::date + 1))::timestamp AT TIME ZONE '${IST}')
`;

const EVENTS_CTE = `
  WITH raw_events AS (
    -- Created / In Review: credited to the member who did it.
    SELECT ta.task_id,
           NULL::text AS request_id,
           ta.actor_id AS member_id,
           (ta.created_at AT TIME ZONE '${IST}')::date AS day,
           CASE WHEN ta.action = ANY($3::text[]) THEN 'created' ELSE 'in_review' END AS metric
      FROM task_activity ta
     WHERE ta.actor_id IS NOT NULL
       AND (
         ta.action = ANY($3::text[])
         OR (ta.action = ANY($4::text[]) AND ta.meta->>'to' = 'In Review')
       )
       ${rangeSql("ta.created_at")}

    UNION ALL

    -- Done / Rework: credited to the task's assignees.
    SELECT ta.task_id,
           NULL::text AS request_id,
           asg.member_id,
           (ta.created_at AT TIME ZONE '${IST}')::date AS day,
           CASE ta.meta->>'to' WHEN 'Done' THEN 'done' ELSE 'rework' END AS metric
      FROM task_activity ta
      JOIN task_assignees asg ON asg.task_id = ta.task_id
     WHERE ta.action = ANY($4::text[])
       AND ta.meta->>'to' IN ('Done', 'Rework')
       ${rangeSql("ta.created_at")}

    UNION ALL

    -- Task requests the member sent count as Created, on the day they sent it.
    SELECT NULL AS task_id,
           tr.id::text AS request_id,
           tr.requested_by AS member_id,
           (tr.created_at AT TIME ZONE '${IST}')::date AS day,
           'created' AS metric
      FROM task_requests tr
     WHERE tr.requested_by IS NOT NULL
       ${rangeSql("tr.created_at")}
  ),
  events AS (
    SELECT e.*,
           COALESCE(e.task_id::text, 'r' || e.request_id) AS item_key
      FROM raw_events e
      LEFT JOIN tasks t ON t.id = e.task_id
     WHERE e.request_id IS NOT NULL
        OR (t.id IS NOT NULL AND ${LEAF_TASK} AND ${IN_LIVE_PROJECT})
  )
`;

const baseParams = ({ from, to }) => [from, to, CREATE_ACTIONS, STAGE_ACTIONS];

async function getMembers({ from, to }) {
  const sums = METRIC_KEYS.map(
    (k) => `COALESCE(SUM(d.n) FILTER (WHERE d.metric = '${k}'), 0)::int AS ${k}`,
  ).join(",\n            ");

  const { rows } = await db.query(
    `${EVENTS_CTE}
     SELECT m.id, m.name, m.email, m.avatar_url,
            ${sums}
       FROM members m
       LEFT JOIN (
         SELECT member_id, day, metric, COUNT(DISTINCT item_key) AS n
           FROM events
          GROUP BY member_id, day, metric
       ) d ON d.member_id = m.id
      WHERE m.active = true AND m.role = 'member'
      GROUP BY m.id
      ORDER BY m.name`,
    baseParams({ from, to }),
  );

  return { members: rows };
}

async function getMemberDetail(memberId, { from, to }) {
  const { rows: found } = await db.query(
    `SELECT id, name, email, avatar_url FROM members WHERE id::text = $1::text`,
    [String(memberId)],
  );
  if (!found.length) {
    const err = new Error("Member not found");
    err.status = 404;
    throw err;
  }

  const { rows } = await db.query(
    `${EVENTS_CTE}
     SELECT DISTINCT ON (ev.day, ev.metric, ev.item_key)
            to_char(ev.day, 'YYYY-MM-DD') AS day,
            ev.metric,
            ev.task_id,
            ev.request_id,
            COALESCE(t.title, tr.title) AS title,
            t.project_id,
            COALESCE(p.name, tr.project_name) AS project_name,
            tr.status AS request_status,
            (SELECT pt.title FROM tasks pt WHERE pt.id = t.parent_task_id) AS parent_title
       FROM events ev
       LEFT JOIN tasks t ON t.id = ev.task_id
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN task_requests tr ON tr.id::text = ev.request_id
      WHERE ev.member_id::text = $5::text
      ORDER BY ev.day DESC, ev.metric, ev.item_key
      LIMIT 2000`,
    [...baseParams({ from, to }), String(memberId)],
  );

  // Group by day (newest first) and count per metric.
  const byDay = new Map();
  const totals = zeroCounts();
  for (const r of rows) {
    if (!byDay.has(r.day)) {
      byDay.set(r.day, { day: r.day, counts: zeroCounts(), items: [] });
    }
    const entry = byDay.get(r.day);
    entry.counts[r.metric] += 1;
    totals[r.metric] += 1;
    entry.items.push({
      metric: r.metric,
      task_id: r.task_id,
      request_id: r.request_id,
      request_status: r.request_status,
      title: r.title,
      parent_title: r.parent_title,
      project_id: r.project_id,
      project_name: r.project_name,
    });
  }

  return { member: found[0], totals, days: Array.from(byDay.values()) };
}


/* ------------------------------------------------------------------ */
/* Idle today + manual nudge                                            */
/* ------------------------------------------------------------------ */

const NUDGE_COOLDOWN_MINUTES = 30;
const NUDGE_MAX_MEMBERS = 100;

// IST midnight today, as a timestamptz.
const TODAY_START = `(((NOW() AT TIME ZONE '${IST}')::date)::timestamp AT TIME ZONE '${IST}')`;
const TODAY_DATE = `((NOW() AT TIME ZONE '${IST}')::date)`;

/*
 * Active members with no activity today (IST): no task action (create, stage
 * change), comment, task request or time log entry. Also says whether the
 * member can get a push, their open task count and when they were last nudged.
 */
async function getIdleToday() {
  const { rows } = await db.query(
    `SELECT m.id, m.name, m.email, m.avatar_url, m.phone,
            EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.member_id = m.id) AS has_push,
            (SELECT COUNT(*)::int
               FROM tasks t
               JOIN task_assignees ta ON ta.task_id = t.id
              WHERE ta.member_id = m.id
                AND t.stage <> 'Done'
                AND ${LEAF_TASK}
                AND ${IN_LIVE_PROJECT}) AS open_tasks,
            (SELECT MAX(n.created_at)
               FROM notifications n
              WHERE n.member_id = m.id AND n.type = 'admin_nudge') AS last_nudged_at
       FROM members m
      WHERE m.active = true AND m.role = 'member'
        AND NOT EXISTS (SELECT 1 FROM task_activity a
                         WHERE a.actor_id = m.id AND a.created_at >= ${TODAY_START})
        AND NOT EXISTS (SELECT 1 FROM task_comments c
                         WHERE c.author_id = m.id AND c.created_at >= ${TODAY_START})
        AND NOT EXISTS (SELECT 1 FROM task_requests r
                         WHERE r.requested_by = m.id AND r.created_at >= ${TODAY_START})
        AND NOT EXISTS (SELECT 1 FROM time_entries e
                         WHERE e.member_id = m.id
                           AND (e.work_date = ${TODAY_DATE} OR e.created_at >= ${TODAY_START}))
      ORDER BY m.name`,
  );

  return { members: rows };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function nudgeBody(openTasks) {
  const ask = "Your admin is checking in: what did you get done today?";
  return openTasks > 0
    ? `${ask} You have ${plural(openTasks, "open task")}. Please update them and log your time on Orbit.`
    : `${ask} Please update your progress and log your time on Orbit.`;
}

/*
 * Manager taps Nudge: one notification per member. It always lands in the
 * bell (type admin_nudge has no off switch), and as a push too when the
 * member has a device subscribed. Not sent twice within
 * NUDGE_COOLDOWN_MINUTES, so a double tap cannot spam anyone.
 */
async function nudgeMembers(memberIds, actor) {
  const ids = Array.from(new Set((Array.isArray(memberIds) ? memberIds : []).map(String)));
  if (!ids.length) {
    const err = new Error("Pick at least one member");
    err.status = 400;
    throw err;
  }
  if (ids.length > NUDGE_MAX_MEMBERS) {
    const err = new Error(`You can nudge up to ${NUDGE_MAX_MEMBERS} members at once`);
    err.status = 400;
    throw err;
  }

  const { rows: members } = await db.query(
    `SELECT m.id,
            EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.member_id = m.id) AS has_push,
            EXISTS (SELECT 1 FROM notifications n
                     WHERE n.member_id = m.id AND n.type = 'admin_nudge'
                       AND n.created_at > NOW() - ($2::int * INTERVAL '1 minute')) AS nudged_recently,
            (SELECT COUNT(*)::int
               FROM tasks t
               JOIN task_assignees ta ON ta.task_id = t.id
              WHERE ta.member_id = m.id
                AND t.stage <> 'Done'
                AND ${LEAF_TASK}
                AND ${IN_LIVE_PROJECT}) AS open_tasks
       FROM members m
      WHERE m.active = true AND m.role = 'member' AND m.id::text = ANY($1::text[])`,
    [ids, NUDGE_COOLDOWN_MINUTES],
  );
  const byId = new Map(members.map((m) => [String(m.id), m]));

  const results = [];
  for (const id of ids) {
    const m = byId.get(id);
    if (!m) {
      results.push({ id, status: "skipped" });
      continue;
    }
    if (m.nudged_recently) {
      results.push({ id, status: "recent" });
      continue;
    }

    const notification = await createNotification(
      m.id,
      "Reminder from admin",
      nudgeBody(m.open_tasks),
      {
        type: "admin_nudge",
        url: "/time-log",
        tag: "orbit-admin-nudge",
        sent_by: actor?.id ?? null,
      },
      { push: { ttl: 12 * 60 * 60, urgency: "high", topic: "orbitnudge" } },
    );

    results.push({ id, status: notification ? "sent" : "failed", push: Boolean(m.has_push) });
  }

  return {
    results,
    sent: results.filter((r) => r.status === "sent").length,
    recent: results.filter((r) => r.status === "recent").length,
    failed: results.filter((r) => r.status === "failed" || r.status === "skipped").length,
  };
}

module.exports = { getMembers, getMemberDetail, getIdleToday, nudgeMembers };
