const db = require("../db");
const { keepStoredDate } = require("../utils/dateInput");
const { LEAF_TASK } = require("../utils/taskScope");

async function insertEventAttendees(client, eventId, memberIds) {
  const uniqueIds = [...new Set(memberIds || [])];
  if (!uniqueIds.length) return;

  const values = uniqueIds.map((_, index) => `($1, $${index + 2})`).join(", ");
  await client.query(
    `INSERT INTO calendar_attendees(event_id, member_id) VALUES ${values}
     ON CONFLICT (event_id, member_id) DO NOTHING`,
    [eventId, ...uniqueIds],
  );
}

const COMPLETED_TASK_STAGES = ["Done"];

/*
 * Completed tasks for the calendar ("what did I finish on which day").
 *
 * - Completed = stage Done (manager approved). The day is the IST date of
 *   the latest move to Done in task_activity (same rule as Time Log and the
 *   dashboard), falling back to updated_at for old tasks with no activity.
 * - A main task that has sub tasks is skipped (its sub tasks are shown
 *   instead); a main task without sub tasks is shown itself.
 * - minutes = time logged on the task by the member(s) being viewed only,
 *   across every work date.
 * - Members always get their own; managers only when they filter by
 *   member(s). With no filter a manager sees no completed list.
 */
const COMPLETED_SELECT = `
  WITH viewed AS (
    SELECT m.id, m.name FROM members m WHERE %WHO%
  )
  SELECT
    t.id,
    t.project_id,
    t.parent_task_id,
    pt.title AS parent_task_title,
    t.title,
    t.stage,
    t.priority,
    p.name AS project_name,
    to_char((COALESCE(done.completed_at, t.updated_at) AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS completed_on,
    COALESCE(logged.minutes, 0)::int AS minutes,
    who.assignee_name
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN tasks pt ON pt.id = t.parent_task_id
  LEFT JOIN LATERAL (
    SELECT MAX(a.created_at) AS completed_at
    FROM task_activity a
    WHERE a.task_id = t.id AND lower(trim(a.meta->>'to')) = 'done'
  ) done ON true
  LEFT JOIN LATERAL (
    SELECT SUM(e.minutes) AS minutes
    FROM time_entries e
    WHERE e.task_id = t.id AND e.member_id IN (SELECT id FROM viewed)
  ) logged ON true
  LEFT JOIN LATERAL (
    SELECT STRING_AGG(v.name, ', ' ORDER BY v.name) AS assignee_name
    FROM task_assignees ta
    JOIN viewed v ON v.id = ta.member_id
    WHERE ta.task_id = t.id
  ) who ON true
  WHERE lower(trim(coalesce(t.stage, ''))) = 'done'
    AND p.trashed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM task_assignees ta
      WHERE ta.task_id = t.id AND ta.member_id IN (SELECT id FROM viewed)
    )
    AND ${LEAF_TASK}
  ORDER BY completed_on, lower(t.title)
`;

function completedQuery(userId, isManager, memberEmailList) {
  if (!isManager) {
    return db.query(COMPLETED_SELECT.replace("%WHO%", "m.id = $1"), [userId]);
  }
  if (memberEmailList.length > 0) {
    return db.query(
      COMPLETED_SELECT.replace("%WHO%", "LOWER(m.email) = ANY($1)"),
      [memberEmailList],
    );
  }
  return Promise.resolve({ rows: [] });
}

class CalendarService {
  async getCalendarData(userId, isManager, memberEmailList) {
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
          AND EXISTS (
            SELECT 1 FROM task_assignees vta
            JOIN members vam ON vam.id = vta.member_id
            WHERE vta.task_id = t.id AND LOWER(vam.email) = ANY($1)
          )
        `;
        taskParams = [memberEmailList];
      }
    } else if (memberEmailList.length > 0) {
      taskVisibilityClause = `
        AND (
          EXISTS (SELECT 1 FROM task_assignees vta WHERE vta.task_id = t.id AND vta.member_id = $1)
          OR EXISTS (
            SELECT 1 FROM task_assignees vta
            JOIN members vam ON vam.id = vta.member_id
            WHERE vta.task_id = t.id AND LOWER(vam.email) = ANY($2)
          )
        )
      `;
      taskParams = [userId, memberEmailList];
    } else {
      taskVisibilityClause = `
        AND EXISTS (SELECT 1 FROM task_assignees vta WHERE vta.task_id = t.id AND vta.member_id = $1)
      `;
      taskParams = [userId];
    }

    const taskQuery = `
      SELECT
        t.id,
        t.project_id,
        t.parent_task_id,
        pt.title AS parent_task_title,
        t.title,
        t.description,
        t.due_date,
        t.stage,
        t.priority,
        t.created_by,
        p.name AS project_name,
        assignee_agg.assignee_name,
        creator.name AS created_by_name,
        creator.email AS created_by_email,
        COALESCE(assignee_agg.assigned_members, '[]'::jsonb) AS assigned_members
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN tasks pt ON pt.id = t.parent_task_id
      LEFT JOIN members creator ON creator.id = t.created_by
      LEFT JOIN LATERAL (
        SELECT
          STRING_AGG(m.name, ', ' ORDER BY m.name) AS assignee_name,
          jsonb_agg(
            jsonb_build_object('id', m.id, 'name', m.name, 'email', m.email)
            ORDER BY m.name
          ) AS assigned_members
        FROM task_assignees ta
        JOIN members m ON m.id = ta.member_id
        WHERE ta.task_id = t.id
      ) assignee_agg ON true
      WHERE t.due_date IS NOT NULL
        AND p.trashed_at IS NULL
        AND ${LEAF_TASK}
        AND t.stage != ALL($${taskParams.length + 1})
        ${taskVisibilityClause}
      ORDER BY t.due_date, t.created_at
    `;

    const [events, tasks, projects, birthdays, completed] = await Promise.all([
      eventParams.length > 0 ? db.query(eventQuery, eventParams) : db.query(eventQuery),
      db.query(taskQuery, [...taskParams, COMPLETED_TASK_STAGES]),
      isManager
        ? db.query(
            `
              SELECT id, name, end_date, status, client_name
              FROM projects
              WHERE end_date IS NOT NULL AND status != 'archived' AND trashed_at IS NULL
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
                AND p.trashed_at IS NULL
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
      completedQuery(userId, isManager, memberEmailList),
    ]);

    return {
      events: events.rows,
      tasks: tasks.rows,
      projects: projects.rows,
      birthdays: birthdays.rows,
      completed: completed.rows,
    };
  }

  async createEvent(eventData, userId) {
    const { title, description, start_date, end_date, type, member_ids } = eventData;
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
          userId,
        ],
      );
      const event = rows[0];
      await insertEventAttendees(client, event.id, member_ids);
      await client.query("COMMIT");
      return event;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async updateEvent(id, eventData) {
    const { title, description, start_date, end_date, type, member_ids } = eventData;
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // Start / end missing (the form leaves out times the user did not
      // change), or sent back exactly as the API returned them: keep the
      // stored values (see utils/dateInput.js).
      const { rows: storedRows } = await client.query(
        "SELECT start_date, end_date FROM calendar_events WHERE id=$1",
        [id],
      );
      const stored = storedRows[0] || {};
      const startToSave = keepStoredDate(start_date, stored.start_date) ? stored.start_date : start_date;
      const endToSave = keepStoredDate(end_date, stored.end_date) ? stored.end_date : end_date || startToSave;
      const { rows } = await client.query(
        `UPDATE calendar_events SET title=$1,description=$2,start_date=$3,end_date=$4,type=$5
         WHERE id=$6 RETURNING *`,
        [
          title,
          description,
          startToSave,
          endToSave,
          type,
          id,
        ],
      );
      if (member_ids) {
        await client.query("DELETE FROM calendar_attendees WHERE event_id=$1", [id]);
        await insertEventAttendees(client, id, member_ids);
      }
      await client.query("COMMIT");
      return rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteEvent(id) {
    await db.query("DELETE FROM calendar_events WHERE id=$1", [id]);
    return { success: true };
  }

  async getEventsByMember(memberId) {
    const { rows } = await db.query(
      `
      SELECT DISTINCT ce.* FROM calendar_events ce
      JOIN calendar_attendees ca ON ca.event_id = ce.id
      WHERE ca.member_id = $1
      ORDER BY ce.start_date
    `,
      [memberId],
    );
    return rows;
  }

  async searchMembers(email) {
    if (!email || email.length < 2) {
      return [];
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
    return rows;
  }

  async notifyGuest(guestData) {
    const { guest_email, event_title } = guestData || {};

    if (
      typeof guest_email !== "string" ||
      !guest_email.trim() ||
      guest_email.length > 255 ||
      typeof event_title !== "string" ||
      event_title.length > 500
    ) {
      const err = new Error("guest_email and event_title are required");
      err.status = 400;
      err.expose = true;
      throw err;
    }

    // Check if guest is a member
    const { rows: memberRows } = await db.query(
      "SELECT id FROM members WHERE LOWER(email) = LOWER($1)",
      [guest_email]
    );
    
    if (memberRows.length > 0) {
      // Create notification for member
      const memberId = memberRows[0].id;
      const { createNotification } = require("../utils/pushNotify");
      await createNotification(
        memberId,
        "Calendar invitation",
        `You have been invited to event: ${event_title}`,
        {
          type: "calendar_invitation",
          entityType: "calendar_event",
          eventKey: `calendar-invitation:${memberId}:${guest_email}:${event_title}`,
          url: "/calendar",
        },
      );
    }
    
    return { success: true, message: "Invitation sent" };
  }
}

module.exports = new CalendarService();
