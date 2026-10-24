'use strict';

/*
 * What Orbit AI can look up. Every tool runs as the signed-in user with the
 * same access rules as the app (services/accessControl.js):
 *
 *   admin (manager): everything — every project, task, person, calendar
 *                    event, review, task request, time entry and activity.
 *   member:          their projects (project_members), tasks assigned to
 *                    them, their own time, calendar events they created or
 *                    attend, their own task requests, and the knowledge base
 *                    of their projects. Colleagues: public profile only.
 *
 * Never touches passwords, the Credentials vault or chat messages.
 * Results are small JSON objects; tasks also come back as "cards" so the
 * UI can link to them. Actions (changes) live in assistantActions.js.
 */

const db = require('../../db');
const { userHasTaskAccess } = require('../accessControl');
const { LEAF_TASK, IN_LIVE_PROJECT } = require('../../utils/taskScope');
// Loaded lazily inside the executors (they use findProjects / findMembers from here).
const lazy = (name) => () => require(name);
const knowledgeTools = lazy('./assistantKnowledge');
const insightTools = lazy('./assistantInsights');

let presence = null;
try { presence = require('../presence'); } catch { /* presence is optional */ }

const TZ = 'Asia/Kolkata';
const TODAY = `(NOW() AT TIME ZONE '${TZ}')::date`;
const OPEN = `t.stage NOT IN ('Done', 'Deployed')`;
const LIVE_PROJECT = `p.trashed_at IS NULL AND COALESCE(p.status, 'active') <> 'archived'`;
const isManager = (user) => user?.role === 'manager';
const text = (value, max = 80) => String(value ?? '').trim().slice(0, max);
const UUID_OR_INT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;
const fail = (message) => ({ error: message });

const TASK_SELECT = `
  SELECT t.id, t.title, t.stage, t.priority, t.project_id, p.name AS project,
         to_char(t.due_date, 'YYYY-MM-DD') AS due,
         COALESCE(t.rework_count, 0) AS rework,
         parent.title AS main_task,
         (SELECT string_agg(m.name, ', ' ORDER BY m.name)
            FROM task_assignees ta JOIN members m ON m.id = ta.member_id
           WHERE ta.task_id = t.id) AS assignees
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id`;

// Members only ever see tasks assigned to them.
function taskVisibility(user, params, alias = 't') {
  if (isManager(user)) return 'TRUE';
  params.push(user.id);
  return `EXISTS (SELECT 1 FROM task_assignees va WHERE va.task_id = ${alias}.id AND va.member_id = $${params.length})`;
}

function projectVisibility(user, params, alias = 'p') {
  if (isManager(user)) return 'TRUE';
  params.push(user.id);
  return `EXISTS (SELECT 1 FROM project_members vm WHERE vm.project_id = ${alias}.id AND vm.member_id = $${params.length})`;
}

const DATE_FILTERS = {
  today: `t.due_date::date = ${TODAY}`,
  tomorrow: `t.due_date::date = ${TODAY} + 1`,
  overdue: `t.due_date::date < ${TODAY}`,
  this_week: `t.due_date::date BETWEEN ${TODAY} AND ${TODAY} + 6`,
  next_week: `t.due_date::date BETWEEN ${TODAY} + 7 AND ${TODAY} + 13`,
  no_due_date: `t.due_date IS NULL`,
};
const WHEN = ['all', 'today', 'tomorrow', 'overdue', 'this_week', 'next_week', 'no_due_date'];

const PERIODS = {
  today: [`${TODAY}`, `${TODAY}`],
  yesterday: [`${TODAY} - 1`, `${TODAY} - 1`],
  this_week: [`date_trunc('week', ${TODAY})::date`, `${TODAY}`],
  last_week: [`date_trunc('week', ${TODAY})::date - 7`, `date_trunc('week', ${TODAY})::date - 1`],
  this_month: [`date_trunc('month', ${TODAY})::date`, `${TODAY}`],
  last_month: [`(date_trunc('month', ${TODAY}) - interval '1 month')::date`, `date_trunc('month', ${TODAY})::date - 1`],
  last_30_days: [`${TODAY} - 29`, `${TODAY}`],
};
const PERIOD_NAMES = Object.keys(PERIODS);

/* ---------- Shared lookups (also used by actions) ---------- */

// A task the user may see, by id or by words of its title.
// { task } or { error, candidates }.
async function findTask(user, ref, { includeDone = true } = {}) {
  const value = text(ref, 200);
  if (!value) return fail('Which task?');
  const params = [];
  const vis = taskVisibility(user, params);
  const where = [vis, 'p.trashed_at IS NULL'];
  if (!includeDone) where.push(OPEN);
  if (UUID_OR_INT.test(value)) {
    params.push(value);
    where.push(`t.id::text = $${params.length}`);
  } else {
    params.push(`%${value}%`);
    where.push(`t.title ILIKE $${params.length}`);
  }
  const { rows } = await db.query(
    `${TASK_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY (t.title ILIKE $${params.length}) DESC, (${OPEN}) DESC, t.updated_at DESC NULLS LAST LIMIT 6`,
    params,
  );
  if (!rows.length) return fail(`No task matching "${value}" that you can see.`);
  const exact = rows.filter((r) => r.title.toLowerCase() === value.toLowerCase());
  if (exact.length === 1 || rows.length === 1) return { task: exact[0] || rows[0] };
  return { error: `More than one task matches "${value}". Ask which one.`, candidates: rows };
}

async function findProjects(user, name) {
  const params = [`%${text(name)}%`];
  const vis = projectVisibility(user, params);
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.client_name, p.status, p.description,
            to_char(p.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(p.end_date, 'YYYY-MM-DD') AS end_date,
            p.custom_stages AS stages, p.docs_url, p.milanote_url
       FROM projects p
      WHERE (p.name ILIKE $1 OR p.client_name ILIKE $1) AND p.trashed_at IS NULL AND ${vis}
      ORDER BY (p.status = 'archived'), (lower(p.name) = lower($1)) DESC, length(p.name) LIMIT 5`,
    params,
  );
  return rows;
}

// Close project names for a misspelt one ("Orbt" -> Orbit, "tourss" -> Toruss).
// anyProject: every live project (task requests); otherwise only visible ones.
const normName = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Edit distance where swapping two neighbouring letters counts as one typo.
function typoDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
const likeness = (a, b) => (a && b ? 1 - typoDistance(a, b) / Math.max(a.length, b.length) : 0);

async function suggestProjects(user, name, { anyProject = false, limit = 3 } = {}) {
  const asked = normName(name);
  if (asked.length < 2) return [];
  const params = [];
  const vis = anyProject ? 'TRUE' : projectVisibility(user, params);
  const { rows } = await db.query(
    `SELECT p.name, p.client_name FROM projects p
      WHERE p.trashed_at IS NULL AND COALESCE(p.status, 'active') <> 'archived' AND ${vis}`,
    params,
  );
  const compact = asked.replace(/ /g, '');
  return rows
    .map((r) => {
      const options = [r.name, r.client_name].filter(Boolean).flatMap((v) => {
        const n = normName(v);
        return [n, n.replace(/ /g, ''), ...n.split(' ').filter((w) => w.length >= 3)];
      });
      const score = Math.max(0, ...options.map((o) => Math.max(likeness(asked, o), likeness(compact, o))));
      return { name: r.name, score };
    })
    .filter((r) => r.score >= 0.6)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .slice(0, limit)
    .map((r) => r.name);
}

// Active members by (part of) name. { members } or { error }.
async function findMembers(names) {
  const list = (Array.isArray(names) ? names : [names]).map((n) => text(n)).filter(Boolean);
  const found = [];
  for (const name of list) {
    const { rows } = await db.query(
      `SELECT id, name, role FROM members
        WHERE active = true AND (name ILIKE $1 OR email ILIKE $1)
        ORDER BY (lower(name) = lower($2)) DESC, (name ILIKE $3) DESC, name LIMIT 5`,
      [`%${name}%`, name, `${name}%`],
    );
    if (!rows.length) return fail(`No active member called "${name}".`);
    const exact = rows.filter((r) => r.name.toLowerCase() === name.toLowerCase() || r.name.toLowerCase().split(' ')[0] === name.toLowerCase());
    if (rows.length > 1 && exact.length !== 1) {
      return { error: `"${name}" matches more than one person: ${rows.map((r) => r.name).join(', ')}. Ask which one.` };
    }
    found.push(exact[0] || rows[0]);
  }
  return { members: found };
}

async function todayString() {
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
}

/* ---------- Declarations (Gemini function calling) ---------- */

const declarations = [
  {
    name: 'my_tasks',
    description: "The signed-in person's own open tasks (assigned to them). Use for 'my tasks', 'what should I do', 'what is due'.",
    parameters: {
      type: 'object',
      properties: {
        when: { type: 'string', enum: WHEN, description: 'Due date filter. Default all.' },
        stage: { type: 'string', description: "Optional stage, e.g. 'Todo', 'In Progress', 'In Review'." },
      },
    },
  },
  {
    name: 'find_tasks',
    description: 'Search tasks by title words, project, assignee, stage, priority or due date. Admins see every task; members only theirs.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Words from the task title.' },
        project: { type: 'string', description: 'Project or client name (or part of it).' },
        assignee: { type: 'string', description: 'Member name (or part of it).' },
        stage: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        when: { type: 'string', enum: WHEN },
        include_done: { type: 'boolean', description: 'Also include Done / Deployed tasks.' },
      },
    },
  },
  {
    name: 'task_details',
    description: 'Everything about one task: description, stage, priority, due date, assignees, sub tasks, latest comments, recent activity (who moved it when), time logged and rework. Use whenever someone asks about a specific task.',
    parameters: {
      type: 'object',
      properties: { task: { type: 'string', description: 'Task id or words from its title.' } },
      required: ['task'],
    },
  },
  {
    name: 'project_brief',
    description: 'Everything about ONE project in one lookup: client, dates, description, Docs / Milanote links, stages, progress (counts), next open tasks, milestones, team, hours this month, last 7 days of activity, and the whole Knowledge board (folders, every note and file with a short preview). Use first for any question about a project: what it is, its status, brand, process, links, files, who works on it.',
    parameters: {
      type: 'object',
      properties: { project: { type: 'string', description: 'Project or client name (or part of it).' } },
      required: ['project'],
    },
  },
  {
    name: 'list_projects',
    description: 'Active projects the person may see, with open, overdue and in-review counts and end dates.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'people',
    description: 'The team directory: who someone is, role, skills, location, bio, online / last seen, open tasks and upcoming birthdays. Admins also get email and phone. Leave name empty for everyone.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional name (or part of it).' },
        skill: { type: 'string', description: "Optional skill, e.g. 'react', 'figma', 'seo'." },
      },
    },
  },
  {
    name: 'team_workload',
    description: 'Admins only: every active member with open, overdue, due-this-week and in-review task counts, and hours logged this week.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'review_queue',
    description: "Tasks waiting In Review. Admins: everything waiting for an admin, oldest first, with who submitted it. Members: their own tasks that are in review.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'calendar',
    description: 'Calendar events (meetings, deadlines and birthdays added to the calendar). Admins: all events. Members: events they created or are invited to.',
    parameters: {
      type: 'object',
      properties: { range: { type: 'string', enum: ['today', 'tomorrow', 'this_week', 'next_week', 'this_month'], description: 'Default this_week.' } },
    },
  },
  {
    name: 'activity',
    description: "What happened: task stage changes and comments in a period ('what happened today', 'what did Hari do yesterday', 'standup'). Admins: everyone; members: only on their tasks.",
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'last_week'], description: 'Default today.' },
        project: { type: 'string' },
        person: { type: 'string', description: 'Admins only: whose activity.' },
      },
    },
  },
  {
    name: 'time_logged',
    description: 'Hours from the Time Log. Members: only their own. Admins: anyone, or the whole team (member = "all").',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_NAMES, description: 'Default this_week. Weeks start Monday.' },
        project: { type: 'string' },
        member: { type: 'string', description: "Admins only: a name, or 'all'." },
      },
    },
  },
  {
    name: 'rework_report',
    description: 'Quality: tasks and people with the most rework (tasks sent back by an admin). Admins: everyone; members: their own.',
    parameters: {
      type: 'object',
      properties: { project: { type: 'string' } },
    },
  },
  {
    name: 'task_requests',
    description: "Task requests (tasks members asked admins to create) with their status: pending, approved (with the task made from it) or declined (with the admin's note). Admins: every member's requests, pending by default. Members: their own requests, all statuses by default. Use for 'my requests', 'was my request approved', 'pending requests'.",
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'approved', 'declined', 'all'], description: 'Admins default pending; members default all.' },
      },
    },
  },
  {
    name: 'knowledge',
    description: "Search inside the Knowledge board of the projects (note text, the text inside uploaded PDF/TXT/MD files, file and folder names), plus matching tasks and task comments from the database. Returns the best excerpts. Use for 'how do we…', 'what is the brand colour / font of…', 'where is the file for…', 'what did the client say about…'. Logins are NOT here.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for: the key words (any language).' },
        project: { type: 'string', description: 'Optional project or client name.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'knowledge_read',
    description: 'Read one Knowledge board note or file in full (long documents come in parts of ~8000 characters). Use after knowledge / project_brief when the excerpt is not enough, or to summarise a document.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title or file name (or part of it).' },
        project: { type: 'string', description: 'Optional project name, to pick the right one.' },
        part: { type: 'integer', description: 'Part number for long documents. Default 1.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'member_insights',
    description: "How someone works in Orbit, from the numbers: tasks completed, on-time %, days from start to review, review wait, rework, open/overdue now, hours logged, days without a time log, active days, busiest hours, comments, task requests, last seen, and the trend vs the previous period. Admins: any member, or member = 'all' for the whole team. Members: only themselves (leave member empty).",
    parameters: {
      type: 'object',
      properties: {
        member: { type: 'string', description: "Admins: a member's name, or 'all'. Members: leave empty." },
        period: { type: 'string', enum: ['this_week', 'last_week', 'this_month', 'last_month', 'last_30_days', 'last_90_days'], description: 'Default last_30_days.' },
      },
    },
  },
];

/* ---------- Executors ---------- */

async function myTasks(user, { when = 'all', stage } = {}) {
  const params = [user.id];
  const where = [OPEN, LIVE_PROJECT, LEAF_TASK, 'EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.member_id = $1)'];
  if (DATE_FILTERS[when]) where.push(DATE_FILTERS[when]);
  if (stage) { params.push(text(stage)); where.push(`t.stage ILIKE $${params.length}`); }
  const { rows } = await db.query(
    `${TASK_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY t.due_date ASC NULLS LAST, t.id LIMIT 40`,
    params,
  );
  return { today: await todayString(), count: rows.length, tasks: rows };
}

async function findTasks(user, { text: words, project, assignee, stage, priority, when = 'all', include_done: includeDone = false } = {}) {
  const params = [];
  const where = [taskVisibility(user, params), LIVE_PROJECT, LEAF_TASK];
  if (!includeDone) where.push(OPEN);
  if (words) { params.push(`%${text(words)}%`); where.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`); }
  if (project) { params.push(`%${text(project)}%`); where.push(`(p.name ILIKE $${params.length} OR p.client_name ILIKE $${params.length})`); }
  if (assignee) {
    params.push(`%${text(assignee)}%`);
    where.push(`EXISTS (SELECT 1 FROM task_assignees fa JOIN members fm ON fm.id = fa.member_id WHERE fa.task_id = t.id AND fm.name ILIKE $${params.length})`);
  }
  if (stage) { params.push(text(stage)); where.push(`t.stage ILIKE $${params.length}`); }
  if (priority) { params.push(text(priority)); where.push(`t.priority ILIKE $${params.length}`); }
  if (DATE_FILTERS[when]) where.push(DATE_FILTERS[when]);
  const { rows } = await db.query(
    `${TASK_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY t.due_date ASC NULLS LAST, t.id LIMIT 30`,
    params,
  );
  return { today: await todayString(), count: rows.length, tasks: rows };
}

async function taskDetails(user, { task } = {}) {
  const found = await findTask(user, task);
  if (!found.task) return found;
  const t = found.task;
  if (!(await userHasTaskAccess(user, t.id))) return fail('You do not have access to that task.');
  const [full, subtasks, comments, activity, time] = await Promise.all([
    db.query(
      `SELECT t.description, c.name AS milestone, cm.name AS created_by,
              to_char(t.created_at, 'YYYY-MM-DD') AS created
         FROM tasks t
         LEFT JOIN clusters c ON c.id = t.cluster_id
         LEFT JOIN members cm ON cm.id = t.created_by
        WHERE t.id = $1`,
      [t.id],
    ),
    db.query(`${TASK_SELECT} WHERE t.parent_task_id = $1 ORDER BY t.due_date NULLS LAST LIMIT 20`, [t.id]),
    db.query(
      `SELECT m.name AS author, LEFT(c.content, 400) AS text,
              to_char(c.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS at
         FROM task_comments c LEFT JOIN members m ON m.id = c.author_id
        WHERE c.task_id = $1 ORDER BY c.created_at DESC LIMIT 8`,
      [t.id],
    ),
    db.query(
      `SELECT m.name AS who, a.action, a.meta->>'from' AS "from", a.meta->>'to' AS "to",
              to_char(a.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS at
         FROM task_activity a LEFT JOIN members m ON m.id = a.actor_id
        WHERE a.task_id = $1 ORDER BY a.created_at DESC LIMIT 8`,
      [t.id],
    ),
    db.query(
      `SELECT ROUND(COALESCE(SUM(e.minutes), 0) / 60.0, 1)::float AS hours
         FROM time_entries e
        WHERE e.task_id = $1 OR e.task_id IN (SELECT id FROM tasks WHERE parent_task_id = $1)`,
      [t.id],
    ).catch(() => ({ rows: [{ hours: null }] })),
  ]);
  return {
    today: await todayString(),
    task: { ...t, description: (full.rows[0]?.description || '').slice(0, 1500), milestone: full.rows[0]?.milestone, created_by: full.rows[0]?.created_by, created: full.rows[0]?.created, hours_logged: time.rows[0]?.hours },
    sub_tasks: subtasks.rows,
    latest_comments: comments.rows,
    recent_activity: activity.rows,
    tasks: [t],
  };
}

async function listProjects(user) {
  const params = [];
  const vis = projectVisibility(user, params);
  const tvis = isManager(user) ? 'TRUE' : `EXISTS (SELECT 1 FROM task_assignees va WHERE va.task_id = t.id AND va.member_id = $1)`;
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.client_name, to_char(p.end_date, 'YYYY-MM-DD') AS end_date,
            COUNT(t.id) FILTER (WHERE ${OPEN})::int AS open_tasks,
            COUNT(t.id) FILTER (WHERE ${OPEN} AND t.due_date::date < ${TODAY})::int AS overdue,
            COUNT(t.id) FILTER (WHERE t.stage = 'In Review')::int AS in_review
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id AND ${LEAF_TASK} AND ${tvis}
      WHERE ${LIVE_PROJECT} AND ${vis}
      GROUP BY p.id ORDER BY overdue DESC, open_tasks DESC LIMIT 40`,
    params,
  );
  return { today: await todayString(), projects: rows };
}

async function people(user, { name, skill } = {}) {
  const params = [];
  const where = ['m.active = true'];
  if (name) { params.push(`%${text(name)}%`); where.push(`m.name ILIKE $${params.length}`); }
  if (skill) { params.push(`%${text(skill)}%`); where.push(`EXISTS (SELECT 1 FROM unnest(COALESCE(m.skills, ARRAY[]::text[])) s WHERE s ILIKE $${params.length})`); }
  const { rows } = await db.query(
    `SELECT m.id, m.name, m.role, m.skills, m.location, LEFT(m.bio, 300) AS bio,
            ${isManager(user) ? 'm.email, m.phone,' : ''}
            to_char(m.birthday, 'DD Mon') AS birthday,
            CASE
              WHEN m.birthday IS NULL THEN NULL
              WHEN to_char(m.birthday, 'MM-DD') = to_char(${TODAY}, 'MM-DD') THEN 0
              ELSE (m.birthday + (EXTRACT(YEAR FROM age(${TODAY}, m.birthday))::int + 1) * interval '1 year')::date - ${TODAY}
            END AS days_to_birthday,
            to_char(m.last_seen_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS last_seen,
            (SELECT COUNT(*)::int FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id
              WHERE ta.member_id = m.id AND ${OPEN} AND ${LEAF_TASK} AND ${IN_LIVE_PROJECT}) AS open_tasks,
            (SELECT string_agg(p.name, ', ') FROM project_members pm JOIN projects p ON p.id = pm.project_id
              WHERE pm.member_id = m.id AND ${LIVE_PROJECT}) AS projects
       FROM members m
      WHERE ${where.join(' AND ')}
      ORDER BY m.role DESC, m.name LIMIT 40`,
    params,
  );
  return {
    today: await todayString(),
    people: rows.map(({ id, ...r }) => ({ ...r, online: presence ? presence.isOnlineNow(id) : undefined })),
  };
}

async function teamWorkload(user) {
  if (!isManager(user)) return fail('Only admins can see the whole team workload. You can ask about your own tasks.');
  const { rows } = await db.query(
    `SELECT m.name,
            COUNT(t.id) FILTER (WHERE ${OPEN})::int AS open_tasks,
            COUNT(t.id) FILTER (WHERE ${OPEN} AND t.due_date::date < ${TODAY})::int AS overdue,
            COUNT(t.id) FILTER (WHERE ${OPEN} AND t.due_date::date BETWEEN ${TODAY} AND ${TODAY} + 6)::int AS due_this_week,
            COUNT(t.id) FILTER (WHERE t.stage = 'In Review')::int AS in_review,
            (SELECT ROUND(COALESCE(SUM(e.minutes), 0) / 60.0, 1)::float FROM time_entries e
              WHERE e.member_id = m.id AND e.work_date >= date_trunc('week', ${TODAY})) AS hours_this_week
       FROM members m
       LEFT JOIN task_assignees ta ON ta.member_id = m.id
       LEFT JOIN tasks t ON t.id = ta.task_id AND ${LEAF_TASK}
       LEFT JOIN projects p ON p.id = t.project_id AND ${LIVE_PROJECT}
      WHERE m.active = true AND m.role = 'member'
        AND (t.id IS NULL OR p.id IS NOT NULL)
      GROUP BY m.id ORDER BY open_tasks DESC`,
  );
  return { today: await todayString(), members: rows };
}

async function reviewQueue(user) {
  const params = [];
  const vis = taskVisibility(user, params);
  const { rows } = await db.query(
    `${TASK_SELECT.replace('SELECT t.id,', `SELECT (SELECT to_char(MAX(a.created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') FROM task_activity a WHERE a.task_id = t.id AND a.meta->>'to' = 'In Review') AS submitted_at, t.id,`)}
      WHERE t.stage = 'In Review' AND p.trashed_at IS NULL AND ${vis}
      ORDER BY submitted_at ASC NULLS FIRST LIMIT 30`,
    params,
  );
  return { today: await todayString(), count: rows.length, tasks: rows };
}

const RANGES = {
  today: [`${TODAY}`, `${TODAY}`],
  tomorrow: [`${TODAY} + 1`, `${TODAY} + 1`],
  this_week: [`${TODAY}`, `${TODAY} + 6`],
  next_week: [`${TODAY} + 7`, `${TODAY} + 13`],
  this_month: [`${TODAY}`, `(date_trunc('month', ${TODAY}) + interval '1 month - 1 day')::date`],
};

async function calendar(user, { range = 'this_week' } = {}) {
  const [from, to] = RANGES[range] || RANGES.this_week;
  const params = [];
  let vis = 'TRUE';
  if (!isManager(user)) {
    params.push(user.id);
    vis = `(e.created_by = $1 OR EXISTS (SELECT 1 FROM calendar_attendees ca WHERE ca.event_id = e.id AND ca.member_id = $1))`;
  }
  const { rows } = await db.query(
    `SELECT e.title, e.type, LEFT(e.description, 300) AS description,
            to_char(e.start_date AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS starts,
            to_char(e.end_date AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS ends,
            (SELECT string_agg(m.name, ', ') FROM calendar_attendees ca JOIN members m ON m.id = ca.member_id WHERE ca.event_id = e.id) AS people
       FROM calendar_events e
      WHERE (e.start_date AT TIME ZONE '${TZ}')::date <= ${to}
        AND (COALESCE(e.end_date, e.start_date) AT TIME ZONE '${TZ}')::date >= ${from}
        AND ${vis}
      ORDER BY e.start_date LIMIT 40`,
    params,
  );
  return { today: await todayString(), range, events: rows };
}

const ACTIVITY_PERIODS = { today: PERIODS.today, yesterday: PERIODS.yesterday, this_week: PERIODS.this_week, last_week: PERIODS.last_week };

async function activity(user, { period = 'today', project, person } = {}) {
  const [from, to] = ACTIVITY_PERIODS[period] || ACTIVITY_PERIODS.today;
  const params = [];
  const vis = taskVisibility(user, params);
  const where = [`(x.at AT TIME ZONE '${TZ}')::date BETWEEN ${from} AND ${to}`, vis, 'p.trashed_at IS NULL'];
  if (project) { params.push(`%${text(project)}%`); where.push(`p.name ILIKE $${params.length}`); }
  if (person && isManager(user)) { params.push(`%${text(person)}%`); where.push(`m.name ILIKE $${params.length}`); }
  const { rows } = await db.query(
    `SELECT m.name AS who, x.kind, x.detail, t.title AS task, p.name AS project,
            to_char(x.at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS at
       FROM (
         SELECT a.task_id, a.actor_id AS person, 'stage' AS kind,
                COALESCE(a.meta->>'from', '?') || ' → ' || COALESCE(a.meta->>'to', '?') AS detail, a.created_at AS at
           FROM task_activity a
         UNION ALL
         SELECT c.task_id, c.author_id, 'comment', LEFT(c.content, 160), c.created_at
           FROM task_comments c
       ) x
       JOIN tasks t ON t.id = x.task_id
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN members m ON m.id = x.person
      WHERE ${where.join(' AND ')}
      ORDER BY x.at DESC LIMIT 60`,
    params,
  );
  return { today: await todayString(), period, count: rows.length, events: rows };
}

async function timeLogged(user, { period = 'this_week', project, member } = {}) {
  const [from, to] = PERIODS[period] || PERIODS.this_week;
  const params = [];
  const where = [`e.work_date BETWEEN ${from} AND ${to}`];
  if (!isManager(user)) {
    params.push(user.id);
    where.push(`e.member_id = $${params.length}`);
  } else if (member && member.toLowerCase() !== 'all') {
    params.push(`%${text(member)}%`);
    where.push(`m.name ILIKE $${params.length}`);
  }
  if (project) { params.push(`%${text(project)}%`); where.push(`p.name ILIKE $${params.length}`); }
  const { rows } = await db.query(
    `SELECT m.name AS member, p.name AS project, ROUND(SUM(e.minutes) / 60.0, 1)::float AS hours
       FROM time_entries e
       JOIN members m ON m.id = e.member_id
       LEFT JOIN projects p ON p.id = e.project_id
      WHERE ${where.join(' AND ')}
      GROUP BY m.name, p.name ORDER BY hours DESC LIMIT 60`,
    params,
  );
  const total = rows.reduce((sum, r) => sum + Number(r.hours || 0), 0);
  return { period, total_hours: Math.round(total * 10) / 10, rows };
}

async function reworkReport(user, { project } = {}) {
  const params = [];
  const vis = taskVisibility(user, params);
  const where = [vis, 'p.trashed_at IS NULL', LEAF_TASK, 'COALESCE(t.rework_count, 0) > 0'];
  if (project) { params.push(`%${text(project)}%`); where.push(`p.name ILIKE $${params.length}`); }
  const [tasks, byPerson] = await Promise.all([
    db.query(`${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.rework_count DESC LIMIT 15`, params),
    db.query(
      `SELECT m.name, SUM(t.rework_count)::int AS rework, COUNT(*)::int AS tasks_with_rework
         FROM tasks t JOIN projects p ON p.id = t.project_id
         JOIN task_assignees ta ON ta.task_id = t.id JOIN members m ON m.id = ta.member_id
        WHERE ${where.join(' AND ')}
        GROUP BY m.name ORDER BY rework DESC LIMIT 15`,
      params,
    ),
  ]);
  return { tasks: tasks.rows, by_person: byPerson.rows };
}

async function taskRequests(user, { status } = {}) {
  const params = [];
  const where = [];
  if (!isManager(user)) { params.push(user.id); where.push(`r.requested_by = $${params.length}`); }
  const wanted = ['pending', 'approved', 'declined', 'all'].includes(status)
    ? status
    : (isManager(user) ? 'pending' : 'all');
  if (wanted !== 'all') { params.push(wanted); where.push(`r.status = $${params.length}`); }
  const { rows } = await db.query(
    `SELECT r.title, r.project_name AS project, LEFT(r.description, 300) AS description,
            to_char(r.due_date, 'YYYY-MM-DD') AS due, m.name AS requested_by,
            to_char(r.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS requested_on,
            r.status, h.name AS handled_by,
            to_char(r.handled_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS handled_on,
            LEFT(r.admin_note, 300) AS admin_note,
            t.title AS created_task, tp.name AS created_task_project
       FROM task_requests r
       LEFT JOIN members m ON m.id = r.requested_by
       LEFT JOIN members h ON h.id = r.handled_by
       LEFT JOIN tasks t ON t.id = r.task_id
       LEFT JOIN projects tp ON tp.id = t.project_id
      WHERE ${where.length ? where.join(' AND ') : 'TRUE'}
      ORDER BY r.created_at DESC LIMIT 30`,
    params,
  );
  return { status: wanted, count: rows.length, requests: rows };
}

const executors = {
  my_tasks: myTasks,
  find_tasks: findTasks,
  task_details: taskDetails,
  project_status: (user, args) => knowledgeTools().projectBrief(user, args), // old name, kept for safety
  project_brief: (user, args) => knowledgeTools().projectBrief(user, args),
  list_projects: listProjects,
  people,
  team_workload: teamWorkload,
  review_queue: reviewQueue,
  calendar,
  activity,
  time_logged: timeLogged,
  rework_report: reworkReport,
  task_requests: taskRequests,
  knowledge: (user, args) => knowledgeTools().knowledge(user, args),
  knowledge_read: (user, args) => knowledgeTools().knowledgeRead(user, args),
  member_insights: (user, args) => insightTools().memberInsights(user, args),
};

// Runs one lookup. Never throws: errors go back to the model as data.
async function run(user, name, args) {
  const fn = executors[name];
  if (!fn) return null; // not a lookup (maybe an action)
  try {
    return await fn(user, args && typeof args === 'object' ? args : {});
  } catch (err) {
    console.error(`[ai] tool ${name} failed:`, err?.message);
    return fail('That lookup failed. Try asking differently.');
  }
}

// Task cards for the UI from any tool result.
function cardsFrom(result) {
  const list = [...(result?.tasks || []), ...(result?.next_open_tasks || []), ...(result?.sub_tasks || []), ...(result?.candidates || [])];
  return list.map((t) => ({ id: t.id, title: t.title, project: t.project, project_id: t.project_id, stage: t.stage, due: t.due, priority: t.priority }));
}

/*
 * A short live summary for the system prompt, so most questions need no
 * lookup at all. Admin: the whole agency. Member: their own work.
 */
async function snapshot(user) {
  if (isManager(user)) {
    const { rows } = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM projects p WHERE ${LIVE_PROJECT}) AS active_projects,
         (SELECT COUNT(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE ${LIVE_PROJECT} AND ${LEAF_TASK} AND ${OPEN}) AS open_tasks,
         (SELECT COUNT(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE ${LIVE_PROJECT} AND ${LEAF_TASK} AND ${OPEN} AND t.due_date::date < ${TODAY}) AS overdue,
         (SELECT COUNT(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE ${LIVE_PROJECT} AND ${LEAF_TASK} AND ${OPEN} AND t.due_date::date = ${TODAY}) AS due_today,
         (SELECT COUNT(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id WHERE ${LEAF_TASK} AND p.trashed_at IS NULL AND t.stage = 'In Review') AS waiting_review,
         (SELECT COUNT(*)::int FROM task_requests WHERE status = 'pending') AS pending_task_requests,
         (SELECT COUNT(*)::int FROM members WHERE active = true AND role = 'member') AS members,
         (SELECT string_agg(name, ', ' ORDER BY name) FROM projects p WHERE ${LIVE_PROJECT}) AS project_names`,
    );
    return { scope: 'whole agency', ...rows[0] };
  }
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id JOIN task_assignees a ON a.task_id = t.id AND a.member_id = $1 WHERE ${LIVE_PROJECT} AND ${LEAF_TASK} AND ${OPEN}) AS my_open_tasks,
       (SELECT COUNT(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id JOIN task_assignees a ON a.task_id = t.id AND a.member_id = $1 WHERE ${LIVE_PROJECT} AND ${LEAF_TASK} AND ${OPEN} AND t.due_date::date < ${TODAY}) AS my_overdue,
       (SELECT COUNT(*)::int FROM tasks t JOIN projects p ON p.id = t.project_id JOIN task_assignees a ON a.task_id = t.id AND a.member_id = $1 WHERE ${LIVE_PROJECT} AND ${LEAF_TASK} AND ${OPEN} AND t.due_date::date = ${TODAY}) AS my_due_today,
       (SELECT COUNT(*)::int FROM tasks t JOIN task_assignees a ON a.task_id = t.id AND a.member_id = $1 WHERE ${LEAF_TASK} AND ${IN_LIVE_PROJECT} AND t.stage = 'In Review') AS my_in_review,
       (SELECT ROUND(COALESCE(SUM(minutes), 0) / 60.0, 1)::float FROM time_entries WHERE member_id = $1 AND work_date >= date_trunc('week', ${TODAY})) AS my_hours_this_week,
       (SELECT string_agg(p.name, ', ' ORDER BY p.name) FROM project_members pm JOIN projects p ON p.id = pm.project_id WHERE pm.member_id = $1 AND ${LIVE_PROJECT}) AS my_projects`,
    [user.id],
  );
  return { scope: 'this member only', ...rows[0] };
}

module.exports = { declarations, run, cardsFrom, myTasks, snapshot, findTask, findProjects, suggestProjects, findMembers, TZ, isManager };
