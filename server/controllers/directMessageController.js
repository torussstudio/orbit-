'use strict';

const service = require('../services/directMessageService');

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

module.exports = {
  members: handle(async (req, res) => res.json({ members: await service.listMembers(req.user, req.query.search) })),
  conversations: handle(async (req, res) => res.json({ conversations: await service.listConversations(req.user) })),
  start: handle(async (req, res) => res.status(201).json({ conversation: await service.startConversation(req.user, req.body?.member_id) })),
  list: handle(async (req, res) => res.json(await service.listMessages(req.user, req.params.id, req.query))),
  send: handle(async (req, res) => res.status(201).json({ message: await service.sendMessage(req.user, req.params.id, req.body?.body, req.body?.attachments, req.body?.reply_to_message_id) })),
  deleteMessage: handle(async (req, res) => res.json(await service.deleteMessage(req.user, req.params.id, req.params.messageId, req.body?.mode))),
  forwardMessage: handle(async (req, res) => res.status(201).json({ message: await service.forwardMessage(req.user, req.params.id, req.params.messageId, req.body?.target_conversation_id) })),
  read: handle(async (req, res) => res.json(await service.markRead(req.user, req.params.id))),
  unread: handle(async (req, res) => res.json({ count: await service.unreadCount(req.user) })),
  uploadSignature: handle(async (req, res) => res.json(await service.signUpload(req.user, req.body || {}))),
};
