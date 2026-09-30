// Uses the same pg pool as the rest of the server.
const pool = require('../db');

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

module.exports = { createRequest, listRequests, deleteRequest };