// const router = require("express").Router();
// const { auth, managerOnly } = require("../middleware/auth");
// const { requireProjectAccess } = require("../middleware/projectAccess");
// const projectController = require("../controllers/projectController");

// // Members don't get the projects list. Managers only.
// router.get("/", auth, managerOnly, projectController.getAllProjects);

// // Drag-and-drop reordering. Registered before PUT /:id so Express
// // doesn't match "reorder" as an :id param.
// router.put("/reorder", auth, managerOnly, projectController.reorderProjects);

// // Managers can open any project; members only projects they belong to
// // (TaskDetail still needs this for the project name and custom_stages).a
// router.get("/:id", auth, requireProjectAccess("id"), projectController.getProjectById);

// router.post("/", auth, managerOnly, projectController.createProject);

// router.put("/:id", auth, managerOnly, projectController.updateProject);

// router.patch("/:id/archive", auth, managerOnly, projectController.archiveProject);

// router.patch("/:id/unarchive", auth, managerOnly, projectController.unarchiveProject);

// router.delete("/:id", auth, managerOnly, projectController.deleteProject);

// module.exports = router;


const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const { requireProjectAccess } = require("../middleware/projectAccess");
const projectController = require("../controllers/projectController");

// Members don't get the projects list. Managers only.
router.get("/", auth, managerOnly, projectController.getAllProjects);

// Trash list. Registered before GET /:id so Express doesn't match "trash"
// as an :id param.
router.get("/trash", auth, managerOnly, projectController.getTrashedProjects);

// Drag-and-drop reordering. Registered before PUT /:id so Express
// doesn't match "reorder" as an :id param.
router.put("/reorder", auth, managerOnly, projectController.reorderProjects);

// Managers can open any project; members only projects they belong to
// (TaskDetail still needs this for the project name and custom_stages).
router.get("/:id", auth, requireProjectAccess("id"), projectController.getProjectById);

router.post("/", auth, managerOnly, projectController.createProject);

router.put("/:id", auth, managerOnly, projectController.updateProject);

router.patch("/:id/archive", auth, managerOnly, projectController.archiveProject);

router.patch("/:id/unarchive", auth, managerOnly, projectController.unarchiveProject);

// Trash: move in, restore (within 7 days). Expired trash is purged
// automatically (see projectService).
router.patch("/:id/trash", auth, managerOnly, projectController.trashProject);

router.patch("/:id/restore", auth, managerOnly, projectController.restoreProject);

// Permanent delete. Only works on a project that is already in trash.
router.delete("/:id", auth, managerOnly, projectController.deleteProject);

module.exports = router;