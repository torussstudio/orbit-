const express = require('express');
const router = express.Router();

// ADJUST THIS IMPORT to match how server/routes/tasks.js does it.
const { authenticate } = require('../middleware/auth');
const taskRequestService = require('../services/taskRequestService');

// Only managers can view or delete requests (roles in members: manager / member).
const requireManager = (req, res, next) => {
  if (req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  next();
};

// POST /task-requests: a member submits a request
router.post('/', authenticate, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const project_name = String(req.body.project_name || '').trim();
    const description = String(req.body.description || '').trim();
    const due_date = req.body.due_date || null;

    if (!title) return res.status(400).json({ error: 'Task name is required.' });
    if (!project_name) return res.status(400).json({ error: 'Project name is required.' });
    if (title.length > 200 || project_name.length > 200 || description.length > 5000) {
      return res.status(400).json({ error: 'One of the fields is too long.' });
    }

    const created = await taskRequestService.createRequest({
      title,
      project_name,
      description,
      due_date,
      requested_by: req.user.id, // always from the session, never from the body
    });

    // Fire-and-forget: a notification problem must never fail the request.
    taskRequestService.notifyManagers(created).catch((err) => {
      console.error('notifyManagers failed:', err?.message);
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('POST /task-requests failed:', err);
    res.status(500).json({ error: 'Could not save the request.' });
  }
});

// GET /task-requests: managers see all requests, newest first
router.get('/', authenticate, requireManager, async (req, res) => {
  try {
    res.json(await taskRequestService.listRequests());
  } catch (err) {
    console.error('GET /task-requests failed:', err);
    res.status(500).json({ error: 'Could not load requests.' });
  }
});

// DELETE /task-requests/:id: managers remove a handled request
router.delete('/:id', authenticate, requireManager, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id.' });

    await taskRequestService.deleteRequest(id);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /task-requests failed:', err);
    res.status(500).json({ error: 'Could not delete the request.' });
  }
});

module.exports = router;