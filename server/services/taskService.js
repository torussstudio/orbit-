const db = require("../db");
const { assertProjectAccess } = require("./accessControl");
const { createNotification } = require("../utils/pushNotify");
const liveEvents = require("./liveEvents");
const { keepStoredDate } = require("../utils/dateInput");
const {
  LIST_SAFETY_LIMIT,
  TOTAL_COLUMN,
  splitTotal,
} = require("../utils/listLimit");

// Stages a member can never set.
// "Done" needs manager approval, and
// "Rework" is the manager's review decision.
const MANAGER_STAGES = ["Done", "Rework"];

// Calendar day (YYYY-MM-DD) of a due date, or null. pg reads
// `timestamp without time zone` as the Node process's local time, so the
// local date parts are the stored date (whatever TZ the server runs in).
function dueDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/*
 * Time tracking (minutes).
 *
 * Every time a task is sent to In Review the member enters how long that
 * round took, and it is ADDED to what is already logged. A rework keeps the
 * time already logged, so the total covers every cycle (first attempt +
 * each rework). Requests without a time entry keep the stored total.
 */
function nextTimeTaken(existingTime, incoming) {
  const current = Number(existingTime) || 0;
  const added = parseInt(incoming, 10);
  const total = Number.isFinite(added) && added > 0 ? current + added : current;
  return total > 0 ? total : null;
}

const ASSIGNEE_JOIN = `
  LEFT JOIN LATERAL (
    SELECT
      STRING_AGG(m.name, ', ' ORDER BY m.name) AS assignee_name,
      COALESCE(
        json_agg(
          json_build_object(
            'id', m.id,
            'name', m.name,
            'email', m.email
          )
          ORDER BY m.name
        ),
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

  return body.assignee_id ? [body.assignee_id] : [];
}

/*
 * Did the caller explicitly send assignees?
 *
 * IMPORTANT: a null `assignee_id` does NOT count. `tasks.*` still carries a
 * legacy `assignee_id` column (null), and clients that spread a task object
 * into the PUT body would otherwise wipe every assignee. Assignees are only
 * changed when `assignee_ids` (array) is sent, or `assignee_id` has a value.
 */
function hasAssigneePayload(body) {
  return (
    Array.isArray(body.assignee_ids) ||
    (body.assignee_id !== undefined && body.assignee_id !== null)
  );
}

async function recomputeParentDueDate(queryable, parentId) {
  const { rows } = await queryable.query(
    `SELECT MAX(due_date) AS max_due
     FROM tasks
     WHERE parent_task_id = $1
       AND due_date IS NOT NULL`,
    [parentId],
  );

  await queryable.query(
    `UPDATE tasks
     SET due_date = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [rows[0]?.max_due || null, parentId],
  );
}

async function recomputeParentStage(queryable, parentId, actorId = null) {
  const { rows: siblings } = await queryable.query(
    `SELECT stage
     FROM tasks
     WHERE parent_task_id = $1`,
    [parentId],
  );

  const { rows: parentRows } = await queryable.query(
    `SELECT stage
     FROM tasks
     WHERE id = $1`,
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
      `UPDATE tasks
       SET stage = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [nextStage, parentId],
    );

    await queryable.query(
      `INSERT INTO task_activity(
         task_id,
         actor_id,
         action,
         meta
       )
       VALUES($1,$2,$3,$4)`,
      [
        parentId,
        actorId,
        "Stage changed",
        JSON.stringify({
          from: currentStage,
          to: nextStage,
        }),
      ],
    );
  }
}

// Returns { rows, total }: rows are capped at LIST_SAFETY_LIMIT, total is
// the real number of tasks in the project.
async function getTasksByProject(projectId) {
  const { rows } = await db.query(
    `SELECT
       t.*,
       assignee_agg.assignee_name,
       assignee_agg.assignees,
       c.name AS cluster_name,
       COUNT(*) OVER() AS ${TOTAL_COLUMN}
     FROM tasks t
     LEFT JOIN clusters c
       ON t.cluster_id = c.id
     ${ASSIGNEE_JOIN}
     WHERE t.project_id = $1
     ORDER BY
       t.sort_order ASC NULLS LAST,
       t.created_at DESC
     LIMIT $2`,
    [projectId, LIST_SAFETY_LIMIT],
  );

  return splitTotal(rows);
}

async function reorderTasks(stage, orderedIds, user) {
  if (!stage || !Array.isArray(orderedIds) || !orderedIds.length) {
    const err = new Error("stage and ordered_ids array required");
    err.status = 400;
    throw err;
  }

  if (user.role === "member" && MANAGER_STAGES.includes(stage)) {
    const err = new Error("Manager approval required for this stage");
    err.status = 403;
    throw err;
  }

  const { rows: taskProjects } = await db.query(
    `SELECT DISTINCT project_id
     FROM tasks
     WHERE id = ANY($1)`,
    [orderedIds],
  );

  if (taskProjects.length !== 1) {
    const err = new Error("Tasks must belong to one project");
    err.status = 403;
    throw err;
  }

  await assertProjectAccess(user, taskProjects[0].project_id);

  // Tasks whose stage changed, for the live event sent after the commit.
  const movedTasks = [];

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    for (let i = 0; i < orderedIds.length; i++) {
      const taskId = orderedIds[i];

      const { rows: prevRows } = await client.query(
        `SELECT
           stage,
           title,
           parent_task_id,
           project_id
         FROM tasks
         WHERE id = $1`,
        [taskId],
      );

      const prevStage = prevRows[0]?.stage;
      const parentTaskId = prevRows[0]?.parent_task_id;
      const projectId = prevRows[0]?.project_id;

      await client.query(
        `UPDATE tasks
         SET
           stage = $1,
           sort_order = $2,
           updated_at = NOW()
         WHERE id = $3`,
        [stage, i, taskId],
      );

      if (prevStage && prevStage !== stage) {
        movedTasks.push({
          id: taskId,
          project_id: projectId,
          parent_task_id: parentTaskId,
        });

        await client.query(
          `INSERT INTO task_activity(
             task_id,
             actor_id,
             action,
             meta
           )
           VALUES($1,$2,$3,$4)`,
          [
            taskId,
            user.id,
            "Stage changed",
            JSON.stringify({
              from: prevStage,
              to: stage,
            }),
          ],
        );

        if (parentTaskId) {
          await recomputeParentStage(client, parentTaskId, user.id);
        }

        /*
         * MEMBER -> IN REVIEW
         * Notify all active managers.
         */
        if (
          user.role === "member" &&
          prevStage !== "In Review" &&
          stage === "In Review"
        ) {
          const { rows: managers } = await client.query(
            `SELECT id
             FROM members
             WHERE role = 'manager'
               AND active = true`,
          );

          managers.forEach((manager) => {
            createNotification(
              manager.id,
              "🔍 Task Ready for Review",
              `A member submitted "${prevRows[0]?.title}" for review.`,
              {
                type: "task_in_review",
                entityId: taskId,
                entityType: "task",
                eventKey: `task-in-review:${taskId}:${Date.now()}`,
                url: `/projects/${projectId}/tasks/${taskId}`,
              },
            ).catch((error) => {
              console.error(
                "Failed to create task review notification:",
                error,
              );
            });
          });
        }
      }
    }

    await client.query("COMMIT");

    // Live update, after the commit. Order-only changes send one event for
    // the project.
    if (movedTasks.length > 0) {
      movedTasks.forEach((moved) => liveEvents.taskChanged("task.updated", moved));
    } else {
      liveEvents.taskChanged("task.updated", {
        id: orderedIds[0],
        project_id: taskProjects[0].project_id,
        parent_task_id: null,
      });
    }

    return {
      success: true,
    };
  } catch (e) {
    await client.query("ROLLBACK");

    if (!e.status) {
      e.status = 400;
    }

    throw e;
  } finally {
    client.release();
  }
}

async function getTaskById(taskId) {
  // The four reads are independent, so run them together instead of
  // one after another.
  const [taskResult, comments, activity, subtasks] = await Promise.all([
    db.query(
    `SELECT
       t.*,
       assignee_agg.assignee_name,
       assignee_agg.assignees,
       p.name AS project_name,
       p.custom_stages AS project_stages,
       p.milanote_url AS project_milanote_url,
       p.docs_url AS project_docs_url
     FROM tasks t
     LEFT JOIN projects p
       ON p.id = t.project_id
     ${ASSIGNEE_JOIN}
     WHERE t.id = $1`,
    [taskId],
  ),

  db.query(
    `SELECT
       tc.*,
       m.name AS author_name
     FROM task_comments tc
     JOIN members m
       ON tc.author_id = m.id
     WHERE tc.task_id = $1
     ORDER BY tc.created_at`,
    [taskId],
  ),

  db.query(
    `SELECT
       ta.*,
       m.name AS actor_name,
       'own' AS source
     FROM task_activity ta
     LEFT JOIN members m
       ON ta.actor_id = m.id
     WHERE ta.task_id = $1

     UNION ALL

     SELECT
       ta.*,
       m.name AS actor_name,
       'subtask' AS source
     FROM task_activity ta
     LEFT JOIN members m
       ON ta.actor_id = m.id
     WHERE ta.task_id IN (
       SELECT id
       FROM tasks
       WHERE parent_task_id = $1
     )

     ORDER BY created_at DESC
     LIMIT 30`,
    [taskId],
  ),

  db.query(
    `SELECT
       t.*,
       assignee_agg.assignee_name,
       assignee_agg.assignees
     FROM tasks t
     ${ASSIGNEE_JOIN}
     WHERE t.parent_task_id = $1
     ORDER BY t.created_at`,
    [taskId],
  ),
  ]);

  const task = taskResult.rows[0];

  if (!task) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }

  return {
    ...task,
    comments: comments.rows,
    activity: activity.rows,
    subtasks: subtasks.rows,
  };
}

async function createTask(data, user) {
  await assertProjectAccess(user, data.project_id);

  if (user.role === "member" && !data.parent_task_id) {
    const err = new Error("Only managers can create main tasks");
    err.status = 403;
    throw err;
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
  } = data;

  const assigneeIds = extractAssigneeIds(data);

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO tasks(
         project_id,
         cluster_id,
         parent_task_id,
         title,
         description,
         priority,
         stage,
         due_date,
         created_by
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        project_id,
        cluster_id || null,
        parent_task_id || null,
        title,
        description,
        priority || "medium",
        stage || "Todo",
        due_date || null,
        user.id,
      ],
    );

    const task = rows[0];

    for (const mid of assigneeIds) {
      await client.query(
        `INSERT INTO task_assignees(
           task_id,
           member_id
         )
         VALUES($1,$2)
         ON CONFLICT DO NOTHING`,
        [task.id, mid],
      );
    }

    const actionLabel = parent_task_id
      ? "[Sub Task] Created sub task"
      : "Created task";

    await client.query(
      `INSERT INTO task_activity(
         task_id,
         actor_id,
         action
       )
       VALUES($1,$2,$3)`,
      [task.id, user.id, actionLabel],
    );

    if (parent_task_id) {
      await recomputeParentStage(client, parent_task_id, user.id);
      await recomputeParentDueDate(client, parent_task_id);
    }

    await client.query("COMMIT");

    assigneeIds.forEach((mid) => {
      createNotification(
        mid,
        parent_task_id ? "📌 New Subtask Assigned" : "📌 New Task Assigned",
        `You have been assigned: ${title}`,
        {
          type: parent_task_id ? "subtask_assigned" : "task_assigned",
          entityId: task.id,
          entityType: "task",
          eventKey: `task-assigned:${task.id}:${mid}:${task.created_at}`,
          url: `/projects/${task.project_id}/tasks/${task.id}`,
        },
      ).catch(() => {});
    });

    // Live update, after the commit.
    liveEvents.taskChanged("task.created", task);

    return task;
  } catch (e) {
    await client.query("ROLLBACK");

    if (!e.status) {
      e.status = 400;
    }

    throw e;
  } finally {
    client.release();
  }
}

async function updateTask(taskId, data, user) {
  const { title, description, priority, stage, due_date, cluster_id } = data;

  const assigneeIdsProvided = hasAssigneePayload(data);
  const assigneeIds = extractAssigneeIds(data);

  const task = await db.query("SELECT * FROM tasks WHERE id=$1", [taskId]);

  if (!task.rows[0]) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }

  const existing = task.rows[0];
  const isSubTask = Boolean(existing.parent_task_id);

  const { rows: previousAssignees } = assigneeIdsProvided
    ? await db.query(
        `SELECT member_id
         FROM task_assignees
         WHERE task_id=$1`,
        [taskId],
      )
    : { rows: [] };

  const previousAssigneeIds = new Set(
    previousAssignees.map((row) => String(row.member_id)),
  );

  /*
   * ==========================================
   * MEMBER UPDATE
   * ==========================================
   */
  if (user.role === "member") {
    if (MANAGER_STAGES.includes(stage)) {
      const err = new Error("Manager approval required for this stage");
      err.status = 403;
      throw err;
    }

    if (existing.stage === "Done") {
      const err = new Error(
        "Only a manager can change a task that is marked Done",
      );
      err.status = 403;
      throw err;
    }

    if (existing.stage === stage && !data.time_taken) {
      return existing;
    }

    const isRework = stage === "Rework";
    const actualStage = isRework ? "Todo" : stage;

    // Adds this round's time to what is already logged (see nextTimeTaken).
    const time_taken = nextTimeTaken(existing.time_taken, data.time_taken);

    /*
     * Detect actual transition to In Review.
     */
    const movedToInReview =
      existing.stage !== "In Review" && actualStage === "In Review";

    // Members can't change due dates: data.new_due_date is ignored here
    // (only the manager review flow sets a new deadline).
    const { rows } = await db.query(
      `UPDATE tasks
       SET
         stage=$1,
         updated_at=NOW(),
         time_taken=$2,
         rework_count=rework_count+$3
       WHERE id=$4
       RETURNING *`,
      [
        actualStage,
        time_taken,
        isRework ? 1 : 0,
        taskId,
      ],
    );

    await db.query(
      `INSERT INTO task_activity(
         task_id,
         actor_id,
         action,
         meta
       )
       VALUES($1,$2,$3,$4)`,
      [
        taskId,
        user.id,
        isSubTask ? "[Sub Task] Stage changed" : "Stage changed",
        JSON.stringify({
          from: existing.stage,
          to: stage,
        }),
      ],
    );

    if (existing.parent_task_id) {
      await recomputeParentStage(db, existing.parent_task_id, user.id);
      await recomputeParentDueDate(db, existing.parent_task_id);
    }

    /*
     * MEMBER -> IN REVIEW
     */
    if (movedToInReview) {
      const { rows: managers } = await db.query(
        `SELECT id
         FROM members
         WHERE role = 'manager'
           AND active = true`,
      );

      managers.forEach((manager) => {
        createNotification(
          manager.id,
          "🔍 Task Ready for Review",
          `A member submitted "${rows[0].title}" for review.`,
          {
            type: "task_in_review",
            entityId: rows[0].id,
            entityType: "task",
            eventKey: `task-in-review:${rows[0].id}:${rows[0].updated_at}`,
            url: `/projects/${rows[0].project_id}/tasks/${rows[0].id}`,
          },
        ).catch((error) => {
          console.error("Failed to create task review notification:", error);
        });
      });
    }

    // Live update, after every write above has been saved.
    liveEvents.taskChanged("task.updated", rows[0]);

    return rows[0];
  }

  /*
   * ==========================================
   * MANAGER UPDATE
   * ==========================================
   *
   * PARTIAL UPDATES ARE SUPPORTED: any field missing from the body keeps its
   * current value. A stage-only review (`{ stage, new_due_date }`) therefore
   * no longer wipes title / priority / due date / cluster / assignees.
   */

  const requestedStage = stage === undefined ? existing.stage : stage;

  const isRework = requestedStage === "Rework";

  /*
   * Rework is stored internally as Todo,
   * but notification is based on requested stage.
   */
  const actualStage = isRework ? "Todo" : requestedStage;

  // Adds this round's time to what is already logged. A rework keeps the
  // time from earlier rounds (see nextTimeTaken).
  const time_taken = nextTimeTaken(existing.time_taken, data.time_taken);

  const { rows: existingSubtasks } = await db.query(
    `SELECT 1
     FROM tasks
     WHERE parent_task_id = $1
     LIMIT 1`,
    [taskId],
  );

  const taskHasSubtasks = existingSubtasks.length > 0;

  const newTitle = title ?? existing.title;
  const newDescription =
    description === undefined ? existing.description : description;
  const newPriority = priority ?? existing.priority;
  const newClusterId =
    cluster_id === undefined ? existing.cluster_id : cluster_id || null;

  // Missing, or sent back exactly as the API returned it: keep the stored
  // value (see utils/dateInput.js).
  const keepDueDate = keepStoredDate(due_date, existing.due_date);

  const finalDueDate = isRework
    ? data.new_due_date ||
      (keepDueDate ? existing.due_date : due_date) ||
      null
    : taskHasSubtasks || keepDueDate
      ? existing.due_date
      : due_date || null;

  /*
   * Capture old due date (calendar day) before UPDATE.
   */
  const previousDueDate = dueDay(existing.due_date);

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE tasks
       SET
         title=$1,
         description=$2,
         priority=$3,
         stage=$4,
         due_date=$5,
         cluster_id=$6,
         updated_at=NOW(),
         time_taken=$7,
         rework_count=rework_count+$8
       WHERE id=$9
       RETURNING *`,
      [
        newTitle,
        newDescription,
        newPriority,
        actualStage,
        finalDueDate,
        newClusterId,
        time_taken,
        isRework ? 1 : 0,
        taskId,
      ],
    );

    /*
     * Update assignees — only when explicitly provided.
     */
    if (assigneeIdsProvided) {
      await client.query(
        `DELETE FROM task_assignees
         WHERE task_id=$1`,
        [taskId],
      );

      for (const mid of assigneeIds) {
        await client.query(
          `INSERT INTO task_assignees(
             task_id,
             member_id
           )
           VALUES($1,$2)
           ON CONFLICT DO NOTHING`,
          [taskId, mid],
        );
      }
    }

    /*
     * Who is assigned NOW (from the DB, not from the request body).
     * Done / Rework / due date notifications go to these people.
     */
    const { rows: currentAssignees } = await client.query(
      `SELECT member_id
       FROM task_assignees
       WHERE task_id=$1`,
      [taskId],
    );

    const currentAssigneeIds = currentAssignees.map((r) => r.member_id);

    /*
     * Stage activity.
     */
    if (existing.stage !== requestedStage) {
      await client.query(
        `INSERT INTO task_activity(
           task_id,
           actor_id,
           action,
           meta
         )
         VALUES($1,$2,$3,$4)`,
        [
          taskId,
          user.id,
          isSubTask ? "[Sub Task] Stage changed" : "Stage changed",
          JSON.stringify({
            from: existing.stage,
            to: requestedStage,
          }),
        ],
      );
    }

    if (existing.parent_task_id) {
      await recomputeParentStage(client, existing.parent_task_id, user.id);
      await recomputeParentDueDate(client, existing.parent_task_id);
    }

    /*
     * Commit database changes first.
     */
    await client.query("COMMIT");

    /*
     * ==========================================
     * MANAGER -> DONE / REWORK
     * ==========================================
     */
    if (
      existing.stage !== requestedStage &&
      (requestedStage === "Done" || requestedStage === "Rework")
    ) {
      const notificationTitle =
        requestedStage === "Done"
          ? "✅ Task Completed"
          : "🔄 Task Sent for Rework";

      const notificationBody =
        requestedStage === "Done"
          ? `"${rows[0].title}" has been marked as Done.`
          : `"${rows[0].title}" has been sent back for rework.`;

      const notificationType =
        requestedStage === "Done" ? "task_done" : "task_rework";

      currentAssigneeIds.forEach((memberId) => {
        createNotification(memberId, notificationTitle, notificationBody, {
          type: notificationType,
          entityId: rows[0].id,
          entityType: "task",
          eventKey: `${notificationType}:${rows[0].id}:${memberId}:${rows[0].updated_at}`,
          url: `/projects/${rows[0].project_id}/tasks/${rows[0].id}`,
        }).catch((error) => {
          console.error(
            `Failed to create ${notificationType} notification:`,
            error,
          );
        });
      });
    }

    /*
     * ==========================================
     * MANAGER -> DUE DATE UPDATED
     * ==========================================
     */
    // Only a different calendar day counts as a change (not a different time
    // of day on the same date).
    const newDueDate = dueDay(rows[0].due_date);

    const dueDateChanged = previousDueDate !== newDueDate;

    if (dueDateChanged && currentAssigneeIds.length > 0) {
      const dueDateMessage = rows[0].due_date
        ? `"${rows[0].title}" due date has been updated.`
        : `"${rows[0].title}" due date has been removed.`;

      currentAssigneeIds.forEach((memberId) => {
        createNotification(memberId, "📅 Due Date Updated", dueDateMessage, {
          type: "task_due_date_updated",
          entityId: rows[0].id,
          entityType: "task",
          eventKey: `task-due-date:${rows[0].id}:${memberId}:${rows[0].updated_at}`,
          url: `/projects/${rows[0].project_id}/tasks/${rows[0].id}`,
        }).catch((error) => {
          console.error("Failed to create due date notification:", error);
        });
      });
    }

    /*
     * ==========================================
     * ASSIGNEE ADD / REMOVE NOTIFICATIONS
     * ==========================================
     */
    if (assigneeIdsProvided) {
      const nextAssigneeIds = new Set(assigneeIds.map((id) => String(id)));

      const added = assigneeIds.filter(
        (id) => !previousAssigneeIds.has(String(id)),
      );

      const removed = [...previousAssigneeIds].filter(
        (id) => !nextAssigneeIds.has(id),
      );

      added.forEach((memberId) => {
        createNotification(
          memberId,
          isSubTask ? "📌 Subtask Assigned" : "📌 Task Assigned",
          `You have been assigned: ${rows[0].title}`,
          {
            type: isSubTask ? "subtask_assigned" : "task_assigned",
            entityId: rows[0].id,
            entityType: "task",
            eventKey: `task-assigned:${rows[0].id}:${memberId}:${rows[0].updated_at}`,
            url: `/projects/${rows[0].project_id}/tasks/${rows[0].id}`,
          },
        ).catch(() => {});
      });

      removed.forEach((memberId) => {
        createNotification(
          memberId,
          isSubTask ? "Subtask Unassigned" : "Task Unassigned",
          `You are no longer assigned to: ${rows[0].title}`,
          {
            type: isSubTask ? "subtask_unassigned" : "task_unassigned",
            entityId: rows[0].id,
            entityType: "task",
            eventKey: `task-unassigned:${rows[0].id}:${memberId}:${rows[0].updated_at}`,
            url: `/projects/${rows[0].project_id}/tasks/${rows[0].id}`,
          },
        ).catch(() => {});
      });
    }

    // Live update, after the commit. Previous assignees are included so a
    // member who was just removed sees the task leave their list.
    liveEvents.taskChanged("task.updated", rows[0], [...previousAssigneeIds]);

    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");

    if (!e.status) {
      e.status = 400;
    }

    throw e;
  } finally {
    client.release();
  }
}

async function deleteTask(taskId, user) {
  const { rows: taskRows } = await db.query(
    "SELECT * FROM tasks WHERE id=$1",
    [taskId],
  );

  if (!taskRows[0]) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }

  /*
   * A task can only be deleted once all of its sub tasks are gone.
   * (tasks.parent_task_id is ON DELETE CASCADE, so without this check
   * deleting a main task would silently wipe all of its sub tasks.)
   */
  const { rows: subtaskRows } = await db.query(
    "SELECT COUNT(*)::int AS count FROM tasks WHERE parent_task_id=$1",
    [taskId],
  );

  if (subtaskRows[0].count > 0) {
    const err = new Error(
      "This task still has sub tasks. Delete all of its sub tasks first.",
    );
    err.status = 409;
    throw err;
  }

  const parentId = taskRows[0].parent_task_id || null;

  // Who is on the task right now. Read before the delete, because the
  // assignee rows are removed together with the task.
  const liveAudience = await liveEvents.taskAudience(taskId);

  // Notifications point at the task by id (related_entity_type /
  // related_entity_id, a text column), so remove them with the task —
  // otherwise the bell keeps links to a task that no longer exists. Sub
  // tasks are already gone (checked above) and each one cleaned up its own
  // notifications when it was deleted.
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM notifications
       WHERE related_entity_type = 'task'
         AND related_entity_id = $1`,
      [String(taskId)],
    );
    await client.query("DELETE FROM tasks WHERE id=$1", [taskId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  if (parentId) {
    await recomputeParentStage(db, parentId, user.id);
    await recomputeParentDueDate(db, parentId);
  }

  // Live update, after the delete is committed.
  liveEvents.taskChanged("task.deleted", taskRows[0], liveAudience);

  return {
    success: true,
  };
}

async function createComment(taskId, userId, content) {
  const { rows } = await db.query(
    `INSERT INTO task_comments(
       task_id,
       author_id,
       content
     )
     VALUES($1,$2,$3)
     RETURNING *,
       (
         SELECT name
         FROM members
         WHERE id=$2
       ) AS author_name`,
    [taskId, userId, content],
  );

  // Live update, after the comment is saved.
  liveEvents.taskChanged("comment.created", { id: taskId });

  return rows[0];
}

async function getInReviewTasks() {
  const { rows } = await db.query(
    `SELECT
       t.id,
       t.title,
       t.stage,
       t.time_taken,
       t.rework_count,
       t.updated_at,
       t.parent_task_id,
       pt.title AS parent_task_title,
       p.id AS project_id,
       p.name AS project_name,
       assignee_agg.assignee_name
     FROM tasks t
     LEFT JOIN tasks pt
       ON t.parent_task_id = pt.id
     INNER JOIN projects p
       ON t.project_id = p.id
     ${ASSIGNEE_JOIN}
     WHERE t.stage = 'In Review'
     ORDER BY t.updated_at DESC
     LIMIT 100`,
  );

  return rows;
}

module.exports = {
  getTasksByProject,
  reorderTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  createComment,
  getInReviewTasks,
};