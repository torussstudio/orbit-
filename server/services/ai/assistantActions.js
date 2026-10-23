'use strict';

/*
 * Orbit AI actions (Phase 2): things the assistant can DO.
 *
 * Nothing changes until the person clicks Confirm:
 *   1. the model calls an action tool, e.g. create_task
 *   2. prepare() checks it (names → ids, dates, permissions) and saves a
 *      pending action with a human preview — no change yet
 *   3. the chat shows a card with Confirm / Cancel
 *   4. confirm() runs it through the SAME services the app uses, so every
 *      rule, notification, activity entry and live update still happens
 *
 * Pending actions expire after 30 minutes and can be confirmed once, only
 * by the person they were prepared for. Permissions are checked again when
 * confirming (by the services themselves).
 *
 * Who can do what (same as the app):
 *   create_task   admins: create tasks / sub tasks.
 *                 members: sub tasks under their own task; anything else
 *                 becomes a Task Request to the admins.
 *   update_task   admins: stage, priority, due date, assignees, title.
 *                 members: stage only (not Done / Rework).
 *   add_comment   anyone with access to the task.
 *   log_time      the person's own time, on their own open tasks.
 *   create_event  admins only.
 */

const crypto = require('node:crypto');
const db = require('../../db');
const tools = require('./assistantTools');

const EXPIRES_MIN = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const fail = (message) => ({ error: message });
const lazy = (path) => { let mod; return () => (mod ||= require(path)); };
const taskService = lazy('../taskService');
const timeLogService = lazy('../timeLogService');
const calendarService = lazy('../calendarService');
const taskRequestService = lazy('../taskRequestService');
const accessControl = lazy('../accessControl');

const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: tools.TZ }).format(new Date());
const prettyDate = (d) => (d ? new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)) : null);
// A date pasted next to a task (e.g. the day it was noted down) is not a
// deadline. A due date in the past is sent back to the model instead of
// being saved.
const PAST_DUE = 'That due date is in the past. If it was only the date written next to the task (not a deadline), prepare it again without due_date. If the person really meant it as the deadline, ask them for a new date.';

const validDate = (d) => DATE_RE.test(String(d || '')) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime());

/* ---------- Declarations ---------- */

const declarations = [
  {
    name: 'create_task',
    description: 'Prepare a new task (or a sub task under parent_task). Admins create it directly; for members it becomes a sub task under their own task, or otherwise a Task Request to the admins. Needs the person to confirm.',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'The project name exactly as the person wrote it (e.g. "Orbit"). Never replace it with another project.' },
        title: { type: 'string' },
        description: { type: 'string' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Member names. Admins only.' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        priority: { type: 'string', enum: PRIORITIES },
        parent_task: { type: 'string', description: 'Main task (id or title) to add this under as a sub task.' },
        confirmed_as_typed: { type: 'boolean', description: 'Members only: true when the person confirmed a project name that is not in Orbit is correct as typed.' },
      },
      required: ['project', 'title'],
    },
  },
  {
    name: 'update_task',
    description: "Prepare a change to a task: stage (e.g. 'In Progress', 'In Review'; admins also 'Done' or 'Rework'), priority, due date, assignees or title. Members can change only the stage. Needs the person to confirm.",
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task id or title words.' },
        stage: { type: 'string' },
        priority: { type: 'string', enum: PRIORITIES },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Full new list of member names (admins only).' },
        title: { type: 'string' },
      },
      required: ['task'],
    },
  },
  {
    name: 'add_comment',
    description: 'Prepare a comment on a task. Needs the person to confirm.',
    parameters: {
      type: 'object',
      properties: { task: { type: 'string' }, text: { type: 'string' } },
      required: ['task', 'text'],
    },
  },
  {
    name: 'log_time',
    description: "Prepare a Time Log entry for the person's own work on one of their open tasks. Needs the person to confirm.",
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task id or title words.' },
        minutes: { type: 'integer', description: 'Time in minutes (2 hours = 120).' },
        date: { type: 'string', description: 'YYYY-MM-DD, default today. Not in the future.' },
      },
      required: ['task', 'minutes'],
    },
  },
  {
    name: 'create_event',
    description: 'Admins only: prepare a calendar event (meeting, deadline). Needs the person to confirm.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        start_time: { type: 'string', description: 'HH:MM 24h, optional (all day if empty)' },
        end_time: { type: 'string', description: 'HH:MM 24h, optional' },
        description: { type: 'string' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Member names to invite.' },
        type: { type: 'string', enum: ['event', 'deadline'] },
      },
      required: ['title', 'date'],
    },
  },
];

const names = new Set(declarations.map((d) => d.name));
const isAction = (name) => names.has(name);

/* ---------- Prepare (validate + preview, no change) ---------- */

// Task requests (members): the project is free text in the app, and a member
// may ask for work in any project. Use the matching project's real name when
// one matches. A misspelt or unknown name is never guessed: the person is
// asked first ("Did you mean Orbit?"). { name } or { error }.
async function requestProjectName(user, asked, confirmedAsTyped) {
  const words = String(asked || '').trim().slice(0, 255);
  if (!words) return fail('Which project is this for?');
  const { rows } = await db.query(
    `SELECT name FROM projects
      WHERE trashed_at IS NULL AND COALESCE(status, 'active') <> 'archived'
        AND (lower(name) = lower($1) OR name ILIKE $2 OR client_name ILIKE $2)
      ORDER BY (lower(name) = lower($1)) DESC, length(name) LIMIT 3`,
    [words, `%${words.replace(/[\\%_]/g, (c) => `\\${c}`)}%`],
  );
  const exact = rows.find((r) => r.name.toLowerCase() === words.toLowerCase());
  if (exact) return { name: exact.name };
  if (rows.length === 1) return { name: rows[0].name };
  if (rows.length > 1) return fail(`"${words}" matches several projects: ${rows.map((r) => r.name).join(', ')}. Ask which one.`);
  if (confirmedAsTyped) return { name: words };
  const close = await tools.suggestProjects(user, words, { anyProject: true });
  if (close.length) {
    return fail(`There is no project called "${words}". Closest: ${close.map((n) => `"${n}"`).join(', ')}. Ask the person "Did you mean ${close[0]}?" and wait. If yes, prepare again with that name; if they say "${words}" is right as typed, prepare again with confirmed_as_typed: true.`);
  }
  return fail(`There is no project called "${words}" in Orbit. Ask the person to check the name. If they say it is right (for example a new project), prepare again with confirmed_as_typed: true.`);
}

async function prepareCreateTask(user, a) {
  const title = String(a.title || '').trim().slice(0, 255);
  if (!title) return fail('What should the task be called?');
  if (!tools.isManager(user) && !a.parent_task) {
    // Members can't create main tasks: send a Task Request instead.
    const resolved = await requestProjectName(user, a.project, a.confirmed_as_typed === true);
    if (resolved.error) return resolved;
    const projectName = resolved.name;
    if (a.due_date && !validDate(a.due_date)) return fail('Due date must be YYYY-MM-DD.');
    if (a.due_date && a.due_date < istToday()) return fail(PAST_DUE);
    const description = String(a.description || '').trim().slice(0, 5000);
    return {
      kind: 'task_request',
      payload: { title, project_name: projectName, description, due_date: a.due_date || null },
      preview: {
        title: 'Send a task request to the admins',
        lines: [`Task: ${title}`, `Project: ${projectName}`, a.due_date && `Wanted by: ${prettyDate(a.due_date)}`, description && `Details: ${description.slice(0, 140)}`].filter(Boolean),
        note: 'Members can’t create main tasks, so this goes to the admins as a request.',
      },
    };
  }
  const projects = await tools.findProjects(user, a.project || '');
  if (!projects.length) {
    const close = await tools.suggestProjects(user, a.project);
    return fail(close.length
      ? `There is no project called "${a.project}". Closest: ${close.map((n) => `"${n}"`).join(', ')}. Ask the person "Did you mean ${close[0]}?" and wait for a yes before preparing it again.`
      : `No project matching "${a.project}" that this person can see. Ask them to check the name.`);
  }
  if (projects.length > 1 && projects[0].name.toLowerCase() !== String(a.project).toLowerCase()) {
    return fail(`"${a.project}" matches several projects: ${projects.map((p) => p.name).join(', ')}. Ask which one.`);
  }
  const project = projects[0];
  if (a.due_date && !validDate(a.due_date)) return fail('Due date must be YYYY-MM-DD.');
  if (a.due_date && a.due_date < istToday()) return fail(PAST_DUE);
  const priority = PRIORITIES.includes(String(a.priority || '').toLowerCase()) ? String(a.priority).toLowerCase() : 'medium';
  const description = String(a.description || '').trim().slice(0, 5000);

  let parent = null;
  if (a.parent_task) {
    const found = await tools.findTask(user, a.parent_task, { includeDone: false });
    if (!found.task) return found;
    if (String(found.task.project_id) !== String(project.id)) return fail(`"${found.task.title}" is not in ${project.name}.`);
    parent = found.task;
  }

  if (!tools.isManager(user) && !parent) {
    // Members can't create main tasks: send a Task Request instead.
    return {
      kind: 'task_request',
      payload: { title, project_name: project.name, description, due_date: a.due_date || null },
      preview: {
        title: 'Send a task request to the admins',
        lines: [`Task: ${title}`, `Project: ${project.name}`, a.due_date && `Wanted by: ${prettyDate(a.due_date)}`, description && `Details: ${description.slice(0, 140)}`].filter(Boolean),
        note: 'Members can’t create main tasks, so this goes to the admins as a request.',
      },
    };
  }

  let assignees = [];
  if (Array.isArray(a.assignees) && a.assignees.length) {
    if (!tools.isManager(user)) return fail('Only admins can assign people.');
    const found = await tools.findMembers(a.assignees);
    if (!found.members) return found;
    assignees = found.members;
  }
  return {
    kind: 'create_task',
    payload: {
      project_id: project.id, title, description, priority, stage: 'Todo',
      due_date: a.due_date || null,
      assignee_ids: assignees.map((m) => m.id),
      parent_task_id: parent?.id || null,
    },
    preview: {
      title: parent ? 'Create a sub task' : 'Create a task',
      lines: [
        `Task: ${title}`,
        `Project: ${project.name}${parent ? ` · under “${parent.title}”` : ''}`,
        assignees.length && `Assign to: ${assignees.map((m) => m.name).join(', ')}`,
        a.due_date && `Due: ${prettyDate(a.due_date)}`,
        `Priority: ${priority}`,
        description && `Details: ${description.slice(0, 140)}`,
      ].filter(Boolean),
    },
  };
}

async function prepareUpdateTask(user, a) {
  const found = await tools.findTask(user, a.task);
  if (!found.task) return found;
  const task = found.task;
  const body = {};
  const lines = [`Task: ${task.title} (${task.project})`];
  const manager = tools.isManager(user);

  if (a.stage) {
    const { rows } = await db.query('SELECT custom_stages FROM projects WHERE id = $1', [task.project_id]);
    const stages = Array.isArray(rows[0]?.custom_stages) ? rows[0].custom_stages : ['Todo', 'In Progress', 'In Review', 'Done', 'Deployed'];
    const wanted = String(a.stage).trim().toLowerCase();
    let stage = stages.find((s) => String(s).toLowerCase() === wanted);
    if (!stage && wanted === 'rework') stage = 'Rework';
    if (!stage) return fail(`"${a.stage}" isn't a stage in ${task.project}. Stages: ${stages.join(', ')}${manager ? ', Rework' : ''}.`);
    if (!manager && ['Done', 'Rework'].includes(stage)) return fail('Only an admin can mark a task Done or send it to Rework. Move it to In Review instead.');
    if (!manager && task.stage === 'Done') return fail('Only an admin can change a task that is Done.');
    if (stage === task.stage) return fail(`It is already in ${stage}.`);
    body.stage = stage;
    lines.push(`Stage: ${task.stage} → ${stage}`);
  }
  if (!manager && (a.priority || a.due_date || a.assignees || a.title)) {
    if (!body.stage) return fail('Members can only change the stage of a task. Ask an admin for other changes.');
    lines.push('(Only the stage changes: members can’t change other fields.)');
  }
  if (manager) {
    if (a.priority) {
      const p = String(a.priority).toLowerCase();
      if (!PRIORITIES.includes(p)) return fail(`Priority must be one of ${PRIORITIES.join(', ')}.`);
      body.priority = p; lines.push(`Priority: ${task.priority || '–'} → ${p}`);
    }
    if (a.due_date) {
      if (!validDate(a.due_date)) return fail('Due date must be YYYY-MM-DD.');
      body.due_date = a.due_date; lines.push(`Due: ${prettyDate(task.due) || 'none'} → ${prettyDate(a.due_date)}`);
    }
    if (a.title) { body.title = String(a.title).trim().slice(0, 255); lines.push(`Title: ${body.title}`); }
    if (Array.isArray(a.assignees)) {
      const found2 = await tools.findMembers(a.assignees);
      if (!found2.members) return found2;
      body.assignee_ids = found2.members.map((m) => m.id);
      lines.push(`Assign to: ${found2.members.map((m) => m.name).join(', ') || 'nobody'}`);
    }
  }
  if (!Object.keys(body).length) return fail('What should change on the task?');
  return {
    kind: 'update_task',
    payload: { task_id: task.id, project_id: task.project_id, body },
    preview: { title: 'Update a task', lines },
  };
}

async function prepareComment(user, a) {
  const found = await tools.findTask(user, a.task);
  if (!found.task) return found;
  const content = String(a.text || '').trim().slice(0, 10000);
  if (!content) return fail('What should the comment say?');
  return {
    kind: 'add_comment',
    payload: { task_id: found.task.id, project_id: found.task.project_id, content },
    preview: { title: 'Add a comment', lines: [`Task: ${found.task.title} (${found.task.project})`, `“${content.slice(0, 300)}”`] },
  };
}

async function prepareLogTime(user, a) {
  const minutes = Math.round(Number(a.minutes));
  if (!Number.isFinite(minutes) || minutes <= 0) return fail('How long did it take (in minutes)?');
  if (minutes > 24 * 60) return fail("One entry can't be more than 24 hours.");
  const date = a.date || istToday();
  if (!validDate(date)) return fail('Date must be YYYY-MM-DD.');
  if (date > istToday()) return fail("The date can't be in the future.");
  const options = await timeLogService().getMemberOptions(user.id);
  const ref = String(a.task || '').trim().toLowerCase();
  const matches = options.tasks.filter((t) => String(t.id) === ref || String(t.title).toLowerCase().includes(ref));
  if (!matches.length) return fail(`"${a.task}" isn't one of your open tasks you can log time on (In Review and Done tasks can't take new time).`);
  const exact = matches.filter((t) => String(t.title).toLowerCase() === ref);
  if (matches.length > 1 && exact.length !== 1) return fail(`Several of your tasks match "${a.task}": ${matches.slice(0, 5).map((t) => t.title).join(', ')}. Ask which one.`);
  const task = exact[0] || matches[0];
  const project = options.projects.find((p) => String(p.id) === String(task.project_id));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return {
    kind: 'log_time',
    payload: { project_id: task.project_id, task_id: task.id, minutes, work_date: date },
    preview: { title: 'Log time', lines: [`Task: ${task.title}${project ? ` (${project.name})` : ''}`, `Time: ${h ? `${h} h ` : ''}${m ? `${m} min` : ''}`.trim(), `Date: ${prettyDate(date)}`] },
  };
}

async function prepareEvent(user, a) {
  if (!tools.isManager(user)) return fail('Only admins can add calendar events.');
  const title = String(a.title || '').trim().slice(0, 500);
  if (!title) return fail('What is the event called?');
  if (!validDate(a.date)) return fail('Date must be YYYY-MM-DD.');
  if (a.start_time && !TIME_RE.test(a.start_time)) return fail('Start time must be HH:MM.');
  if (a.end_time && !TIME_RE.test(a.end_time)) return fail('End time must be HH:MM.');
  const pad = (t) => t.padStart(5, '0');
  const start = `${a.date}T${a.start_time ? pad(a.start_time) : '00:00'}:00+05:30`;
  const end = `${a.date}T${a.end_time ? pad(a.end_time) : a.start_time ? pad(a.start_time) : '23:59'}:00+05:30`;
  let attendees = [];
  if (Array.isArray(a.attendees) && a.attendees.length) {
    const found = await tools.findMembers(a.attendees);
    if (!found.members) return found;
    attendees = found.members;
  }
  return {
    kind: 'create_event',
    payload: { title, description: String(a.description || '').slice(0, 2000), start_date: start, end_date: end, type: a.type === 'deadline' ? 'deadline' : 'event', member_ids: attendees.map((m) => m.id) },
    preview: {
      title: 'Add a calendar event',
      lines: [
        `Event: ${title}`,
        `When: ${prettyDate(a.date)}${a.start_time ? `, ${a.start_time}${a.end_time ? `–${a.end_time}` : ''}` : ' (all day)'}`,
        attendees.length && `Invite: ${attendees.map((m) => m.name).join(', ')}`,
      ].filter(Boolean),
    },
  };
}

const preparers = {
  create_task: prepareCreateTask,
  update_task: prepareUpdateTask,
  add_comment: prepareComment,
  log_time: prepareLogTime,
  create_event: prepareEvent,
};

// Validates and saves a pending action. Never throws.
// Returns { action, forModel } or { error } for the model.
async function prepare(user, name, args) {
  try {
    const prepared = await preparers[name](user, args && typeof args === 'object' ? args : {});
    if (prepared.error) return { forModel: prepared };
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO ai_actions (id, member_id, kind, payload, preview, status, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'pending', NOW() + make_interval(mins => $6))`,
      [id, user.id, prepared.kind, JSON.stringify(prepared.payload), JSON.stringify(prepared.preview), EXPIRES_MIN],
    );
    const action = { id, kind: prepared.kind, status: 'pending', preview: prepared.preview };
    return {
      action,
      forModel: {
        status: 'waiting_for_confirmation',
        summary: prepared.preview,
        note: 'Card shown; nothing has changed yet. If the person asked for more items in their message, prepare every remaining one now, in this same reply. Then tell them to press Confirm (or Confirm all when there are several cards).',
      },
    };
  } catch (err) {
    console.error(`[ai] prepare ${name} failed:`, err?.message);
    return { forModel: fail('Could not prepare that. Try again with more detail.') };
  }
}

/* ---------- Confirm / cancel ---------- */

const httpError = (status, message) => Object.assign(new Error(message), { status });

async function loadOwn(user, id) {
  const { rows } = await db.query(
    `SELECT id, member_id, kind, payload, preview, status, result, expires_at < NOW() AS expired
       FROM ai_actions WHERE id = $1`,
    [String(id || '')],
  );
  const action = rows[0];
  if (!action || String(action.member_id) !== String(user.id)) throw httpError(404, 'Action not found.');
  return action;
}

const publicAction = (a) => ({ id: a.id, kind: a.kind, status: a.status, preview: a.preview, result: a.result || null });

async function execute(user, kind, p) {
  switch (kind) {
    case 'create_task': {
      const task = await taskService().createTask({ ...p }, user);
      return { text: `Created “${task.title}”.`, link: `/projects/${task.project_id}/tasks/${task.id}` };
    }
    case 'task_request': {
      const created = await taskRequestService().createRequest({ ...p, requested_by: user.id });
      taskRequestService().notifyManagers(created).catch(() => {});
      return { text: `Request “${p.title}” sent to the admins.` };
    }
    case 'update_task': {
      await accessControl().assertTaskAccess(user, p.task_id);
      const task = await taskService().updateTask(p.task_id, { ...p.body }, user);
      return { text: `Updated “${task?.title || 'the task'}”.`, link: `/projects/${p.project_id}/tasks/${p.task_id}` };
    }
    case 'add_comment': {
      await accessControl().assertTaskAccess(user, p.task_id);
      await taskService().createComment(p.task_id, user.id, p.content);
      return { text: 'Comment added.', link: `/projects/${p.project_id}/tasks/${p.task_id}` };
    }
    case 'log_time': {
      const entry = await timeLogService().createEntry(user.id, { ...p });
      return { text: `Logged ${Math.round((entry.minutes / 60) * 10) / 10} h on “${entry.task_title || 'the task'}”.` };
    }
    case 'create_event': {
      if (!tools.isManager(user)) throw httpError(403, 'Only admins can add calendar events.');
      const event = await calendarService().createEvent({ ...p }, user.id);
      return { text: `Added “${event.title}” to the calendar.`, link: '/calendar' };
    }
    default:
      throw httpError(400, 'Unknown action.');
  }
}

async function confirm(user, id) {
  const action = await loadOwn(user, id);
  if (action.status !== 'pending') return { action: publicAction(action) };
  if (action.expired) {
    await db.query(`UPDATE ai_actions SET status = 'expired' WHERE id = $1`, [action.id]);
    throw httpError(410, 'This expired. Ask Orbit AI again.');
  }
  // Claim it first so a double click can't run it twice.
  const claim = await db.query(`UPDATE ai_actions SET status = 'running' WHERE id = $1 AND status = 'pending' RETURNING id`, [action.id]);
  if (!claim.rowCount) return { action: publicAction(await loadOwn(user, id)) };
  try {
    const result = await execute(user, action.kind, action.payload);
    await db.query(`UPDATE ai_actions SET status = 'done', result = $2::jsonb, done_at = NOW() WHERE id = $1`, [action.id, JSON.stringify(result)]);
    return { action: { ...publicAction(action), status: 'done', result }, message: result.text };
  } catch (err) {
    const message = err?.status && err.status < 500 ? err.message : 'That did not work. Nothing was changed.';
    if (!err?.status || err.status >= 500) console.error('[ai] action failed:', err?.message);
    await db.query(`UPDATE ai_actions SET status = 'failed', result = $2::jsonb WHERE id = $1`, [action.id, JSON.stringify({ text: message })]);
    return { action: { ...publicAction(action), status: 'failed', result: { text: message } }, message: `⚠️ ${message}` };
  }
}

async function cancel(user, id) {
  const action = await loadOwn(user, id);
  if (action.status === 'pending') await db.query(`UPDATE ai_actions SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`, [action.id]);
  return { action: { ...publicAction(action), status: action.status === 'pending' ? 'cancelled' : action.status } };
}

// Current state of saved actions (for chat history).
async function states(user, ids) {
  if (!ids.length) return new Map();
  const { rows } = await db.query(
    `SELECT id, kind, preview, result,
            CASE WHEN status = 'pending' AND expires_at < NOW() THEN 'expired' ELSE status END AS status
       FROM ai_actions WHERE member_id = $1 AND id = ANY($2::text[])`,
    [user.id, ids.map(String)],
  );
  return new Map(rows.map((r) => [r.id, publicAction(r)]));
}

// The person's latest actions (last 2 hours), so a follow-up like a second
// set of task details is understood as "the same again". Newest first.
const KIND_LABEL = {
  create_task: 'create task',
  task_request: 'task request',
  update_task: 'update task',
  add_comment: 'comment',
  log_time: 'log time',
  create_event: 'calendar event',
};

async function recent(user, limit = 5) {
  const { rows } = await db.query(
    `SELECT kind, preview,
            CASE WHEN status = 'pending' AND expires_at < NOW() THEN 'expired' ELSE status END AS status,
            GREATEST(0, ROUND(EXTRACT(EPOCH FROM NOW() - created_at) / 60))::int AS minutes_ago
       FROM ai_actions
      WHERE member_id = $1 AND created_at > NOW() - INTERVAL '2 hours'
      ORDER BY created_at DESC
      LIMIT $2`,
    [user.id, limit],
  );
  return rows.map((r) => {
    const first = (r.preview?.lines || [])[0] || r.preview?.title || '';
    return `${KIND_LABEL[r.kind] || r.kind} — ${String(first).slice(0, 90)} — ${r.status === 'pending' ? 'waiting for Confirm' : r.status}, ${r.minutes_ago} min ago`;
  });
}

module.exports = { declarations, isAction, prepare, confirm, cancel, states, recent };
