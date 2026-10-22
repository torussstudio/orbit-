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

// A time entry was added, edited or deleted. Notify active managers and the
// member who made the change so their Time Log views refresh immediately.
async function sendTimeLogEvent(projectId, memberId) {
  const { rows } = await db.query(
    `SELECT id FROM members WHERE role = 'manager' AND active = true`,
  );
  const recipients = [...rows.map((row) => row.id), memberId].filter((id) => id !== null && id !== undefined);
  eventBus.publish(recipients, {
    type: "timelog.changed",
    taskId: null,
    projectId,
    at: new Date().toISOString(),
  });
}

function timeLogChanged(projectId, memberId) {
  try {
    if (shouldSkip() || projectId === undefined || projectId === null) return;

    sendTimeLogEvent(projectId, memberId).catch((err) => {
      console.error("[liveEvents] time log event failed:", err?.message);
    });
  } catch (err) {
    console.error("[liveEvents] time log event failed:", err?.message);
  }
}

/*
 * Messages (shared inbox). A conversation belongs to one member; every
 * active manager can see it. Both events go to that member and every active
 * manager (the sender's other tabs included). The message text is never
 * sent: clients fetch it through the permission-checked messages API.
 *
 * conversation: { id, member_id }
 */
async function sendMessageEvent(type, conversation) {
  const { rows } = await db.query(
    `SELECT id
       FROM members
      WHERE role = 'manager'
        AND active = true`,
  );

  eventBus.publish([conversation.member_id, ...rows.map((row) => row.id)], {
    type,
    taskId: null,
    projectId: null,
    conversationId: conversation.id,
    at: new Date().toISOString(),
  });
}

function messageEvent(type, conversation) {
  try {
    if (shouldSkip() || !conversation || conversation.id === undefined || conversation.id === null) {
      return;
    }

    sendMessageEvent(type, conversation).catch((err) => {
      console.error("[liveEvents] message event failed:", err?.message);
    });
  } catch (err) {
    console.error("[liveEvents] message event failed:", err?.message);
  }
}

// A new message was saved. Call after the commit.
function messageCreated(conversation) {
  messageEvent("message.created", conversation);
}

// Someone read a conversation that had unread messages ("Seen", badges).
function messageRead(conversation) {
  messageEvent("message.read", conversation);
}

// Direct member chats are visible only to the two participants. The event
// contains no message content; each client fetches through the access-checked API.
function directMessageEvent(type, conversation) {
  try {
    if (shouldSkip() || !conversation || conversation.member_one_id == null || conversation.member_two_id == null) return;
    eventBus.publish([conversation.member_one_id, conversation.member_two_id], {
      type,
      taskId: null,
      projectId: null,
      conversationId: conversation.id,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[liveEvents] direct message event failed:", err?.message);
  }
}

function directMessageCreated(conversation) {
  directMessageEvent("direct.message.created", conversation);
}

function directMessageRead(conversation) {
  directMessageEvent("direct.message.read", conversation);
}

// A message was edited or got a reaction. Clients refetch the thread.
function directMessageUpdated(conversation) {
  directMessageEvent("direct.message.updated", conversation);
}

function messageUpdated(conversation) {
  messageEvent("message.updated", conversation);
}

/*
 * Typing indicators. Only the OTHER side hears it, the event carries the
 * typer's id (no text), and nothing is stored.
 */
function directTyping(conversation, userId) {
  try {
    if (shouldSkip() || !conversation) return;
    const other = String(conversation.member_one_id) === String(userId)
      ? conversation.member_two_id
      : conversation.member_one_id;
    eventBus.publish([other], {
      type: "direct.typing",
      conversationId: conversation.id,
      userId,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[liveEvents] typing event failed:", err?.message);
  }
}

async function sendMessageTyping(conversation, userId) {
  const { rows } = await db.query(
    `SELECT id FROM members WHERE role = 'manager' AND active = true`,
  );
  const recipients = [conversation.member_id, ...rows.map((row) => row.id)]
    .filter((id) => String(id) !== String(userId));
  eventBus.publish(recipients, {
    type: "message.typing",
    conversationId: conversation.id,
    userId,
    at: new Date().toISOString(),
  });
}

function messageTyping(conversation, userId) {
  try {
    if (shouldSkip() || !conversation) return;
    sendMessageTyping(conversation, userId).catch((err) => {
      console.error("[liveEvents] typing event failed:", err?.message);
    });
  } catch (err) {
    console.error("[liveEvents] typing event failed:", err?.message);
  }
}

/*
 * The member's access changed (deactivated, deleted, role changed, password
 * set by a manager, logged out everywhere): forget their cached auth lookup,
 * so their next request reads the database again, and end their live streams
 * now. Call it after the database change is committed. Never throws, so it
 * can never fail the request.
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

/*
 * Some sessions of a member were revoked (signed out from another device,
 * "sign out all other devices"), but the member keeps their access on the
 * session that asked for it. Ends only the live streams opened with the
 * revoked sessions. accessChanged() is not used for this: it closes every
 * stream of the member, the caller's own included.
 * Call it after the database change is committed. Never throws.
 */
function sessionsRevoked(sessionIds, reason) {
  try {
    eventBus.closeSessions(sessionIds, reason);
  } catch (err) {
    console.error("[liveEvents] closing session streams failed:", err?.message);
  }
}

/*
 * The member changed their own password: every OTHER session was revoked and
 * the one that made the change stays signed in. Forget the cached auth
 * lookup and end only the other sessions' streams. Never throws.
 */
function passwordChanged(userId, revokedSessionIds) {
  try {
    authCache.clear(userId);
  } catch (err) {
    console.error("[liveEvents] clearing auth cache failed:", err?.message);
  }

  sessionsRevoked(revokedSessionIds, "password changed");
}

async function sendMemberEvent(memberId) {
  const { rows } = await db.query("SELECT id FROM members WHERE role = 'manager' AND active = true");

  eventBus.publish([...rows.map((row) => row.id), memberId], {
    type: "member.changed",
    taskId: null,
    projectId: null,
    at: new Date().toISOString(),
  });
}

function memberChanged(memberId) {
  try {
    if (shouldSkip() || memberId === undefined || memberId === null) {
      return;
    }

    sendMemberEvent(memberId).catch((err) => {
      console.error("[liveEvents] member event failed:", err?.message);
    });
  } catch (err) {
    console.error("[liveEvents] member event failed:", err?.message);
  }
}
module.exports = {
  memberChanged,
  accessChanged,
  sessionsRevoked,
  passwordChanged,
  taskChanged,
  taskAudience,
  projectChanged,
  notificationCreated,
  timeLogChanged,
  messageCreated,
  messageRead,
  directMessageCreated,
  directMessageRead,
  directMessageUpdated,
  messageUpdated,
  directTyping,
  messageTyping,
};
