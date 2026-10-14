// const db = require("../db");
// const liveEvents = require("./liveEvents");
// const { createNotification } = require("../utils/pushNotify");

// /*
//  * Messages between members and the admin team.
//  *
//  * Shared inbox: every member has ONE conversation, with "the admin team".
//  * Every active manager sees every conversation and any of them can reply.
//  * Members only ever see their own conversation. Managers do not have a
//  * conversation of their own.
//  *
//  * Access is checked here, on every call, never only in the UI:
//  *   - a manager can open any conversation,
//  *   - a member only the one whose member_id is their own id.
//  * A conversation the user may not open answers 404, exactly like one that
//  * does not exist, so nobody can find out which ids exist.
//  *
//  * Read state is per person (conversation_reads): one manager reading a
//  * thread does not clear it for the other managers.
//  *
//  * Orbit runs as one Node process, so the send rate limit and the push
//  * throttle below are plain in-memory Maps.
//  */

// const MAX_BODY_LENGTH = 4000;
// const PAGE_SIZE = 30;
// const MAX_PAGE_SIZE = 100;
// const PREVIEW_LENGTH = 140;
// const PUSH_PREVIEW_LENGTH = 120;

// // At most RATE_MAX messages per sender per RATE_WINDOW_MS.
// const RATE_WINDOW_MS = 10 * 1000;
// const RATE_MAX = 20;
// const sendLog = new Map(); // userId -> recent send timestamps

// // Push: at most one per conversation and recipient every PUSH_GAP_MS, and
// // none to someone who has the thread open (their client marks it read every
// // 45 s while it is open, see Messages.jsx).
// const PUSH_GAP_MS = 2 * 60 * 1000;
// const ACTIVE_READER_MS = 60 * 1000;
// const lastPush = new Map(); // `${conversationId}:${recipientId}` -> ms

// const httpError = (status, message) => Object.assign(new Error(message), { status });
// const isManager = (user) => user?.role === "manager";
// const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

// // An id in the URL that is not a valid number / uuid makes Postgres throw
// // 22P02. That is "not found", not a server error.
// async function query(text, params, notFoundMessage = "Conversation not found.") {
//   try {
//     return await db.query(text, params);
//   } catch (err) {
//     if (err.code === "22P02") throw httpError(404, notFoundMessage);
//     throw err;
//   }
// }

// function checkRate(userId) {
//   const key = String(userId);
//   const now = Date.now();
//   const recent = (sendLog.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);

//   if (recent.length >= RATE_MAX) {
//     sendLog.set(key, recent);
//     throw httpError(429, "You are sending messages too fast. Wait a few seconds and try again.");
//   }

//   recent.push(now);
//   sendLog.set(key, recent);
// }

// function cleanBody(value) {
//   if (typeof value !== "string") throw httpError(400, "Write a message first.");

//   const body = value
//     .replace(/\u0000/g, "")
//     .replace(/\r\n?/g, "\n")
//     .trim();

//   if (!body) throw httpError(400, "Write a message first.");
//   if (body.length > MAX_BODY_LENGTH) {
//     throw httpError(400, `A message can be at most ${MAX_BODY_LENGTH} characters.`);
//   }
//   return body;
// }

// const CONVERSATION_SELECT = `
//   SELECT c.id, c.member_id, c.last_message_at, c.created_at,
//          m.name AS member_name, m.email AS member_email,
//          m.avatar_url AS member_avatar_url, m.active AS member_active
//     FROM conversations c
//     JOIN members m ON m.id = c.member_id
// `;

// const publicConversation = (c) => ({
//   id: c.id,
//   member_id: c.member_id,
//   member_name: c.member_name,
//   member_email: c.member_email,
//   member_avatar_url: c.member_avatar_url,
//   member_active: c.member_active,
//   last_message_at: c.last_message_at,
// });

// // The conversation, if this user may open it. 404 otherwise.
// async function getAccessibleConversation(user, conversationId) {
//   const { rows } = await query(`${CONVERSATION_SELECT} WHERE c.id = $1`, [conversationId]);
//   const conversation = rows[0];

//   if (!conversation) throw httpError(404, "Conversation not found.");
//   if (!isManager(user) && !sameId(conversation.member_id, user.id)) {
//     throw httpError(404, "Conversation not found.");
//   }
//   return conversation;
// }

// // A member's conversation, created the first time it is needed.
// async function ensureConversation(memberId) {
//   await db.query(
//     `INSERT INTO conversations (member_id) VALUES ($1)
//      ON CONFLICT (member_id) DO NOTHING`,
//     [memberId]
//   );
//   const { rows } = await db.query(`${CONVERSATION_SELECT} WHERE c.member_id = $1`, [memberId]);
//   return rows[0] || null;
// }

// // When the other side last read this conversation ("Seen").
// //   manager viewing: when the member read it,
// //   member viewing:  the latest read by any manager.
// async function otherSideReadAt(conversation, user) {
//   const { rows } = isManager(user)
//     ? await db.query(
//         `SELECT last_read_at AS at
//            FROM conversation_reads
//           WHERE conversation_id = $1 AND member_id = $2`,
//         [conversation.id, conversation.member_id]
//       )
//     : await db.query(
//         `SELECT MAX(last_read_at) AS at
//            FROM conversation_reads
//           WHERE conversation_id = $1 AND member_id <> $2`,
//         [conversation.id, conversation.member_id]
//       );
//   return rows[0]?.at || null;
// }

// /* -------------------------------------------------------------------------- */
// /* Lists                                                                      */
// /* -------------------------------------------------------------------------- */

// // Manager inbox: every active member, with or without messages, most recent
// // conversation first. unread = the member's messages this manager has not
// // read yet (replies from other managers never count as unread).
// const listConversations = async (user) => {
//   const { rows } = await db.query(
//     `SELECT m.id AS member_id, m.name, m.email, m.avatar_url,
//             c.id AS conversation_id, c.last_message_at,
//             lm.body AS last_body, lm.sender_id AS last_sender_id,
//             lm.created_at AS last_created_at,
//             COALESCE(u.unread, 0)::int AS unread
//        FROM members m
//        LEFT JOIN conversations c ON c.member_id = m.id
//        LEFT JOIN LATERAL (
//          SELECT LEFT(x.body, ${PREVIEW_LENGTH}) AS body, x.sender_id, x.created_at
//            FROM messages x
//           WHERE x.conversation_id = c.id
//           ORDER BY x.created_at DESC, x.id DESC
//           LIMIT 1
//        ) lm ON true
//        LEFT JOIN conversation_reads r
//               ON r.conversation_id = c.id AND r.member_id = $1
//        LEFT JOIN LATERAL (
//          SELECT COUNT(*) AS unread
//            FROM messages x
//           WHERE x.conversation_id = c.id
//             AND x.sender_id = c.member_id
//             AND x.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
//        ) u ON true
//       WHERE m.role = 'member' AND m.active = true
//       ORDER BY c.last_message_at DESC NULLS LAST, m.name ASC`,
//     [user.id]
//   );

//   return rows.map((row) => ({
//     member_id: row.member_id,
//     name: row.name,
//     email: row.email,
//     avatar_url: row.avatar_url,
//     conversation_id: row.conversation_id,
//     last_message_at: row.last_message_at,
//     last_message: row.last_created_at
//       ? { body: row.last_body, sender_id: row.last_sender_id, created_at: row.last_created_at }
//       : null,
//     unread: row.unread,
//   }));
// };

// // Manager opens a member who has never been messaged.
// const startConversation = async (user, memberId) => {
//   if (memberId === undefined || memberId === null || memberId === "") {
//     throw httpError(400, "Choose a member.");
//   }

//   const { rows } = await query(
//     "SELECT id, role, active FROM members WHERE id = $1",
//     [memberId],
//     "Member not found."
//   );
//   const member = rows[0];

//   if (!member || member.role !== "member") throw httpError(404, "Member not found.");
//   if (!member.active) throw httpError(400, "This member is no longer active.");

//   return publicConversation(await ensureConversation(member.id));
// };

// // A member's own conversation with the admin team.
// const myConversation = async (user) => {
//   if (isManager(user)) throw httpError(403, "Managers use the inbox.");
//   return publicConversation(await ensureConversation(user.id));
// };

// /* -------------------------------------------------------------------------- */
// /* Messages                                                                   */
// /* -------------------------------------------------------------------------- */

// /*
//  * One page of messages, oldest first in the result.
//  *   no cursor:     the newest page. has_more = older messages exist.
//  *   before=<id>:   the page before that message. has_more = still older.
//  *   after=<id>:    messages newer than that one (live updates).
//  *                  has_more = even more are waiting.
//  */
// const listMessages = async (user, conversationId, { before, after, limit } = {}) => {
//   const conversation = await getAccessibleConversation(user, conversationId);

//   const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(limit, 10) || PAGE_SIZE));
//   const params = [conversation.id];
//   let where = "msg.conversation_id = $1";
//   let order = "DESC";

//   if (after) {
//     params.push(after);
//     where += ` AND (msg.created_at, msg.id) > (
//       SELECT created_at, id FROM messages WHERE id = $2 AND conversation_id = $1
//     )`;
//     order = "ASC";
//   } else if (before) {
//     params.push(before);
//     where += ` AND (msg.created_at, msg.id) < (
//       SELECT created_at, id FROM messages WHERE id = $2 AND conversation_id = $1
//     )`;
//   }

//   params.push(size + 1);
//   const { rows } = await query(
//     `SELECT msg.id, msg.conversation_id, msg.sender_id, msg.body, msg.created_at,
//             s.name AS sender_name, s.role AS sender_role
//        FROM messages msg
//        LEFT JOIN members s ON s.id = msg.sender_id
//       WHERE ${where}
//       ORDER BY msg.created_at ${order}, msg.id ${order}
//       LIMIT $${params.length}`,
//     params
//   );

//   const hasMore = rows.length > size;
//   const page = rows.slice(0, size);

//   return {
//     conversation: publicConversation(conversation),
//     messages: order === "DESC" ? page.reverse() : page,
//     has_more: hasMore,
//     other_read_at: await otherSideReadAt(conversation, user),
//   };
// };

// const sendMessage = async (user, conversationId, rawBody) => {
//   const conversation = await getAccessibleConversation(user, conversationId);

//   if (!conversation.member_active) {
//     throw httpError(400, "This member is no longer active, so the conversation is read-only.");
//   }

//   const body = cleanBody(rawBody);
//   checkRate(user.id);

//   const client = await db.connect();
//   let message;
//   try {
//     await client.query("BEGIN");

//     const { rows } = await client.query(
//       `INSERT INTO messages (conversation_id, sender_id, body)
//        VALUES ($1, $2, $3)
//        RETURNING id, conversation_id, sender_id, body, created_at`,
//       [conversation.id, user.id, body]
//     );
//     message = rows[0];

//     await client.query(
//       "UPDATE conversations SET last_message_at = $2 WHERE id = $1",
//       [conversation.id, message.created_at]
//     );

//     // Sending counts as having read everything up to here.
//     await client.query(
//       `INSERT INTO conversation_reads (conversation_id, member_id, last_read_at)
//        VALUES ($1, $2, $3)
//        ON CONFLICT (conversation_id, member_id)
//        DO UPDATE SET last_read_at = GREATEST(conversation_reads.last_read_at, EXCLUDED.last_read_at)`,
//       [conversation.id, user.id, message.created_at]
//     );

//     const { rows: sender } = await client.query(
//       "SELECT name, role FROM members WHERE id = $1",
//       [user.id]
//     );
//     message.sender_name = sender[0]?.name || null;
//     message.sender_role = sender[0]?.role || user.role || null;

//     await client.query("COMMIT");
//   } catch (err) {
//     await client.query("ROLLBACK").catch(() => {});
//     throw err;
//   } finally {
//     client.release();
//   }

//   // After the commit: live update, then push. Neither can fail the request.
//   liveEvents.messageCreated(conversation);
//   notifyRecipients(conversation, message).catch((err) => {
//     console.error("[messages] push failed:", err?.message);
//   });

//   return message;
// };

// // Push to the other side: a member's message goes to every active manager,
// // a manager's message goes to the member.
// async function notifyRecipients(conversation, message) {
//   const fromMember = sameId(message.sender_id, conversation.member_id);

//   let recipients;
//   if (fromMember) {
//     const { rows } = await db.query(
//       "SELECT id FROM members WHERE role = 'manager' AND active = true"
//     );
//     recipients = rows.map((row) => row.id);
//   } else {
//     recipients = [conversation.member_id];
//   }

//   recipients = recipients.filter((id) => !sameId(id, message.sender_id));
//   if (recipients.length === 0) return;

//   // Nobody gets a push for a thread they have open right now.
//   const { rows: reads } = await db.query(
//     `SELECT member_id, last_read_at
//        FROM conversation_reads
//       WHERE conversation_id = $1 AND member_id = ANY($2)`,
//     [conversation.id, recipients]
//   );
//   const now = Date.now();
//   const activeReaders = new Set(
//     reads
//       .filter((row) => now - new Date(row.last_read_at).getTime() < ACTIVE_READER_MS)
//       .map((row) => String(row.member_id))
//   );

//   const flat = message.body.replace(/\s+/g, " ");
//   const preview = flat.length > PUSH_PREVIEW_LENGTH
//     ? `${flat.slice(0, PUSH_PREVIEW_LENGTH - 1)}…`
//     : flat;
//   const title = `Message from ${message.sender_name || (fromMember ? "a member" : "the admin team")}`;
//   const url = fromMember ? `/messages/${conversation.member_id}` : "/messages";

//   for (const recipientId of recipients) {
//     if (activeReaders.has(String(recipientId))) continue;

//     const key = `${conversation.id}:${recipientId}`;
//     if (now - (lastPush.get(key) || 0) < PUSH_GAP_MS) continue;
//     lastPush.set(key, now);

//     await createNotification(recipientId, title, preview, {
//       type: "message",
//       entityId: conversation.id,
//       entityType: "conversation",
//       url,
//       eventKey: `message:${message.id}:${recipientId}`,
//     });
//   }
// }

// /*
//  * The user has the thread open: everything up to now is read. The client
//  * also calls this every 45 s while the thread is open, which is how the
//  * push code above knows not to push to them.
//  * changed = there were unread messages, so the other side's "Seen" and the
//  * unread badges have something to update (only then is an event sent).
//  */
// const markRead = async (user, conversationId) => {
//   const conversation = await getAccessibleConversation(user, conversationId);

//   const { rows } = await db.query(
//     `WITH prev AS (
//        SELECT last_read_at
//          FROM conversation_reads
//         WHERE conversation_id = $1 AND member_id = $2
//      )
//      INSERT INTO conversation_reads (conversation_id, member_id, last_read_at)
//      VALUES ($1, $2, NOW())
//      ON CONFLICT (conversation_id, member_id) DO UPDATE SET last_read_at = NOW()
//      RETURNING (SELECT last_read_at FROM prev) AS previous`,
//     [conversation.id, user.id]
//   );

//   const previous = rows[0]?.previous ? new Date(rows[0].previous) : null;
//   const lastMessage = conversation.last_message_at ? new Date(conversation.last_message_at) : null;
//   const changed = Boolean(lastMessage && (!previous || previous < lastMessage));

//   if (changed) liveEvents.messageRead(conversation);
//   return { changed };
// };

// // Sidebar badge.
// //   manager: members' messages this manager has not read, active members only
// //   member:  admin team messages in their own conversation not read yet
// const unreadCount = async (user) => {
//   const { rows } = isManager(user)
//     ? await db.query(
//         `SELECT COUNT(*)::int AS count
//            FROM messages x
//            JOIN conversations c ON c.id = x.conversation_id
//            JOIN members m ON m.id = c.member_id AND m.role = 'member' AND m.active = true
//            LEFT JOIN conversation_reads r
//                   ON r.conversation_id = c.id AND r.member_id = $1
//           WHERE x.sender_id = c.member_id
//             AND x.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)`,
//         [user.id]
//       )
//     : await db.query(
//         `SELECT COUNT(*)::int AS count
//            FROM messages x
//            JOIN conversations c ON c.id = x.conversation_id
//            LEFT JOIN conversation_reads r
//                   ON r.conversation_id = c.id AND r.member_id = $1
//           WHERE c.member_id = $1
//             AND x.sender_id IS DISTINCT FROM c.member_id
//             AND x.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)`,
//         [user.id]
//       );

//   return { count: rows[0]?.count || 0 };
// };

// module.exports = {
//   MAX_BODY_LENGTH,
//   listConversations,
//   startConversation,
//   myConversation,
//   listMessages,
//   sendMessage,
//   markRead,
//   unreadCount,
// };




const db = require("../db");
const liveEvents = require("./liveEvents");
const { createNotification } = require("../utils/pushNotify");
const { validateAttachment } = require("./directMessageService");

/*
 * Messages between members and the admin team.
 *
 * Shared inbox: every member has ONE conversation, with "the admin team".
 * Every active manager sees every conversation and any of them can reply.
 * Members only ever see their own conversation. Managers do not have a
 * conversation of their own.
 *
 * Access is checked here, on every call, never only in the UI:
 *   - a manager can open any conversation,
 *   - a member only the one whose member_id is their own id.
 * A conversation the user may not open answers 404, exactly like one that
 * does not exist, so nobody can find out which ids exist.
 *
 * Read state is per person (conversation_reads): one manager reading a
 * thread does not clear it for the other managers.
 *
 * Orbit runs as one Node process, so the send rate limit and the push
 * throttle below are plain in-memory Maps.
 */

const MAX_BODY_LENGTH = 4000;
const MAX_ATTACHMENTS = 3;
const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const PREVIEW_LENGTH = 140;
const PUSH_PREVIEW_LENGTH = 120;

// At most RATE_MAX messages per sender per RATE_WINDOW_MS.
const RATE_WINDOW_MS = 10 * 1000;
const RATE_MAX = 20;
const sendLog = new Map(); // userId -> recent send timestamps

// Push: at most one per conversation and recipient every PUSH_GAP_MS, and
// none to someone who has the thread open (their client marks it read every
// 45 s while it is open, see Messages.jsx).
const PUSH_GAP_MS = 2 * 60 * 1000;
const ACTIVE_READER_MS = 60 * 1000;
const lastPush = new Map(); // `${conversationId}:${recipientId}` -> ms
// Who has a thread open on screen right now. Set ONLY by markRead (the
// client calls it on open and every 45 s while the tab is visible), never by
// sending, so replying and then leaving does not block the next push.
// In memory: the app runs as one Node process.
const viewing = new Map(); // `${conversationId}:${memberId}` -> ms

const httpError = (status, message) => Object.assign(new Error(message), { status });
const isManager = (user) => user?.role === "manager";
const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

// An id in the URL that is not a valid number / uuid makes Postgres throw
// 22P02. That is "not found", not a server error.
async function query(text, params, notFoundMessage = "Conversation not found.") {
  try {
    return await db.query(text, params);
  } catch (err) {
    if (err.code === "22P02") throw httpError(404, notFoundMessage);
    throw err;
  }
}

function checkRate(userId) {
  const key = String(userId);
  const now = Date.now();
  const recent = (sendLog.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);

  if (recent.length >= RATE_MAX) {
    sendLog.set(key, recent);
    throw httpError(429, "You are sending messages too fast. Wait a few seconds and try again.");
  }

  recent.push(now);
  sendLog.set(key, recent);
}

function cleanBody(value) {
  if (typeof value !== "string") throw httpError(400, "Write a message first.");

  const body = value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!body) throw httpError(400, "Write a message first.");
  if (body.length > MAX_BODY_LENGTH) {
    throw httpError(400, `A message can be at most ${MAX_BODY_LENGTH} characters.`);
  }
  return body;
}

const CONVERSATION_SELECT = `
  SELECT c.id, c.member_id, c.last_message_at, c.created_at,
         m.name AS member_name, m.email AS member_email,
         m.avatar_url AS member_avatar_url, m.active AS member_active
    FROM conversations c
    JOIN members m ON m.id = c.member_id
`;

const publicConversation = (c) => ({
  id: c.id,
  member_id: c.member_id,
  member_name: c.member_name,
  member_email: c.member_email,
  member_avatar_url: c.member_avatar_url,
  member_active: c.member_active,
  last_message_at: c.last_message_at,
});

// The conversation, if this user may open it. 404 otherwise.
async function getAccessibleConversation(user, conversationId) {
  const { rows } = await query(`${CONVERSATION_SELECT} WHERE c.id = $1`, [conversationId]);
  const conversation = rows[0];

  if (!conversation) throw httpError(404, "Conversation not found.");
  if (!isManager(user) && !sameId(conversation.member_id, user.id)) {
    throw httpError(404, "Conversation not found.");
  }
  return conversation;
}

// A member's conversation, created the first time it is needed.
async function ensureConversation(memberId) {
  await db.query(
    `INSERT INTO conversations (member_id) VALUES ($1)
     ON CONFLICT (member_id) DO NOTHING`,
    [memberId]
  );
  const { rows } = await db.query(`${CONVERSATION_SELECT} WHERE c.member_id = $1`, [memberId]);
  return rows[0] || null;
}

// When the other side last read this conversation ("Seen").
//   manager viewing: when the member read it,
//   member viewing:  the latest read by any manager.
async function otherSideReadAt(conversation, user) {
  const { rows } = isManager(user)
    ? await db.query(
        `SELECT last_read_at AS at
           FROM conversation_reads
          WHERE conversation_id = $1 AND member_id = $2`,
        [conversation.id, conversation.member_id]
      )
    : await db.query(
        `SELECT MAX(last_read_at) AS at
           FROM conversation_reads
          WHERE conversation_id = $1 AND member_id <> $2`,
        [conversation.id, conversation.member_id]
      );
  return rows[0]?.at || null;
}

/* -------------------------------------------------------------------------- */
/* Lists                                                                      */
/* -------------------------------------------------------------------------- */

// Manager inbox: every active member, with or without messages, most recent
// conversation first. unread = the member's messages this manager has not
// read yet (replies from other managers never count as unread).
const listConversations = async (user) => {
  const { rows } = await db.query(
    `SELECT m.id AS member_id, m.name, m.email, m.avatar_url,
            c.id AS conversation_id, c.last_message_at,
            lm.body AS last_body, lm.attachments AS last_attachments, lm.sender_id AS last_sender_id,
            lm.created_at AS last_created_at,
            COALESCE(u.unread, 0)::int AS unread
       FROM members m
       LEFT JOIN conversations c ON c.member_id = m.id
       LEFT JOIN LATERAL (
         SELECT LEFT(x.body, ${PREVIEW_LENGTH}) AS body, x.attachments, x.sender_id, x.created_at
           FROM messages x
          WHERE x.conversation_id = c.id AND x.deleted_at IS NULL AND NOT (x.hidden_by ? $1::text)
          ORDER BY x.created_at DESC, x.id DESC
          LIMIT 1
       ) lm ON true
       LEFT JOIN conversation_reads r
              ON r.conversation_id = c.id AND r.member_id = $1
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS unread
           FROM messages x
          WHERE x.conversation_id = c.id
            AND x.sender_id = c.member_id
            AND x.deleted_at IS NULL AND NOT (x.hidden_by ? $1::text)
            AND x.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
       ) u ON true
      WHERE m.role = 'member' AND m.active = true
      ORDER BY c.last_message_at DESC NULLS LAST, m.name ASC`,
    [user.id]
  );

  return rows.map((row) => ({
    member_id: row.member_id,
    name: row.name,
    email: row.email,
    avatar_url: row.avatar_url,
    conversation_id: row.conversation_id,
    last_message_at: row.last_message_at,
    last_message: row.last_created_at
      ? { body: row.last_body, attachments: row.last_attachments || [], sender_id: row.last_sender_id, created_at: row.last_created_at }
      : null,
    unread: row.unread,
  }));
};

// Manager opens a member who has never been messaged.
const startConversation = async (user, memberId) => {
  if (memberId === undefined || memberId === null || memberId === "") {
    throw httpError(400, "Choose a member.");
  }

  const { rows } = await query(
    "SELECT id, role, active FROM members WHERE id = $1",
    [memberId],
    "Member not found."
  );
  const member = rows[0];

  if (!member || member.role !== "member") throw httpError(404, "Member not found.");
  if (!member.active) throw httpError(400, "This member is no longer active.");

  return publicConversation(await ensureConversation(member.id));
};

// A member's own conversation with the admin team.
const myConversation = async (user) => {
  if (isManager(user)) throw httpError(403, "Managers use the inbox.");
  return publicConversation(await ensureConversation(user.id));
};

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

/*
 * One page of messages, oldest first in the result.
 *   no cursor:     the newest page. has_more = older messages exist.
 *   before=<id>:   the page before that message. has_more = still older.
 *   after=<id>:    messages newer than that one (live updates).
 *                  has_more = even more are waiting.
 */
const listMessages = async (user, conversationId, { before, after, limit } = {}) => {
  const conversation = await getAccessibleConversation(user, conversationId);

  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(limit, 10) || PAGE_SIZE));
  const params = [conversation.id];
  let where = "msg.conversation_id = $1";
  let order = "DESC";

  if (after) {
    params.push(after);
    where += ` AND (msg.created_at, msg.id) > (
      SELECT created_at, id FROM messages WHERE id = $2 AND conversation_id = $1
    )`;
    order = "ASC";
  } else if (before) {
    params.push(before);
    where += ` AND (msg.created_at, msg.id) < (
      SELECT created_at, id FROM messages WHERE id = $2 AND conversation_id = $1
    )`;
  }

  params.push(size + 1);
  const { rows } = await query(
    `SELECT msg.id, msg.conversation_id, msg.sender_id,
            CASE WHEN msg.deleted_at IS NOT NULL THEN '' ELSE msg.body END AS body, msg.attachments, msg.created_at,
            msg.reply_to_message_id, msg.forwarded_from_id, msg.deleted_at IS NOT NULL AS deleted,
            rm.body AS reply_body, rs.name AS reply_sender_name,
            s.name AS sender_name, s.role AS sender_role
       FROM messages msg
       LEFT JOIN members s ON s.id = msg.sender_id
       LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
       LEFT JOIN members rs ON rs.id = rm.sender_id
      WHERE ${where}
        AND NOT (msg.hidden_by ? $${params.length + 1})
      ORDER BY msg.created_at ${order}, msg.id ${order}
      LIMIT $${params.length}`,
    [...params, String(user.id)]
  );

  const hasMore = rows.length > size;
  const page = rows.slice(0, size);

  return {
    conversation: publicConversation(conversation),
    messages: order === "DESC" ? page.reverse() : page,
    has_more: hasMore,
    other_read_at: await otherSideReadAt(conversation, user),
  };
};

const sendMessage = async (user, conversationId, rawBody, rawAttachments = [], replyToId = null) => {
  const conversation = await getAccessibleConversation(user, conversationId);

  if (!conversation.member_active) {
    throw httpError(400, "This member is no longer active, so the conversation is read-only.");
  }

  const body = typeof rawBody === 'string' ? rawBody.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim() : '';
  if (body.length > MAX_BODY_LENGTH) throw httpError(400, `A message can be at most ${MAX_BODY_LENGTH} characters.`);
  if (!Array.isArray(rawAttachments) || rawAttachments.length > MAX_ATTACHMENTS) throw httpError(400, 'A message can include up to 3 attachments.');
  if (!body && rawAttachments.length === 0) throw httpError(400, 'Write a message or attach a file first.');
  checkRate(user.id);

  const client = await db.connect();
  let message;
  try {
    await client.query("BEGIN");

    if (replyToId) {
      const reply = await client.query("SELECT id FROM messages WHERE id = $1 AND conversation_id = $2 AND deleted_at IS NULL", [replyToId, conversation.id]);
      if (!reply.rows[0]) throw httpError(400, "The message you are replying to is unavailable.");
    }

    const used = new Set();
    const attachments = [];
    for (const item of rawAttachments) {
      const publicId = String(item?.public_id || '');
      if (!publicId || used.has(publicId)) throw httpError(400, 'Invalid or duplicate attachment.');
      used.add(publicId);
      const { rows: intents } = await client.query(
        `SELECT public_id, mime_type, file_size, resource_type FROM direct_upload_intents
          WHERE public_id = $1 AND member_id = $2 AND expires_at > NOW() FOR UPDATE`,
        [publicId, user.id],
      );
      if (!intents[0]) throw httpError(400, 'The upload expired. Please attach the file again.');
      attachments.push(validateAttachment(item, intents[0]));
    }

    const { rows } = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, body, attachments, reply_to_message_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, conversation_id, sender_id, body, attachments, created_at, reply_to_message_id`,
      [conversation.id, user.id, body, JSON.stringify(attachments), replyToId || null]
    );
    message = rows[0];

    await client.query(
      "UPDATE conversations SET last_message_at = $2 WHERE id = $1",
      [conversation.id, message.created_at]
    );

    // Sending counts as having read everything up to here.
    await client.query(
      `INSERT INTO conversation_reads (conversation_id, member_id, last_read_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, member_id)
       DO UPDATE SET last_read_at = GREATEST(conversation_reads.last_read_at, EXCLUDED.last_read_at)`,
      [conversation.id, user.id, message.created_at]
    );

    const { rows: sender } = await client.query(
      "SELECT name, role FROM members WHERE id = $1",
      [user.id]
    );
    message.sender_name = sender[0]?.name || null;
    message.sender_role = sender[0]?.role || user.role || null;

    if (used.size) await client.query('DELETE FROM direct_upload_intents WHERE public_id = ANY($1::text[])', [[...used]]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // After the commit: live update, then push. Neither can fail the request.
  liveEvents.messageCreated(conversation);
  notifyRecipients(conversation, message).catch((err) => {
    console.error("[messages] push failed:", err?.message);
  });

  return message;
};

const deleteMessage = async (user, conversationId, messageId, mode) => {
  const conversation = await getAccessibleConversation(user, conversationId);
  if (!['for-me', 'for-everyone'].includes(mode)) throw httpError(400, 'Choose whether to delete the message for you or everyone.');
  const { rows } = await query('SELECT id, sender_id FROM messages WHERE id = $1 AND conversation_id = $2', [messageId, conversation.id]);
  const message = rows[0];
  if (!message) throw httpError(404, 'Message not found.');
  if (mode === 'for-everyone' && !sameId(message.sender_id, user.id)) throw httpError(403, 'You can only delete your own message for everyone.');
  if (mode === 'for-everyone') await query("UPDATE messages SET deleted_at = COALESCE(deleted_at, NOW()), body = 'This message was deleted', attachments = '[]'::jsonb WHERE id = $1", [messageId]);
  else await query("UPDATE messages SET hidden_by = CASE WHEN hidden_by ? $2 THEN hidden_by ELSE hidden_by || to_jsonb($2::text) END WHERE id = $1", [messageId, String(user.id)]);
  liveEvents.messageCreated(conversation);
  return { success: true };
};

const forwardMessage = async (user, sourceConversationId, messageId, targetConversationId) => {
  const source = await getAccessibleConversation(user, sourceConversationId);
  const target = await getAccessibleConversation(user, targetConversationId);
  const { rows } = await query('SELECT id, body, attachments, deleted_at FROM messages WHERE id = $1 AND conversation_id = $2', [messageId, source.id]);
  const original = rows[0];
  if (!original || original.deleted_at) throw httpError(404, 'Message not found or already deleted.');
  const inserted = await query(`INSERT INTO messages (conversation_id, sender_id, body, attachments, forwarded_from_id)
    VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id, conversation_id, sender_id, body, attachments, created_at, forwarded_from_id`,
    [target.id, user.id, original.body, JSON.stringify(original.attachments || []), original.id]);
  const message = inserted.rows[0];
  await query('UPDATE conversations SET last_message_at = $2 WHERE id = $1', [target.id, message.created_at]);
  liveEvents.messageCreated(target);
  notifyRecipients(target, message).catch((err) => console.error('[messages] push failed:', err?.message));
  return message;
};

// Push to the other side: a member's message goes to every active manager,
// a manager's message goes to the member.
async function notifyRecipients(conversation, message) {
  const fromMember = sameId(message.sender_id, conversation.member_id);

  let recipients;
  if (fromMember) {
    const { rows } = await db.query(
      "SELECT id FROM members WHERE role = 'manager' AND active = true"
    );
    recipients = rows.map((row) => row.id);
  } else {
    recipients = [conversation.member_id];
  }

  recipients = recipients.filter((id) => !sameId(id, message.sender_id));
  if (recipients.length === 0) return;

  // Nobody gets a push for a thread they have open on screen right now.
  const now = Date.now();
  const isViewing = (id) =>
    now - (viewing.get(`${conversation.id}:${id}`) || 0) < ACTIVE_READER_MS;

  const flat = message.body.replace(/\s+/g, " ");
  const preview = !flat && message.attachments?.length ? 'Sent an attachment' : flat.length > PUSH_PREVIEW_LENGTH
    ? `${flat.slice(0, PUSH_PREVIEW_LENGTH - 1)}…`
    : flat;
  const title = `Message from ${message.sender_name || (fromMember ? "a member" : "the admin team")}`;
  const url = fromMember ? `/messages/${conversation.member_id}` : "/messages";

  for (const recipientId of recipients) {
    if (isViewing(recipientId)) continue;

    const key = `${conversation.id}:${recipientId}`;
    if (now - (lastPush.get(key) || 0) < PUSH_GAP_MS) continue;
    lastPush.set(key, now);

    await createNotification(recipientId, title, preview, {
      type: "message",
      entityId: conversation.id,
      entityType: "conversation",
      url,
      eventKey: `message:${message.id}:${recipientId}`,
    });
  }
}

/*
 * The user has the thread open: everything up to now is read. The client
 * also calls this every 45 s while the thread is open, which is how the
 * push code above knows not to push to them.
 * changed = there were unread messages, so the other side's "Seen" and the
 * unread badges have something to update (only then is an event sent).
 */
const markRead = async (user, conversationId) => {
  const conversation = await getAccessibleConversation(user, conversationId);

  // On screen now: no push for this thread, and once they have read it the
  // next new message may push again straight away.
  const key = `${conversation.id}:${user.id}`;
  viewing.set(key, Date.now());
  lastPush.delete(key);

  const { rows } = await db.query(
    `WITH prev AS (
       SELECT last_read_at
         FROM conversation_reads
        WHERE conversation_id = $1 AND member_id = $2
     )
     INSERT INTO conversation_reads (conversation_id, member_id, last_read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (conversation_id, member_id) DO UPDATE SET last_read_at = NOW()
     RETURNING (SELECT last_read_at FROM prev) AS previous`,
    [conversation.id, user.id]
  );

  const previous = rows[0]?.previous ? new Date(rows[0].previous) : null;
  const lastMessage = conversation.last_message_at ? new Date(conversation.last_message_at) : null;
  const changed = Boolean(lastMessage && (!previous || previous < lastMessage));

  if (changed) liveEvents.messageRead(conversation);
  return { changed };
};

// Sidebar badge.
//   manager: members' messages this manager has not read, active members only
//   member:  admin team messages in their own conversation not read yet
const unreadCount = async (user) => {
  const { rows } = isManager(user)
    ? await db.query(
        `SELECT COUNT(*)::int AS count
           FROM messages x
           JOIN conversations c ON c.id = x.conversation_id
           JOIN members m ON m.id = c.member_id AND m.role = 'member' AND m.active = true
           LEFT JOIN conversation_reads r
                  ON r.conversation_id = c.id AND r.member_id = $1
          WHERE x.sender_id = c.member_id
            AND x.deleted_at IS NULL AND NOT (x.hidden_by ? $1::text)
            AND x.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)`,
        [user.id]
      )
    : await db.query(
        `SELECT COUNT(*)::int AS count
           FROM messages x
           JOIN conversations c ON c.id = x.conversation_id
           LEFT JOIN conversation_reads r
                  ON r.conversation_id = c.id AND r.member_id = $1
          WHERE c.member_id = $1
            AND x.sender_id IS DISTINCT FROM c.member_id
            AND x.deleted_at IS NULL AND NOT (x.hidden_by ? $1::text)
            AND x.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)`,
        [user.id]
      );

  return { count: rows[0]?.count || 0 };
};

module.exports = {
  MAX_BODY_LENGTH,
  listConversations,
  startConversation,
  myConversation,
  listMessages,
  sendMessage,
  deleteMessage,
  forwardMessage,
  markRead,
  unreadCount,
};
