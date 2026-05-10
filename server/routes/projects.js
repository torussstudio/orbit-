const router = require("express").Router();
const db = require("../db");
const { auth, managerOnly } = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  let q, params;
  if (req.user.role === "manager") {
    q = `SELECT p.*, m.name as created_by_name FROM projects p
         LEFT JOIN members m ON p.created_by=m.id
         ORDER BY p.created_at DESC`;
    params = [];
  } else {
    q = `SELECT p.*, m.name as created_by_name FROM projects p
         LEFT JOIN members m ON p.created_by=m.id
         JOIN project_members pm ON pm.project_id=p.id
         WHERE pm.member_id=$1 AND p.status != 'archived' ORDER BY p.created_at DESC`;
    params = [req.user.id];
  }
  const { rows } = await db.query(q, params);
  res.json(rows);
});

router.get("/:id", auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*, m.name as created_by_name FROM projects p
     LEFT JOIN members m ON p.created_by=m.id WHERE p.id=$1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const members = await db.query(
    `SELECT m.id,m.name,m.email,m.role FROM members m
     JOIN project_members pm ON pm.member_id=m.id WHERE pm.project_id=$1`,
    [req.params.id],
  );
  res.json({ ...rows[0], members: members.rows });
});

router.post("/", auth, managerOnly, async (req, res) => {
  const {
    name,
    client_name,
    description,
    status,
    start_date,
    end_date,
    member_ids,
    custom_stages,
  } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO projects(name,client_name,description,status,start_date,end_date,custom_stages,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
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
          ],
        ),
        req.user.id,
      ],
    );
    const proj = rows[0];
    if (member_ids?.length) {
      for (const mid of member_ids) {
        await client.query(
          "INSERT INTO project_members VALUES($1,$2) ON CONFLICT DO NOTHING",
          [proj.id, mid],
        );
      }
    }
    await client.query("COMMIT");
    res.status(201).json(proj);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.put("/:id", auth, managerOnly, async (req, res) => {
  const {
    name,
    client_name,
    description,
    status,
    start_date,
    end_date,
    custom_stages,
    member_ids,
  } = req.body;
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
        req.params.id,
      ],
    );
    if (member_ids) {
      await client.query("DELETE FROM project_members WHERE project_id=$1", [
        req.params.id,
      ]);
      for (const mid of member_ids) {
        await client.query(
          "INSERT INTO project_members VALUES($1,$2) ON CONFLICT DO NOTHING",
          [req.params.id, mid],
        );
      }
    }
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.patch("/:id/archive", auth, managerOnly, async (req, res) => {
  await db.query("UPDATE projects SET status='archived' WHERE id=$1", [
    req.params.id,
  ]);
  res.json({ success: true });
});

router.patch("/:id/unarchive", auth, managerOnly, async (req, res) => {
  await db.query("UPDATE projects SET status='active' WHERE id=$1", [
    req.params.id,
  ]);
  res.json({ success: true });
});

router.delete("/:id", auth, managerOnly, async (req, res) => {
  try {
    await db.query("DELETE FROM projects WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
