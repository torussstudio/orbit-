const {
  assertProjectAccess,
  assertTaskAccess,
  getTaskProjectId,
  getClusterProjectId,
} = require("../services/accessControl");

function requireProjectAccess(paramName = "projectId") {
  return async (req, res, next) => {
    try {
      const projectId = req.params[paramName] || req.body?.project_id;
      if (!projectId) {
        return res.status(400).json({ error: "Project id required" });
      }
      await assertProjectAccess(req.user, projectId);
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireTaskProjectAccess() {
  return async (req, res, next) => {
    try {
      const taskId = req.params.id;

      if (!taskId) {
        return res.status(400).json({
          error: "Task id required",
        });
      }

      const projectId = await getTaskProjectId(taskId);

      if (!projectId) {
        return res.status(404).json({
          error: "Not found",
        });
      }

      await assertTaskAccess(req.user, taskId);

      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireClusterProjectAccess() {
  return async (req, res, next) => {
    try {
      const projectId = await getClusterProjectId(req.params.id);
      if (!projectId) {
        return res.status(404).json({ error: "Not found" });
      }
      await assertProjectAccess(req.user, projectId);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  requireProjectAccess,
  requireTaskProjectAccess,
  requireClusterProjectAccess,
};
