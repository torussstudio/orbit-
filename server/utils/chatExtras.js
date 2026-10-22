'use strict';

/*
 * Shared rules for the chat extras used by both chats (member <-> admin team
 * in messageService.js, member <-> member in directMessageService.js):
 * reactions, editing, in-chat search and typing indicators.
 */

const MAX_BODY = 4000;
// A message can be edited by its sender for this long after sending.
const EDIT_WINDOW_MS = 15 * 60 * 1000;
// One typing event per person and conversation at most this often.
const TYPING_GAP_MS = 2000;
const SEARCH_MIN = 2;
const SEARCH_MAX = 80;
const SEARCH_LIMIT = 50;

const fail = (status, message) => Object.assign(new Error(message), { status });

// One emoji (incl. skin tones, ZWJ sequences, flags). No letters or digits.
function cleanEmoji(value) {
  if (value === null || value === undefined || value === '') return null; // remove
  if (typeof value !== 'string') throw fail(400, 'Choose an emoji.');
  const emoji = value.trim();
  if (!emoji || emoji.length > 16 || /[\p{L}\p{N}\s<>]/u.test(emoji.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ''))
    || !/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u.test(emoji)) {
    throw fail(400, 'Choose an emoji.');
  }
  return emoji;
}

// Next reactions object: one reaction per person, the same emoji again
// removes it, null removes it.
function nextReactions(current, userId, emoji) {
  const reactions = { ...(current && typeof current === 'object' ? current : {}) };
  const key = String(userId);
  if (!emoji || reactions[key] === emoji) delete reactions[key];
  else reactions[key] = emoji;
  return reactions;
}

function cleanEditBody(value, hasAttachments) {
  const body = typeof value === 'string' ? value.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim() : '';
  if (body.length > MAX_BODY) throw fail(400, `A message can be at most ${MAX_BODY} characters.`);
  if (!body && !hasAttachments) throw fail(400, 'A message cannot be empty. Delete it instead.');
  return body;
}

function assertEditable(message, userId) {
  if (!message) throw fail(404, 'Message not found.');
  if (String(message.sender_id) !== String(userId)) throw fail(403, 'You can only edit your own messages.');
  if (message.deleted_at) throw fail(400, 'This message was deleted.');
  if (message.forwarded_from_id) throw fail(400, 'Forwarded messages cannot be edited.');
  if (Date.now() - new Date(message.created_at).getTime() > EDIT_WINDOW_MS) {
    throw fail(400, 'Messages can only be edited for 15 minutes after sending.');
  }
}

// ILIKE pattern with %, _ and \ escaped, or null when the query is too short.
function searchPattern(value) {
  const q = String(value || '').trim().slice(0, SEARCH_MAX);
  if (q.length < SEARCH_MIN) return null;
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const lastTyping = new Map(); // `${conversationId}:${userId}` -> ms

// true when a typing event should go out now (in-memory throttle).
function typingAllowed(conversationId, userId) {
  const key = `${conversationId}:${userId}`;
  const now = Date.now();
  if (now - (lastTyping.get(key) || 0) < TYPING_GAP_MS) return false;
  lastTyping.set(key, now);
  if (lastTyping.size > 5000) {
    for (const [k, t] of lastTyping) if (now - t > 60_000) lastTyping.delete(k);
  }
  return true;
}

module.exports = {
  EDIT_WINDOW_MS,
  SEARCH_LIMIT,
  cleanEmoji,
  nextReactions,
  cleanEditBody,
  assertEditable,
  searchPattern,
  typingAllowed,
};
