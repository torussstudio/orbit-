// // Uses the same pg pool as the rest of the server.
// const pool = require('../db');

// async function createRequest({ title, project_name, description, due_date, requested_by }) {
//   const { rows } = await pool.query(
//     `insert into task_requests (title, project_name, description, due_date, requested_by)
//      values ($1, $2, $3, $4, $5)
//      returning *`,
//     [title, project_name, description, due_date, requested_by]
//   );
//   return rows[0];
// }

// // All requests, newest first, with the requester's name included.
// async function listRequests() {
//   const { rows } = await pool.query(
//     `select tr.*, m.name as requested_by_name
//        from task_requests tr
//        left join members m on m.id = tr.requested_by
//       order by tr.created_at desc`
//   );
//   return rows;
// }

// async function deleteRequest(id) {
//   await pool.query('delete from task_requests where id = $1', [id]);
// }

// module.exports = { createRequest, listRequests, deleteRequest };


// Uses the same pg pool as the rest of the server.
const pool = require('../db');
const { sendToMany } = require('../utils/pushNotify');

async function createRequest({ title, project_name, description, due_date, requested_by }) {
  const { rows } = await pool.query(
    `insert into task_requests (title, project_name, description, due_date, requested_by)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [title, project_name, description, due_date, requested_by]
  );
  return rows[0];
}

// All requests, newest first, with the requester's name included.
async function listRequests() {
  const { rows } = await pool.query(
    `select tr.*, m.name as requested_by_name
       from task_requests tr
       left join members m on m.id = tr.requested_by
      order by tr.created_at desc`
  );
  return rows;
}

async function deleteRequest(id) {
  await pool.query('delete from task_requests where id = $1', [id]);
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

module.exports = { createRequest, listRequests, deleteRequest, notifyManagers };