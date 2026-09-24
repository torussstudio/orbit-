const db = require("../db");
const { assertProjectAccess } = require("./accessControl");
const { createNotification } = require("../utils/pushNotify");

// Stages a member can never set. "Done" needs manager approval, and
// "Rework" is the manager's review decision (send back for rework).
const MANAGER_STAGES = ["Done", "Rework"];

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
  return body.assignee_id ? [body.assignee_id] : [];
}

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

async function getTasksByProject(projectId) {
  const { rows } = await db.query(
    `SELECT t.*, assignee_agg.assignee_name, assignee_agg.assignees, c.name as cluster_name FROM tasks t
     LEFT JOIN clusters c ON t.cluster_id=c.id
     ${ASSIGNEE_JOIN}
     WHERE t.project_id=$1
     ORDER BY t.sort_order ASC NULLS LAST, t.created_at DESC`,
    [projectId],
  );
  return rows;
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
    "SELECT DISTINCT project_id FROM tasks WHERE id = ANY($1)",
    [orderedIds],
  );
  if (taskProjects.length !== 1) {
    const err = new Error("Tasks must belong to one project");
    err.status = 403;
    throw err;
  }
  await assertProjectAccess(user, taskProjects[0].project_id);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (let i = 0; i < orderedIds.length; i++) {
      const taskId = orderedIds[i];
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

      if (prevStage && prevStage !== stage) {
        await client.query(
          `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
          [
            taskId,
            user.id,
            "Stage changed",
            JSON.stringify({ from: prevStage, to: stage }),
          ],
        );

        if (parentTaskId) {
          await recomputeParentStage(client, parentTaskId, user.id);
        }
      }
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (e) {
    await client.query("ROLLBACK");
    if (!e.status) e.status = 400;
    throw e;
  } finally {
    client.release();
  }
}

async function getTaskById(taskId) {
  const { rows } = await db.query(
    `SELECT t.*, assignee_agg.assignee_name, assignee_agg.assignees FROM tasks t ${ASSIGNEE_JOIN} WHERE t.id=$1`,
    [taskId],
  );
  if (!rows[0]) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  const comments = await db.query(
    `SELECT tc.*, m.name as author_name FROM task_comments tc
     JOIN members m ON tc.author_id=m.id WHERE tc.task_id=$1 ORDER BY tc.created_at`,
    [taskId],
  );
  const activity = await db.query(
    `SELECT ta.*, m.name as actor_name, 'own' as source FROM task_activity ta
     LEFT JOIN members m ON ta.actor_id=m.id WHERE ta.task_id=$1
     UNION ALL
     SELECT ta.*, m.name as actor_name, 'subtask' as source FROM task_activity ta
     LEFT JOIN members m ON ta.actor_id=m.id
     WHERE ta.task_id IN (SELECT id FROM tasks WHERE parent_task_id=$1)
     ORDER BY created_at DESC LIMIT 30`,
    [taskId],
  );
  const subtasks = await db.query(
    `SELECT t.*, assignee_agg.assignee_name, assignee_agg.assignees FROM tasks t ${ASSIGNEE_JOIN} WHERE t.parent_task_id=$1 ORDER BY t.created_at`,
    [taskId],
  );
  return {
    ...rows[0],
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
        user.id,
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
        "📌 New Task Assigned",
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

    return task;
  } catch (e) {
    await client.query("ROLLBACK");
    if (!e.status) e.status = 400;
    throw e;
  } finally {
    client.release();
  }
}

async function updateTask(taskId, data, user) {
  const { title, description, priority, stage, due_date, cluster_id } = data;
  const assigneeIdsProvided = Array.isArray(data.assignee_ids) || data.assignee_id !== undefined;
  const assigneeIds = extractAssigneeIds(data);

  const task = await db.query("SELECT * FROM tasks WHERE id=$1", [taskId]);
  if (!task.rows[0]) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }

  const isSubTask = Boolean(task.rows[0].parent_task_id);
  const { rows: previousAssignees } = assigneeIdsProvided
    ? await db.query("SELECT member_id FROM task_assignees WHERE task_id=$1", [taskId])
    : { rows: [] };
  const previousAssigneeIds = new Set(previousAssignees.map((row) => String(row.member_id)));

  if (user.role === "member") {
    if (MANAGER_STAGES.includes(stage)) {
      const err = new Error("Manager approval required for this stage");
      err.status = 403;
      throw err;
    }
    // Once a manager has approved a task as Done, members can't reopen it.
    if (task.rows[0].stage === "Done") {
      const err = new Error("Only a manager can change a task that is marked Done");
      err.status = 403;
      throw err;
    }
    if (task.rows[0].stage === stage && !data.time_taken) {
      return task.rows[0];
    }
    const isRework = stage === "Rework";
    const actualStage = isRework ? "Todo" : stage;
    const incomingTime =
      data.time_taken && data.time_taken !== task.rows[0].time_taken
        ? parseInt(data.time_taken)
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
        data.new_due_date || null,
        taskId,
      ],
    );
    await db.query(
      `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
      [
        taskId,
        user.id,
        isSubTask ? "[Sub Task] Stage changed" : "Stage changed",
        JSON.stringify({ from: task.rows[0].stage, to: stage }),
      ],
    );

    if (task.rows[0].parent_task_id) {
      await recomputeParentStage(db, task.rows[0].parent_task_id, user.id);
      await recomputeParentDueDate(db, task.rows[0].parent_task_id);
    }

    return rows[0];
  }

  const isRework = stage === "Rework";
  const actualStage = isRework ? "Todo" : stage;
  const incomingTime =
    data.time_taken && data.time_taken !== task.rows[0].time_taken
      ? parseInt(data.time_taken)
      : 0;
  const existingTime = task.rows[0].time_taken || 0;
  const time_taken = isRework
    ? null
    : incomingTime > 0
      ? existingTime + incomingTime
      : existingTime > 0
        ? existingTime
        : null;

  const { rows: existingSubtasks } = await db.query(
    `SELECT 1 FROM tasks WHERE parent_task_id = $1 LIMIT 1`,
    [taskId],
  );
  const taskHasSubtasks = existingSubtasks.length > 0;

  const finalDueDate = isRework
    ? data.new_due_date || due_date || null
    : taskHasSubtasks
      ? task.rows[0].due_date
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
        taskId,
      ],
    );

    if (assigneeIdsProvided) {
      await client.query("DELETE FROM task_assignees WHERE task_id=$1", [
        taskId,
      ]);
      for (const mid of assigneeIds) {
        await client.query(
          "INSERT INTO task_assignees(task_id, member_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [taskId, mid],
        );
      }
    }

    if (task.rows[0].stage !== stage) {
      await client.query(
        `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
        [
          taskId,
          user.id,
          isSubTask ? "[Sub Task] Stage changed" : "Stage changed",
          JSON.stringify({ from: task.rows[0].stage, to: stage }),
        ],
      );
    }

    if (task.rows[0].parent_task_id) {
      await recomputeParentStage(client, task.rows[0].parent_task_id, user.id);
      await recomputeParentDueDate(client, task.rows[0].parent_task_id);
    }

    await client.query("COMMIT");

    if (assigneeIdsProvided) {
      const nextAssigneeIds = new Set(assigneeIds.map((id) => String(id)));
      const added = assigneeIds.filter((id) => !previousAssigneeIds.has(String(id)));
      const removed = [...previousAssigneeIds].filter((id) => !nextAssigneeIds.has(id));

      added.forEach((memberId) => {
        createNotification(
          memberId,
          isSubTask ? "Subtask Assigned" : "Task Assigned",
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

    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    if (!e.status) e.status = 400;
    throw e;
  } finally {
    client.release();
  }
}

async function deleteTask(taskId, user) {
  const { rows: taskRows } = await db.query("SELECT * FROM tasks WHERE id=$1", [
    taskId,
  ]);
  const parentId = taskRows[0]?.parent_task_id || null;

  await db.query("DELETE FROM tasks WHERE id=$1", [taskId]);

  if (parentId) {
    await recomputeParentStage(db, parentId, user.id);
    await recomputeParentDueDate(db, parentId);
  }

  return { success: true };
}

async function createComment(taskId, userId, content) {
  const { rows } = await db.query(
    `INSERT INTO task_comments(task_id,author_id,content) VALUES($1,$2,$3)
     RETURNING *, (SELECT name FROM members WHERE id=$2) as author_name`,
    [taskId, userId, content],
  );
  return rows[0];
}

async function getInReviewTasks() {
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