const router = require("express").Router();
const db = require("../db");
const { auth } = require("../middleware/auth");

// GET all notifications for current user
router.get("/", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, message, read, created_at FROM notifications WHERE member_id=$1 ORDER BY created_at DESC LIMIT 50",
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark notification as read
router.patch("/:id/read", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      "UPDATE notifications SET read=true WHERE id=$1 AND member_id=$2 RETURNING id, message, read, created_at",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create notification (internal use)
router.post("/", auth, async (req, res) => {
  try {
    const { member_id, message } = req.body;
    const { rows } = await db.query(
      "INSERT INTO notifications(member_id, message) VALUES($1, $2) RETURNING id, message, read, created_at",
      [member_id, message]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
