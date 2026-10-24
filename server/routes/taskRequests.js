const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const taskRequestService = require('../services/taskRequestService');
const { setTotalHeader } = require('../utils/listLimit');

// Only managers can view all requests, approve, decline or delete them
// (roles in members: manager / member).
const requireManager = (req, res, next) => {
  if (req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  next();
};

// task_requests.id follows the members id type: integer or UUID.
function validId(req, res) {
  const id = String(req.params.id);
  const isIntegerId = /^\d{1,18}$/.test(id);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isIntegerId && !isUuid) {
    res.status(400).json({ error: 'Invalid id.' });
    return null;
  }
  return id;
}

// Errors with a status (400 / 403 / 404 / 409) carry a message meant for the
// person; anything else is logged and answered with `fallback`.
function sendError(res, err, label, fallback) {
  if (err?.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`${label} failed:`, err);
  return res.status(500).json({ error: fallback });
}

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

// GET /task-requests/mine: the signed-in person's own requests, with status.
// Registered before the /:id routes.
router.get('/mine', authenticate, async (req, res) => {
  try {
    const { rows, total } = await taskRequestService.listMine(req.user);
    setTotalHeader(res, total);
    res.json(rows);
  } catch (err) {
    sendError(res, err, 'GET /task-requests/mine', 'Could not load your requests.');
  }
});

// GET /task-requests: managers see requests, newest first.
// ?status=pending | handled. Without it, every request (as before).
router.get('/', authenticate, requireManager, async (req, res) => {
  try {
    const status = ['pending', 'handled'].includes(req.query.status) ? req.query.status : undefined;
    const { rows, total } = await taskRequestService.listRequests({ status });
    setTotalHeader(res, total);
    res.json(rows);
  } catch (err) {
    sendError(res, err, 'GET /task-requests', 'Could not load requests.');
  }
});

// POST /task-requests/:id/approve: body { task?, note? }.
// With `task` ({ project_id, title, description, priority, cluster_id,
// assignee_ids, due_date }) a main task is created and linked to the request.
router.post('/:id/approve', authenticate, requireManager, async (req, res) => {
  const id = validId(req, res);
  if (!id) return;
  try {
    const task = req.body?.task && typeof req.body.task === 'object' ? req.body.task : null;
    const request = await taskRequestService.approveRequest(id, req.user, {
      task,
      note: req.body?.note,
    });
    res.json(request);
  } catch (err) {
    sendError(res, err, 'POST /task-requests/:id/approve', 'Could not approve the request.');
  }
});

// POST /task-requests/:id/decline: body { note? } (the reason, shown to the member).
router.post('/:id/decline', authenticate, requireManager, async (req, res) => {
  const id = validId(req, res);
  if (!id) return;
  try {
    const request = await taskRequestService.declineRequest(id, req.user, { note: req.body?.note });
    res.json(request);
  } catch (err) {
    sendError(res, err, 'POST /task-requests/:id/decline', 'Could not decline the request.');
  }
});

// POST /task-requests/:id/cancel: the member who asked withdraws a pending request.
router.post('/:id/cancel', authenticate, async (req, res) => {
  const id = validId(req, res);
  if (!id) return;
  try {
    await taskRequestService.cancelRequest(id, req.user);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, 'POST /task-requests/:id/cancel', 'Could not cancel the request.');
  }
});

// DELETE /task-requests/:id: managers remove a request (spam, duplicates).
router.delete('/:id', authenticate, requireManager, async (req, res) => {
  const id = validId(req, res);
  if (!id) return;
  try {
    await taskRequestService.deleteRequest(id);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, 'DELETE /task-requests', 'Could not delete the request.');
  }
});

module.exports = router;
