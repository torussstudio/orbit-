const taskService = require("../services/taskService");

async function getTasksByProject(req, res, next) {
  try {
    const tasks = await taskService.getTasksByProject(req.params.projectId);
    res.json(tasks);
  } catch (error) {
    next(error);
  }
}

async function reorderTasks(req, res, next) {
  try {
    const { stage, ordered_ids } = req.body;
    const result = await taskService.reorderTasks(stage, ordered_ids, req.user);
    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
}

async function getTaskById(req, res, next) {
  try {
    const taskData = await taskService.getTaskById(req.params.id);
    res.json(taskData);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
}

async function createTask(req, res, next) {
  try {
    const task = await taskService.createTask(req.body, req.user);
    res.status(201).json(task);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    console.log("[TASK UPDATE] ENTERED", {
      taskId: req.params.id,
      userId: req.user?.id,
      role: req.user?.role,
      body: req.body,
    });

    const task = await taskService.updateTask(
      req.params.id,
      req.body,
      req.user
    );

    console.log("[TASK UPDATE] SUCCESS");

    res.json(task);
  } catch (error) {
    console.error("[TASK UPDATE ERROR]", {
      status: error.status,
      message: error.message,
      name: error.name,
      stack: error.stack,
    });

    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
      });
    }

    next(error);
  }
}

async function deleteTask(req, res, next) {
  try {
    const result = await taskService.deleteTask(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function createComment(req, res, next) {
  try {
    const comment = await taskService.createComment(req.params.id, req.user.id, req.body.content);
    res.status(201).json(comment);
  } catch (error) {
    next(error);
  }
}

async function getInReviewTasks(req, res, next) {
  try {
    const tasks = await taskService.getInReviewTasks();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
