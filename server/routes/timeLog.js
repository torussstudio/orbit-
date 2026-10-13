const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const timeLogController = require("../controllers/timeLogController");

// Members: their own Time Log form. The server picks the member from the
// session, never from the body. Old entries are never sent back.
router.get("/my/options", auth, timeLogController.getMyOptions);
router.post("/entries", auth, timeLogController.createEntry);

// Managers only. List/detail accept ?from=YYYY-MM-DD&to=YYYY-MM-DD (work dates).
router.get("/projects", auth, managerOnly, timeLogController.getProjects);
router.get("/projects/:id", auth, managerOnly, timeLogController.getProjectDetail);
router.get("/members", auth, managerOnly, timeLogController.getMembers);
router.get("/members/:id", auth, managerOnly, timeLogController.getMemberDetail);
router.put("/entries/:id", auth, managerOnly, timeLogController.updateEntry);
router.delete("/entries/:id", auth, managerOnly, timeLogController.deleteEntry);

module.exports = router;
