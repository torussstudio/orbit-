'use strict';

/*
 * Orbit AI: project knowledge.
 *
 *   project_brief   everything about one project in one lookup: details,
 *                   links, team, progress, milestones, recent activity,
 *                   hours and the whole Knowledge board (folders, notes,
 *                   files with a preview of their text)
 *   knowledge       ranked search over Knowledge notes, the text inside
 *                   Knowledge files (see knowledgeIndex.js) and, as a
 *                   fallback, tasks and task comments
 *   knowledge_read  one note or file in full (long ones in parts)
 *
 * Access is the app's: admins see every project; members only projects they
 * belong to (project_members), and of the tasks only their own. Results are
 * size-capped so a question stays cheap on the free tier. Anything that looks
 * like a secret is masked before it reaches the model.
 */

const db = require('../../db');
const { LEAF_TASK } = require('../../utils/taskScope');

const TZ = 'Asia/Kolkata';
const TODAY = `(NOW() AT TIME ZONE '${TZ}')::date`;
const OPEN = `t.stage NOT IN ('Done', 'Deployed')`;
const isManager = (user) => user?.role === 'manager';
const fail = (message) => ({ error: message });
const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);

const READ_PART = 8000; // characters per knowledge_read part (~2k tokens)
const BRIEF_BUDGET = 14000; // characters for a whole project_brief result

// Words that never help a search ("what is the brand colour of moksha").
const STOP = new Set(`a an the of for in on at to is are was be by and or with about from what whats which who how
do does did we our us me my i you your it its this that these those any some give show tell find search look list
please pls can could should would there here all project projects knowledge base board note notes file files doc docs
details detail info information about enthaa entha enthanu evide aanu und undo ille illa onnu ennu`.split(/\s+/));

function terms(query) {
  const words = String(query || '').toLowerCase().split(/[^\p{L}\p{N}#@._-]+/u)
    .map((w) => w.replace(/^[._-]+|[._-]+$/g, ''))
    .filter((w) => w.length >= 2 && !STOP.has(w));
  const unique = [...new Set(words)].slice(0, 8);
  if (unique.length) return unique;
  const whole = text(query, 80).toLowerCase();
  return whole.length >= 2 ? [whole] : [];
}

const likeOf = (word) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Never pass anything that looks like a secret to the model.
function scrub(value) {
  return String(value || '')
    .replace(/(password|passwd|pwd|pass|api[_ -]?key|secret|token|otp|pin)(\s*[:=-]\s*|\s+is\s+)\S+/gi, '$1$2[hidden]')
    .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}\b/g, '[hidden]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[hidden]');
}

// Up to `max` windows of text around the search words.
function excerpt(content, words, { size = 700, max = 2 } = {}) {
  const body = scrub(content);
  if (!body) return '';
  const lower = body.toLowerCase();
  const hits = [];
  for (const w of words) {
    const at = lower.indexOf(w);
    if (at >= 0) hits.push(at);
  }
  if (!hits.length) return body.slice(0, size) + (body.length > size ? ' …' : '');
  hits.sort((a, b) => a - b);
  const windows = [];
  for (const at of hits) {
    if (windows.length >= max) break;
    const start = Math.max(0, at - Math.floor(size / 3));
    if (windows.some(([s, e]) => start < e)) continue;
    windows.push([start, Math.min(body.length, start + size)]);
  }
  return windows
    .map(([s, e]) => `${s > 0 ? '… ' : ''}${body.slice(s, e).trim()}${e < body.length ? ' …' : ''}`)
    .join('\n');
}

// SQL: the project is visible to this user.
function projectVisible(user, params, alias = 'p') {
  if (isManager(user)) return 'TRUE';
  params.push(String(user.id));
  return `EXISTS (SELECT 1 FROM project_members vm WHERE vm.project_id = ${alias}.id AND vm.member_id::text = $${params.length})`;
}

// SQL: the task is visible to this user (members: assigned to them).
function taskVisible(user, params, alias = 't') {
  if (isManager(user)) return 'TRUE';
  params.push(String(user.id));
  return `EXISTS (SELECT 1 FROM task_assignees va WHERE va.task_id = ${alias}.id AND va.member_id::text = $${params.length})`;
}

function projectFilter(project, params, alias = 'p') {
  if (!project) return 'TRUE';
  params.push(likeOf(text(project)));
  return `(${alias}.name ILIKE $${params.length} OR ${alias}.client_name ILIKE $${params.length})`;
}

/* ------------------------------------------------------------------ */
/* knowledge: search                                                   */
/* ------------------------------------------------------------------ */

async function knowledge(user, { query, project } = {}) {
  const words = terms(query);
  if (!words.length) return fail('What should I look for?');
  const pats = words.map(likeOf);

  const score = (fields) => fields
    .map(([col, weight]) => `(SELECT COUNT(*) FROM unnest($1::text[]) w(pat) WHERE ${col} ILIKE w.pat) * ${weight}`)
    .join(' + ');

  const noteParams = [pats];
  const noteSql = `
    SELECT * FROM (
      SELECT n.id, n.title, n.content, p.name AS project, kf.name AS folder,
             to_char(n.updated_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS updated,
             ${score([['n.title', 3], ['n.content', 1], ["coalesce(kf.name, '')", 1]])} AS score
        FROM knowledge_notes n
        JOIN projects p ON p.id = n.project_id
        LEFT JOIN knowledge_folders kf ON kf.id = n.folder_id
       WHERE p.trashed_at IS NULL
         AND ${projectVisible(user, noteParams)}
         AND ${projectFilter(project, noteParams)}
    ) s WHERE score > 0
    ORDER BY score DESC, updated DESC NULLS LAST LIMIT 6`;

  const fileParams = [pats];
  const fileSql = `
    SELECT * FROM (
      SELECT f.id, f.name, f.mime_type, p.name AS project, kf.name AS folder,
             x.status AS read_status, x.content,
             ${score([['f.name', 3], ["coalesce(x.content, '')", 1], ["coalesce(kf.name, '')", 1]])} AS score
        FROM knowledge_files f
        JOIN projects p ON p.id = f.project_id
        LEFT JOIN knowledge_folders kf ON kf.id = f.folder_id
        LEFT JOIN ai_knowledge_text x ON x.file_id = f.id::text
       WHERE p.trashed_at IS NULL
         AND ${projectVisible(user, fileParams)}
         AND ${projectFilter(project, fileParams)}
    ) s WHERE score > 0
    ORDER BY score DESC LIMIT 5`;

  // Fallback: the same words in tasks and task comments the user can see.
  const taskParams = [pats];
  const taskSql = `
    SELECT * FROM (
      SELECT t.id, t.title, t.stage, t.project_id, p.name AS project, LEFT(t.description, 2000) AS description,
             to_char(t.due_date, 'YYYY-MM-DD') AS due, t.priority,
             ${score([['t.title', 3], ["coalesce(t.description, '')", 1]])} AS score
        FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE p.trashed_at IS NULL
         AND ${taskVisible(user, taskParams)}
         AND ${projectFilter(project, taskParams)}
    ) s WHERE score > 0
    ORDER BY score DESC LIMIT 5`;

  const commentParams = [pats];
  const commentSql = `
    SELECT * FROM (
      SELECT c.content, m.name AS author, t.title AS task, p.name AS project,
             to_char(c.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS at,
             ${score([['c.content', 1]])} AS score
        FROM task_comments c
        JOIN tasks t ON t.id = c.task_id
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN members m ON m.id = c.author_id
       WHERE p.trashed_at IS NULL
         AND ${taskVisible(user, commentParams)}
         AND ${projectFilter(project, commentParams)}
    ) s WHERE score > 0
    ORDER BY score DESC, at DESC LIMIT 5`;

  const [notes, files, tasks, comments] = await Promise.all([
    db.query(noteSql, noteParams),
    db.query(fileSql, fileParams).catch(() => ({ rows: [] })),
    db.query(taskSql, taskParams),
    db.query(commentSql, commentParams),
  ]);

  const result = {
    searched_for: words,
    knowledge_notes: notes.rows.map((n) => ({
      title: n.title, project: n.project, folder: n.folder || undefined, updated: n.updated,
      excerpt: excerpt(n.content, words), length: (n.content || '').length,
    })),
    knowledge_files: files.rows.map((f) => ({
      name: f.name, project: f.project, folder: f.folder || undefined, type: f.mime_type,
      readable: f.read_status === 'ok',
      excerpt: f.read_status === 'ok' ? excerpt(f.content, words) : undefined,
    })),
    tasks: tasks.rows.map(({ score: _s, description, ...t }) => ({ ...t, description: excerpt(description, words, { size: 400, max: 1 }) || undefined })),
    task_comments: comments.rows.map(({ score: _s, content, ...c }) => ({ ...c, text: excerpt(content, words, { size: 400, max: 1 }) })),
  };
  const found = notes.rows.length + files.rows.length;
  if (found) result.tip = 'To read a whole note or file, call knowledge_read with its title.';
  else if (tasks.rows.length || comments.rows.length) result.note = 'Nothing in the Knowledge board matches; the task/comment matches above come from the database.';
  else result.note = 'Nothing matches in the Knowledge board, tasks or comments.';
  return result;
}

/* ------------------------------------------------------------------ */
/* knowledge_read: one note or file in full                            */
/* ------------------------------------------------------------------ */

async function knowledgeRead(user, { title, project, part = 1 } = {}) {
  const name = text(title, 200);
  if (!name) return fail('Which note or file?');
  const params = [likeOf(name), name.toLowerCase()];
  const vis = projectVisible(user, params);
  const pf = projectFilter(project, params);
  const { rows } = await db.query(
    `SELECT * FROM (
       SELECT 'note' AS kind, n.title AS name, n.content, 'ok' AS read_status, NULL AS mime_type,
              p.name AS project, kf.name AS folder,
              to_char(n.updated_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS updated,
              (lower(n.title) = $2) AS exact
         FROM knowledge_notes n JOIN projects p ON p.id = n.project_id
         LEFT JOIN knowledge_folders kf ON kf.id = n.folder_id
        WHERE n.title ILIKE $1 AND p.trashed_at IS NULL AND ${vis} AND ${pf}
       UNION ALL
       SELECT 'file', f.name, x.content,
              COALESCE(x.status, CASE WHEN lower(f.mime_type) IN ('application/pdf', 'text/plain', 'text/markdown') THEN 'pending' ELSE 'skipped' END),
              f.mime_type,
              p.name, kf.name, to_char(f.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD'),
              (lower(f.name) = $2)
         FROM knowledge_files f JOIN projects p ON p.id = f.project_id
         LEFT JOIN knowledge_folders kf ON kf.id = f.folder_id
         LEFT JOIN ai_knowledge_text x ON x.file_id = f.id::text
        WHERE f.name ILIKE $1 AND p.trashed_at IS NULL AND ${vis} AND ${pf}
     ) s ORDER BY exact DESC, length(name) ASC LIMIT 5`,
    params,
  );
  if (!rows.length) return fail(`No note or file called "${name}" that you can see. Try the knowledge search.`);
  const doc = rows[0];
  const others = rows.slice(1).map((r) => `${r.name} (${r.project})`);
  const base = { kind: doc.kind, name: doc.name, project: doc.project, folder: doc.folder || undefined, updated: doc.updated, other_matches: others.length ? others : undefined };
  if (doc.kind === 'file' && doc.read_status !== 'ok') {
    const why = {
      pending: 'Its text has not been read yet (it is read in the background shortly after upload).',
      skipped: 'This type of file (image / zip) has no readable text.',
      empty: 'The file has no text in it (for example a scanned PDF).',
      failed: 'The file could not be opened.',
    }[doc.read_status] || 'Its text is not available.';
    return { ...base, type: doc.mime_type, note: why };
  }
  const body = scrub(doc.content || '');
  const parts = Math.max(1, Math.ceil(body.length / READ_PART));
  const n = Math.min(Math.max(1, Number.parseInt(part, 10) || 1), parts);
  return {
    ...base,
    part: n,
    total_parts: parts,
    content: body.slice((n - 1) * READ_PART, n * READ_PART) || '(empty)',
    note: parts > n ? `Long document: call knowledge_read again with part ${n + 1} for more.` : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* project_brief: everything about one project                        */
/* ------------------------------------------------------------------ */

function folderPaths(folders) {
  const byId = new Map(folders.map((f) => [String(f.id), f]));
  const pathOf = (f, depth = 0) => {
    if (!f || depth > 8) return '';
    const parent = f.parent_id != null ? byId.get(String(f.parent_id)) : null;
    return parent ? `${pathOf(parent, depth + 1)} / ${f.name}` : f.name;
  };
  return new Map(folders.map((f) => [String(f.id), pathOf(f)]));
}

const clip = (value, size) => {
  const s = scrub(value).replace(/\s+/g, ' ').trim();
  return s.length > size ? `${s.slice(0, size)} …` : s;
};

async function projectBrief(user, { project } = {}) {
  if (!project) return fail('Which project?');
  const { findProjects } = require('./assistantTools');
  const matches = await findProjects(user, project);
  if (!matches.length) return fail(`No project matching "${project}" that you can see.`);
  const p = matches[0];
  const admin = isManager(user);
  const pid = p.id;
  const mine = admin ? 'TRUE' : `EXISTS (SELECT 1 FROM task_assignees va WHERE va.task_id = t.id AND va.member_id::text = $2)`;
  const mineParams = admin ? [pid] : [pid, String(user.id)];

  const [stages, openTasks, team, milestones, activity, hours, folders, notes, files] = await Promise.all([
    // Progress of the whole project (counts only, like the Projects page).
    db.query(
      `SELECT t.stage, COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE ${OPEN} AND t.due_date::date < ${TODAY})::int AS overdue
         FROM tasks t WHERE t.project_id = $1 AND ${LEAF_TASK}
        GROUP BY t.stage ORDER BY count DESC`,
      [pid],
    ),
    // Open tasks: admins the next ones due; members their own.
    db.query(
      `SELECT t.id, t.title, t.stage, t.priority, t.project_id, $${mineParams.length + 1}::text AS project,
              to_char(t.due_date, 'YYYY-MM-DD') AS due, pt.title AS main_task,
              (SELECT string_agg(m.name, ', ' ORDER BY m.name) FROM task_assignees ta JOIN members m ON m.id = ta.member_id WHERE ta.task_id = t.id) AS assignees
         FROM tasks t LEFT JOIN tasks pt ON pt.id = t.parent_task_id
        WHERE t.project_id = $1 AND ${OPEN} AND ${LEAF_TASK} AND ${mine}
        ORDER BY t.due_date ASC NULLS LAST, t.id LIMIT 10`,
      [...mineParams, p.name],
    ),
    db.query(
      `SELECT m.name, m.role FROM project_members pm JOIN members m ON m.id = pm.member_id
        WHERE pm.project_id = $1 AND m.active = true ORDER BY m.role DESC, m.name`,
      [pid],
    ),
    db.query(
      `SELECT c.name, c.status, to_char(c.target_date, 'YYYY-MM-DD') AS target_date, COALESCE(c.rework_count, 0) AS rework,
              (SELECT COUNT(*)::int FROM tasks t LEFT JOIN tasks pt ON pt.id = t.parent_task_id
                WHERE COALESCE(t.cluster_id, pt.cluster_id) = c.id AND ${LEAF_TASK}) AS tasks,
              (SELECT COUNT(*)::int FROM tasks t LEFT JOIN tasks pt ON pt.id = t.parent_task_id
                WHERE COALESCE(t.cluster_id, pt.cluster_id) = c.id AND ${LEAF_TASK} AND t.stage = 'Done') AS done
         FROM clusters c WHERE c.project_id = $1 ORDER BY c.target_date NULLS LAST LIMIT 12`,
      [pid],
    ).catch(() => ({ rows: [] })),
    // Last 7 days (members: on their own tasks).
    db.query(
      `SELECT m.name AS who, x.kind, x.detail, t.title AS task,
              to_char(x.at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS at
         FROM (
           SELECT a.task_id, a.actor_id AS person, 'stage' AS kind,
                  COALESCE(a.meta->>'from', '?') || ' → ' || COALESCE(a.meta->>'to', '?') AS detail, a.created_at AS at
             FROM task_activity a WHERE a.meta ? 'to' AND a.created_at > NOW() - interval '7 days'
           UNION ALL
           SELECT c.task_id, c.author_id, 'comment', LEFT(c.content, 140), c.created_at
             FROM task_comments c WHERE c.created_at > NOW() - interval '7 days'
         ) x
         JOIN tasks t ON t.id = x.task_id
         LEFT JOIN members m ON m.id = x.person
        WHERE t.project_id = $1 AND ${mine}
        ORDER BY x.at DESC LIMIT 8`,
      mineParams,
    ),
    db.query(
      admin
        ? `SELECT m.name, ROUND(SUM(e.minutes) / 60.0, 1)::float AS hours
             FROM time_entries e JOIN members m ON m.id = e.member_id
            WHERE e.project_id = $1 AND e.work_date >= date_trunc('month', ${TODAY})
            GROUP BY m.name ORDER BY hours DESC LIMIT 8`
        : `SELECT 'you' AS name, ROUND(COALESCE(SUM(e.minutes), 0) / 60.0, 1)::float AS hours
             FROM time_entries e
            WHERE e.project_id = $1 AND e.member_id::text = $2 AND e.work_date >= date_trunc('month', ${TODAY})`,
      admin ? [pid] : [pid, String(user.id)],
    ).catch(() => ({ rows: [] })),
    db.query(`SELECT id, parent_id, name FROM knowledge_folders WHERE project_id = $1`, [pid]),
    db.query(
      `SELECT n.title, n.folder_id, n.content, to_char(n.updated_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS updated
         FROM knowledge_notes n WHERE n.project_id = $1 ORDER BY n.updated_at DESC NULLS LAST LIMIT 40`,
      [pid],
    ),
    db.query(
      `SELECT f.name, f.folder_id, f.mime_type, x.status AS read_status, LEFT(x.content, 600) AS content,
              to_char(f.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS uploaded
         FROM knowledge_files f LEFT JOIN ai_knowledge_text x ON x.file_id = f.id::text
        WHERE f.project_id = $1 ORDER BY f.created_at DESC LIMIT 40`,
      [pid],
    ).catch(() => ({ rows: [] })),
  ]);

  const paths = folderPaths(folders.rows);
  const total = stages.rows.reduce((s, r) => s + r.count, 0);
  const done = stages.rows.filter((r) => r.stage === 'Done').reduce((s, r) => s + r.count, 0);
  const overdue = stages.rows.reduce((s, r) => s + r.overdue, 0);

  const build = (noteChars, fileChars, listMax) => ({
    project: {
      name: p.name,
      client: p.client_name || undefined,
      status: p.status,
      start_date: p.start_date || undefined,
      end_date: p.end_date || undefined,
      description: clip(p.description || '', 1500) || undefined,
      docs_url: p.docs_url || undefined,
      milanote_url: p.milanote_url || undefined,
      stages: p.stages || undefined,
    },
    other_matches: matches.slice(1).map((m) => m.name),
    progress: { tasks: total, done, percent_done: total ? Math.round((done / total) * 100) : 0, overdue, by_stage: stages.rows.map(({ stage, count }) => ({ stage, count })) },
    next_open_tasks: openTasks.rows,
    milestones: milestones.rows,
    team: team.rows,
    hours_this_month: hours.rows,
    recent_activity: activity.rows,
    knowledge_board: {
      folders: [...paths.values()].sort(),
      notes_total: notes.rows.length,
      notes: notes.rows.slice(0, listMax).map((n) => ({
        title: n.title,
        folder: n.folder_id != null ? paths.get(String(n.folder_id)) : undefined,
        updated: n.updated,
        preview: clip(n.content || '', noteChars) || undefined,
      })),
      files_total: files.rows.length,
      files: files.rows.slice(0, listMax).map((f) => ({
        name: f.name,
        folder: f.folder_id != null ? paths.get(String(f.folder_id)) : undefined,
        type: f.mime_type,
        readable: f.read_status === 'ok',
        preview: f.read_status === 'ok' && fileChars ? clip(f.content || '', fileChars) : undefined,
      })),
    },
    note: admin ? undefined : 'Progress counts cover the whole project; next_open_tasks and recent_activity show only this member\'s own tasks.',
    tip: 'Previews are short: use knowledge_read for a whole note or file, knowledge to search inside them.',
  });

  // Keep the result inside the budget: shorter previews first, then fewer items.
  const attempts = [[280, 220, 30], [160, 120, 30], [100, 0, 20], [0, 0, 15]];
  let result;
  for (const [n, f, max] of attempts) {
    result = build(n, f, max);
    if (JSON.stringify(result).length <= BRIEF_BUDGET) break;
  }
  return result;
}

module.exports = { knowledge, knowledgeRead, projectBrief, terms, excerpt, scrub };
