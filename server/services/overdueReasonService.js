const db = require("../db");
const { LEAF_TASK, IN_LIVE_PROJECT } = require("../utils/taskScope");
const { createNotification } = require("../utils/pushNotify");
const liveEvents = require("./liveEvents");
const taskService = require("./taskService");

/*
 * Why is a task overdue?
 *
 * An overdue task is a leaf task (see utils/taskScope.js) in a live project
 * whose due date (an IST calendar day) is before today and that is not Done
 * or In Review (In Review is waiting for the manager, same as the deadline
 * reminders). It counts once per assignee.
 *
 * The assignee gives a reason (soft: nothing is blocked). The manager sees it
 * in Member Activity -> Overdue and decides: acknowledge, extend the due date,
 * reassign, or ask for more detail.
 *
 * A reason belongs to (task, assignee, due day). When the due date moves, the
 * old reason no longer matches, so a task that goes overdue again is asked
 * again.
 */

// kind: external = outside the team's control, team = inside it.
const REASONS = [
  { code: "client_delay", label: "Waiting on the client", kind: "external" },
  { code: "assets_missing", label: "Content or assets not received", kind: "external" },
  { code: "review_pending", label: "Waiting for review or approval", kind: "external" },
  { code: "dependency", label: "Depends on another task or person", kind: "external" },
  { code: "scope_change", label: "Scope changed or extra work added", kind: "external" },
  { code: "underestimated", label: "Took longer than estimated", kind: "team" },
  { code: "workload", label: "Too many tasks at once", kind: "team" },
  { code: "unavailable", label: "Leave or not available", kind: "team" },
  { code: "technical", label: "Technical issue", kind: "team" },
  { code: "other", label: "Other (add a note)", kind: "other" },
];
const REASON_CODES = new Set(REASONS.map((r) => r.code));
const DECISIONS = ["acknowledged", "extend", "reassign", "ask_again"];

const NOTE_MAX = 500;
const LIST_MAX = 1000;
const ASK_MAX = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TODAY_IST = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`;

const httpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// One row per (overdue task, active assignee), with that assignee's reason
// for the current due date, if any.
const OVERDUE_FROM = `
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  JOIN task_assignees ta ON ta.task_id = t.id
  JOIN members m ON m.id = ta.member_id AND m.active = true
  LEFT JOIN task_delay_reasons r
         ON r.task_id = t.id
        AND r.member_id = ta.member_id
        AND r.due_day = t.due_date::date
  WHERE t.due_date IS NOT NULL
    AND t.due_date::date < ${TODAY_IST}
    AND lower(trim(coalesce(t.stage, ''))) NOT IN ('done', 'in review')
    AND COALESCE(p.status, '') <> 'archived'
    AND ${LEAF_TASK}
    AND ${IN_LIVE_PROJECT}`;

const OVERDUE_COLUMNS = `
  t.id AS task_id,
  t.title,
  t.stage,
  t.project_id,
  p.name AS project_name,
  t.due_date::date::text AS due_day,
  (${TODAY_IST} - t.due_date::date)::int AS days_overdue,
  m.id AS member_id,
  m.name AS member_name,
  m.avatar_url,
  r.id AS reason_id,
  r.reason,
  r.note,
  r.new_due_date::text AS new_due_date,
  r.updated_at AS reason_at,
  r.decision,
  r.decision_note,
  r.decided_at`;

function shape(row) {
  return {
    task_id: row.task_id,
    title: row.title,
    stage: row.stage,
    project_id: row.project_id,
    project_name: row.project_name,
    due_day: row.due_day,
    days_overdue: row.days_overdue,
    member_id: row.member_id,
    member_name: row.member_name,
    avatar_url: row.avatar_url,
    reason_id: row.reason_id,
    reason: row.reason,
    note: row.note,
    new_due_date: row.new_due_date,
    reason_at: row.reason_at,
    decision: row.decision,
    decision_note: row.decision_note,
    decided_at: row.decided_at,
    // The assignee still has something to answer.
    pending: !row.reason_id || row.decision === "ask_again",
  };
}

async function todayIst() {
  const { rows } = await db.query(`SELECT ${TODAY_IST}::text AS today`);
  return rows[0].today;
}

function readDate(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw httpError(400, `${label} must be a date (YYYY-MM-DD)`);
  }
  return value;
}

function readNote(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text.length > NOTE_MAX) throw httpError(400, `Keep the note under ${NOTE_MAX} characters`);
  return text || null;
}

function tellTaskChanged(row) {
  liveEvents.taskChanged("task.updated", { id: row.task_id, project_id: row.project_id });
}

/* ------------------------------------------------------------------ */
/* Assignee                                                             */
/* ------------------------------------------------------------------ */

// The signed-in member's own overdue tasks.
async function getMine(user) {
  const { rows } = await db.query(
    `SELECT ${OVERDUE_COLUMNS}
     ${OVERDUE_FROM}
       AND ta.member_id::text = $1::text
     ORDER BY t.due_date, t.title
     LIMIT ${LIST_MAX}`,
    [String(user.id)],
  );

  const items = rows.map(shape);
  return {
    reasons: REASONS,
    items,
    pending: items.filter((i) => i.pending).length,
  };
}

async function saveReason(user, taskId, body = {}) {
  const reason = String(body.reason || "");
  if (!REASON_CODES.has(reason)) throw httpError(400, "Pick a reason");

  const note = readNote(body.note);
  if (reason === "other" && !note) throw httpError(400, "Add a short note for Other");

  const newDueDate = readDate(body.new_due_date, "Expected date");
  if (newDueDate && newDueDate < (await todayIst())) {
    throw httpError(400, "Expected date cannot be in the past");
  }

  const { rows } = await db.query(
    `SELECT ${OVERDUE_COLUMNS}
     ${OVERDUE_FROM}
       AND ta.member_id::text = $1::text
       AND t.id::text = $2::text`,
    [String(user.id), String(taskId)],
  );
  const row = rows[0];
  if (!row) throw httpError(404, "This task is not overdue, or it is not assigned to you");
  if (row.reason_id && row.decision && row.decision !== "ask_again") {
    throw httpError(409, "Your admin has already reviewed this reason");
  }

  await db.query(
    `INSERT INTO task_delay_reasons (task_id, member_id, due_day, reason, note, new_due_date)
     VALUES ($1, $2, $3::date, $4, $5, $6::date)
     ON CONFLICT (task_id, member_id, due_day) DO UPDATE
        SET reason = EXCLUDED.reason,
            note = EXCLUDED.note,
            new_due_date = EXCLUDED.new_due_date,
            updated_at = NOW(),
            decision = NULL,
            decision_note = NULL,
            decided_by = NULL,
            decided_at = NULL`,
    [row.task_id, row.member_id, row.due_day, reason, note, newDueDate],
  );

  tellTaskChanged(row);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Manager                                                              */
/* ------------------------------------------------------------------ */

async function getOverdue() {
  const { rows } = await db.query(
    `SELECT ${OVERDUE_COLUMNS}
     ${OVERDUE_FROM}
     ORDER BY t.due_date, t.title, m.name
     LIMIT ${LIST_MAX}`,
  );
  const items = rows.map(shape);

  const kindOf = new Map(REASONS.map((r) => [r.code, r.kind]));
  const byReason = {};
  const summary = { total: items.length, no_reason: 0, awaiting_decision: 0, external: 0, team: 0, other: 0, by_reason: byReason };

  for (const item of items) {
    if (!item.reason_id) {
      summary.no_reason += 1;
      continue;
    }
    byReason[item.reason] = (byReason[item.reason] || 0) + 1;
    summary[kindOf.get(item.reason) || "other"] += 1;
    if (!item.decision) summary.awaiting_decision += 1;
  }

  return { reasons: REASONS, items, summary, truncated: items.length >= LIST_MAX };
}

async function loadReason(reasonId) {
  const { rows } = await db.query(
    `SELECT r.id, r.task_id, r.member_id, r.due_day::text AS due_day, r.reason,
            r.new_due_date::text AS new_due_date, r.decision,
            t.title, t.project_id
       FROM task_delay_reasons r
       JOIN tasks t ON t.id = r.task_id
      WHERE r.id::text = $1::text`,
    [String(reasonId)],
  );
  if (!rows[0]) throw httpError(404, "Reason not found");
  return rows[0];
}

async function decide(actor, reasonId, body = {}) {
  const decision = String(body.decision || "");
  if (!DECISIONS.includes(decision)) throw httpError(400, "Pick a decision");

  const note = readNote(body.note);
  const row = await loadReason(reasonId);
  const taskUrl = `/projects/${row.project_id}/tasks/${row.task_id}`;

  if (decision === "extend") {
    const newDate = readDate(body.new_due_date || row.new_due_date, "New due date");
    if (!newDate) throw httpError(400, "Pick the new due date");
    if (newDate < (await todayIst())) throw httpError(400, "New due date cannot be in the past");

    // Same path as editing the date by hand: it notifies the assignees,
    // refreshes the parent and sends the live update.
    await taskService.updateTask(row.task_id, { due_date: newDate }, actor);
  } else if (decision === "reassign") {
    const to = body.assignee_id;
    if (!to) throw httpError(400, "Pick who should take this task");

    const { rows: target } = await db.query(
      `SELECT id FROM members WHERE id::text = $1::text AND active = true`,
      [String(to)],
    );
    if (!target[0]) throw httpError(400, "That member is not active");

    const { rows: current } = await db.query(
      `SELECT member_id FROM task_assignees WHERE task_id = $1`,
      [row.task_id],
    );
    const next = new Set(current.map((c) => String(c.member_id)));
    next.delete(String(row.member_id));
    next.add(String(target[0].id));

    await taskService.updateTask(row.task_id, { assignee_ids: [...next] }, actor);
  }

  const stored = decision === "extend" ? "extend" : decision;
  await db.query(
    `UPDATE task_delay_reasons
        SET decision = $2, decision_note = $3, decided_by = $4, decided_at = NOW()
      WHERE id::text = $1::text`,
    [String(reasonId), stored, note, actor.id],
  );

  // Extend / reassign already notify through taskService. The other two
  // answers go to the assignee here.
  if (decision === "ask_again") {
    await createNotification(
      row.member_id,
      "Admin needs more detail",
      note
        ? `"${row.title}": ${note}`
        : `"${row.title}": please update why this task is overdue.`,
      {
        type: "overdue_reason_request",
        entityId: row.task_id,
        entityType: "task",
        eventKey: `overdue-ask-again:${row.id}:${Date.now()}`,
        url: "/",
        tag: "orbit-overdue-reason",
      },
      { push: { ttl: 12 * 60 * 60, urgency: "normal", topic: "orbitoverdue" } },
    );
  } else if (decision === "acknowledged") {
    await createNotification(
      row.member_id,
      "Reason noted",
      note ? `"${row.title}": ${note}` : `Your admin saw why "${row.title}" is overdue.`,
      {
        type: "overdue_decision",
        entityId: row.task_id,
        entityType: "task",
        eventKey: `overdue-ack:${row.id}:${Date.now()}`,
        url: taskUrl,
      },
    );
  }

  tellTaskChanged(row);
  return { ok: true };
}

// Admin asks assignees who have not answered yet. At most once per day per
// task and person.
async function askReasons(actor, items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) throw httpError(400, "Pick at least one task");
  if (list.length > ASK_MAX) throw httpError(400, `You can ask for up to ${ASK_MAX} at once`);

  const today = await todayIst();
  const results = [];

  for (const entry of list) {
    const taskId = entry?.task_id;
    const memberId = entry?.member_id;
    if (!taskId || !memberId) {
      results.push({ task_id: taskId, member_id: memberId, status: "skipped" });
      continue;
    }

    const { rows } = await db.query(
      `SELECT ${OVERDUE_COLUMNS}
       ${OVERDUE_FROM}
         AND ta.member_id::text = $1::text
         AND t.id::text = $2::text`,
      [String(memberId), String(taskId)],
    );
    const row = rows[0];
    if (!row || row.reason_id) {
      results.push({ task_id: taskId, member_id: memberId, status: "skipped" });
      continue;
    }

    const eventKey = `overdue-ask:${row.task_id}:${row.member_id}:${today}`;
    const { rows: seen } = await db.query(
      `SELECT 1 FROM notifications WHERE member_id::text = $1::text AND dedupe_key = $2`,
      [String(row.member_id), eventKey],
    );
    if (seen[0]) {
      results.push({ task_id: taskId, member_id: memberId, status: "recent" });
      continue;
    }

    const days = row.days_overdue;
    const notification = await createNotification(
      row.member_id,
      "Why is this task overdue?",
      `"${row.title}" is ${days} ${days === 1 ? "day" : "days"} overdue. Please tell your admin why.`,
      {
        type: "overdue_reason_request",
        entityId: row.task_id,
        entityType: "task",
        eventKey,
        url: "/",
        tag: "orbit-overdue-reason",
        sent_by: actor?.id ?? null,
      },
      { push: { ttl: 12 * 60 * 60, urgency: "normal", topic: "orbitoverdue" } },
    );

    results.push({ task_id: taskId, member_id: memberId, status: notification ? "sent" : "failed" });
  }

  return {
    results,
    sent: results.filter((r) => r.status === "sent").length,
    recent: results.filter((r) => r.status === "recent").length,
    failed: results.filter((r) => r.status === "failed" || r.status === "skipped").length,
  };
}

module.exports = { REASONS, getMine, saveReason, getOverdue, decide, askReasons };
