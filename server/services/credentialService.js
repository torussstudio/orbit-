const db = require("../db");

async function getCredentialsByProject(projectId, role) {
  let q;
  if (role === "manager") {
    q = `SELECT cc.*, json_agg(json_build_object('id',c.id,'label',c.label,'value',c.value) ORDER BY c.created_at) FILTER (WHERE c.id IS NOT NULL) as entries
         FROM credential_clusters cc LEFT JOIN credential_entries c ON c.cluster_id=cc.id
         WHERE cc.project_id=$1 GROUP BY cc.id ORDER BY cc.created_at`;
  } else {
    q = `SELECT cc.*, json_agg(json_build_object('id',c.id,'label',c.label,'value','••••••••') ORDER BY c.created_at) FILTER (WHERE c.id IS NOT NULL) as entries
         FROM credential_clusters cc LEFT JOIN credential_entries c ON c.cluster_id=cc.id
         WHERE cc.project_id=$1 AND cc.visibility='public' GROUP BY cc.id ORDER BY cc.created_at`;
  }
  const { rows } = await db.query(q, [projectId]);
  return rows;
}

async function createCredentialCluster({ project_id, name, visibility }) {
  const { rows } = await db.query(
    "INSERT INTO credential_clusters(project_id,name,visibility) VALUES($1,$2,$3) RETURNING *",
    [project_id, name, visibility || "private"],
  );
  return rows[0];
}

async function updateCredentialCluster(id, { name, visibility }) {
  const { rows } = await db.query(
    "UPDATE credential_clusters SET name=$1,visibility=$2 WHERE id=$3 RETURNING *",
    [name, visibility, id],
  );
  return rows[0];
}

async function deleteCredentialCluster(id) {
  await db.query("DELETE FROM credential_clusters WHERE id=$1", [id]);
}

async function createCredentialEntry({ cluster_id, label, value }) {
  const { rows } = await db.query(
    "INSERT INTO credential_entries(cluster_id,label,value) VALUES($1,$2,$3) RETURNING *",
    [cluster_id, label, value],
  );
  return rows[0];
}

async function updateCredentialEntry(id, { label, value }) {
  const { rows } = await db.query(
    "UPDATE credential_entries SET label=$1,value=$2 WHERE id=$3 RETURNING *",
    [label, value, id],
  );
  return rows[0];
}

async function deleteCredentialEntry(id) {
  await db.query("DELETE FROM credential_entries WHERE id=$1", [id]);
}

module.exports = { getCredentialsByProject, createCredentialCluster, updateCredentialCluster, deleteCredentialCluster, createCredentialEntry, updateCredentialEntry, deleteCredentialEntry };
