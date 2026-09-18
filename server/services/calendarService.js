const db = require("../db");

const COMPLETED_TASK_STAGES = ["Done"];

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

    return {
      events: events.rows,
      tasks: tasks.rows,
      projects: projects.rows,
      birthdays: birthdays.rows,
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
      if (member_ids?.length) {
        for (const mid of member_ids) {
          await client.query(
            "INSERT INTO calendar_attendees(event_id, member_id) VALUES($1,$2) ON CONFLICT (event_id, member_id) DO NOTHING",
            [event.id, mid],
          );
        }
      }
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
      const { rows } = await client.query(
        `UPDATE calendar_events SET title=$1,description=$2,start_date=$3,end_date=$4,type=$5
         WHERE id=$6 RETURNING *`,
        [
          title,
          description,
          start_date,
          end_date || start_date,
          type,
          id,
        ],
      );
      if (member_ids) {
        await client.query("DELETE FROM calendar_attendees WHERE event_id=$1", [id]);
        for (const mid of member_ids) {
          await client.query(
            "INSERT INTO calendar_attendees(event_id, member_id) VALUES($1,$2) ON CONFLICT (event_id, member_id) DO NOTHING",
            [id, mid],
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
    const { guest_email, event_title } = guestData;
    
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
