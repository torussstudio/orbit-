const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const memberController = require("../controllers/memberController");

router.get("/", auth, memberController.getAllMembers);
router.get("/suggestions", auth, memberController.getMemberSuggestions);
router.post("/", auth, managerOnly, memberController.createInvitation);
router.post("/direct", auth, managerOnly, memberController.createMember);
router.get("/invitations/pending", auth, managerOnly, memberController.listPendingInvitations);
router.post("/invitations/:id/decision", auth, managerOnly, memberController.decideInvitation);
router.get("/invitation/:token", memberController.getInvitation);
router.post("/invitation/:token/accept", memberController.acceptInvitation);
router.post("/onboarding/complete", auth, memberController.completeOnboarding);
router.put("/:id", auth, managerOnly, memberController.updateMember);
router.patch("/:id/deactivate", auth, managerOnly, memberController.deactivateMember);
router.patch("/:id/activate", auth, managerOnly, memberController.activateMember);
router.delete("/:id", auth, managerOnly, memberController.deleteMember);

module.exports = router;
