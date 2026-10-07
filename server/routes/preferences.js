const router = require("express").Router();
const db = require("../db");
const { auth } = require("../middleware/auth");

/*
 * Per-user UI preferences. For now: theme ('light' | 'dark' | 'system').
 *
 * Stored on members.theme so the choice follows the user to every device.
 * NULL means the user never picked one (the app then uses light).
 */

const THEMES = ["light", "dark", "system"];

// Add the column once, the first time it is needed (safe on a live DB).
let ready = null;
function ensureColumn() {
  if (!ready) {
    ready = db
      .query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS theme VARCHAR(10)`)
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

router.get("/theme", auth, async (req, res, next) => {
  try {
    await ensureColumn();
    const { rows } = await db.query(
      `SELECT theme FROM members WHERE id = $1 LIMIT 1`,
      [req.user.id],
    );
    const theme = rows[0]?.theme;
    res.json({ theme: THEMES.includes(theme) ? theme : null });
  } catch (err) {
    next(err);
  }
});

router.put("/theme", auth, async (req, res, next) => {
  const theme = req.body?.theme;

  if (!THEMES.includes(theme)) {
    return res.status(400).json({ error: "Theme must be light, dark or system" });
  }

  try {
    await ensureColumn();
    await db.query(`UPDATE members SET theme = $1 WHERE id = $2`, [theme, req.user.id]);
    res.json({ theme });
  } catch (err) {
    next(err);
  }
});

module.exports = router;