const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const { requireProjectAccess } = require("../middleware/projectAccess");
const credentialController = require("../controllers/credentialController");

router.get("/project/:projectId", auth, requireProjectAccess("projectId"), credentialController.getCredentials);
router.post("/clusters", auth, managerOnly, credentialController.createCluster);
router.put("/clusters/:id", auth, managerOnly, credentialController.updateCluster);
router.delete("/clusters/:id", auth, managerOnly, credentialController.deleteCluster);
router.post("/entries", auth, managerOnly, credentialController.createEntry);
router.put("/entries/:id", auth, managerOnly, credentialController.updateEntry);
router.delete("/entries/:id", auth, managerOnly, credentialController.deleteEntry);

module.exports = router;
