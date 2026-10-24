// Uses the same pg pool as the rest of the server.
const pool = require('../db');
const { sendToMany, createNotification } = require('../utils/pushNotify');
const { LIST_SAFETY_LIMIT, TOTAL_COLUMN, splitTotal } = require('../utils/listLimit');
const liveEvents = require('./liveEvents');

// Lazy: taskService pulls in a lot, and only approve needs it.
let taskServiceModule = null;
const taskService = () => (taskServiceModule ||= require('./taskService'));

const STATUSES = ['pending', 'approved', 'declined'];
const NOTE_MAX = 1000;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Columns every list returns: the request, who asked, who handled it, and
// the task made from it (null when there is none or it was deleted).
const REQUEST_COLUMNS = `
  tr.id, tr.title, tr.project_name, tr.description,
  to_char(tr.due_date, 'YYYY-MM-DD') as due_date,
  tr.requested_by, tr.created_at,
  tr.status, tr.handled_by, tr.handled_at, tr.admin_note, tr.task_id,
  m.name as requested_by_name,
  h.name as handled_by_name,
  t.title as task_title,
  t.project_id as task_project_id,
  t.stage as task_stage,
  tp.name as task_project_name`;

const REQUEST_JOINS = `
  left join members m on m.id = tr.requested_by
  left join members h on h.id = tr.handled_by
  left join tasks t on t.id = tr.task_id
  left join projects tp on tp.id = t.project_id`;

async function createRequest({ title, project_name, description, due_date, requested_by }) {
  const { rows } = await pool.query(
    `insert into task_requests (title, project_name, description, due_date, requested_by)
     values ($1, $2, $3, $4, $5)
     returning id, title, project_name, description,
               to_char(due_date, 'YYYY-MM-DD') as due_date,
               requested_by, created_at, status`,
    [title, project_name, description, due_date, requested_by]
  );
  liveEvents.taskRequestChanged(requested_by);
  return rows[0];
}

// Requests for managers, newest first, with names included.
// status: 'pending' | 'handled' (approved or declined) | anything else = all.
// Returns { rows, total }: rows are capped at LIST_SAFETY_LIMIT, total is
// the real number of matching requests.
async function listRequests({ status } = {}) {
  let where = 'true';
  if (status === 'pending') where = `tr.status = 'pending'`;
  else if (status === 'handled') where = `tr.status <> 'pending'`;

  const { rows } = await pool.query(
    `select ${REQUEST_COLUMNS},
            count(*) over() as ${TOTAL_COLUMN}
       from task_requests tr
       ${REQUEST_JOINS}
      where ${where}
      order by ${status === 'handled' ? 'tr.handled_at desc nulls last,' : ''} tr.created_at desc
      limit $1`,
    [LIST_SAFETY_LIMIT]
  );
  return splitTotal(rows);
}

// The signed-in person's own requests, newest first.
// task_open: true when they can open the task made from the request
// (managers always; members when they are on that project and it is not
// in the trash). Otherwise the page shows the task name without a link.
async function listMine(user) {
  const { rows } = await pool.query(
    `select ${REQUEST_COLUMNS},
            (t.id is not null and tp.trashed_at is null and (
               $2::boolean or exists (
                 select 1 from project_members pm
                  where pm.project_id = t.project_id and pm.member_id = $1
               )
            )) as task_open,
            count(*) over() as ${TOTAL_COLUMN}
       from task_requests tr
       ${REQUEST_JOINS}
      where tr.requested_by = $1
      order by tr.created_at desc
      limit $3`,
    [user.id, user.role === 'manager', LIST_SAFETY_LIMIT]
  );
  return splitTotal(rows);
}

async function getRequest(id) {
  const { rows } = await pool.query(
    `select ${REQUEST_COLUMNS}
       from task_requests tr
       ${REQUEST_JOINS}
      where tr.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Why a pending-only update matched nothing: missing, or already handled.
async function notPendingError(id) {
  const { rows } = await pool.query('select status from task_requests where id = $1', [id]);
  if (!rows[0]) return httpError(404, 'This request no longer exists.');
  return httpError(409, `This request was already ${rows[0].status}.`);
}

function cleanNote(note) {
  const value = String(note ?? '').trim();
  if (value.length > NOTE_MAX) throw httpError(400, `Keep the note under ${NOTE_MAX} characters.`);
  return value || null;
}

// Only the fields a main task created from a request may carry.
function pickTaskFields(task) {
  const out = {
    project_id: task.project_id,
    title: String(task.title ?? '').trim(),
    description: String(task.description ?? ''),
    priority: task.priority,
    cluster_id: task.cluster_id || null,
  };
  if (Array.isArray(task.assignee_ids)) out.assignee_ids = task.assignee_ids;
  if (task.due_date) out.due_date = task.due_date;
  return out;
}

/*
 * Approve a pending request. With `task`, also creates that main task and
 * links it to the request.
 *
 * The request is claimed first (pending -> approved, in one guarded
 * update), so two managers approving at once cannot create two tasks. If
 * creating the task then fails, the request goes back to pending and the
 * error is passed on.
 */
async function approveRequest(id, user, { task = null, note = null } = {}) {
  const adminNote = cleanNote(note);

  let fields = null;
  if (task) {
    fields = pickTaskFields(task);
    if (!fields.project_id) throw httpError(400, 'Choose a project for the task.');
    if (!fields.title) throw httpError(400, 'Enter a task title.');
    if (fields.title.length > 500) throw httpError(400, 'The task title is too long.');
  }

  const { rows } = await pool.query(
    `update task_requests
        set status = 'approved', handled_by = $2, handled_at = now(), admin_note = $3
      where id = $1 and status = 'pending'
      returning id`,
    [id, user.id, adminNote]
  );
  if (!rows[0]) throw await notPendingError(id);

  if (fields) {
    let created;
    try {
      created = await taskService().createTask(fields, user);
    } catch (err) {
      await pool
        .query(
          `update task_requests
              set status = 'pending', handled_by = null, handled_at = null, admin_note = null
            where id = $1 and status = 'approved' and task_id is null`,
          [id]
        )
        .catch((undoErr) => console.error('[task-request] undo approve failed:', undoErr?.message));
      throw err;
    }
    await pool.query('update task_requests set task_id = $2 where id = $1', [id, created.id]);
  }

  const request = await getRequest(id);
  afterHandled(request, user);
  return request;
}

async function declineRequest(id, user, { note = null } = {}) {
  const adminNote = cleanNote(note);
  const { rows } = await pool.query(
    `update task_requests
        set status = 'declined', handled_by = $2, handled_at = now(), admin_note = $3
      where id = $1 and status = 'pending'
      returning id`,
    [id, user.id, adminNote]
  );
  if (!rows[0]) throw await notPendingError(id);

  const request = await getRequest(id);
  afterHandled(request, user);
  return request;
}

// A member withdraws their own request while it is still pending.
async function cancelRequest(id, user) {
  const { rows } = await pool.query(
    `delete from task_requests
      where id = $1 and requested_by = $2 and status = 'pending'
      returning id`,
    [id, user.id]
  );
  if (!rows[0]) {
    const { rows: found } = await pool.query(
      'select status, requested_by from task_requests where id = $1',
      [id]
    );
    if (!found[0] || String(found[0].requested_by) !== String(user.id)) {
      throw httpError(404, 'This request no longer exists.');
    }
    throw httpError(409, `This request was already ${found[0].status}, so it can't be cancelled.`);
  }
  liveEvents.taskRequestChanged(user.id);
}

async function deleteRequest(id) {
  const { rows } = await pool.query(
    'delete from task_requests where id = $1 returning requested_by',
    [id]
  );
  if (rows[0]) liveEvents.taskRequestChanged(rows[0].requested_by);
}

// After approve / decline: live refresh for everyone, and a bell + push to
// the member who asked (not when a manager handles their own request).
function afterHandled(request, user) {
  if (!request) return;
  liveEvents.taskRequestChanged(request.requested_by);
  if (String(request.requested_by) === String(user.id)) return;

  notifyRequester(request, user).catch((err) => {
    console.error('[task-request] notifying the requester failed:', err?.message);
  });
}

async function notifyRequester(request, user) {
  let actor = user.name;
  if (!actor) {
    const { rows } = await pool.query('select name from members where id = $1', [user.id]);
    actor = rows[0]?.name || 'An admin';
  }

  const approved = request.status === 'approved';
  const title = approved ? '✅ Task request approved' : 'Task request declined';
  let body = `${actor} ${approved ? 'approved' : 'declined'} "${request.title}"`;
  if (approved && request.task_project_name) body += ` and added it to ${request.task_project_name}`;
  if (request.admin_note) body += `. Note: ${request.admin_note.slice(0, 200)}`;

  await createNotification(request.requested_by, title, body, {
    type: 'task_request_update',
    entityType: 'task_request',
    entityId: request.id,
    url: '/task-request?tab=mine',
    eventKey: `task_request_update:${request.id}:${request.status}`,
  });
}

// Tell every active manager (except the requester) about a new request.
// Saves the in-app bell notification and sends browser push, via the same
// createNotification helper the rest of Orbit uses.
async function notifyManagers(request) {
  const { rows: requester } = await pool.query(
    'select name from members where id = $1',
    [request.requested_by]
  );
  const requesterName = requester[0]?.name || 'A member';

  const { rows: managers } = await pool.query(
    `select id from members
      where role = 'manager' and active = true and id <> $1`,
    [request.requested_by]
  );
  if (!managers.length) return;

  await sendToMany(
    managers.map(m => m.id),
    'New task request',
    `${requesterName} requested "${request.title}" for ${request.project_name}`,
    {
      type: 'task_request',
      entityType: 'task_request',
      entityId: request.id,
      url: '/requested-tasks',
      eventKey: `task_request:${request.id}`,
    }
  );
}

module.exports = {
  STATUSES,
  createRequest,
  listRequests,
  listMine,
  getRequest,
  approveRequest,
  declineRequest,
  cancelRequest,
  deleteRequest,
  notifyManagers,
};
