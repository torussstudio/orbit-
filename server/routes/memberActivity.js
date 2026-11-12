const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const memberActivityController = require("../controllers/memberActivityController");

// Managers only. Both accept ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST days).
router.get("/members", auth, managerOnly, memberActivityController.getMembers);
router.get("/members/:id", auth, managerOnly, memberActivityController.getMemberDetail);

// Members with no activity today, and the manual "Nudge" push / bell reminder.
router.get("/idle", auth, managerOnly, memberActivityController.getIdle);
router.post("/nudge", auth, managerOnly, memberActivityController.nudge);

module.exports = router;
