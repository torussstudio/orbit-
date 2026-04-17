const router = require("express").Router();
const bcrypt = require("bcryptjs");
const db = require("../db");
const { auth, managerOnly } = require("../middleware/auth");

// GET all members
router.get("/", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id,name,email,role,birthday,skills,active,created_at FROM members ORDER BY created_at",
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET member suggestions with search
router.get("/suggestions", auth, async (req, res) => {
  try {
    const { search } = req.query;
    const searchTerm = search ? `%${search.toLowerCase()}%` : '%';
    
    const { rows } = await db.query(
      `SELECT id, name, email 
       FROM members 
       WHERE (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1) 
       AND active = true
       ORDER BY name 
       LIMIT 10`,
      [searchTerm]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", auth, managerOnly, async (req, res) => {
  const { name, email, password, role, birthday, skills } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      "INSERT INTO members(name,email,password_hash,role,birthday,skills) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,email,role,birthday,skills,active",
      [name, email, hash, role, birthday || null, skills || []],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/:id", auth, managerOnly, async (req, res) => {
  try {
    const { name, email, role, birthday, skills } = req.body;
    const { rows } = await db.query(
      "UPDATE members SET name=$1,email=$2,role=$3,birthday=$4,skills=$5 WHERE id=$6 RETURNING id,name,email,role,birthday,skills",
      [name, email, role, birthday || null, skills, req.params.id],
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch("/:id/deactivate", auth, managerOnly, async (req, res) => {
  await db.query("UPDATE members SET active=false WHERE id=$1", [
    req.params.id,
  ]);
  res.json({ success: true });
});

module.exports = router;
