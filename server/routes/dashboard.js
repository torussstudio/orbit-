const router = require("express").Router();
const { auth, managerOnly, requireSelfOrRole } = require("../middleware/auth");
const dashboardController = require("../controllers/dashboardController");

router.get("/", auth, dashboardController.getDashboard);
router.get("/members/:id/tasks", auth, requireSelfOrRole("id", "manager"), dashboardController.getMemberTasks);
// Lists every main task across all projects — manager dashboard only.
router.get("/tasks", auth, managerOnly, dashboardController.getTasksList);
router.get("/my-tasks", auth, dashboardController.getMyTasks);

module.exports = router;