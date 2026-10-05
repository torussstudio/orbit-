const taskService = require("../services/taskService");
const { setTotalHeader } = require("../utils/listLimit");

async function getTasksByProject(req, res, next) {
  try {
    const { rows, total } = await taskService.getTasksByProject(req.params.projectId);
    setTotalHeader(res, total);
    res.json(rows);
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
    const task = await taskService.updateTask(
      req.params.id,
      req.body,
      req.user
    );

    res.json(task);
  } catch (error) {
    console.error("[task update] failed:", {
      taskId: req.params.id,
      status: error.status,
      message: error.message,
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
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
}

const COMMENT_MAX_LENGTH = 10000;

async function createComment(req, res, next) {
  try {
    const content = req.body?.content;
    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "Comment cannot be empty" });
    }
    if (content.length > COMMENT_MAX_LENGTH) {
      return res.status(400).json({ error: `Comment must be ${COMMENT_MAX_LENGTH} characters or less` });
    }

    const comment = await taskService.createComment(req.params.id, req.user.id, content);
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
    next(error);
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