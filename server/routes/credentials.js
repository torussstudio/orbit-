const router = require('express').Router();
const db = require('../db');
const { auth, managerOnly } = require('../middleware/auth');

router.get('/project/:projectId', auth, async (req, res) => {
  let q;
  const params = [req.params.projectId];
  if (req.user.role === 'manager') {
    q = `SELECT cc.*, json_agg(json_build_object('id',c.id,'label',c.label,'value',c.value) ORDER BY c.created_at) FILTER (WHERE c.id IS NOT NULL) as entries
         FROM credential_clusters cc LEFT JOIN credentials c ON c.cluster_id=cc.id
         WHERE cc.project_id=$1 GROUP BY cc.id ORDER BY cc.created_at`;
  } else {
    q = `SELECT cc.*, json_agg(json_build_object('id',c.id,'label',c.label,'value','••••••••') ORDER BY c.created_at) FILTER (WHERE c.id IS NOT NULL) as entries
         FROM credential_clusters cc LEFT JOIN credentials c ON c.cluster_id=cc.id
         WHERE cc.project_id=$1 AND cc.visibility='public' GROUP BY cc.id ORDER BY cc.created_at`;
  }
  const { rows } = await db.query(q, params);
  res.json(rows);
});

router.post('/clusters', auth, managerOnly, async (req, res) => {
  const { project_id, name, visibility } = req.body;
  const { rows } = await db.query(
    'INSERT INTO credential_clusters(project_id,name,visibility) VALUES($1,$2,$3) RETURNING *',
    [project_id, name, visibility||'private']);
  res.status(201).json(rows[0]);
});

router.put('/clusters/:id', auth, managerOnly, async (req, res) => {
  const { name, visibility } = req.body;
  const { rows } = await db.query(
    'UPDATE credential_clusters SET name=$1,visibility=$2 WHERE id=$3 RETURNING *',
    [name, visibility, req.params.id]);
  res.json(rows[0]);
});

router.delete('/clusters/:id', auth, managerOnly, async (req, res) => {
  await db.query('DELETE FROM credential_clusters WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.post('/entries', auth, managerOnly, async (req, res) => {
  const { cluster_id, label, value } = req.body;
  const { rows } = await db.query(
    'INSERT INTO credentials(cluster_id,label,value) VALUES($1,$2,$3) RETURNING *',
    [cluster_id, label, value]);
  res.status(201).json(rows[0]);
});

router.put('/entries/:id', auth, managerOnly, async (req, res) => {
  const { label, value } = req.body;
  const { rows } = await db.query(
    'UPDATE credentials SET label=$1,value=$2 WHERE id=$3 RETURNING *',
    [label, value, req.params.id]);
  res.json(rows[0]);
});

router.delete('/entries/:id', auth, managerOnly, async (req, res) => {
  await db.query('DELETE FROM credentials WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
