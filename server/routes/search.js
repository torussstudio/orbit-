const router = require("express").Router();
const db = require("../db");
const { auth } = require("../middleware/auth");

router.get("/", auth, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (typeof q !== "string" || q.trim().length < 2) return res.json({ projects: [], tasks: [], members: [] });
    const search = `%${q.trim().toLowerCase().slice(0, 200)}%`;
    const isManager = req.user.role === "manager";

    // Managers search everything. Members only see projects they belong to and
    // tasks assigned to them — the same rules assertProjectAccess /
    // assertTaskAccess enforce when they open a result.
    const [projects, tasks, members] = await Promise.all([
      isManager
        ? db.query(
            `SELECT id, name, status, description FROM projects WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1 ORDER BY name LIMIT 5`,
            [search]
          )
        : db.query(
            `SELECT p.id, p.name, p.status, p.description FROM projects p
             JOIN project_members pm ON pm.project_id = p.id AND pm.member_id = $2
             WHERE LOWER(p.name) LIKE $1 OR LOWER(p.description) LIKE $1 ORDER BY p.name LIMIT 5`,
            [search, req.user.id]
          ),
      isManager
        ? db.query(
            `SELECT t.id, t.title, t.stage, t.priority, t.project_id, p.name as project_name
             FROM tasks t JOIN projects p ON t.project_id = p.id
             WHERE LOWER(t.title) LIKE $1 OR LOWER(t.description) LIKE $1
             ORDER BY t.updated_at DESC LIMIT 8`,
            [search]
          )
        : db.query(
            `SELECT t.id, t.title, t.stage, t.priority, t.project_id, p.name as project_name
             FROM tasks t JOIN projects p ON t.project_id = p.id
             WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.member_id = $2)
               AND (LOWER(t.title) LIKE $1 OR LOWER(t.description) LIKE $1)
             ORDER BY t.updated_at DESC LIMIT 8`,
            [search, req.user.id]
          ),
      db.query(
        `SELECT id, name, email, role FROM members WHERE active = true AND (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1) ORDER BY name LIMIT 5`,
        [search]
      ),
    ]);
    res.json({ projects: projects.rows, tasks: tasks.rows, members: members.rows });
  } catch (err) { next(err); }
});

module.exports = router;
