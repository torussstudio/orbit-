const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const timeLogController = require("../controllers/timeLogController");

// Managers only. All accept ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST days).
router.get("/projects", auth, managerOnly, timeLogController.getProjects);
router.get("/projects/:id", auth, managerOnly, timeLogController.getProjectDetail);
router.get("/members", auth, managerOnly, timeLogController.getMembers);
router.get("/members/:id", auth, managerOnly, timeLogController.getMemberDetail);

module.exports = router;