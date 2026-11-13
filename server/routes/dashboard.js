const router = require("express").Router();
const { auth, managerOnly, requireSelfOrRole } = require("../middleware/auth");
const dashboardController = require("../controllers/dashboardController");

router.get("/", auth, dashboardController.getDashboard);
router.get("/members/:id/tasks", auth, requireSelfOrRole("id", "manager"), dashboardController.getMemberTasks);
router.get("/members/:id/activity-heatmap", auth, requireSelfOrRole("id", "manager"), dashboardController.getActivityHeatmap);
router.get("/members/:id/time-summary", auth, requireSelfOrRole("id", "manager"), dashboardController.getTimeSummary);
// Lists every main task across all projects — manager dashboard only.
router.get("/tasks", auth, managerOnly, dashboardController.getTasksList);
router.get("/my-tasks", auth, dashboardController.getMyTasks);
// Members page (managers): task progress per member.
router.get("/team-progress", auth, managerOnly, dashboardController.getTeamProgress);

module.exports = router;