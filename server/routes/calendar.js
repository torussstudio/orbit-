const router = require('express').Router();
const db = require('../db');
const { auth, managerOnly } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Email transporter (Outlook)
const transporter = nodemailer.createTransport({
  host: 'smtp-mail.outlook.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.OUTLOOK_EMAIL,
    pass: process.env.OUTLOOK_PASS
  }
});

// GET all calendar data (events + task due dates + project deadlines)
router.get('/', auth, async (req, res) => {
  try {
    const [events, tasks, projects, birthdays] = await Promise.all([
      db.query(`
        SELECT ce.*, m.name as created_by_name,
          COALESCE(json_agg(json_build_object('id', m2.id, 'name', m2.name, 'email', m2.email))
            FILTER (WHERE m2.id IS NOT NULL), '[]') as attendees
        FROM calendar_events ce
        LEFT JOIN members m ON ce.created_by = m.id
        LEFT JOIN calendar_attendees ca ON ca.event_id = ce.id
        LEFT JOIN members m2 ON ca.member_id = m2.id
        GROUP BY ce.id, m.name
        ORDER BY ce.start_date`),
      db.query(`
        SELECT t.id, t.title, t.due_date, t.stage, t.priority,
          p.name as project_name, m.name as assignee_name, m.email as assignee_email
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        LEFT JOIN members m ON t.assignee_id = m.id
        WHERE t.due_date IS NOT NULL AND t.stage NOT IN ('Done','Deployed')
        ORDER BY t.due_date`),
      db.query(`
        SELECT id, name, end_date, status, client_name
        FROM projects
        WHERE end_date IS NOT NULL AND status != 'archived'
        ORDER BY end_date`),
      db.query(`
        SELECT id, name, email, birthday
        FROM members
        WHERE birthday IS NOT NULL AND active = true`)
    ]);

    res.json({
      events: events.rows,
      tasks: tasks.rows,
      projects: projects.rows,
      birthdays: birthdays.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create event
router.post('/', auth, managerOnly, async (req, res) => {
  const { title, description, start_date, end_date, type, member_ids } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO calendar_events(title, description, start_date, end_date, type, created_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, description, start_date, end_date || start_date, type || 'event', req.user.id]
    );
    const event = rows[0];
    if (member_ids?.length) {
      for (const mid of member_ids) {
        await client.query(
          'INSERT INTO calendar_attendees(event_id, member_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [event.id, mid]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json(event);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// PUT update event
router.put('/:id', auth, managerOnly, async (req, res) => {
  const { title, description, start_date, end_date, type, member_ids } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE calendar_events SET title=$1,description=$2,start_date=$3,end_date=$4,type=$5
       WHERE id=$6 RETURNING *`,
      [title, description, start_date, end_date || start_date, type, req.params.id]
    );
    if (member_ids) {
      await client.query('DELETE FROM calendar_attendees WHERE event_id=$1', [req.params.id]);
      for (const mid of member_ids) {
        await client.query(
          'INSERT INTO calendar_attendees(event_id, member_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [req.params.id, mid]
        );
      }
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

// DELETE event
router.delete('/:id', auth, managerOnly, async (req, res) => {
  await db.query('DELETE FROM calendar_events WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// GET reminder check endpoint (called by cron-job.org every hour)
router.get('/reminders/check', async (req, res) => {
  try {
    const oneHourLater = new Date(Date.now() + 60 * 60 * 1000);
    const windowStart = new Date(oneHourLater.getTime() - 5 * 60 * 1000);
    const windowEnd = new Date(oneHourLater.getTime() + 5 * 60 * 1000);

    // Check custom events
    const events = await db.query(`
      SELECT ce.*, 
        json_agg(json_build_object('name', m.name, 'email', m.email)) 
          FILTER (WHERE m.id IS NOT NULL) as attendees
      FROM calendar_events ce
      LEFT JOIN calendar_attendees ca ON ca.event_id = ce.id
      LEFT JOIN members m ON ca.member_id = m.id
      WHERE ce.start_date BETWEEN $1 AND $2 AND ce.reminder_sent = false
      GROUP BY ce.id`, [windowStart, windowEnd]);

    // Check task due dates
    const tasks = await db.query(`
      SELECT t.title, t.due_date, p.name as project_name,
        m.name as assignee_name, m.email as assignee_email
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN members m ON t.assignee_id = m.id
      WHERE t.due_date BETWEEN $1 AND $2
        AND t.stage NOT IN ('Done','Deployed')
        AND m.email IS NOT NULL`, [windowStart, windowEnd]);

    // Check project deadlines
    const projects = await db.query(`
      SELECT p.name, p.end_date, m.name as manager_name, m.email as manager_email
      FROM projects p
      LEFT JOIN members m ON p.created_by = m.id
      WHERE p.end_date BETWEEN $1 AND $2
        AND p.status != 'archived'`, [windowStart, windowEnd]);

    let sent = 0;

    // Send event reminders
    for (const event of events.rows) {
      if (event.attendees?.length) {
        for (const attendee of event.attendees) {
          if (attendee.email) {
            await transporter.sendMail({
              from: process.env.OUTLOOK_EMAIL,
              to: attendee.email,
              subject: `⏰ Reminder: ${event.title} starts in 1 hour`,
              html: `
                <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                  <h2 style="color: #6366f1;">⏰ Event Reminder</h2>
                  <p>Hi ${attendee.name},</p>
                  <p>This is a reminder that <strong>${event.title}</strong> starts in 1 hour.</p>
                  ${event.description ? `<p>${event.description}</p>` : ''}
                  <p style="color: #6b7280;">📅 ${new Date(event.start_date).toLocaleString()}</p>
                  <hr/>
                  <p style="font-size: 12px; color: #9ca3af;">Orbit Agency OS</p>
                </div>`
            });
            sent++;
          }
        }
        await db.query('UPDATE calendar_events SET reminder_sent=true WHERE id=$1', [event.id]);
      }
    }

    // Send task due date reminders
    for (const task of tasks.rows) {
      if (task.assignee_email) {
        await transporter.sendMail({
          from: process.env.OUTLOOK_EMAIL,
          to: task.assignee_email,
          subject: `⏰ Task Due in 1 Hour: ${task.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
              <h2 style="color: #6366f1;">⏰ Task Deadline Reminder</h2>
              <p>Hi ${task.assignee_name},</p>
              <p>Your task <strong>${task.title}</strong> in project <strong>${task.project_name}</strong> is due in 1 hour!</p>
              <p style="color: #6b7280;">📅 Due: ${new Date(task.due_date).toLocaleString()}</p>
              <hr/>
              <p style="font-size: 12px; color: #9ca3af;">Orbit Agency OS</p>
            </div>`
        });
        sent++;
      }
    }

    // Send project deadline reminders
    for (const project of projects.rows) {
      if (project.manager_email) {
        await transporter.sendMail({
          from: process.env.OUTLOOK_EMAIL,
          to: project.manager_email,
          subject: `⏰ Project Deadline in 1 Hour: ${project.name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
              <h2 style="color: #6366f1;">⏰ Project Deadline Reminder</h2>
              <p>Hi ${project.manager_name},</p>
              <p>Project <strong>${project.name}</strong> deadline is in 1 hour!</p>
              <p style="color: #6b7280;">📅 Deadline: ${new Date(project.end_date).toLocaleString()}</p>
              <hr/>
              <p style="font-size: 12px; color: #9ca3af;">Orbit Agency OS</p>
            </div>`
        });
        sent++;
      }
    }

    res.json({ success: true, reminders_sent: sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
