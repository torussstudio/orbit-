const bcrypt = require("bcryptjs");
const db = require("../db");

async function getAllMembers() {
  const { rows } = await db.query(
    "SELECT id,name,email,role,birthday,skills,active,created_at,avatar_url FROM members ORDER BY created_at",
  );
  return rows;
}

async function getMemberSuggestions(search) {
  const searchTerm = search ? `%${search.toLowerCase()}%` : "%";
  const { rows } = await db.query(
    `SELECT id, name, email FROM members WHERE (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1) AND active = true ORDER BY name LIMIT 10`,
    [searchTerm],
  );
  return rows;
}

async function createMember({ name, email, password, role, birthday, skills }) {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    "INSERT INTO members(name,email,password_hash,role,birthday,skills) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,email,role,birthday,skills,active",
    [name, email, hash, role, birthday || null, skills || []],
  );
  return rows[0];
}

async function updateMember(id, { name, email, role, birthday, skills, password }) {
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      "UPDATE members SET name=$1,email=$2,role=$3,birthday=$4,skills=$5,password_hash=$6 WHERE id=$7 RETURNING id,name,email,role,birthday,skills",
      [name, email, role, birthday || null, skills, hash, id],
    );
    return rows[0];
  }
  const { rows } = await db.query(
    "UPDATE members SET name=$1,email=$2,role=$3,birthday=$4,skills=$5 WHERE id=$6 RETURNING id,name,email,role,birthday,skills",
    [name, email, role, birthday || null, skills, id],
  );
  return rows[0];
}

async function deactivateMember(id) {
  await db.query("UPDATE members SET active=false WHERE id=$1", [id]);
}

async function activateMember(id) {
  await db.query("UPDATE members SET active=true WHERE id=$1", [id]);
}

async function deleteMember(id) {
  const { rows: pendingTasks } = await db.query(
    `SELECT t.id, t.title, t.stage FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
     WHERE ta.member_id = $1 AND t.stage != 'Done' ORDER BY t.title`,
    [id],
  );
  if (pendingTasks.length > 0) {
    const count = pendingTasks.length;
    const err = new Error(
      `This member has ${count} task${count > 1 ? "s" : ""} not marked Done (${pendingTasks.map((t) => t.title).join(", ")}). Complete or delete ${count > 1 ? "them" : "it"} first.`
    );
    err.status = 400;
    err.expose = true;
    throw err;
  }
  await db.query("DELETE FROM task_assignees WHERE member_id=$1", [id]);
  await db.query("DELETE FROM members WHERE id=$1", [id]);
}

module.exports = { getAllMembers, getMemberSuggestions, createMember, updateMember, deactivateMember, activateMember, deleteMember };
