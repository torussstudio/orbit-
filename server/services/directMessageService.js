'use strict';

const crypto = require('node:crypto');
const db = require('../db');
const liveEvents = require('./liveEvents');
const { createNotification } = require('../utils/pushNotify');

const MAX_BODY = 4000;
const MAX_ATTACHMENTS = 3;
const IMAGE_LIMIT = 10 * 1024 * 1024;
const PDF_LIMIT = 50 * 1024 * 1024;
const DESIGN_FILE_LIMIT = 50 * 1024 * 1024;
const RAW_EXTENSIONS = {
  'application/pdf': 'pdf',
  'application/vnd.adobe.illustrator': 'ai',
  'image/vnd.adobe.illustrator': 'ai',
  'application/postscript': 'ai',
  'image/vnd.adobe.photoshop': 'psd',
  'application/vnd.adobe.photoshop': 'psd',
};
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 20;
const recentSends = new Map();
const lastPush = new Map();

const fail = (status, message) => Object.assign(new Error(message), { status });
const sameId = (a, b) => String(a) === String(b);
const sortIds = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

function requireMember(user) {
  if (user?.role !== 'member') throw fail(403, 'Member chats are only available to members.');
}

function checkRate(userId) {
  const now = Date.now();
  const recent = (recentSends.get(String(userId)) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) throw fail(429, 'You are sending messages too fast. Wait a few seconds and try again.');
  recent.push(now);
  recentSends.set(String(userId), recent);
}

function filePolicy(mime, size) {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    if (!Number.isInteger(size) || size < 1 || size > IMAGE_LIMIT) throw fail(400, 'Images must be 10 MB or smaller.');
    return { resourceType: 'image', preset: process.env.CLOUDINARY_CHAT_IMAGE_PRESET };
  }
  if (mime === 'application/pdf') {
    if (!Number.isInteger(size) || size < 1 || size > PDF_LIMIT) throw fail(400, 'PDF files must be 50 MB or smaller.');
    return { resourceType: 'raw', preset: process.env.CLOUDINARY_CHAT_PDF_PRESET };
  }
  if (RAW_EXTENSIONS[mime] && RAW_EXTENSIONS[mime] !== 'pdf') {
    if (!Number.isInteger(size) || size < 1 || size > DESIGN_FILE_LIMIT) throw fail(400, 'AI and PSD files must be 50 MB or smaller.');
    return { resourceType: 'image', preset: null };
  }
  if (mime === 'image/svg+xml') {
    if (!Number.isInteger(size) || size < 1 || size > DESIGN_FILE_LIMIT) throw fail(400, 'SVG files must be 50 MB or smaller.');
    return { resourceType: 'image', preset: null };
  }
  throw fail(400, 'Attach JPG, PNG, WebP, SVG, AI, PSD, or PDF files.');
}

async function signUpload(user, { mime_type: mime, size }) {
  if (!['manager', 'member'].includes(user?.role)) throw fail(403, 'Sign in to upload chat files.');
  checkRate(user.id);
  const policy = filePolicy(mime, size);
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret || (mime === 'application/pdf' && !policy.preset)) {
    throw fail(503, 'Chat file uploads are not configured yet.');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  await db.query('DELETE FROM direct_upload_intents WHERE expires_at < NOW()');
  const folder = `orbit-chat/${user.id}`;
  const rawExtension = RAW_EXTENSIONS[mime];
  const publicId = `${folder}/${crypto.randomUUID()}${policy.resourceType === 'raw' ? `.${rawExtension}` : ''}`;
  const params = { public_id: publicId, timestamp };
  if (policy.preset) params.upload_preset = policy.preset;
  const toSign = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  const signature = crypto.createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');
  await db.query(
    `INSERT INTO direct_upload_intents (public_id, member_id, mime_type, file_size, resource_type, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour')`,
    [publicId, user.id, mime, size, policy.resourceType],
  );

  return {
    cloud_name: cloudName,
    api_key: apiKey,
    timestamp,
    signature,
    public_id: publicId,
    upload_preset: policy.preset || null,
    resource_type: policy.resourceType,
    upload_url: `https://api.cloudinary.com/v1_1/${cloudName}/${policy.resourceType}/upload`,
  };
}

async function activePeer(user, peerId) {
  requireMember(user);
  if (peerId == null || sameId(peerId, user.id)) throw fail(400, 'Choose another member to chat with.');
  const { rows } = await db.query(
    `SELECT id, name, avatar_url, bio FROM members WHERE id = $1 AND role = 'member' AND active = true`,
    [peerId],
  );
  if (!rows[0]) throw fail(404, 'Member not found.');
  return rows[0];
}

async function startConversation(user, peerId) {
  const peer = await activePeer(user, peerId);
  const [one, two] = sortIds(user.id, peer.id) <= 0 ? [user.id, peer.id] : [peer.id, user.id];
  await db.query(
    `INSERT INTO direct_conversations (member_one_id, member_two_id)
     VALUES ($1, $2) ON CONFLICT (member_one_id, member_two_id) DO NOTHING`,
    [one, two],
  );
  const { rows } = await db.query(
    `SELECT id, member_one_id, member_two_id, last_message_at FROM direct_conversations
      WHERE member_one_id = $1 AND member_two_id = $2`, [one, two],
  );
  return { ...rows[0], peer };
}

async function listMembers(user, search = '') {
  requireMember(user);
  const q = String(search || '').trim().slice(0, 80);
  const { rows } = await db.query(
    `SELECT id, name, avatar_url, bio FROM members
      WHERE role = 'member' AND active = true AND id <> $1
        AND ($2 = '' OR name ILIKE $3 OR email ILIKE $3)
      ORDER BY name ASC LIMIT 50`,
    [user.id, q, `%${q}%`],
  );
  return rows;
}

async function listConversations(user) {
  requireMember(user);
  const { rows } = await db.query(
    `SELECT c.id, c.last_message_at, p.id AS peer_id, p.name AS peer_name, p.avatar_url AS peer_avatar_url, p.bio AS peer_bio,
            lm.body AS last_body, lm.created_at AS last_created_at,
            lm.sender_id AS last_sender_id,
            COALESCE(unread.count, 0)::int AS unread
       FROM direct_conversations c
       JOIN members p ON p.id = CASE WHEN c.member_one_id = $1 THEN c.member_two_id ELSE c.member_one_id END
       LEFT JOIN LATERAL (
         SELECT body, created_at, sender_id FROM direct_messages
          WHERE direct_conversation_id = c.id AND deleted_at IS NULL AND NOT (hidden_by ? $1::text)
          ORDER BY created_at DESC, id DESC LIMIT 1
       ) lm ON true
       LEFT JOIN direct_conversation_reads r ON r.direct_conversation_id = c.id AND r.member_id = $1
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS count FROM direct_messages m
          WHERE m.direct_conversation_id = c.id AND m.sender_id = p.id
            AND m.deleted_at IS NULL AND NOT (m.hidden_by ? $1::text)
            AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
       ) unread ON true
      WHERE c.member_one_id = $1 OR c.member_two_id = $1
      ORDER BY c.last_message_at DESC NULLS LAST, p.name ASC`,
    [user.id],
  );
  return rows.map((row) => ({
    id: row.id,
    peer: { id: row.peer_id, name: row.peer_name, avatar_url: row.peer_avatar_url, bio: row.peer_bio },
    last_message_at: row.last_message_at,
    last_message: row.last_created_at ? { body: row.last_body, sender_id: row.last_sender_id, created_at: row.last_created_at } : null,
    unread: row.unread,
  }));
}

async function accessible(user, conversationId) {
  requireMember(user);
  const { rows } = await db.query(
    `SELECT c.id, c.member_one_id, c.member_two_id, c.last_message_at,
            p.id AS peer_id, p.name AS peer_name, p.avatar_url AS peer_avatar_url, p.bio AS peer_bio, p.active AS peer_active
       FROM direct_conversations c
       JOIN members p ON p.id = CASE WHEN c.member_one_id = $2 THEN c.member_two_id ELSE c.member_one_id END
      WHERE c.id = $1 AND (c.member_one_id = $2 OR c.member_two_id = $2)`,
    [conversationId, user.id],
  );
  if (!rows[0]) throw fail(404, 'Conversation not found.');
  return rows[0];
}

async function listMessages(user, conversationId, { before, after, limit } = {}) {
  const conversation = await accessible(user, conversationId);
  const size = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 30));
  const params = [conversation.id];
  let where = 'm.direct_conversation_id = $1';
  let order = 'DESC';
  if (after || before) {
    params.push(after || before);
    where += ` AND (m.created_at, m.id) ${after ? '>' : '<'} (
      SELECT created_at, id FROM direct_messages WHERE id = $2 AND direct_conversation_id = $1
    )`;
    if (after) order = 'ASC';
  }
  params.push(size + 1);
  const { rows } = await db.query(
    `SELECT m.id, m.direct_conversation_id AS conversation_id, m.sender_id,
            CASE WHEN m.deleted_at IS NOT NULL THEN '' ELSE m.body END AS body,
            m.attachments, m.created_at, m.reply_to_message_id,
            m.forwarded_from_id, m.deleted_at IS NOT NULL AS deleted,
            rm.body AS reply_body, rm.sender_id AS reply_sender_id,
            rs.name AS reply_sender_name
       FROM direct_messages m
       LEFT JOIN direct_messages rm ON rm.id = m.reply_to_message_id
       LEFT JOIN members rs ON rs.id = rm.sender_id
      WHERE ${where}
        AND NOT (m.hidden_by ? $${params.length + 1})
      ORDER BY m.created_at ${order}, m.id ${order} LIMIT $${params.length}`,
    [...params, String(user.id)],
  );
  const page = rows.slice(0, size);
  const read = await db.query(
    `SELECT last_read_at FROM direct_conversation_reads WHERE direct_conversation_id = $1 AND member_id = $2`,
    [conversation.id, conversation.peer_id],
  );
  return {
    conversation: { id: conversation.id, peer: { id: conversation.peer_id, name: conversation.peer_name, avatar_url: conversation.peer_avatar_url, bio: conversation.peer_bio, active: conversation.peer_active } },
    messages: order === 'DESC' ? page.reverse() : page,
    has_more: rows.length > size,
    other_read_at: read.rows[0]?.last_read_at || null,
  };
}

function validateAttachment(item, intent) {
  if (!item || typeof item !== 'object') throw fail(400, 'Invalid attachment.');
  const policy = filePolicy(intent.mime_type, Number(intent.file_size));
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const expectedResource = intent.resource_type;
  const format = String(item.format || (intent.mime_type === 'application/pdf' && expectedResource === 'raw' ? 'pdf' : '')).toLowerCase();
  let url;
  try { url = new URL(item.secure_url); } catch { throw fail(400, 'Invalid Cloudinary file URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== `res.cloudinary.com` ||
      !url.pathname.startsWith(`/${cloud}/${expectedResource}/upload/`) ||
      item.resource_type !== expectedResource || item.public_id !== intent.public_id ||
      !Number.isInteger(Number(item.bytes)) || Number(item.bytes) !== Number(intent.file_size) ||
      !['jpg', 'jpeg', 'png', 'webp', 'svg', 'pdf', 'ai', 'psd'].includes(format) ||
      (expectedResource !== policy.resourceType)) {
    throw fail(400, 'The uploaded file could not be verified. Please try again.');
  }
  return {
    public_id: intent.public_id,
    secure_url: url.href,
    resource_type: expectedResource,
    format,
    bytes: Number(intent.file_size),
    mime_type: intent.mime_type,
    original_filename: String(item.original_filename || 'attachment').slice(0, 200),
  };
}

async function sendMessage(user, conversationId, rawBody, rawAttachments = [], replyToId = null) {
  const conversation = await accessible(user, conversationId);
  if (!conversation.peer_active) throw fail(400, 'This member is no longer active, so the conversation is read-only.');
  const body = typeof rawBody === 'string' ? rawBody.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim() : '';
  if (body.length > MAX_BODY) throw fail(400, `A message can be at most ${MAX_BODY} characters.`);
  if (!Array.isArray(rawAttachments) || rawAttachments.length > MAX_ATTACHMENTS) throw fail(400, 'A message can include up to 3 attachments.');
  if (!body && rawAttachments.length === 0) throw fail(400, 'Write a message or attach a file first.');
  checkRate(user.id);

  const client = await db.connect();
  let message;
  let attachments = [];
  try {
    await client.query('BEGIN');
    if (replyToId) {
      const reply = await client.query(`SELECT id FROM direct_messages WHERE id = $1 AND direct_conversation_id = $2 AND deleted_at IS NULL`, [replyToId, conversation.id]);
      if (!reply.rows[0]) throw fail(400, 'The message you are replying to is unavailable.');
    }
    const used = new Set();
    for (const item of rawAttachments) {
      const publicId = String(item?.public_id || '');
      if (!publicId || used.has(publicId)) throw fail(400, 'Invalid or duplicate attachment.');
      used.add(publicId);
      const { rows } = await client.query(
        `SELECT public_id, mime_type, file_size, resource_type FROM direct_upload_intents
          WHERE public_id = $1 AND member_id = $2 AND expires_at > NOW() FOR UPDATE`,
        [publicId, user.id],
      );
      if (!rows[0]) throw fail(400, 'The upload expired. Please attach the file again.');
      attachments.push(validateAttachment(item, rows[0]));
    }
    const inserted = await client.query(
      `INSERT INTO direct_messages (direct_conversation_id, sender_id, body, attachments, reply_to_message_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, direct_conversation_id AS conversation_id, sender_id, body, attachments, created_at`,
      [conversation.id, user.id, body, JSON.stringify(attachments), replyToId || null],
    );
    message = inserted.rows[0];
    const sender = await client.query('SELECT name FROM members WHERE id = $1', [user.id]);
    message.sender_name = sender.rows[0]?.name || null;
    await client.query('UPDATE direct_conversations SET last_message_at = $2 WHERE id = $1', [conversation.id, message.created_at]);
    await client.query(
      `INSERT INTO direct_conversation_reads (direct_conversation_id, member_id, last_read_at)
       VALUES ($1, $2, $3) ON CONFLICT (direct_conversation_id, member_id)
       DO UPDATE SET last_read_at = GREATEST(direct_conversation_reads.last_read_at, EXCLUDED.last_read_at)`,
      [conversation.id, user.id, message.created_at],
    );
    if (used.size) {
      await client.query('DELETE FROM direct_upload_intents WHERE public_id = ANY($1::text[])', [[...used]]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const eventConversation = { id: conversation.id, member_one_id: conversation.member_one_id, member_two_id: conversation.member_two_id };
  liveEvents.directMessageCreated(eventConversation);
  notifyDirectRecipient(conversation, message).catch((err) => console.error('[direct messages] push failed:', err?.message));
  return message;
}

async function deleteMessage(user, conversationId, messageId, mode) {
  const conversation = await accessible(user, conversationId);
  if (!['for-me', 'for-everyone'].includes(mode)) throw fail(400, 'Choose whether to delete the message for you or everyone.');
  const { rows } = await db.query(`SELECT id, sender_id FROM direct_messages WHERE id = $1 AND direct_conversation_id = $2`, [messageId, conversation.id]);
  const message = rows[0];
  if (!message) throw fail(404, 'Message not found.');
  if (mode === 'for-everyone' && !sameId(message.sender_id, user.id)) throw fail(403, 'You can only delete your own message for everyone.');
  if (mode === 'for-everyone') await db.query(`UPDATE direct_messages SET deleted_at = COALESCE(deleted_at, NOW()), body = '', attachments = '[]'::jsonb WHERE id = $1`, [messageId]);
  else await db.query(`UPDATE direct_messages SET hidden_by = CASE WHEN hidden_by ? $2 THEN hidden_by ELSE hidden_by || to_jsonb($2::text) END WHERE id = $1`, [messageId, String(user.id)]);
  liveEvents.directMessageCreated(conversation);
  return { success: true };
}

async function forwardMessage(user, sourceConversationId, messageId, targetConversationId) {
  const source = await accessible(user, sourceConversationId);
  const target = await accessible(user, targetConversationId);
  if (!target.peer_active) throw fail(400, 'This member is no longer active.');
  const { rows } = await db.query(`SELECT id, body, attachments, deleted_at FROM direct_messages WHERE id = $1 AND direct_conversation_id = $2`, [messageId, source.id]);
  const original = rows[0];
  if (!original || original.deleted_at) throw fail(404, 'Message not found or already deleted.');
  const inserted = await db.query(`INSERT INTO direct_messages (direct_conversation_id, sender_id, body, attachments, forwarded_from_id) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id, direct_conversation_id AS conversation_id, sender_id, body, attachments, created_at, forwarded_from_id`, [target.id, user.id, original.body, JSON.stringify(original.attachments || []), original.id]);
  const message = inserted.rows[0];
  await db.query('UPDATE direct_conversations SET last_message_at = $2 WHERE id = $1', [target.id, message.created_at]);
  liveEvents.directMessageCreated(target);
  notifyDirectRecipient(target, message).catch((err) => console.error('[direct messages] push failed:', err?.message));
  return message;
}

async function notifyDirectRecipient(conversation, message) {
  const recipientId = sameId(conversation.member_one_id, message.sender_id) ? conversation.member_two_id : conversation.member_one_id;
  const key = `${conversation.id}:${recipientId}`;
  const now = Date.now();
  if (now - (lastPush.get(key) || 0) < 120_000) return;
  lastPush.set(key, now);
  const flat = message.body.replace(/\s+/g, ' ');
  const preview = flat || (message.attachments?.length ? 'Sent an attachment' : 'New message');
  await createNotification(recipientId, `Message from ${message.sender_name || 'a member'}`, preview.slice(0, 120), {
    type: 'message', entityId: conversation.id, entityType: 'conversation',
    url: `/messages/people/${conversation.id}`, eventKey: `direct-message:${message.id}:${recipientId}`,
  });
}

async function markRead(user, conversationId) {
  const conversation = await accessible(user, conversationId);
  const { rows } = await db.query(
    `WITH prev AS (SELECT last_read_at FROM direct_conversation_reads WHERE direct_conversation_id = $1 AND member_id = $2)
     INSERT INTO direct_conversation_reads (direct_conversation_id, member_id, last_read_at) VALUES ($1, $2, NOW())
     ON CONFLICT (direct_conversation_id, member_id) DO UPDATE SET last_read_at = NOW()
     RETURNING (SELECT last_read_at FROM prev) AS previous`, [conversation.id, user.id],
  );
  const previous = rows[0]?.previous ? new Date(rows[0].previous) : null;
  const last = conversation.last_message_at ? new Date(conversation.last_message_at) : null;
  const changed = Boolean(last && (!previous || previous < last));
  if (changed) liveEvents.directMessageRead(conversation);
  return { changed };
}

async function unreadCount(user) {
  requireMember(user);
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM direct_messages m
       JOIN direct_conversations c ON c.id = m.direct_conversation_id
       LEFT JOIN direct_conversation_reads r ON r.direct_conversation_id = c.id AND r.member_id = $1
      WHERE (c.member_one_id = $1 OR c.member_two_id = $1)
        AND m.sender_id <> $1 AND m.deleted_at IS NULL AND NOT (m.hidden_by ? $1::text)
        AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)`,
    [user.id],
  );
  return Number(rows[0]?.count || 0);
}

module.exports = { listMembers, listConversations, startConversation, listMessages, sendMessage, deleteMessage, forwardMessage, markRead, unreadCount, signUpload, validateAttachment };
