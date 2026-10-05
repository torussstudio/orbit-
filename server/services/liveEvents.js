/*
 * Works out WHO should hear about a change and hands it to the event bus.
 *
 * Call these only AFTER the database change is committed. They return
 * straight away (the recipient lookup runs in the background) and can never
 * throw or reject, so they cannot fail or slow down the request.
 *
 * When LIVE_EVENTS_ENABLED is off, or nobody is connected, no query runs.
 */

const db = require("../db");
const eventBus = require("./eventBus");
const authCache = require("./authCache");

function shouldSkip() {
  return !eventBus.isEnabled() || !eventBus.hasConnections();
}

// Assignees of the task and of its sub tasks, the task creator, and every
// active manager.
async function taskRecipients(taskId) {
  const { rows } = await db.query(
    `SELECT member_id AS id
       FROM task_assignees
      WHERE task_id = $1
     UNION
     SELECT ta.member_id
       FROM task_assignees ta
       JOIN tasks s ON s.id = ta.task_id
      WHERE s.parent_task_id = $1
     UNION
     SELECT created_by
       FROM tasks
      WHERE id = $1
        AND created_by IS NOT NULL
     UNION
     SELECT id
       FROM members
      WHERE role = 'manager'
        AND active = true`,
    [taskId],
  );

  return rows.map((row) => row.id);
}

async function sendTaskEvent(type, task, extraUserIds) {
  let { project_id: projectId, parent_task_id: parentId } = task;

  // Callers that only know the task id (comments).
  if (projectId === undefined) {
    const { rows } = await db.query(
      `SELECT project_id, parent_task_id
         FROM tasks
        WHERE id = $1`,
      [task.id],
    );
    projectId = rows[0]?.project_id ?? null;
    parentId = rows[0]?.parent_task_id ?? null;
  }

  const at = new Date().toISOString();
  const recipients = await taskRecipients(task.id);

  eventBus.publish([...recipients, ...extraUserIds], {
    type,
    taskId: task.id,
    projectId,
    at,
  });

  // A sub task change also changes what its main task shows (sub task list,
  // derived stage and due date), so people on the main task hear about it.
  if (parentId) {
    const parentRecipients = await taskRecipients(parentId);

    eventBus.publish([...parentRecipients, ...extraUserIds], {
      type: "task.updated",
      taskId: parentId,
      projectId,
      at,
    });
  }
}

/*
 * type: "task.created" | "task.updated" | "task.deleted" | "comment.created"
 * task: { id, project_id, parent_task_id } (only id is required)
 * extraUserIds: people who must hear about it but are no longer linked to the
 *   task in the database (removed assignees, assignees of a deleted task).
 */
function taskChanged(type, task, extraUserIds = []) {
  try {
    if (shouldSkip() || !task || task.id === undefined || task.id === null) {
      return;
    }

    sendTaskEvent(type, task, extraUserIds || []).catch((err) => {
      console.error("[liveEvents] task event failed:", err?.message);
    });
  } catch (err) {
    console.error("[liveEvents] task event failed:", err?.message);
  }
}

/*
 * Everyone linked to a task right now. Call it BEFORE deleting a task (the
 * assignee rows are deleted with it) and pass the result to taskChanged().
 * Returns [] when the feature is off or the lookup fails. Never throws.
 */
async function taskAudience(taskId) {
  try {
    if (shouldSkip()) return [];
    return await taskRecipients(taskId);
  } catch (err) {
    console.error("[liveEvents] audience lookup failed:", err?.message);
    return [];
  }
}

async function sendProjectEvent(type, projectId, extraUserIds) {
  const { rows } = await db.query(
    `SELECT member_id AS id
       FROM project_members
      WHERE project_id = $1
     UNION
     SELECT id
       FROM members
      WHERE role = 'manager'
        AND active = true`,
    [projectId],
  );

  eventBus.publish([...rows.map((row) => row.id), ...extraUserIds], {
    type,
    taskId: null,
    projectId,
    at: new Date().toISOString(),
  });
}

/*
 * type: "project.created" | "project.updated" | "project.deleted"
 * Goes to the project's members and every active manager.
 */
function projectChanged(type, projectId, extraUserIds = []) {
  try {
    if (shouldSkip() || projectId === undefined || projectId === null) {
      return;
    }

    sendProjectEvent(type, projectId, extraUserIds || []).catch((err) => {
      console.error("[liveEvents] project event failed:", err?.message);
    });
  } catch (err) {
    console.error("[liveEvents] project event failed:", err?.message);
  }
}

// A new bell notification was saved for this user.
function notificationCreated(userId) {
  try {
    if (shouldSkip()) return;

    eventBus.publish([userId], {
      type: "notification.created",
      taskId: null,
      projectId: null,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[liveEvents] notification event failed:", err?.message);
  }
}

/*
 * The member's access changed (deactivated, deleted, role changed, password
 * changed, logged out everywhere): forget their cached auth lookup, so their
 * next request reads the database again, and end their live streams now.
 * Call it after the database change is committed. Never throws, so it can
 * never fail the request.
 */
function accessChanged(userId, reason) {
  try {
    authCache.clear(userId);
  } catch (err) {
    console.error("[liveEvents] clearing auth cache failed:", err?.message);
  }

  try {
    eventBus.closeUser(userId, reason);
  } catch (err) {
    console.error("[liveEvents] closing streams failed:", err?.message);
  }
}

module.exports = {
  accessChanged,
  taskChanged,
  taskAudience,
  projectChanged,
  notificationCreated,
};
