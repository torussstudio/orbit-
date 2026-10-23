'use strict';

/*
 * Orbit AI: how someone works in Orbit (member_insights).
 *
 * Admins: any member, or the whole team (member = "all").
 * Members: only themselves.
 *
 * Everything is worked out here in SQL; the model only gets the numbers and
 * describes them. Counted on "leaf" tasks (sub tasks and tasks without sub
 * tasks, utils/taskScope.js) in projects that are not in the trash.
 *
 *  work      completed (approved to Done in the period), on time (sent to
 *            review on or before the due date), average days from start to
 *            review, average review wait, sent to review, rework, open /
 *            overdue / in review right now
 *  time      hours logged, days with a log vs working days (Mon–Sat),
 *            misc share, top projects, completed tasks with no time logged
 *  activity  active days, comments, task requests, busiest hours (IST),
 *            last seen
 *  trend     the previous period of the same length
 *
 * Never reads chat messages or credentials.
 */

const db = require('../../db');
const { LEAF_TASK } = require('../../utils/taskScope');

const TZ = 'Asia/Kolkata';
const TODAY = `(NOW() AT TIME ZONE '${TZ}')::date`;
const isManager = (user) => user?.role === 'manager';
const fail = (message) => ({ error: message });

const PERIODS = {
  this_week: [`date_trunc('week', ${TODAY})::date`, `${TODAY}`],
  last_week: [`date_trunc('week', ${TODAY})::date - 7`, `date_trunc('week', ${TODAY})::date - 1`],
  this_month: [`date_trunc('month', ${TODAY})::date`, `${TODAY}`],
  last_month: [`(date_trunc('month', ${TODAY}) - interval '1 month')::date`, `date_trunc('month', ${TODAY})::date - 1`],
  last_30_days: [`${TODAY} - 29`, `${TODAY}`],
  last_90_days: [`${TODAY} - 89`, `${TODAY}`],
};
const PERIOD_NAMES = Object.keys(PERIODS);

const round1 = (n) => (n == null || Number.isNaN(Number(n)) ? null : Math.round(Number(n) * 10) / 10);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

// The period and the one before it, as dates.
async function periodDates(period) {
  const [from, to] = PERIODS[period] || PERIODS.last_30_days;
  const { rows } = await db.query(
    `SELECT to_char(f, 'YYYY-MM-DD') AS f, to_char(t, 'YYYY-MM-DD') AS t,
            to_char(f - (t - f + 1), 'YYYY-MM-DD') AS pf, to_char(f - 1, 'YYYY-MM-DD') AS pt,
            to_char(${TODAY}, 'YYYY-MM-DD') AS today
       FROM (SELECT (${from})::date AS f, (${to})::date AS t) d`,
  );
  return rows[0];
}

/*
 * Per member, for [f, t] and the previous period [pf, pt].
 * $1 member ids (text[]), $2 f, $3 t, $4 pf, $5 pt
 */
const TASKS_SQL = `
  WITH mt AS (
    SELECT ta.member_id::text AS member_id, t.id, t.title, t.stage, t.due_date, t.updated_at, t.project_id
      FROM task_assignees ta
      JOIN tasks t ON t.id = ta.task_id
      JOIN projects p ON p.id = t.project_id
     WHERE ta.member_id::text = ANY($1::text[]) AND p.trashed_at IS NULL AND ${LEAF_TASK}
  ),
  ev AS (
    SELECT a.task_id, lower(trim(a.meta->>'to')) AS to_stage, a.actor_id::text AS actor,
           (a.created_at AT TIME ZONE '${TZ}') AS at
      FROM task_activity a
     WHERE a.task_id IN (SELECT id FROM mt) AND a.meta ? 'to'
  ),
  per_task AS (
    SELECT mt.*,
           COALESCE((SELECT MAX(e.at) FROM ev e WHERE e.task_id = mt.id AND e.to_stage = 'done'),
                    CASE WHEN lower(trim(mt.stage)) = 'done' THEN mt.updated_at AT TIME ZONE '${TZ}' END) AS done_at,
           (SELECT MAX(e.at) FROM ev e WHERE e.task_id = mt.id AND e.to_stage = 'in review') AS review_at,
           (SELECT MIN(e.at) FROM ev e WHERE e.task_id = mt.id AND e.to_stage = 'in progress') AS start_at
      FROM mt
  ),
  done AS (
    SELECT *, done_at::date AS done_on FROM per_task WHERE lower(trim(stage)) = 'done'
  )
  SELECT m.member_id,
    (SELECT COUNT(*) FROM done d WHERE d.member_id = m.member_id AND d.done_on BETWEEN $2::date AND $3::date)::int AS completed,
    (SELECT COUNT(*) FROM done d WHERE d.member_id = m.member_id AND d.done_on BETWEEN $4::date AND $5::date)::int AS completed_prev,
    (SELECT COUNT(*) FROM done d WHERE d.member_id = m.member_id AND d.done_on BETWEEN $2::date AND $3::date AND d.due_date IS NOT NULL)::int AS completed_with_due,
    (SELECT COUNT(*) FROM done d WHERE d.member_id = m.member_id AND d.done_on BETWEEN $2::date AND $3::date
        AND d.due_date IS NOT NULL AND COALESCE(d.review_at, d.done_at)::date <= d.due_date)::int AS on_time,
    (SELECT COUNT(*) FROM done d WHERE d.member_id = m.member_id AND d.done_on BETWEEN $4::date AND $5::date AND d.due_date IS NOT NULL)::int AS completed_with_due_prev,
    (SELECT COUNT(*) FROM done d WHERE d.member_id = m.member_id AND d.done_on BETWEEN $4::date AND $5::date
        AND d.due_date IS NOT NULL AND COALESCE(d.review_at, d.done_at)::date <= d.due_date)::int AS on_time_prev,
    (SELECT AVG(EXTRACT(EPOCH FROM (d.review_at - d.start_at)) / 86400.0) FROM done d
      WHERE d.member_id = m.member_id AND d.done_on BETWEEN $2::date AND $3::date AND d.review_at > d.start_at) AS avg_days_to_review,
    (SELECT AVG(EXTRACT(EPOCH FROM (d.done_at - d.review_at)) / 86400.0) FROM done d
      WHERE d.member_id = m.member_id AND d.done_on BETWEEN $2::date AND $3::date AND d.done_at >= d.review_at) AS avg_review_wait_days,
    (SELECT COUNT(DISTINCT e.task_id) FROM ev e JOIN mt ON mt.id = e.task_id AND mt.member_id = m.member_id
      WHERE e.to_stage = 'in review' AND e.at::date BETWEEN $2::date AND $3::date)::int AS sent_to_review,
    (SELECT COUNT(DISTINCT x.task_id) FROM (
        SELECT e.task_id FROM ev e WHERE e.to_stage = 'rework' AND e.at::date BETWEEN $2::date AND $3::date
        UNION
        SELECT mt2.id FROM activity_log l JOIN mt mt2 ON l.entity_id = mt2.id::text
         WHERE l.event_type = 'task_rework' AND (l.created_at AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date
      ) x JOIN mt ON mt.id = x.task_id AND mt.member_id = m.member_id)::int AS rework,
    (SELECT COUNT(DISTINCT x.task_id) FROM (
        SELECT e.task_id FROM ev e WHERE e.to_stage = 'rework' AND e.at::date BETWEEN $4::date AND $5::date
        UNION
        SELECT mt2.id FROM activity_log l JOIN mt mt2 ON l.entity_id = mt2.id::text
         WHERE l.event_type = 'task_rework' AND (l.created_at AT TIME ZONE '${TZ}')::date BETWEEN $4::date AND $5::date
      ) x JOIN mt ON mt.id = x.task_id AND mt.member_id = m.member_id)::int AS rework_prev,
    (SELECT COUNT(*) FROM mt WHERE mt.member_id = m.member_id AND lower(trim(mt.stage)) NOT IN ('done', 'deployed'))::int AS open_now,
    (SELECT COUNT(*) FROM mt WHERE mt.member_id = m.member_id AND lower(trim(mt.stage)) NOT IN ('done', 'deployed', 'in review')
        AND mt.due_date < ${TODAY})::int AS overdue_now,
    (SELECT COUNT(*) FROM mt WHERE mt.member_id = m.member_id AND lower(trim(mt.stage)) = 'in review')::int AS in_review_now,
    (SELECT COUNT(*) FROM done d WHERE d.member_id = m.member_id AND d.done_on BETWEEN $2::date AND $3::date
        AND NOT EXISTS (SELECT 1 FROM time_entries te WHERE te.task_id = d.id AND te.member_id::text = m.member_id))::int AS completed_without_time
  FROM (SELECT unnest($1::text[]) AS member_id) m
`;

// $1 member ids, $2 f, $3 t, $4 pf, $5 pt, $6 today
const TIME_SQL = `
  SELECT m.member_id,
    COALESCE((SELECT SUM(e.minutes) FROM time_entries e WHERE e.member_id::text = m.member_id AND e.work_date BETWEEN $2::date AND $3::date), 0)::int AS minutes,
    COALESCE((SELECT SUM(e.minutes) FROM time_entries e WHERE e.member_id::text = m.member_id AND e.work_date BETWEEN $4::date AND $5::date), 0)::int AS minutes_prev,
    COALESCE((SELECT SUM(e.minutes) FROM time_entries e WHERE e.member_id::text = m.member_id AND e.work_date BETWEEN $2::date AND $3::date AND e.is_misc), 0)::int AS misc_minutes,
    (SELECT COUNT(*) FROM generate_series($2::date, LEAST($3::date, $6::date), interval '1 day') d
      WHERE EXTRACT(ISODOW FROM d) <> 7)::int AS working_days,
    (SELECT COUNT(*) FROM generate_series($2::date, LEAST($3::date, $6::date), interval '1 day') d
      WHERE EXTRACT(ISODOW FROM d) <> 7
        AND EXISTS (SELECT 1 FROM time_entries e WHERE e.member_id::text = m.member_id AND e.work_date = d::date))::int AS logged_days
  FROM (SELECT unnest($1::text[]) AS member_id) m
`;

// Everything a member did, as IST timestamps (for active days / hours).
// $1 member ids, $2 f, $3 t
const ACTIVITY_SQL = `
  WITH acts AS (
    SELECT a.actor_id::text AS member_id, a.created_at AT TIME ZONE '${TZ}' AS at, 'stage' AS kind
      FROM task_activity a WHERE a.actor_id::text = ANY($1::text[])
    UNION ALL
    SELECT c.author_id::text, c.created_at AT TIME ZONE '${TZ}', 'comment'
      FROM task_comments c WHERE c.author_id::text = ANY($1::text[])
    UNION ALL
    SELECT e.member_id::text, e.created_at AT TIME ZONE '${TZ}', 'time_log'
      FROM time_entries e WHERE e.member_id::text = ANY($1::text[]) AND e.created_at IS NOT NULL
    UNION ALL
    SELECT r.requested_by::text, r.created_at AT TIME ZONE '${TZ}', 'task_request'
      FROM task_requests r WHERE r.requested_by::text = ANY($1::text[])
  ),
  period AS (SELECT * FROM acts WHERE at::date BETWEEN $2::date AND $3::date)
  SELECT m.member_id,
    (SELECT COUNT(DISTINCT at::date) FROM period p WHERE p.member_id = m.member_id)::int AS active_days,
    (SELECT COUNT(*) FROM period p WHERE p.member_id = m.member_id AND p.kind = 'comment')::int AS comments,
    (SELECT COUNT(*) FROM period p WHERE p.member_id = m.member_id AND p.kind = 'task_request')::int AS task_requests,
    (SELECT COUNT(*) FROM period p WHERE p.member_id = m.member_id AND p.kind = 'stage')::int AS stage_changes,
    (SELECT json_agg(h ORDER BY n DESC, h) FROM (
        SELECT EXTRACT(HOUR FROM p.at)::int AS h, COUNT(*) AS n FROM period p
         WHERE p.member_id = m.member_id GROUP BY 1 ORDER BY n DESC, h LIMIT 3) top) AS busiest_hours,
    (SELECT to_char(MIN(at::time), 'HH24:MI') FROM (
        SELECT MIN(p.at) AS at FROM period p WHERE p.member_id = m.member_id GROUP BY p.at::date) f) AS earliest_start,
    (SELECT to_char(percentile_disc(0.5) WITHIN GROUP (ORDER BY first_at::time), 'HH24:MI') FROM (
        SELECT MIN(p.at) AS first_at FROM period p WHERE p.member_id = m.member_id GROUP BY p.at::date) f) AS usual_first_activity,
    (SELECT to_char(percentile_disc(0.5) WITHIN GROUP (ORDER BY last_at::time), 'HH24:MI') FROM (
        SELECT MAX(p.at) AS last_at FROM period p WHERE p.member_id = m.member_id GROUP BY p.at::date) l) AS usual_last_activity
  FROM (SELECT unnest($1::text[]) AS member_id) m
`;

function hourLabel(h) {
  const to = (x) => `${String(x).padStart(2, '0')}:00`;
  return `${to(h)}–${to((h + 1) % 24)}`;
}

function shape(member, w = {}, tm = {}, ac = {}) {
  const hours = round1((tm.minutes || 0) / 60);
  const hoursPrev = round1((tm.minutes_prev || 0) / 60);
  return {
    name: member.name,
    last_seen: member.last_seen || undefined,
    work: {
      completed: w.completed || 0,
      on_time_percent: pct(w.on_time || 0, w.completed_with_due || 0),
      on_time: `${w.on_time || 0} of ${w.completed_with_due || 0} with a due date`,
      avg_days_start_to_review: round1(w.avg_days_to_review),
      avg_review_wait_days: round1(w.avg_review_wait_days),
      sent_to_review: w.sent_to_review || 0,
      rework_tasks: w.rework || 0,
      rework_percent: pct(w.rework || 0, (w.completed || 0) + (w.rework || 0)),
      open_now: w.open_now || 0,
      overdue_now: w.overdue_now || 0,
      in_review_now: w.in_review_now || 0,
      completed_without_time_logged: w.completed_without_time || 0,
    },
    time: {
      hours_logged: hours,
      working_days: tm.working_days || 0,
      days_with_time_log: tm.logged_days || 0,
      days_without_time_log: Math.max(0, (tm.working_days || 0) - (tm.logged_days || 0)),
      avg_hours_per_logged_day: tm.logged_days ? round1(hours / tm.logged_days) : null,
      misc_percent: pct(tm.misc_minutes || 0, tm.minutes || 0),
    },
    activity: {
      active_days: ac.active_days || 0,
      stage_changes: ac.stage_changes || 0,
      comments: ac.comments || 0,
      task_requests: ac.task_requests || 0,
      usual_first_activity: ac.usual_first_activity || undefined,
      usual_last_activity: ac.usual_last_activity || undefined,
      busiest_hours: (ac.busiest_hours || []).map(hourLabel),
    },
    previous_period: {
      completed: w.completed_prev || 0,
      on_time_percent: pct(w.on_time_prev || 0, w.completed_with_due_prev || 0),
      hours_logged: hoursPrev,
      rework_tasks: w.rework_prev || 0,
    },
  };
}

async function metricsFor(members, d) {
  const ids = members.map((m) => String(m.id));
  const args = [ids, d.f, d.t, d.pf, d.pt];
  const [work, time, act] = await Promise.all([
    db.query(TASKS_SQL, args),
    db.query(TIME_SQL, [...args, d.today]),
    db.query(ACTIVITY_SQL, [ids, d.f, d.t]),
  ]);
  const by = (rows) => new Map(rows.map((r) => [String(r.member_id), r]));
  const W = by(work.rows); const T = by(time.rows); const A = by(act.rows);
  return members.map((m) => shape(m, W.get(String(m.id)), T.get(String(m.id)), A.get(String(m.id))));
}

// Extra detail for one person.
async function detailFor(member, d) {
  const id = String(member.id);
  const [overdue, recent, projects] = await Promise.all([
    db.query(
      `SELECT t.title, p.name AS project, to_char(t.due_date, 'YYYY-MM-DD') AS due, t.stage
         FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id JOIN projects p ON p.id = t.project_id
        WHERE ta.member_id::text = $1 AND p.trashed_at IS NULL AND ${LEAF_TASK}
          AND lower(trim(t.stage)) NOT IN ('done', 'deployed', 'in review') AND t.due_date < ${TODAY}
        ORDER BY t.due_date LIMIT 5`,
      [id],
    ),
    db.query(
      `SELECT t.title, p.name AS project, to_char(MAX(a.created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS done_on
         FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id JOIN projects p ON p.id = t.project_id
         JOIN task_activity a ON a.task_id = t.id AND lower(trim(a.meta->>'to')) = 'done'
        WHERE ta.member_id::text = $1 AND p.trashed_at IS NULL AND ${LEAF_TASK} AND lower(trim(t.stage)) = 'done'
        GROUP BY t.id, t.title, p.name
       HAVING (MAX(a.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date
        ORDER BY MAX(a.created_at) DESC LIMIT 6`,
      [id, d.f, d.t],
    ),
    db.query(
      `SELECT COALESCE(p.name, 'Miscellaneous') AS project, ROUND(SUM(e.minutes) / 60.0, 1)::float AS hours
         FROM time_entries e LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.member_id::text = $1 AND e.work_date BETWEEN $2::date AND $3::date
        GROUP BY 1 ORDER BY hours DESC LIMIT 4`,
      [id, d.f, d.t],
    ),
  ]);
  return { overdue_tasks: overdue.rows, recently_completed: recent.rows, hours_by_project: projects.rows };
}

const DEFINITIONS = 'completed = approved to Done in the period (approval date). on_time = sent to In Review on or before the due date. '
  + 'avg_days_start_to_review = first In Progress → In Review. avg_review_wait_days = In Review → Done (admin side). '
  + 'rework = tasks sent back for changes. working_days = Mon–Sat so far in the period. Only sub tasks and tasks without sub tasks are counted.';

async function memberInsights(user, { member, period = 'last_30_days' } = {}) {
  const d = await periodDates(period);
  const periodInfo = { name: PERIODS[period] ? period : 'last_30_days', from: d.f, to: d.t, previous: `${d.pf} to ${d.pt}` };
  const admin = isManager(user);
  const wanted = String(member || '').trim();

  const load = (where, params) => db.query(
    `SELECT id, name, role, to_char(last_seen_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS last_seen
       FROM members WHERE active = true AND ${where} ORDER BY name`,
    params,
  ).then((r) => r.rows);

  // Members: only themselves.
  if (!admin) {
    const me = await load('id::text = $1', [String(user.id)]);
    if (!me.length) return fail('Could not find your profile.');
    if (wanted && !['me', 'myself', 'self', 'i', 'njan', 'ente'].includes(wanted.toLowerCase())) {
      const { findMembers } = require('./assistantTools');
      const found = await findMembers([wanted]);
      const isSelf = found.members?.length === 1 && String(found.members[0].id) === String(user.id);
      if (!isSelf) return fail('Members can only see their own work insights. Ask an admin about other people.');
    }
    const [m] = await metricsFor(me, d);
    return { scope: 'you', period: periodInfo, ...m, ...(await detailFor(me[0], d)), definitions: DEFINITIONS };
  }

  // Admins: the whole team.
  if (!wanted || ['all', 'team', 'everyone', 'everybody'].includes(wanted.toLowerCase())) {
    const team = await load(`role = 'member'`, []);
    if (!team.length) return fail('No active members.');
    const rows = await metricsFor(team, d);
    const sum = (f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
    const avg = (f) => round1(sum(f) / rows.length);
    return {
      scope: 'team',
      period: periodInfo,
      team_average: {
        completed: avg((r) => r.work.completed),
        hours_logged: avg((r) => r.time.hours_logged),
        days_without_time_log: avg((r) => r.time.days_without_time_log),
        rework_tasks: avg((r) => r.work.rework_tasks),
      },
      members: rows.map((r) => ({
        name: r.name,
        last_seen: r.last_seen,
        completed: r.work.completed,
        completed_prev: r.previous_period.completed,
        on_time_percent: r.work.on_time_percent,
        avg_days_start_to_review: r.work.avg_days_start_to_review,
        rework_tasks: r.work.rework_tasks,
        open_now: r.work.open_now,
        overdue_now: r.work.overdue_now,
        in_review_now: r.work.in_review_now,
        hours_logged: r.time.hours_logged,
        hours_prev: r.previous_period.hours_logged,
        days_without_time_log: r.time.days_without_time_log,
        completed_without_time_logged: r.work.completed_without_time_logged,
        active_days: r.activity.active_days,
      })),
      definitions: DEFINITIONS,
      tip: 'Ask about one person for the full picture (busiest hours, overdue tasks, hours by project).',
    };
  }

  // Admins: one person.
  const { findMembers } = require('./assistantTools');
  const found = await findMembers([wanted]);
  if (found.error) return found;
  const person = (await load('id::text = $1', [String(found.members[0].id)]))[0];
  if (!person) return fail(`${found.members[0].name} is not an active member.`);
  const [m] = await metricsFor([person], d);
  const teamRows = person.role === 'member' ? await metricsFor(await load(`role = 'member'`, []), d) : [];
  const teamAvg = teamRows.length
    ? {
      completed: round1(teamRows.reduce((s, r) => s + r.work.completed, 0) / teamRows.length),
      hours_logged: round1(teamRows.reduce((s, r) => s + (r.time.hours_logged || 0), 0) / teamRows.length),
      rework_tasks: round1(teamRows.reduce((s, r) => s + r.work.rework_tasks, 0) / teamRows.length),
    }
    : undefined;
  return { scope: 'one member', period: periodInfo, role: person.role, ...m, team_average: teamAvg, ...(await detailFor(person, d)), definitions: DEFINITIONS };
}

module.exports = { memberInsights, PERIOD_NAMES };
