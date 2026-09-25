const db = require("../db");

async function userHasProjectAccess(user, projectId) {
  if (!user?.id || !projectId) return false;

  if (user.role === "manager") {
    return true;
  }

  const { rows } = await db.query(
    `
    SELECT 1
    FROM project_members
    WHERE project_id = $1
      AND member_id = $2
    LIMIT 1
    `,
    [projectId, user.id],
  );

  return Boolean(rows[0]);
}

async function assertProjectAccess(user, projectId) {
  const allowed = await userHasProjectAccess(user, projectId);

  if (!allowed) {
    const err = new Error("Forbidden");
    err.status = 403;
    err.expose = true;
    throw err;
  }
}

/**
 * Task-level access
 *
 * Manager -> allowed
 * Member  -> must be assigned to the task
 */
async function userHasTaskAccess(user, taskId) {
  if (!user?.id || !taskId) {
    return false;
  }

  if (user.role === "manager") {
    return true;
  }

  const { rows } = await db.query(
    `
    SELECT 1
    FROM task_assignees
    WHERE task_id = $1
      AND member_id = $2
    LIMIT 1
    `,
    [taskId, user.id],
  );

  return Boolean(rows[0]);
}

async function assertTaskAccess(user, taskId) {
  const allowed = await userHasTaskAccess(user, taskId);

  if (!allowed) {
    const err = new Error("Forbidden");
    err.status = 403;
    err.expose = true;
    throw err;
  }
}

async function getTaskProjectId(taskId) {
  const { rows } = await db.query(
    `
    SELECT project_id
    FROM tasks
    WHERE id = $1
    LIMIT 1
    `,
    [taskId],
  );

  return rows[0]?.project_id || null;
}

async function getClusterProjectId(clusterId) {
  const { rows } = await db.query(
    `
    SELECT project_id
    FROM clusters
    WHERE id = $1
    LIMIT 1
    `,
    [clusterId],
  );

  return rows[0]?.project_id || null;
}

module.exports = {
  userHasProjectAccess,
  assertProjectAccess,

  userHasTaskAccess,
  assertTaskAccess,

  getTaskProjectId,
  getClusterProjectId,
};