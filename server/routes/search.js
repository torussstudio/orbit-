const router = require("express").Router();
const db = require("../db");
const { auth } = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json({ projects: [], tasks: [], members: [] });

  const search = `%${q.trim().toLowerCase()}%`;

  try {
    const [projects, tasks, members] = await Promise.all([
      db.query(
        `SELECT id, name, status, description FROM projects
         WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1
         ORDER BY name LIMIT 5`,
        [search]
      ),
      db.query(
        `SELECT t.id, t.title, t.stage, t.priority, t.project_id, p.name as project_name
         FROM tasks t JOIN projects p ON t.project_id = p.id
         WHERE LOWER(t.title) LIKE $1 OR LOWER(t.description) LIKE $1
         ORDER BY t.updated_at DESC LIMIT 8`,
        [search]
      ),
      db.query(
        `SELECT id, name, email, role FROM members
         WHERE active = true AND (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1)
         ORDER BY name LIMIT 5`,
        [search]
      ),
    ]);

    res.json({
      projects: projects.rows,
      tasks: tasks.rows,
      members: members.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;