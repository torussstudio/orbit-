const messageService = require("../services/messageService");
const directMessageService = require("../services/directMessageService");

// Errors thrown with a status (see httpError in messageService) are sent
// as-is. Anything else is a real server error and goes to the error handler.
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// Manager inbox: every active member and their conversation (if any).
const listConversations = handle(async (req, res) => {
  res.json({ conversations: await messageService.listConversations(req.user) });
});

// Manager opens a member who has no conversation yet. { member_id }
const startConversation = handle(async (req, res) => {
  const conversation = await messageService.startConversation(req.user, req.body?.member_id);
  res.json({ conversation });
});

// A member's own conversation with the admin team.
const myConversation = handle(async (req, res) => {
  res.json({ conversation: await messageService.myConversation(req.user) });
});

// ?before=<messageId> | ?after=<messageId>, &limit=
const listMessages = handle(async (req, res) => {
  const { before, after, limit } = req.query;
  res.json(await messageService.listMessages(req.user, req.params.id, { before, after, limit }));
});

// { body }
const sendMessage = handle(async (req, res) => {
  const message = await messageService.sendMessage(req.user, req.params.id, req.body?.body, req.body?.attachments, req.body?.reply_to_message_id);
  res.status(201).json({ message });
});

const uploadSignature = handle(async (req, res) => {
  res.json(await directMessageService.signUpload(req.user, req.body || {}));
});

const deleteMessage = handle(async (req, res) => {
  res.json(await messageService.deleteMessage(req.user, req.params.id, req.params.messageId, req.body?.mode));
});

const forwardMessage = handle(async (req, res) => {
  const message = await messageService.forwardMessage(req.user, req.params.id, req.params.messageId, req.body?.target_conversation_id);
  res.status(201).json({ message });
});

const markRead = handle(async (req, res) => {
  res.json(await messageService.markRead(req.user, req.params.id));
});

const unreadCount = handle(async (req, res) => {
  const current = await messageService.unreadCount(req.user);
  const direct = req.user?.role === 'member' ? await directMessageService.unreadCount(req.user) : { count: 0 };
  res.json({ count: current.count + direct.count });
});

// { emoji } — the same emoji again, or null, removes the reaction.
const reactToMessage = handle(async (req, res) => {
  res.json(await messageService.reactToMessage(req.user, req.params.id, req.params.messageId, req.body?.emoji));
});

// { body }
const editMessage = handle(async (req, res) => {
  res.json({ message: await messageService.editMessage(req.user, req.params.id, req.params.messageId, req.body?.body) });
});

// ?q=
const searchMessages = handle(async (req, res) => {
  res.json(await messageService.searchMessages(req.user, req.params.id, req.query.q));
});

const typing = handle(async (req, res) => {
  res.json(await messageService.typing(req.user, req.params.id));
});

module.exports = {
  reactToMessage,
  editMessage,
  searchMessages,
  typing,
  listConversations,
  startConversation,
  myConversation,
  listMessages,
  sendMessage,
  uploadSignature,
  deleteMessage,
  forwardMessage,
  markRead,
  unreadCount,
};
