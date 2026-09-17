const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const memberController = require("../controllers/memberController");

router.get("/", auth, memberController.getAllMembers);
router.get("/suggestions", auth, memberController.getMemberSuggestions);
router.post("/", auth, managerOnly, memberController.createMember);
router.put("/:id", auth, managerOnly, memberController.updateMember);
router.patch("/:id/deactivate", auth, managerOnly, memberController.deactivateMember);
router.patch("/:id/activate", auth, managerOnly, memberController.activateMember);
router.delete("/:id", auth, managerOnly, memberController.deleteMember);

module.exports = router;