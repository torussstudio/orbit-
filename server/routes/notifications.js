'use strict';

const router = require('express').Router();
const db     = require('../db');
const { auth } = require('../middleware/auth');

// GET /api/notifications — list latest 50 for current user
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, message, read, created_at
       FROM notifications
       WHERE member_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[notifications] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// PATCH /api/notifications/read-all — mark ALL as read
// NOTE: must be defined BEFORE /:id/read
router.patch('/read-all', auth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE notifications SET read = true WHERE member_id = $1 AND read = false`,
      [req.user.id]
    );
    res.json({ updated: rowCount });
  } catch (err) {
    console.error('[notifications] PATCH /read-all error:', err.message);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE notifications SET read = true
       WHERE id = $1 AND member_id = $2
       RETURNING id, message, read, created_at`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Notification not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[notifications] PATCH /:id/read error:', err.message);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// DELETE /api/notifications/:id — delete one notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM notifications WHERE id = $1 AND member_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[notifications] DELETE /:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// POST /api/notifications/push-subscribe — save push subscription
router.post('/push-subscribe', auth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    await db.query(
      `INSERT INTO push_subscriptions (member_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint)
       DO UPDATE SET member_id = $1, p256dh = $3, auth = $4, created_at = NOW()`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[notifications] POST /push-subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

// DELETE /api/notifications/push-subscribe — remove subscription on logout
router.delete('/push-subscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    await db.query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1 AND member_id = $2`,
      [endpoint, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[notifications] DELETE /push-subscribe error:', err.message);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// GET /api/notifications/vapid-public-key — no auth needed
router.get('/vapid-public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: key });
});

module.exports = router;