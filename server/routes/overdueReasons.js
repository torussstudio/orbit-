const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const overdueReasonController = require("../controllers/overdueReasonController");

// Any signed-in user, only their own overdue tasks.
router.get("/mine", auth, overdueReasonController.getMine);
router.put("/tasks/:taskId", auth, overdueReasonController.saveReason);

// Managers only: every overdue task with its reason, and what to do about it.
router.get("/", auth, managerOnly, overdueReasonController.getOverdue);
router.post("/ask", auth, managerOnly, overdueReasonController.ask);
router.post("/:id/decision", auth, managerOnly, overdueReasonController.decide);

module.exports = router;
