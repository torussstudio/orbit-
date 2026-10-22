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

// Online / last seen for chat headers and lists. ?ids=1,2&team=1
router.get("/presence", auth, messageController.presence);

// Sidebar badge (anyone signed in, their own count).
router.get("/unread-count", auth, messageController.unreadCount);

// Manager inbox.
router.get("/conversations", auth, managerOnly, messageController.listConversations);
router.post("/conversations", auth, managerOnly, messageController.startConversation);

// A member's own conversation. Registered before /conversations/:id/...
// so "me" is never read as an id.
router.get("/conversations/me", auth, messageController.myConversation);

router.get("/conversations/:id/messages", auth, messageController.listMessages);
router.post("/uploads/signature", auth, messageController.uploadSignature);
router.post("/conversations/:id/messages", auth, messageController.sendMessage);
router.delete("/conversations/:id/messages/:messageId", auth, messageController.deleteMessage);
router.post("/conversations/:id/messages/:messageId/forward", auth, messageController.forwardMessage);
router.post("/conversations/:id/read", auth, messageController.markRead);
router.post("/conversations/:id/typing", auth, messageController.typing);
router.get("/conversations/:id/search", auth, messageController.searchMessages);
router.patch("/conversations/:id/messages/:messageId", auth, messageController.editMessage);
router.post("/conversations/:id/messages/:messageId/reactions", auth, messageController.reactToMessage);

// One-to-one chats between active members. The service checks both roles
// and conversation participation for every request.
router.get("/direct/unread-count", auth, directMessageController.unread);
router.get("/direct/members", auth, directMessageController.members);
router.get("/direct/conversations", auth, directMessageController.conversations);
router.post("/direct/conversations", auth, directMessageController.start);
router.post("/direct/uploads/signature", auth, directMessageController.uploadSignature);
router.get("/direct/conversations/:id/messages", auth, directMessageController.list);
router.post("/direct/conversations/:id/messages", auth, directMessageController.send);
router.delete("/direct/conversations/:id/messages/:messageId", auth, directMessageController.deleteMessage);
router.post("/direct/conversations/:id/messages/:messageId/forward", auth, directMessageController.forwardMessage);
router.post("/direct/conversations/:id/read", auth, directMessageController.read);
router.post("/direct/conversations/:id/typing", auth, directMessageController.typing);
router.get("/direct/conversations/:id/search", auth, directMessageController.search);
router.patch("/direct/conversations/:id/messages/:messageId", auth, directMessageController.edit);
router.post("/direct/conversations/:id/messages/:messageId/reactions", auth, directMessageController.react);

module.exports = router;
