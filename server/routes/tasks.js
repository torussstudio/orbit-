const router = require('express').Router();
const db = require('../db');
const { auth, managerOnly } = require('../middleware/auth');

const MANAGER_STAGES = ['Done', 'Deployed'];

router.get('/project/:projectId', auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, m.name as assignee_name, c.name as cluster_name FROM tasks t
     LEFT JOIN members m ON t.assignee_id=m.id
     LEFT JOIN clusters c ON t.cluster_id=c.id
     WHERE t.project_id=$1 ORDER BY t.created_at DESC`, [req.params.projectId]);
  res.json(rows);
});

router.get('/:id', auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, m.name as assignee_name FROM tasks t LEFT JOIN members m ON t.assignee_id=m.id WHERE t.id=$1`,
    [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const comments = await db.query(
    `SELECT tc.*, m.name as author_name FROM task_comments tc
     JOIN members m ON tc.author_id=m.id WHERE tc.task_id=$1 ORDER BY tc.created_at`, [req.params.id]);
  const activity = await db.query(
    `SELECT ta.*, m.name as actor_name FROM task_activity ta
     LEFT JOIN members m ON ta.actor_id=m.id WHERE ta.task_id=$1 ORDER BY ta.created_at DESC LIMIT 20`, [req.params.id]);
  res.json({ ...rows[0], comments: comments.rows, activity: activity.rows });
});

router.post('/', auth, managerOnly, async (req, res) => {
  const { project_id, cluster_id, title, description, assignee_id, priority, stage, due_date } = req.body;
  const { rows } = await db.query(
    `INSERT INTO tasks(project_id,cluster_id,title,description,assignee_id,priority,stage,due_date,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [project_id, cluster_id||null, title, description, assignee_id||null, priority||'medium', stage||'Todo', due_date||null, req.user.id]
  );
  await db.query(`INSERT INTO task_activity(task_id,actor_id,action) VALUES($1,$2,$3)`,
    [rows[0].id, req.user.id, 'Created task']);
  res.status(201).json(rows[0]);
});

router.put('/:id', auth, async (req, res) => {
  const { title, description, assignee_id, priority, stage, due_date, cluster_id } = req.body;
  const task = await db.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
  if (!task.rows[0]) return res.status(404).json({ error: 'Not found' });

  if (req.user.role === 'developer') {
    if (MANAGER_STAGES.includes(stage)) return res.status(403).json({ error: 'Manager approval required for this stage' });
    const { rows } = await db.query(
      'UPDATE tasks SET stage=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [stage, req.params.id]);
    await db.query(`INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
      [req.params.id, req.user.id, 'Stage changed', JSON.stringify({ from: task.rows[0].stage, to: stage })]);
    return res.json(rows[0]);
  }

  const { rows } = await db.query(
    `UPDATE tasks SET title=$1,description=$2,assignee_id=$3,priority=$4,stage=$5,due_date=$6,cluster_id=$7,updated_at=NOW()
     WHERE id=$8 RETURNING *`,
    [title, description, assignee_id||null, priority, stage, due_date||null, cluster_id||null, req.params.id]
  );
  if (task.rows[0].stage !== stage) {
    await db.query(`INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
      [req.params.id, req.user.id, 'Stage changed', JSON.stringify({ from: task.rows[0].stage, to: stage })]);
  }
  res.json(rows[0]);
});

router.delete('/:id', auth, managerOnly, async (req, res) => {
  await db.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.post('/:id/comments', auth, async (req, res) => {
  const { content } = req.body;
  const { rows } = await db.query(
    `INSERT INTO task_comments(task_id,author_id,content) VALUES($1,$2,$3)
     RETURNING *, (SELECT name FROM members WHERE id=$2) as author_name`,
    [req.params.id, req.user.id, content]);
  res.status(201).json(rows[0]);
});

module.exports = router;
