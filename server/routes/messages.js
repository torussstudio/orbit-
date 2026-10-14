const router = require("express").Router();
const { auth, managerOnly } = require("../middleware/auth");
const messageController = require("../controllers/messageController");
const directMessageController = require("../controllers/directMessageController");

/*
 * Messages: members <-> admin team (shared inbox).
 *
 * Who may open which conversation is checked in services/messageService.js
 * for every :id route (manager: any, member: only their own). The routes
 * below only add the "managers only" rule for the inbox list and for
 * starting a conversation with a member.
 */

// Sidebar badge (anyone signed in, their own count).
router.get("/unread-count", auth, messageController.unreadCount);

// Manager inbox.
router.get("/conversations", auth, managerOnly, messageController.listConversations);
router.post("/conversations", auth, managerOnly, messageController.startConversation);

// A member's own conversation. Registered before /conversations/:id/...
// so "me" is never read as an id.
router.get("/conversations/me", auth, messageController.myConversation);

router.get("/conversations/:id/messages", auth, messageController.listMessages);
router.post("/conversations/:id/messages", auth, messageController.sendMessage);
router.post("/conversations/:id/read", auth, messageController.markRead);

// One-to-one chats between active members. The service checks both roles
// and conversation participation for every request.
router.get("/direct/unread-count", auth, directMessageController.unread);
router.get("/direct/members", auth, directMessageController.members);
router.get("/direct/conversations", auth, directMessageController.conversations);
router.post("/direct/conversations", auth, directMessageController.start);
router.post("/direct/uploads/signature", auth, directMessageController.uploadSignature);
router.get("/direct/conversations/:id/messages", auth, directMessageController.list);
router.post("/direct/conversations/:id/messages", auth, directMessageController.send);
router.post("/direct/conversations/:id/read", auth, directMessageController.read);

module.exports = router;
