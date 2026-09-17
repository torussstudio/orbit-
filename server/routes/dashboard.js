const router = require("express").Router();
const { auth, requireSelfOrRole } = require("../middleware/auth");
const dashboardController = require("../controllers/dashboardController");

router.get("/", auth, dashboardController.getDashboard);
router.get("/members/:id/tasks", auth, requireSelfOrRole("id", "manager"), dashboardController.getMemberTasks);
router.get("/tasks", auth, dashboardController.getTasksList);
router.get("/my-tasks", auth, dashboardController.getMyTasks);

module.exports = router;