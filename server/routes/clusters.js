const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const { requireProjectAccess, requireClusterProjectAccess } = require("../middleware/projectAccess");
const clusterController = require("../controllers/clusterController");

router.get("/project/:projectId", auth, requireProjectAccess("projectId"), clusterController.getClustersByProject);
router.get("/:id", auth, requireClusterProjectAccess(), clusterController.getClusterById);
router.post("/", auth, managerOnly, clusterController.createCluster);
router.put("/:id", auth, managerOnly, clusterController.updateCluster);
router.post("/:id/submit-review", auth, managerOnly, clusterController.submitClusterForReview);
router.post("/:id/review", auth, managerOnly, clusterController.reviewCluster);
router.patch("/:id/complete", auth, managerOnly, clusterController.completeCluster);
router.delete("/:id", auth, managerOnly, clusterController.deleteCluster);

module.exports = router;
