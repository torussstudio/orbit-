const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { auth } = require("../middleware/auth");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  computeRefreshExpiry,
} = require("../utils/jwt");
const {
  getRefreshCookieOptions,
  clearAuthCookies,
} = require("../utils/cookies");
const {
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForMember,
  rotateRefreshToken,
} = require("../models/refreshTokens");
const { verifyAccessToken } = require("../utils/jwt");

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

    const user = {
      id: rows[0].id,
      name: rows[0].name,
      email: rows[0].email,
      role: rows[0].role,
      phone: rows[0].phone || null,
      location: rows[0].location || null,
      bio: rows[0].bio || null,
      birthday: rows[0].birthday || null,
      avatar_url: rows[0].avatar_url || null,
    };

    const accessToken = signAccessToken(user);

    const refreshJti = crypto.randomUUID();
    const refreshToken = signRefreshToken(user, refreshJti);
    const refreshExpiresAt = computeRefreshExpiry();
    if (!refreshExpiresAt) {
      return res
        .status(500)
        .json({ error: "Server refresh expiry misconfigured" });
    }

    await createRefreshToken({
      memberId: user.id,
      jti: refreshJti,
      expiresAt: refreshExpiresAt,
      userAgent: req.get("user-agent") || null,
      ipAddress: req.ip || null,
    });

    // Store refresh token as httpOnly cookie; JS never sees it.
    res.cookie("orbit_refresh", refreshToken, getRefreshCookieOptions());

    res.json({
      user,
      accessToken,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// POST /api/auth/refresh
// Rotates refresh token and returns a new access token.
// =========================
// router.post("/refresh", async (req, res) => {
//   const refreshToken = req.cookies?.orbit_refresh;
//   if (!refreshToken) {
//     clearAuthCookies(res);
//     return res.status(401).json({ error: "Not authenticated" });
//   }
router.post("/refresh", async (req, res) => {
  const allowedOrigins = ["http://localhost:3000", "https://orbit.torusdxn.in"];

  const origin = req.get("origin");

  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({
      error: "INVALID_ORIGIN",
    });
  }

  const refreshToken = req.cookies?.orbit_refresh;

  if (!refreshToken) {
    clearAuthCookies(res);

    return res.status(401).json({
      error: "Not authenticated",
    });
  }
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Invalid refresh token" });
  }

  const jti = payload?.jti;
  const memberId = payload?.id || payload?.sub;
  if (!jti || !memberId) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Invalid refresh token" });
  }

  const stored = await findValidRefreshToken(jti);

  if (!stored) {
    // possible token reuse attack
    if (memberId) {
      await revokeAllRefreshTokensForMember(memberId, "token_reuse_detected");
    }

    clearAuthCookies(res);

    return res.status(401).json({
      error: "Refresh token revoked or expired",
    });
  }

  const { rows } = await db.query(
    "SELECT id, name, email, role, skills, active, phone, location, bio, birthday, avatar_url FROM members WHERE id=$1",
    [memberId],
  );
  if (!rows[0] || !rows[0].active) {
    await revokeRefreshToken(jti, "user_inactive_or_missing");
    clearAuthCookies(res);
    return res.status(401).json({ error: "User not found" });
  }

  const user = {
    id: rows[0].id,
    name: rows[0].name,
    email: rows[0].email,
    role: rows[0].role,
    skills: rows[0].skills,
    phone: rows[0].phone || null,
    location: rows[0].location || null,
    bio: rows[0].bio || null,
    birthday: rows[0].birthday || null,
    avatar_url: rows[0].avatar_url || null,
  };

  const newAccessToken = signAccessToken(user);
  const newJti = crypto.randomUUID();
  const newRefreshToken = signRefreshToken(user, newJti);
  const newRefreshExpiresAt = computeRefreshExpiry();
  if (!newRefreshExpiresAt) {
    return res
      .status(500)
      .json({ error: "Server refresh expiry misconfigured" });
  }

  await rotateRefreshToken(jti, { newJti, newExpiresAt: newRefreshExpiresAt });
  res.cookie("orbit_refresh", newRefreshToken, getRefreshCookieOptions());

  return res.json({ user, accessToken: newAccessToken });
});

// =========================
// POST /api/auth/logout
// Clears the auth cookie to invalidate the session.
// =========================
router.post("/logout", async (req, res) => {
  const allowedOrigins = ["http://localhost:3000", "https://orbit.torusdxn.in"];

  const origin = req.get("origin");

  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({
      error: "INVALID_ORIGIN",
    });
  }
  try {
    const refreshToken = req.cookies?.orbit_refresh;

    const authHeader = req.get("authorization") || req.get("Authorization");
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : null;

    let refreshPayload = null;
    if (refreshToken) {
      try {
        refreshPayload = verifyRefreshToken(refreshToken);
      } catch (_) {
        // Best-effort decode even if expired/invalid.
        refreshPayload = jwt.decode(refreshToken) || null;
      }
    }

    // Revoke the exact refresh token session if jti is available.
    if (refreshPayload?.jti) {
      await revokeRefreshToken(refreshPayload.jti, "logout");
    }

    // Also revoke all active refresh sessions for the current user if we can identify them.
    // This prevents token reuse when cookie is missing/not sent and guarantees hard logout.
    let memberId = refreshPayload?.id || refreshPayload?.sub || null;
    if (!memberId && bearerToken) {
      try {
        const accessPayload = verifyAccessToken(bearerToken);
        memberId = accessPayload?.id || accessPayload?.sub || null;
      } catch (_) {
        // ignore access token parse failure
      }
    }
    if (memberId) {
      await revokeAllRefreshTokensForMember(memberId, "logout_all");
    }

    clearAuthCookies(res);
    return res.json({ success: true });
  } catch (e) {
    clearAuthCookies(res);
    return res.status(500).json({
      error: "LOGOUT_FAILED",
      message: "Unable to complete logout cleanup",
    });
  }
});

// =========================
// GET /api/auth/me
// Returns the current user's profile from the DB using the JWT identity.
// The auth middleware validates the cookie before this runs.
// =========================
router.get("/me", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, name, email, role, skills, phone, location, bio, birthday, avatar_url FROM members WHERE id=$1",
      [req.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// PUT /api/auth/profile
// Authenticated user updates their own profile info + optional password.
// =========================
router.put("/profile", auth, async (req, res) => {
  try {
    const { name, email, phone, location, bio, password, avatar_base64 } =
      req.body;
    const memberId = req.user.id;

    // Fetch current row
    const { rows: current } = await db.query(
      "SELECT * FROM members WHERE id=$1",
      [memberId],
    );
    if (!current[0]) return res.status(404).json({ error: "User not found" });

    // Build update fields dynamically
    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      updates.push(`name=$${idx++}`);
      values.push(name);
    }
    if (email !== undefined) {
      updates.push(`email=$${idx++}`);
      values.push(email);
    }
    if (phone !== undefined) {
      updates.push(`phone=$${idx++}`);
      values.push(phone || null);
    }
    if (location !== undefined) {
      updates.push(`location=$${idx++}`);
      values.push(location || null);
    }
    if (bio !== undefined) {
      updates.push(`bio=$${idx++}`);
      values.push(bio || null);
    }

    // Avatar: store base64 string in avatar_url column (or you can write to disk later)
    if (avatar_base64) {
      updates.push(`avatar_url=$${idx++}`);
      values.push(avatar_base64);
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push(`password_hash=$${idx++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      return res.json({ success: true, user: current[0] });
    }

    values.push(memberId);
    const { rows } = await db.query(
      `UPDATE members SET ${updates.join(", ")} WHERE id=$${idx} RETURNING id,name,email,role,phone,location,bio,avatar_url`,
      values,
    );

    res.json({ success: true, user: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =========================
// DELETE /api/auth/account
// Authenticated user deletes their own account.
// =========================
router.delete("/account", auth, async (req, res) => {
  try {
    const memberId = req.user.id;
    await revokeAllRefreshTokensForMember(memberId, "account_deleted");
    await db.query("DELETE FROM members WHERE id=$1", [memberId]);
    clearAuthCookies(res);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
