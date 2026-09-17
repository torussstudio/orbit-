const db = require("../db");

async function getClustersByProject(projectId) {
  const { rows } = await db.query(
    `SELECT c.*, COUNT(t.id) as task_count FROM clusters c
     LEFT JOIN tasks t ON t.cluster_id=c.id WHERE c.project_id=$1
     GROUP BY c.id ORDER BY c.created_at DESC`,
    [projectId],
  );
  return rows;
}

async function getClusterById(id) {
  const { rows } = await db.query(
    `SELECT c.*, p.name as project_name FROM clusters c JOIN projects p ON c.project_id = p.id WHERE c.id=$1`,
    [id],
  );
  if (!rows[0]) return null;
  const tasks = await db.query(
    `SELECT t.*, assignee_agg.assignee_name FROM tasks t
     LEFT JOIN LATERAL (
       SELECT STRING_AGG(m.name, ', ' ORDER BY m.name) AS assignee_name
       FROM task_assignees ta JOIN members m ON m.id=ta.member_id WHERE ta.task_id=t.id
     ) assignee_agg ON true WHERE t.cluster_id=$1`,
    [id],
  );
  const reviews = await db.query(
    `SELECT cr.*, m.name as reviewer_name FROM cluster_reviews cr
     JOIN members m ON cr.reviewer_id=m.id WHERE cr.cluster_id=$1 ORDER BY cr.created_at DESC`,
    [id],
  );
  return { ...rows[0], tasks: tasks.rows, reviews: reviews.rows };
}

async function createCluster({ project_id, name, description, target_date, userId }) {
  const { rows } = await db.query(
    `INSERT INTO clusters(project_id,name,description,target_date,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [project_id, name, description, target_date || null, userId],
  );
  return rows[0];
}

async function updateCluster(id, { name, description, target_date }) {
  const { rows } = await db.query(
    "UPDATE clusters SET name=$1,description=$2,target_date=$3 WHERE id=$4 RETURNING *",
    [name, description, target_date || null, id],
  );
  return rows[0];
}

async function submitClusterForReview(id) {
  const { rows } = await db.query("UPDATE clusters SET status='in_review' WHERE id=$1 RETURNING *", [id]);
  return rows[0];
}

async function reviewCluster(id, { decision, notes, rework_task_ids, reviewerId }) {
  const pool = require("../db");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO cluster_reviews(cluster_id,reviewer_id,decision,notes,rework_task_ids) VALUES($1,$2,$3,$4,$5)`,
      [id, reviewerId, decision, notes, rework_task_ids || []],
    );
    if (decision === "approved") {
      await client.query("UPDATE clusters SET status='approved' WHERE id=$1", [id]);
    } else {
      await client.query("UPDATE clusters SET status='needs_rework', rework_count=rework_count+1 WHERE id=$1", [id]);
      if (rework_task_ids?.length) {
        await client.query("UPDATE tasks SET stage='Todo',updated_at=NOW() WHERE id = ANY($1)", [rework_task_ids]);
      }
    }
    await client.query("COMMIT");
    const { rows } = await pool.query("SELECT * FROM clusters WHERE id=$1", [id]);
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function completeCluster(id) {
  const { rows } = await db.query("UPDATE clusters SET status='completed' WHERE id=$1 RETURNING *", [id]);
  return rows[0];
}

async function deleteCluster(id) {
  await db.query("DELETE FROM clusters WHERE id=$1", [id]);
}

module.exports = { getClustersByProject, getClusterById, createCluster, updateCluster, submitClusterForReview, reviewCluster, completeCluster, deleteCluster };
