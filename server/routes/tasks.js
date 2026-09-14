const router = require("express").Router();
const db = require("../db");
const { auth, managerOnly } = require("../middleware/auth");
const { createNotification } = require("../utils/pushNotify");

const MANAGER_STAGES = ["Done"];

const ASSIGNEE_JOIN = `
  LEFT JOIN LATERAL (
    SELECT
      STRING_AGG(m.name, ', ' ORDER BY m.name) AS assignee_name,
      COALESCE(
        json_agg(json_build_object('id', m.id, 'name', m.name, 'email', m.email) ORDER BY m.name),
        '[]'
      ) AS assignees
    FROM task_assignees ta
    JOIN members m ON m.id = ta.member_id
    WHERE ta.task_id = t.id
  ) assignee_agg ON true
`;

function extractAssigneeIds(body) {
  if (Array.isArray(body.assignee_ids)) {
    return [...new Set(body.assignee_ids.filter(Boolean))];
  }
  // Backward-compat: anything still sending the old single assignee_id.
  return body.assignee_id ? [body.assignee_id] : [];
}

// Whenever a subtask is created, its due_date changes, or it's deleted,
// the parent task's due_date is recomputed as the MAX (latest) due_date
// among its remaining subtasks. If a parent has no subtasks with a due
// date, its due_date is cleared (falls back to null / manual entry).
// `queryable` is either the plain `db` pool or an in-transaction `client`
// so this can be called from both transactional and non-transactional
// code paths.
async function recomputeParentDueDate(queryable, parentId) {
  const { rows } = await queryable.query(
    `SELECT MAX(due_date) as max_due FROM tasks WHERE parent_task_id = $1 AND due_date IS NOT NULL`,
    [parentId],
  );
  await queryable.query(
    `UPDATE tasks SET due_date = $1, updated_at = NOW() WHERE id = $2`,
    [rows[0]?.max_due || null, parentId],
  );
}

// Derives a main task's stage from the full set of its subtask stages
// (instead of only recognizing the Done <-> In Progress transition):
//  - no subtasks left           -> Todo
//  - every subtask is Todo      -> Todo
//  - every subtask is Done      -> Done
//  - anything else (a mix, or
//    any subtask In Progress /
//    In Review)                 -> In Progress
// Only writes + logs activity when the computed stage actually differs
// from the parent's current stage. `actorId` is optional — pass it when
// available so the activity entry has a real actor instead of null.
async function recomputeParentStage(queryable, parentId, actorId = null) {
  const { rows: siblings } = await queryable.query(
    `SELECT stage FROM tasks WHERE parent_task_id = $1`,
    [parentId],
  );
  const { rows: parentRows } = await queryable.query(
    `SELECT stage FROM tasks WHERE id = $1`,
    [parentId],
  );
  const currentStage = parentRows[0]?.stage;

  let nextStage;
  if (siblings.length === 0) {
    nextStage = "Todo";
  } else if (siblings.every((s) => s.stage === "Done")) {
    nextStage = "Done";
  } else if (siblings.every((s) => s.stage === "Todo")) {
    nextStage = "Todo";
  } else {
    nextStage = "In Progress";
  }

  if (nextStage && nextStage !== currentStage) {
    await queryable.query(
      `UPDATE tasks SET stage = $1, updated_at = NOW() WHERE id = $2`,
      [nextStage, parentId],
    );
    await queryable.query(
      `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
      [
        parentId,
        actorId,
        "Stage changed",
        JSON.stringify({ from: currentStage, to: nextStage }),
      ],
    );
  }
}

router.get("/project/:projectId", auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, assignee_agg.assignee_name, assignee_agg.assignees, c.name as cluster_name FROM tasks t
     LEFT JOIN clusters c ON t.cluster_id=c.id
     ${ASSIGNEE_JOIN}
     WHERE t.project_id=$1
     ORDER BY t.sort_order ASC NULLS LAST, t.created_at DESC`,
    [req.params.projectId],
  );
  res.json(rows);
});

// Drag-and-drop reordering within a board column, and moving a card
// between columns. Registered before PUT /:id so Express doesn't match
// "reorder" as an :id param.
router.put("/reorder", auth, async (req, res) => {
  const { stage, ordered_ids } = req.body;
  if (!stage || !Array.isArray(ordered_ids) || !ordered_ids.length) {
    return res
      .status(400)
      .json({ error: "stage and ordered_ids array required" });
  }
  if (req.user.role === "member" && MANAGER_STAGES.includes(stage)) {
    return res
      .status(403)
      .json({ error: "Manager approval required for this stage" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (let i = 0; i < ordered_ids.length; i++) {
      const taskId = ordered_ids[i];
      const { rows: prevRows } = await client.query(
        "SELECT stage, title, parent_task_id FROM tasks WHERE id = $1",
        [taskId],
      );
      const prevStage = prevRows[0]?.stage;
      const parentTaskId = prevRows[0]?.parent_task_id;

      await client.query(
        "UPDATE tasks SET stage=$1, sort_order=$2, updated_at=NOW() WHERE id=$3",
        [stage, i, taskId],
      );

      // Only log an activity entry for the card that actually changed
      // column — reordering siblings within the same column shouldn't
      // spam the activity feed.
      if (prevStage && prevStage !== stage) {
        await client.query(
          `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
          [
            taskId,
            req.user.id,
            "Stage changed",
            JSON.stringify({ from: prevStage, to: stage }),
          ],
        );

        // If this card is a subtask, keep its parent's derived stage in sync.
        if (parentTaskId) {
          await recomputeParentStage(client, parentTaskId, req.user.id);
        }
      }
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.get("/:id", auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, assignee_agg.assignee_name, assignee_agg.assignees FROM tasks t ${ASSIGNEE_JOIN} WHERE t.id=$1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const comments = await db.query(
    `SELECT tc.*, m.name as author_name FROM task_comments tc
     JOIN members m ON tc.author_id=m.id WHERE tc.task_id=$1 ORDER BY tc.created_at`,
    [req.params.id],
  );
  // Activity includes both own activity and sub-task activity (labelled [Sub Task])
  const activity = await db.query(
    `SELECT ta.*, m.name as actor_name, 'own' as source FROM task_activity ta
     LEFT JOIN members m ON ta.actor_id=m.id WHERE ta.task_id=$1
     UNION ALL
     SELECT ta.*, m.name as actor_name, 'subtask' as source FROM task_activity ta
     LEFT JOIN members m ON ta.actor_id=m.id
     WHERE ta.task_id IN (SELECT id FROM tasks WHERE parent_task_id=$1)
     ORDER BY created_at DESC LIMIT 30`,
    [req.params.id],
  );
  const subtasks = await db.query(
    `SELECT t.*, assignee_agg.assignee_name, assignee_agg.assignees FROM tasks t ${ASSIGNEE_JOIN} WHERE t.parent_task_id=$1 ORDER BY t.created_at`,
    [req.params.id],
  );
  res.json({
    ...rows[0],
    comments: comments.rows,
    activity: activity.rows,
    subtasks: subtasks.rows,
  });
});

router.post("/", auth, async (req, res) => {
  // Only managers can create main tasks; members can create subtasks
  if (req.user.role === "member" && !req.body.parent_task_id) {
    return res
      .status(403)
      .json({ error: "Only managers can create main tasks" });
  }
  const {
    project_id,
    cluster_id,
    parent_task_id,
    title,
    description,
    priority,
    stage,
    due_date,
  } = req.body;
  const assigneeIds = extractAssigneeIds(req.body);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO tasks(project_id,cluster_id,parent_task_id,title,description,priority,stage,due_date,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        project_id,
        cluster_id || null,
        parent_task_id || null,
        title,
        description,
        priority || "medium",
        stage || "Todo",
        due_date || null,
        req.user.id,
      ],
    );
    const task = rows[0];

    for (const mid of assigneeIds) {
      await client.query(
        "INSERT INTO task_assignees(task_id, member_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [task.id, mid],
      );
    }

    const actionLabel = parent_task_id
      ? "[Sub Task] Created sub task"
      : "Created task";
    await client.query(
      `INSERT INTO task_activity(task_id,actor_id,action) VALUES($1,$2,$3)`,
      [task.id, req.user.id, actionLabel],
    );

    // A new subtask can shift the parent's derived stage (e.g. parent
    // was Todo/Done and now has an In Progress/In Review sibling) — keep
    // it in sync with the full set of subtask stages.
    if (parent_task_id) {
      await recomputeParentStage(client, parent_task_id, req.user.id);

      // New subtask may push the parent's derived due date later —
      // recompute it as the MAX due_date across all subtasks.
      await recomputeParentDueDate(client, parent_task_id);
    }

    await client.query("COMMIT");

    // Feature 1/N (see chat): notify every assignee when a task is
    // created and assigned to them.
    assigneeIds.forEach((mid) => {
      createNotification(
        mid,
        "📌 New Task Assigned",
        `You have been assigned: ${title}`,
        { url: "/tasks" },
      ).catch(() => {});
    });

    res.status(201).json(task);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.put("/:id", auth, async (req, res) => {
  const { title, description, priority, stage, due_date, cluster_id } =
    req.body;
  const assigneeIdsProvided =
    Array.isArray(req.body.assignee_ids) || req.body.assignee_id !== undefined;
  const assigneeIds = extractAssigneeIds(req.body);

  const task = await db.query("SELECT * FROM tasks WHERE id=$1", [
    req.params.id,
  ]);
  if (!task.rows[0]) return res.status(404).json({ error: "Not found" });

  const isSubTask = Boolean(task.rows[0].parent_task_id);

  if (req.user.role === "member") {
    if (MANAGER_STAGES.includes(stage))
      return res
        .status(403)
        .json({ error: "Manager approval required for this stage" });
    // Skip update if stage hasn't changed and no time_taken
    if (task.rows[0].stage === stage && !req.body.time_taken) {
      return res.json(task.rows[0]);
    }
    const isRework = stage === "Rework";
    const actualStage = isRework ? "Todo" : stage;
    const incomingTime =
      req.body.time_taken && req.body.time_taken !== task.rows[0].time_taken
        ? parseInt(req.body.time_taken)
        : 0;
    const existingTime = task.rows[0].time_taken || 0;
    const time_taken = isRework
      ? null
      : incomingTime > 0
        ? existingTime + incomingTime
        : existingTime > 0
          ? existingTime
          : null;
    const { rows } = await db.query(
      "UPDATE tasks SET stage=$1,updated_at=NOW(),time_taken=$2,rework_count=rework_count+$3,due_date=COALESCE($4,due_date) WHERE id=$5 RETURNING *",
      [
        actualStage,
        time_taken,
        isRework ? 1 : 0,
        req.body.new_due_date || null,
        req.params.id,
      ],
    );
    await db.query(
      `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
      [
        req.params.id,
        req.user.id,
        isSubTask ? "[Sub Task] Stage changed" : "Stage changed",
        JSON.stringify({ from: task.rows[0].stage, to: stage }),
      ],
    );

    if (task.rows[0].parent_task_id) {
      await recomputeParentStage(db, task.rows[0].parent_task_id, req.user.id);

      // This path can change the subtask's due_date (via new_due_date on
      // rework), so keep the parent's derived due date in sync.
      await recomputeParentDueDate(db, task.rows[0].parent_task_id);
    }

    // NOTIFICATION REMOVED (see chat) — was: "📌 Task Updated" alert
    // here (member-triggered stage update path). Stage/assignee logic
    // above is untouched; only this alert was pulled out.

    return res.json(rows[0]);
  }

  const isRework = stage === "Rework";
  const actualStage = isRework ? "Todo" : stage;
  const incomingTime =
    req.body.time_taken && req.body.time_taken !== task.rows[0].time_taken
      ? parseInt(req.body.time_taken)
      : 0;
  const existingTime = task.rows[0].time_taken || 0;
  const time_taken = isRework
    ? null
    : incomingTime > 0
      ? existingTime + incomingTime
      : existingTime > 0
        ? existingTime
        : null;

  // A main task with subtasks has its due_date derived from those
  // subtasks (see recomputeParentDueDate) rather than taken from the
  // form, so an empty/omitted due_date here should NOT clear it — we
  // only use the submitted due_date when this task has no subtasks yet.
  const { rows: existingSubtasks } = await db.query(
    `SELECT 1 FROM tasks WHERE parent_task_id = $1 LIMIT 1`,
    [req.params.id],
  );
  const taskHasSubtasks = existingSubtasks.length > 0;

  const finalDueDate = isRework
    ? req.body.new_due_date || due_date || null
    : taskHasSubtasks
      ? task.rows[0].due_date // leave untouched; recomputeParentDueDate (subtask path) owns this
      : due_date || null;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE tasks SET title=$1,description=$2,priority=$3,stage=$4,due_date=$5,cluster_id=$6,updated_at=NOW(),time_taken=$7,rework_count=rework_count+$8
       WHERE id=$9 RETURNING *`,
      [
        title,
        description,
        priority,
        actualStage,
        finalDueDate,
        cluster_id || null,
        time_taken,
        isRework ? 1 : 0,
        req.params.id,
      ],
    );

    if (assigneeIdsProvided) {
      await client.query("DELETE FROM task_assignees WHERE task_id=$1", [
        req.params.id,
      ]);
      for (const mid of assigneeIds) {
        await client.query(
          "INSERT INTO task_assignees(task_id, member_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [req.params.id, mid],
        );
      }
    }

    if (task.rows[0].stage !== stage) {
      await client.query(
        `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
        [
          req.params.id,
          req.user.id,
          isSubTask ? "[Sub Task] Stage changed" : "Stage changed",
          JSON.stringify({ from: task.rows[0].stage, to: stage }),
        ],
      );
    }

    // Keep parent stage derived from the full set of subtask stages
    if (task.rows[0].parent_task_id) {
      await recomputeParentStage(client, task.rows[0].parent_task_id, req.user.id);

      // This edit may have changed the subtask's own due_date — keep the
      // parent's derived due date (MAX across subtasks) in sync.
      await recomputeParentDueDate(client, task.rows[0].parent_task_id);
    }

    await client.query("COMMIT");

    // NOTIFICATION REMOVED (see chat) — was: "📌 Task Updated" alert
    // here (manager full-edit path). Update/assignee logic above is
    // untouched; only this alert was pulled out.

    res.json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.delete("/:id", auth, managerOnly, async (req, res) => {
  const { rows: taskRows } = await db.query("SELECT * FROM tasks WHERE id=$1", [
    req.params.id,
  ]);
  const parentId = taskRows[0]?.parent_task_id || null;

  await db.query("DELETE FROM tasks WHERE id=$1", [req.params.id]);

  if (parentId) {
    await recomputeParentStage(db, parentId, req.user.id);

    // The deleted subtask may have held the parent's derived due date —
    // recompute from whatever subtasks remain (or clear it if none left).
    await recomputeParentDueDate(db, parentId);
  }

  res.json({ success: true });
});

router.post("/:id/comments", auth, async (req, res) => {
  const { content } = req.body;
  const { rows } = await db.query(
    `INSERT INTO task_comments(task_id,author_id,content) VALUES($1,$2,$3)
     RETURNING *, (SELECT name FROM members WHERE id=$2) as author_name`,
    [req.params.id, req.user.id, content],
  );
  res.status(201).json(rows[0]);
});

router.get("/in-review/all", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT 
        t.id, t.title, t.stage, t.time_taken, t.rework_count, t.updated_at,
        t.parent_task_id,
        pt.title as parent_task_title,
        p.id as project_id, p.name as project_name,
        assignee_agg.assignee_name
       FROM tasks t
       LEFT JOIN tasks pt ON t.parent_task_id = pt.id
       INNER JOIN projects p ON t.project_id = p.id
       ${ASSIGNEE_JOIN}
       WHERE t.stage = 'In Review'
       ORDER BY t.updated_at DESC
       LIMIT 100`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;