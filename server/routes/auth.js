const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { auth, clearAllAuthCookies } = require("../middleware/auth");

// =========================
// 🍪 COOKIE CONFIG HELPER
// Centralised so dev/prod settings stay consistent.
// =========================
const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,           // JS cannot access the cookie — core XSS protection
    secure: isProd,           // HTTPS only in production, allows HTTP in dev
    sameSite: isProd ? 'none' : 'lax', // 'none' required for cross-origin (Vercel ↔ Render); 'lax' is fine in dev
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days — matches JWT expiresIn: '7d'
    path: '/',
  };
};

// =========================
// POST /api/auth/login
// =========================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await db.query(
      "SELECT * FROM members WHERE email=$1 AND active=true",
      [email],
    );
    if (!rows[0]) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: rows[0].id,
        role: rows[0].role,
        name: rows[0].name,
        email: rows[0].email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Set the JWT as an httpOnly cookie — token is never exposed to client-side JS
    res.cookie('orbit_token', token, getCookieOptions());

    // Return the user profile (NOT the token — that lives in the cookie)
    res.json({
      user: {
        id: rows[0].id,
        name: rows[0].name,
        email: rows[0].email,
        role: rows[0].role,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// POST /api/auth/logout
// Clears the auth cookie to invalidate the session.
// =========================
router.post("/logout", (req, res) => {
  // Clear the primary access token and aggressively scrub legacy tokens
  clearAllAuthCookies(res);

  res.json({ success: true });
});

// =========================
// GET /api/auth/me
// Returns the current user's profile from the DB using the JWT identity.
// The auth middleware validates the cookie before this runs.
// =========================
router.get("/me", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, name, email, role, skills FROM members WHERE id=$1",
      [req.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
