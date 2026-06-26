'use strict';

const db = require('../db');

// Save notification row to DB
// The Supabase webhook will automatically trigger the Edge Function
// to send the Web Push whenever a new row is inserted here.
async function createNotification(userId, title, body, data = {}) {
  try {
    const message = body ? `${title}: ${body}` : title;

    const { rows } = await db.query(
      `INSERT INTO notifications (member_id, message)
       VALUES ($1, $2)
       RETURNING id, member_id, message, read, created_at`,
      [userId, message]
    );

    return rows[0];
  } catch (err) {
    console.error('[pushNotify] createNotification failed:', err.message);
    return null;
  }
}

// Send to many users at once (daily reminders)
async function sendToMany(userIds, title, body, data = {}) {
  if (!userIds || !userIds.length) return;
  const BATCH = 10;
  for (let i = 0; i < userIds.length; i += BATCH) {
    const chunk = userIds.slice(i, i + BATCH);
    await Promise.all(chunk.map((id) => createNotification(id, title, body, data)));
  }
}

module.exports = { createNotification, sendToMany };