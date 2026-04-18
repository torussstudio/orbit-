const router = require("express").Router();
const db = require("../db");
const { auth, managerOnly } = require("../middleware/auth");

const COMPLETED_TASK_STAGES = ["Done", "Deployed"];

function parseMemberEmails(rawMembers) {
  if (!rawMembers) return [];

  return [...new Set(
    String(rawMembers)
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )];
}

// GET all calendar data with optional member filtering
router.get("/", auth, async (req, res) => {
  try {
    const memberEmailList = parseMemberEmails(req.query.members);
    const isManager = req.user.role === "manager";
    const userId = req.user.id;

    let eventVisibilityClause = "";
    let eventParams = [];

    if (isManager) {
      if (memberEmailList.length > 0) {
        eventVisibilityClause = `
          WHERE LOWER(filter_attendee.email) = ANY($1)
        `;
        eventParams = [memberEmailList];
      }
    } else if (memberEmailList.length > 0) {
      eventVisibilityClause = `
        WHERE filter_ca.member_id = $1
           OR LOWER(filter_attendee.email) = ANY($2)
      `;
      eventParams = [userId, memberEmailList];
    } else {
      eventVisibilityClause = `
        WHERE filter_ca.member_id = $1
      `;
      eventParams = [userId];
    }

    const eventQuery = `
      WITH visible_events AS (
        SELECT DISTINCT ce.id
        FROM calendar_events ce
        LEFT JOIN calendar_attendees filter_ca ON filter_ca.event_id = ce.id
        LEFT JOIN members filter_attendee ON filter_attendee.id = filter_ca.member_id
        ${eventVisibilityClause}
      )
      SELECT
        ce.*,
        creator.name AS created_by_name,
        creator.email AS created_by_email,
        COALESCE(
          jsonb_agg(
            DISTINCT jsonb_build_object(
              'id', attendee.id,
              'name', attendee.name,
              'email', attendee.email
            )
          ) FILTER (WHERE attendee.id IS NOT NULL),
          '[]'::jsonb
        ) AS attendees
      FROM visible_events ve
      JOIN calendar_events ce ON ce.id = ve.id
      LEFT JOIN members creator ON ce.created_by = creator.id
      LEFT JOIN calendar_attendees ca ON ca.event_id = ce.id
      LEFT JOIN members attendee ON attendee.id = ca.member_id
      GROUP BY ce.id, creator.name, creator.email
      ORDER BY ce.start_date
    `;

    let taskVisibilityClause = "";
    let taskParams = [];

    if (isManager) {
      if (memberEmailList.length > 0) {
        taskVisibilityClause = `
          AND LOWER(assignee.email) = ANY($1)
        `;
        taskParams = [memberEmailList];
      }
    } else if (memberEmailList.length > 0) {
      taskVisibilityClause = `
        AND (
          t.assignee_id = $1
          OR LOWER(assignee.email) = ANY($2)
        )
      `;
      taskParams = [userId, memberEmailList];
    } else {
      taskVisibilityClause = `
        AND t.assignee_id = $1
      `;
      taskParams = [userId];
    }

    const taskQuery = `
      SELECT
        t.id,
        t.project_id,
        t.title,
        t.description,
        t.due_date,
        t.stage,
        t.priority,
        t.assignee_id,
        t.created_by,
        p.name AS project_name,
        assignee.name AS assignee_name,
        assignee.email AS assignee_email,
        creator.name AS created_by_name,
        creator.email AS created_by_email,
        CASE
          WHEN assignee.id IS NULL THEN '[]'::jsonb
          ELSE jsonb_build_array(
            jsonb_build_object(
              'id', assignee.id,
              'name', assignee.name,
              'email', assignee.email
            )
          )
        END AS assigned_members
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN members assignee ON assignee.id = t.assignee_id
      LEFT JOIN members creator ON creator.id = t.created_by
      WHERE t.due_date IS NOT NULL
        AND t.stage != ALL($${taskParams.length + 1})
        ${taskVisibilityClause}
      ORDER BY t.due_date, t.created_at
    `;

    const [events, tasks, projects, birthdays] = await Promise.all([
      eventParams.length > 0 ? db.query(eventQuery, eventParams) : db.query(eventQuery),
      db.query(taskQuery, [...taskParams, COMPLETED_TASK_STAGES]),
      isManager
        ? db.query(
            `
              SELECT id, name, end_date, status, client_name
              FROM projects
              WHERE end_date IS NOT NULL AND status != 'archived'
              ORDER BY end_date
            `,
          )
        : db.query(
            `
              SELECT DISTINCT p.id, p.name, p.end_date, p.status, p.client_name
              FROM projects p
              JOIN project_members pm ON pm.project_id = p.id
              WHERE pm.member_id = $1
                AND p.end_date IS NOT NULL
                AND p.status != 'archived'
              ORDER BY p.end_date
            `,
            [userId],
          ),
      db.query(
        `
          SELECT id, name, birthday
          FROM members
          WHERE birthday IS NOT NULL AND active = true
          ORDER BY name
        `,
      ),
    ]);

    res.json({
      events: events.rows,
      tasks: tasks.rows,
      projects: projects.rows,
      birthdays: birthdays.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create event
router.post("/", auth, managerOnly, async (req, res) => {
  const { title, description, start_date, end_date, type, member_ids } =
    req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO calendar_events(title, description, start_date, end_date, type, created_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        title,
        description,
        start_date,
        end_date || start_date,
        type || "event",
        req.user.id,
      ],
    );
    const event = rows[0];
    if (member_ids?.length) {
      for (const mid of member_ids) {
        await client.query(
          "INSERT INTO calendar_attendees(event_id, member_id) VALUES($1,$2) ON CONFLICT (event_id, member_id) DO NOTHING",
          [event.id, mid],
        );
      }
    }
    await client.query("COMMIT");
    res.status(201).json(event);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PUT update event
router.put("/:id", auth, managerOnly, async (req, res) => {
  const { title, description, start_date, end_date, type, member_ids } =
    req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE calendar_events SET title=$1,description=$2,start_date=$3,end_date=$4,type=$5
       WHERE id=$6 RETURNING *`,
      [
        title,
        description,
        start_date,
        end_date || start_date,
        type,
        req.params.id,
      ],
    );
    if (member_ids) {
      await client.query("DELETE FROM calendar_attendees WHERE event_id=$1", [
        req.params.id,
      ]);
      for (const mid of member_ids) {
        await client.query(
          "INSERT INTO calendar_attendees(event_id, member_id) VALUES($1,$2) ON CONFLICT (event_id, member_id) DO NOTHING",
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

// DELETE event
router.delete("/:id", auth, managerOnly, async (req, res) => {
  try {
    await db.query("DELETE FROM calendar_events WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET events filtered by member
router.get("/member/:memberId", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `
      SELECT DISTINCT ce.* FROM calendar_events ce
      JOIN calendar_attendees ca ON ca.event_id = ce.id
      WHERE ca.member_id = $1
      ORDER BY ce.start_date
    `,
      [req.params.memberId],
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search members by email
router.get("/search-members", auth, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || email.length < 2) {
      return res.json([]);
    }
    const { rows } = await db.query(
      `
      SELECT id, name, email FROM members
      WHERE email ILIKE $1 AND active = true
      ORDER BY name
      LIMIT 10
    `,
      [`%${email}%`],
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send notification to event guest
router.post("/notify-guest", auth, async (req, res) => {
  try {
    const { guest_email, event_title, start_date, description } = req.body;
    
    // Check if guest is a member
    const { rows: memberRows } = await db.query(
      "SELECT id FROM members WHERE LOWER(email) = LOWER($1)",
      [guest_email]
    );
    
    if (memberRows.length > 0) {
      // Create notification for member
      const memberId = memberRows[0].id;
      const message = `You have been invited to event: ${event_title}`;
      await db.query(
        "INSERT INTO notifications(member_id, message) VALUES($1, $2)",
        [memberId, message]
      );
    }
    
    // In a real app, you would send an email here using nodemailer
    // For now, we'll just return success
    res.json({ success: true, message: "Invitation sent" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
