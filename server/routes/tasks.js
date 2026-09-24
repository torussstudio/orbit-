const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const { requireProjectAccess, requireTaskProjectAccess } = require("../middleware/projectAccess");
const taskController = require("../controllers/taskController");

router.get("/project/:projectId", auth, requireProjectAccess("projectId"), taskController.getTasksByProject);

router.put("/reorder", auth, managerOnly, taskController.reorderTasks);

router.get("/:id", auth, requireTaskProjectAccess(), taskController.getTaskById);

router.post("/", auth, managerOnly, taskController.createTask);

router.put("/:id", auth, requireTaskProjectAccess(), taskController.updateTask);

router.delete("/:id", auth, managerOnly, requireTaskProjectAccess(), taskController.deleteTask);

router.post("/:id/comments", auth, requireTaskProjectAccess(), taskController.createComment);

router.get("/in-review/all", auth, managerOnly, taskController.getInReviewTasks);

module.exports = router;