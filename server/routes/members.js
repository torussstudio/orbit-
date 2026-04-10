const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, managerOnly } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  const { rows } = await db.query('SELECT id,name,email,role,skills,active,created_at FROM members ORDER BY created_at');
  res.json(rows);
});

router.post('/', auth, managerOnly, async (req, res) => {
  const { name, email, password, role, skills } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO members(name,email,password_hash,role,skills) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role,skills,active',
      [name, email, hash, role, skills || []]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', auth, managerOnly, async (req, res) => {
  const { name, email, role, skills } = req.body;
  const { rows } = await db.query(
    'UPDATE members SET name=$1,email=$2,role=$3,skills=$4 WHERE id=$5 RETURNING id,name,email,role,skills',
    [name, email, role, skills, req.params.id]
  );
  res.json(rows[0]);
});

router.patch('/:id/deactivate', auth, managerOnly, async (req, res) => {
  await db.query('UPDATE members SET active=false WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
