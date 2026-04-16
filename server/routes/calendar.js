const router = require('express').Router();
const db = require('../db');
const { auth, managerOnly } = require('../middleware/auth');

// GET all calendar data
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
          p.name as project_name, m.name as assignee_name
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
  try {
    await db.query('DELETE FROM calendar_events WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
