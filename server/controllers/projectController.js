// const projectService = require("../services/projectService");

// const getAllProjects = async (req, res, next) => {
//   try {
//     const projects = await projectService.getAllProjects(req.user);
//     res.json(projects);
//   } catch (err) {
//     next(err);
//   }
// };

// const reorderProjects = async (req, res, next) => {
//   try {
//     const { project_ids } = req.body;
//     await projectService.reorderProjects(project_ids);
//     res.json({ success: true });
//   } catch (err) {
//     if (err.message === "project_ids array required") {
//       res.status(400).json({ error: err.message });
//     } else {
//       res.status(400).json({ error: err.message });
//     }
//   }
// };

// const getProjectById = async (req, res, next) => {
//   try {
//     const project = await projectService.getProjectById(req.user, req.params.id);
//     if (!project) return res.status(404).json({ error: "Not found" });
//     res.json(project);
//   } catch (err) {
//     next(err);
//   }
// };

// const createProject = async (req, res, next) => {
//   try {
//     const project = await projectService.createProject(req.user, req.body);
//     res.status(201).json(project);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// const updateProject = async (req, res, next) => {
//   try {
//     const project = await projectService.updateProject(req.params.id, req.body);
//     res.json(project);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// const archiveProject = async (req, res, next) => {
//   try {
//     await projectService.archiveProject(req.params.id);
//     res.json({ success: true });
//   } catch (err) {
//     next(err);
//   }
// };

// const unarchiveProject = async (req, res, next) => {
//   try {
//     await projectService.unarchiveProject(req.params.id);
//     res.json({ success: true });
//   } catch (err) {
//     next(err);
//   }
// };

// const deleteProject = async (req, res, next) => {
//   try {
//     await projectService.deleteProject(req.params.id);
//     res.json({ success: true });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// module.exports = {
//   getAllProjects,
//   reorderProjects,
//   getProjectById,
//   createProject,
//   updateProject,
//   archiveProject,
//   unarchiveProject,
//   deleteProject,
// };



const projectService = require("../services/projectService");

// Errors thrown with a status (see httpError in projectService) are sent
// as-is; anything else uses the fallback status.
const sendError = (res, err, fallback = 400) =>
  res.status(err.status || fallback).json({ error: err.message });

const getAllProjects = async (req, res, next) => {
  try {
    const projects = await projectService.getAllProjects(req.user);
    res.json(projects);
  } catch (err) {
    next(err);
  }
};

const getTrashedProjects = async (req, res, next) => {
  try {
    const projects = await projectService.getTrashedProjects();
    res.json(projects);
  } catch (err) {
    next(err);
  }
};

const reorderProjects = async (req, res, next) => {
  try {
    const { project_ids } = req.body;
    await projectService.reorderProjects(project_ids);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
};

const getProjectById = async (req, res, next) => {
  try {
    const project = await projectService.getProjectById(req.user, req.params.id);
    if (!project) return res.status(404).json({ error: "Not found" });
    res.json(project);
  } catch (err) {
    next(err);
  }
};

const createProject = async (req, res, next) => {
  try {
    const project = await projectService.createProject(req.user, req.body);
    res.status(201).json(project);
  } catch (err) {
    sendError(res, err);
  }
};

const updateProject = async (req, res, next) => {
  try {
    const project = await projectService.updateProject(req.params.id, req.body);
    res.json(project);
  } catch (err) {
    sendError(res, err);
  }
};

const archiveProject = async (req, res, next) => {
  try {
    await projectService.archiveProject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.status) return sendError(res, err);
    next(err);
  }
};

const unarchiveProject = async (req, res, next) => {
  try {
    await projectService.unarchiveProject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.status) return sendError(res, err);
    next(err);
  }
};

const trashProject = async (req, res, next) => {
  try {
    await projectService.trashProject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.status) return sendError(res, err);
    next(err);
  }
};

const restoreProject = async (req, res, next) => {
  try {
    await projectService.restoreProject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.status) return sendError(res, err);
    next(err);
  }
};

const deleteProject = async (req, res, next) => {
  try {
    await projectService.deleteProject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
};

module.exports = {
  getAllProjects,
  getTrashedProjects,
  reorderProjects,
  getProjectById,
  createProject,
  updateProject,
  archiveProject,
  unarchiveProject,
  trashProject,
  restoreProject,
  deleteProject,
};