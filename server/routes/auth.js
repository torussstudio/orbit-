const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

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
    res.json({
      token,
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

router.get("/me", require("../middleware/auth").auth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT id,name,email,role,skills FROM members WHERE id=$1",
    [req.user.id],
  );
  res.json(rows[0]);
});

module.exports = router;
