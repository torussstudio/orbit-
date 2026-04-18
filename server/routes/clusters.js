const router = require("express").Router();
const db = require("../db");
const { auth, managerOnly } = require("../middleware/auth");

router.get("/project/:projectId", auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, COUNT(t.id) as task_count FROM clusters c
     LEFT JOIN tasks t ON t.cluster_id=c.id WHERE c.project_id=$1
     GROUP BY c.id ORDER BY c.created_at DESC`,
    [req.params.projectId],
  );
  res.json(rows);
});

router.get("/:id", auth, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM clusters WHERE id=$1", [
    req.params.id,
  ]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const tasks = await db.query(
    `SELECT t.*, m.name as assignee_name FROM tasks t LEFT JOIN members m ON t.assignee_id=m.id
     WHERE t.cluster_id=$1`,
    [req.params.id],
  );
  const reviews = await db.query(
    `SELECT cr.*, m.name as reviewer_name FROM cluster_reviews cr
     JOIN members m ON cr.reviewer_id=m.id WHERE cr.cluster_id=$1 ORDER BY cr.created_at DESC`,
    [req.params.id],
  );
  res.json({ ...rows[0], tasks: tasks.rows, reviews: reviews.rows });
});

router.post("/", auth, managerOnly, async (req, res) => {
  const { project_id, name, description, target_date } = req.body;
  const { rows } = await db.query(
    `INSERT INTO clusters(project_id,name,description,target_date,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [project_id, name, description, target_date || null, req.user.id],
  );
  res.status(201).json(rows[0]);
});

router.put("/:id", auth, managerOnly, async (req, res) => {
  const { name, description, target_date } = req.body;
  const { rows } = await db.query(
    "UPDATE clusters SET name=$1,description=$2,target_date=$3 WHERE id=$4 RETURNING *",
    [name, description, target_date || null, req.params.id],
  );
  res.json(rows[0]);
});

router.post("/:id/submit-review", auth, managerOnly, async (req, res) => {
  const { rows } = await db.query(
    "UPDATE clusters SET status='in_review' WHERE id=$1 RETURNING *",
    [req.params.id],
  );
  res.json(rows[0]);
});

router.post("/:id/review", auth, managerOnly, async (req, res) => {
  const { decision, notes, rework_task_ids } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO cluster_reviews(cluster_id,reviewer_id,decision,notes,rework_task_ids) VALUES($1,$2,$3,$4,$5)`,
      [req.params.id, req.user.id, decision, notes, rework_task_ids || []],
    );

    if (decision === "approved") {
      await client.query("UPDATE clusters SET status='approved' WHERE id=$1", [
        req.params.id,
      ]);
    } else {
      await client.query(
        "UPDATE clusters SET status='needs_rework', rework_count=rework_count+1 WHERE id=$1",
        [req.params.id],
      );
      if (rework_task_ids?.length) {
        await client.query(
          "UPDATE tasks SET stage='Todo',updated_at=NOW() WHERE id = ANY($1)",
          [rework_task_ids],
        );
      }
    }
    await client.query("COMMIT");
    const { rows } = await db.query("SELECT * FROM clusters WHERE id=$1", [
      req.params.id,
    ]);
    res.json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.patch("/:id/complete", auth, managerOnly, async (req, res) => {
  const { rows } = await db.query(
    "UPDATE clusters SET status='completed' WHERE id=$1 RETURNING *",
    [req.params.id],
  );
  res.json(rows[0]);
});

router.delete("/:id", auth, managerOnly, async (req, res) => {
  await db.query("DELETE FROM clusters WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
