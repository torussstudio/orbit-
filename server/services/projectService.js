const db = require("../db");
const { assertProjectAccess } = require("./accessControl");

const getAllProjects = async (user) => {
  let q, params;
  if (user.role === "manager") {
    q = `SELECT p.*, m.name as created_by_name FROM projects p
         LEFT JOIN members m ON p.created_by=m.id
         ORDER BY p.sort_order ASC NULLS LAST, p.created_at DESC`;
    params = [];
  } else {
    q = `SELECT p.*, m.name as created_by_name FROM projects p
         LEFT JOIN members m ON p.created_by=m.id
         JOIN project_members pm ON pm.project_id=p.id
         WHERE pm.member_id=$1 AND p.status != 'archived'
         ORDER BY p.sort_order ASC NULLS LAST, p.created_at DESC`;
    params = [user.id];
  }
  const { rows } = await db.query(q, params);
  return rows;
};

const reorderProjects = async (project_ids) => {
  if (!Array.isArray(project_ids) || !project_ids.length) {
    throw new Error("project_ids array required");
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < project_ids.length; i++) {
      await client.query("UPDATE projects SET sort_order=$1 WHERE id=$2", [
        i,
        project_ids[i],
      ]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const getProjectById = async (user, projectId) => {
  await assertProjectAccess(user, projectId);
  const { rows } = await db.query(
    `SELECT p.*, m.name as created_by_name FROM projects p
     LEFT JOIN members m ON p.created_by=m.id WHERE p.id=$1`,
    [projectId]
  );
  if (!rows[0]) return null;
  const members = await db.query(
    `SELECT m.id,m.name,m.email,m.role FROM members m
     JOIN project_members pm ON pm.member_id=m.id WHERE pm.project_id=$1`,
    [projectId]
  );
  return { ...rows[0], members: members.rows };
};

const createProject = async (user, data) => {
  const {
    name,
    client_name,
    description,
    status,
    start_date,
    end_date,
    member_ids,
    custom_stages,
  } = data;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO projects(name,client_name,description,status,start_date,end_date,custom_stages,created_by,sort_order)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(MIN(sort_order), 0) - 1 FROM projects)) RETURNING *`,
      [
        name,
        client_name,
        description,
        status || "active",
        start_date || null,
        end_date || null,
        JSON.stringify(
          custom_stages || [
            "Todo",
            "In Progress",
            "In Review",
            "Done",
          ]
        ),
        user.id,
      ]
    );
    const proj = rows[0];
    if (member_ids?.length) {
      for (const mid of member_ids) {
        await client.query(
          "INSERT INTO project_members VALUES($1,$2) ON CONFLICT DO NOTHING",
          [proj.id, mid]
        );
      }
    }
    await client.query("COMMIT");
    return proj;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const updateProject = async (projectId, data) => {
  const {
    name,
    client_name,
    description,
    status,
    start_date,
    end_date,
    custom_stages,
    member_ids,
  } = data;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE projects SET name=$1,client_name=$2,description=$3,status=$4,start_date=$5,end_date=$6,custom_stages=$7
       WHERE id=$8 RETURNING *`,
      [
        name,
        client_name,
        description,
        status,
        start_date || null,
        end_date || null,
        JSON.stringify(custom_stages),
        projectId,
      ]
    );
    if (member_ids) {
      await client.query("DELETE FROM project_members WHERE project_id=$1", [
        projectId,
      ]);
      for (const mid of member_ids) {
        await client.query(
          "INSERT INTO project_members VALUES($1,$2) ON CONFLICT DO NOTHING",
          [projectId, mid]
        );
      }
    }
    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const archiveProject = async (projectId) => {
  await db.query("UPDATE projects SET status='archived' WHERE id=$1", [
    projectId,
  ]);
};

const unarchiveProject = async (projectId) => {
  await db.query("UPDATE projects SET status='active' WHERE id=$1", [
    projectId,
  ]);
};

const deleteProject = async (projectId) => {
  const { rows: countRows } = await db.query(
    "SELECT COUNT(*)::int AS count FROM tasks WHERE project_id=$1",
    [projectId]
  );
  const taskCount = countRows[0]?.count || 0;
  if (taskCount > 0) {
    throw new Error(
      `This project still has ${taskCount} task${
        taskCount === 1 ? "" : "s"
      } (including sub tasks). Delete all tasks before deleting the project.`
    );
  }

  await db.query("DELETE FROM projects WHERE id=$1", [projectId]);
};

module.exports = {
  getAllProjects,
  reorderProjects,
  getProjectById,
  createProject,
  updateProject,
  archiveProject,
  unarchiveProject,
  deleteProject,
};
