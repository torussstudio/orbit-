const bcrypt = require("bcryptjs");
const db = require("../db");
const {
  normalizeEmail,
  assertPasswordLength,
  assertEmailAvailable,
  isEmailUniqueViolation,
  emailTakenError,
  deleteMemberRecord,
} = require("../utils/accountRules");
const liveEvents = require("./liveEvents");
const { revokeAllRefreshTokensForMember } = require("../models/refreshTokens");
const { removeAllPushSubscriptionsForMember } = require("./notificationService");
const { keepStoredDate } = require("../utils/dateInput");

async function getAllMembers() {
  const { rows } = await db.query(
    `SELECT m.id, m.name, m.email, m.role, m.birthday, m.skills, m.active, m.created_at, m.avatar_url,
            COALESCE(tc.task_count, 0)::int AS task_count
     FROM members m
     LEFT JOIN (
       SELECT ta.member_id, COUNT(DISTINCT t.id) AS task_count
       FROM task_assignees ta
       JOIN tasks t ON t.id = ta.task_id
       WHERE t.stage != 'Done'
       GROUP BY ta.member_id
     ) tc ON tc.member_id = m.id
     ORDER BY m.created_at`,
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

// A manager sets this member's password, so no current password is needed.
async function createMember({ name, email: rawEmail, password, role, birthday, skills }) {
  const email = normalizeEmail(rawEmail);
  assertPasswordLength(password);
  await assertEmailAvailable(email);

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query(
      "INSERT INTO members(name,email,password_hash,role,birthday,skills) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,email,role,birthday,skills,active",
      [name, email, hash, role, birthday || null, skills || []],
    );
    return rows[0];
  } catch (err) {
    if (isEmailUniqueViolation(err)) throw emailTakenError();
    throw err;
  }
}

async function updateMember(id, { name, email: rawEmail, role, birthday, skills, password }) {
  const email = normalizeEmail(rawEmail);
  if (password) assertPasswordLength(password);
  await assertEmailAvailable(email, id);

  // Role before the save, to tell a real role change from a plain edit.
  const { rows: before } = await db.query(
    "SELECT role, birthday FROM members WHERE id=$1",
    [id],
  );
  const previousRole = before[0]?.role;
  // The Members form has no birthday field: a birthday that is missing, or
  // sent back exactly as the API returned it, keeps the stored value (see
  // utils/dateInput.js).
  const storedBirthday = before[0]?.birthday ?? null;
  const birthdayToSave = keepStoredDate(birthday, storedBirthday) ? storedBirthday : birthday || null;
  const roleChanged = (row) =>
    Boolean(row) && previousRole !== undefined && row.role !== previousRole;

  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      const { rows } = await db.query(
        "UPDATE members SET name=$1,email=$2,role=$3,birthday=$4,skills=$5,password_hash=$6 WHERE id=$7 RETURNING id,name,email,role,birthday,skills",
        [name, email, role, birthdayToSave, skills, hash, id],
      );
      // Saved. A manager set a new password for this member (and maybe a
      // new role). Same as when a member changes their own password
      // (authService.updateProfile): every session of that member is
      // revoked, so each device has to log in again with the new password.
      await revokeAllRefreshTokensForMember(id, "password_changed_by_manager");

      // End the member's live streams (this also clears their auth cache).
      liveEvents.accessChanged(
        id,
        roleChanged(rows[0])
          ? "role changed and password reset by a manager"
          : "password reset by a manager",
      );

      // No device of this member stays signed in, so none keeps getting
      // pushes: remove every push subscription of the member (also the ones
      // saved before subscriptions were linked to a session). A device
      // subscribes again when the member logs in on it.
      await removeAllPushSubscriptionsForMember(id);
      return rows[0];
    }
    const { rows } = await db.query(
      "UPDATE members SET name=$1,email=$2,role=$3,birthday=$4,skills=$5 WHERE id=$6 RETURNING id,name,email,role,birthday,skills",
      [name, email, role, birthdayToSave, skills, id],
    );
    // Saved. Role changed: end the member's live streams.
    if (roleChanged(rows[0])) {
      liveEvents.accessChanged(id, "role changed");
    }
    return rows[0];
  } catch (err) {
    if (isEmailUniqueViolation(err)) throw emailTakenError();
    throw err;
  }
}

async function deactivateMember(id) {
  await db.query("UPDATE members SET active=false WHERE id=$1", [id]);
  // Saved: end the member's live streams now.
  liveEvents.accessChanged(id, "deactivated");
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
  // One transaction: last-active-manager block, the member's own
  // notifications, then the member (task assignments go with the member:
  // task_assignees.member_id is ON DELETE CASCADE). A failed delete changes
  // nothing.
  await deleteMemberRecord(id, {
    lastManagerMessage:
      "This member is the only active manager and cannot be deleted. Make another member a manager first.",
    linkedMessage:
      "This member is still linked to projects, tasks or comments and cannot be deleted. Deactivate the member instead.",
  });
}

module.exports = { getAllMembers, getMemberSuggestions, createMember, updateMember, deactivateMember, activateMember, deleteMember };
