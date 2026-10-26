const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const timeLogController = require("../controllers/timeLogController");

// Members: their own Time Log form and history. The server picks the member
// from the session, never from the body.
router.get("/my/options", auth, timeLogController.getMyOptions);
router.post("/entries", auth, timeLogController.createEntry);
router.get("/my/entries", auth, timeLogController.getMyEntries);
router.put("/my/entries/:id", auth, timeLogController.updateMyEntry);
router.delete("/my/entries/:id", auth, timeLogController.deleteMyEntry);

// Managers only. List/detail accept ?from=YYYY-MM-DD&to=YYYY-MM-DD (work dates).
router.get("/projects", auth, managerOnly, timeLogController.getProjects);
router.get("/unlogged-done", auth, managerOnly, timeLogController.getUnloggedDoneTasks);
router.post("/unlogged-done/:taskId/entries", auth, managerOnly, timeLogController.addUnloggedTaskEntry);
router.get("/projects/:id", auth, managerOnly, timeLogController.getProjectDetail);
router.get("/members", auth, managerOnly, timeLogController.getMembers);
router.get("/members/:id", auth, managerOnly, timeLogController.getMemberDetail);
router.put("/entries/:id", auth, managerOnly, timeLogController.updateEntry);
router.delete("/entries/:id", auth, managerOnly, timeLogController.deleteEntry);

module.exports = router;
