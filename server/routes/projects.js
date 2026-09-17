const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const projectController = require("../controllers/projectController");

router.get("/", auth, projectController.getAllProjects);

// Drag-and-drop reordering. Registered before PUT /:id so Express
// doesn't match "reorder" as an :id param.
router.put("/reorder", auth, managerOnly, projectController.reorderProjects);

router.get("/:id", auth, projectController.getProjectById);

router.post("/", auth, managerOnly, projectController.createProject);

router.put("/:id", auth, managerOnly, projectController.updateProject);

router.patch("/:id/archive", auth, managerOnly, projectController.archiveProject);

router.patch("/:id/unarchive", auth, managerOnly, projectController.unarchiveProject);

router.delete("/:id", auth, managerOnly, projectController.deleteProject);

module.exports = router;