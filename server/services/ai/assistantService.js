'use strict';

/*
 * Orbit AI: the assistant panel.
 *
 *   chat(user, text)        answer, looking things up with tools; actions are
 *                           prepared as cards that need Confirm (Phase 2)
 *   confirmAction / cancelAction
 *   history(user)           the saved conversation (with action states)
 *   clear(user)             start over
 *   briefing(user)          today's morning briefing (made once a day, cached)
 *   usage(user)             questions used today / daily limit (+ team total for admins)
 *
 * Role aware: an admin's assistant knows the whole agency; a member's knows
 * everything about their own work and their projects. The same access rules
 * as the app apply in every tool (assistantTools.js / assistantActions.js).
 *
 * Free-tier friendly: a per-person daily question limit (AI_DAILY_LIMIT,
 * default 40), a live snapshot in the prompt so simple questions need no
 * lookup, short history, small tool results, the lite model for briefings.
 */

const db = require('../../db');
const gemini = require('./gemini');
const tools = require('./assistantTools');
const actions = require('./assistantActions');

const MAX_INPUT = 4000;
const HISTORY_FOR_MODEL = 14;
const MAX_TOOL_ROUNDS = 5;
const MAX_ACTIONS_PER_REPLY = 5;
const fail = (status, message) => Object.assign(new Error(message), { status });
const dailyLimit = () => Math.max(1, Number.parseInt(process.env.AI_DAILY_LIMIT, 10) || 40);

const istDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: tools.TZ }).format(new Date()); // YYYY-MM-DD
const istNow = () => new Intl.DateTimeFormat('en-IN', { timeZone: tools.TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());

// The next 14 days, so "Friday" / "next Monday" become exact dates.
function calendarHint() {
  const out = [];
  const base = new Date(`${istDate()}T00:00:00Z`);
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(base.getTime() + i * 86400000);
    const label = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
    out.push(`${label} = ${d.toISOString().slice(0, 10)}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`);
  }
  return out.join('; ');
}

// req.user has only id and role; the prompt and briefing use the name.
async function withName(user) {
  if (user.name) return user;
  const { rows } = await db.query('SELECT name FROM members WHERE id = $1', [user.id]);
  return { ...user, name: rows[0]?.name || '' };
}

const snapshotCache = new Map(); // userId -> { at, data }
async function snapshotFor(user) {
  const hit = snapshotCache.get(String(user.id));
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const data = await tools.snapshot(user).catch(() => null);
  snapshotCache.set(String(user.id), { at: Date.now(), data });
  return data;
}

function systemPrompt(user, snapshot) {
  const admin = tools.isManager(user);
  return [
    'You are Orbit AI, the assistant inside Orbit — the project, task, time and team app of Toruss, a creative agency in Palakkad, Kerala (web, branding, design, SEO, social media).',
    `Now: ${istNow()} (India time). Work week Monday–Saturday; Sunday is off.`,
    `Dates: ${calendarHint()}.`,
    '',
    admin
      ? `You are talking to ${user.name || 'an admin'}, an ADMIN. Admins see and manage everything: every project, task, member, the review queue, task requests, time logs, rework, calendar and activity. Act like a sharp chief-of-staff: spot risks (overdue work, overloaded people, tasks stuck in review, rework), and suggest who/what to act on.`
      : `You are talking to ${user.name || 'a team member'}, a MEMBER. You know everything about their own work: their tasks (with details, comments and history), their projects, their time log, their calendar, their task requests and their projects' knowledge base. Colleagues' public profiles are visible, but not other people's tasks or hours. Act like a helpful senior teammate: help them prioritise, unblock and finish.`,
    snapshot ? `Live snapshot right now (${snapshot.scope}): ${JSON.stringify(snapshot)}` : '',
    '',
    'How to answer:',
    '- For facts beyond the snapshot, call tools. Combine several tools when useful (e.g. task_details + activity). Never invent tasks, people, numbers or dates.',
    '- If a tool returns an error or nothing, say so plainly and suggest the next step.',
    '- Lead with the answer. Then short "- " bullets. **Bold** the key item. Overdue first. Dates like "Mon 26 Oct". No tables or headings. Keep it under ~150 words unless asked for detail.',
    '- End with one useful next step when it helps (e.g. "Want me to move it to In Review?").',
    '- People often write Manglish (Malayalam in English letters) or mix languages. Understand it. Reply in English unless they ask for Malayalam/Manglish.',
    '- When asked to rewrite / translate / "make it professional" a message for a client or the team: return only the polished message, ready to copy. Do not add facts.',
    '- For standups or summaries, use the activity tool and group by project.',
    '',
    'Doing things (actions):',
    '- You can prepare: create_task, update_task, add_comment, log_time' + (admin ? ', create_event' : '') + '. Nothing changes until the person presses Confirm on the card, so say e.g. "Ready — press Confirm below."',
    '- Resolve names and dates from what they said and the date list above. If something essential is missing or a name is ambiguous, ask one short question instead of guessing.',
    admin ? '' : '- Members cannot create main tasks: create_task turns it into a Task Request for the admins (or a sub task under their own task). Members can only change a task\'s stage, and not to Done or Rework.',
    '- Never claim something was done before it is confirmed.',
    '',
    'Never reveal or ask for passwords, API keys or anything from the Credentials vault. You have no access to private chats.',
  ].filter((line) => line !== '').join('\n');
}

/* ---------- Usage limits ---------- */

async function usage(user) {
  const { rows } = await db.query(
    `SELECT questions FROM ai_usage WHERE member_id = $1 AND day = $2`,
    [user.id, istDate()],
  );
  const result = { used: rows[0]?.questions || 0, limit: dailyLimit(), enabled: gemini.isEnabled() };
  if (tools.isManager(user)) {
    const team = await db.query(`SELECT COALESCE(SUM(questions), 0)::int AS q, COALESCE(SUM(calls), 0)::int AS c FROM ai_usage WHERE day = $1`, [istDate()]);
    result.team_questions = team.rows[0].q;
    result.team_calls = team.rows[0].c;
  }
  return result;
}

async function countUsage(userId, { questions = 0, calls = 0 }) {
  await db.query(
    `INSERT INTO ai_usage (member_id, day, questions, calls) VALUES ($1, $2, $3, $4)
     ON CONFLICT (member_id, day) DO UPDATE
       SET questions = ai_usage.questions + EXCLUDED.questions, calls = ai_usage.calls + EXCLUDED.calls`,
    [userId, istDate(), questions, calls],
  );
}

/* ---------- Conversation ---------- */

async function withActionStates(user, messages) {
  const ids = messages.flatMap((m) => (Array.isArray(m.actions) ? m.actions : []));
  const map = await actions.states(user, ids);
  return messages.map((m) => ({ ...m, actions: (m.actions || []).map((id) => map.get(String(id))).filter(Boolean) }));
}

async function history(user) {
  const { rows } = await db.query(
    `SELECT id, role, content, cards, actions, created_at FROM ai_messages
      WHERE member_id = $1 ORDER BY created_at DESC, id DESC LIMIT 60`,
    [user.id],
  );
  return { messages: await withActionStates(user, rows.reverse()), usage: await usage(user) };
}

async function clear(user) {
  await db.query('DELETE FROM ai_messages WHERE member_id = $1', [user.id]);
  await db.query(`UPDATE ai_actions SET status = 'cancelled' WHERE member_id = $1 AND status = 'pending'`, [user.id]);
  return { ok: true };
}

async function save(userId, role, content, cards = [], actionIds = []) {
  const { rows } = await db.query(
    `INSERT INTO ai_messages (member_id, role, content, cards, actions) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
     RETURNING id, role, content, cards, actions, created_at`,
    [userId, role, content, JSON.stringify(cards), JSON.stringify(actionIds)],
  );
  return rows[0];
}

const textOf = (content) => (content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();

// Shown in the panel while a tool runs (streaming only).
const STATUS = {
  my_tasks: 'Checking your tasks',
  find_tasks: 'Searching tasks',
  task_details: 'Reading the task',
  project_status: 'Checking the project',
  list_projects: 'Looking at projects',
  people: 'Looking up the team',
  team_workload: 'Checking team workload',
  review_queue: 'Checking the review queue',
  calendar: 'Checking the calendar',
  activity: 'Reading recent activity',
  time_logged: 'Adding up hours',
  rework_report: 'Checking rework',
  task_requests: 'Checking task requests',
  knowledge: 'Searching the Knowledge base',
};
const declarations = () => [...tools.declarations, ...actions.declarations];

/*
 * opts.emit(event): stream mode. Events: { type: 'status', text },
 * { type: 'delta', text }. opts.signal: aborts (Stop button / closed tab).
 */
async function chat(authUser, rawText, opts = {}) {
  const { emit, signal } = opts;
  const started = Date.now();
  const timing = { db: 0, model: 0, tools: 0, models: [] };
  if (!gemini.isEnabled()) throw fail(503, 'Orbit AI is not set up yet. Ask an admin to add the API key on the server.');
  const text = typeof rawText === 'string' ? rawText.replace(/\u0000/g, '').trim() : '';
  if (!text) throw fail(400, 'Type a question first.');
  if (text.length > MAX_INPUT) throw fail(400, `Keep it under ${MAX_INPUT} characters.`);
  emit?.({ type: 'status', text: 'Thinking' });

  // Everything the first model call needs, fetched at the same time.
  const [user, used, past, snapshot] = await Promise.all([
    withName(authUser),
    usage(authUser),
    db.query(
      `SELECT role, content FROM ai_messages WHERE member_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${HISTORY_FOR_MODEL}`,
      [authUser.id],
    ).then((r) => r.rows),
    snapshotFor(authUser),
  ]);
  timing.db += Date.now() - started;
  if (used.used >= used.limit) {
    throw fail(429, `You've used all ${used.limit} Orbit AI questions for today. It resets tomorrow.`);
  }

  // Recent conversation as context (text only).
  const contents = past.reverse().map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
  contents.push({ role: 'user', parts: [{ text }] });

  const system = systemPrompt(user, snapshot);
  // Saved while the model works; awaited before the reply is saved.
  const userMessagePromise = save(user.id, 'user', text);
  const cards = new Map();
  const prepared = [];
  let calls = 0;
  let answer = '';
  let streamedText = '';
  let stopped = false;
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const request = {
        system,
        contents,
        tools: round < MAX_TOOL_ROUNDS ? declarations() : undefined,
        maxTokens: 1500,
      };
      let content;
      let usedModel;
      const modelStart = Date.now();
      if (emit) {
        // Text from an earlier round ("Let me check…") stays; separate it.
        const before = streamedText;
        ({ content, model: usedModel } = await gemini.stream({
          ...request,
          signal,
          onText: (piece) => {
            if (streamedText === before && before && !before.endsWith('\n')) {
              streamedText += '\n\n';
              emit({ type: 'delta', text: '\n\n' });
            }
            streamedText += piece;
            emit({ type: 'delta', text: piece });
          },
        }));
      } else {
        ({ content, model: usedModel } = await gemini.generate(request));
      }
      timing.model += Date.now() - modelStart;
      timing.models.push(usedModel);
      calls += 1;
      contents.push(content);
      const fnCalls = content.parts.filter((p) => p.functionCall);
      if (!fnCalls.length) {
        answer = emit ? streamedText.trim() : textOf(content);
        break;
      }
      // All lookups of this round run at the same time.
      const toolStart = Date.now();
      let actionSlots = MAX_ACTIONS_PER_REPLY - prepared.length;
      const responses = await Promise.all(fnCalls.map(async (part) => {
        const { name, args } = part.functionCall;
        if (emit) emit({ type: 'status', text: actions.isAction(name) ? 'Preparing the change' : (STATUS[name] || 'Looking it up') });
        let result;
        if (actions.isAction(name)) {
          if (actionSlots <= 0) {
            result = { error: `At most ${MAX_ACTIONS_PER_REPLY} changes at a time. Ask the person to confirm these first.` };
          } else {
            actionSlots -= 1;
            const out = await actions.prepare(user, name, args);
            if (out.action) prepared.push(out.action);
            result = out.forModel;
          }
        } else {
          result = (await tools.run(user, name, args)) || { error: `Unknown tool ${name}` };
          for (const card of tools.cardsFrom(result)) if (!cards.has(String(card.id))) cards.set(String(card.id), card);
        }
        return { functionResponse: { name, response: { result } } };
      }));
      timing.tools += Date.now() - toolStart;
      contents.push({ role: 'user', parts: responses });
    }
  } catch (err) {
    if (!err?.stopped) throw err;
    stopped = true;
    answer = streamedText.trim();
  } finally {
    countUsage(user.id, { questions: 1, calls }).catch(() => {});
  }
  if (stopped) answer = answer ? `${answer} …` : '(Stopped)';

  if (!answer) answer = prepared.length ? 'Ready — check the details and press Confirm below.' : "I couldn't put an answer together. Try asking in a different way.";
  // Task cards for tasks the answer talks about (at most 8).
  const lower = answer.toLowerCase();
  const shown = prepared.length ? [] : [...cards.values()].filter((c) => lower.includes(String(c.title).toLowerCase().slice(0, 24))).slice(0, 8);
  const saveStart = Date.now();
  const userMessage = await userMessagePromise;
  const reply = await save(user.id, 'assistant', answer, shown, prepared.map((a) => a.id));
  timing.db += Date.now() - saveStart;
  const total = Date.now() - started;
  // One line per question, to see where time goes (model / lookups / database).
  console.log(`[ai] ${total}ms total · ${calls} model call${calls === 1 ? '' : 's'} ${timing.model}ms (${timing.models.join(', ')}) · lookups ${timing.tools}ms · db ${timing.db}ms`);
  const nextUsage = { ...used, used: used.used + 1 };
  if (nextUsage.team_questions != null) nextUsage.team_questions += 1;
  return { user_message: userMessage, reply: { ...reply, actions: prepared }, usage: nextUsage };
}

async function confirmAction(user, id) {
  const out = await actions.confirm(user, id);
  let message = null;
  if (out.message) {
    // So the next question knows it happened (and the chat shows it).
    message = await save(user.id, 'assistant', out.action.status === 'done' ? `✅ ${out.message}` : out.message);
    snapshotCache.delete(String(user.id));
  }
  return { action: out.action, message };
}

async function cancelAction(user, id) {
  return actions.cancel(user, id);
}

/* ---------- Morning briefing ---------- */

async function briefing(authUser) {
  const user = await withName(authUser);
  const day = istDate();
  const cached = await db.query(`SELECT text, cards FROM ai_briefings WHERE member_id = $1 AND day = $2`, [user.id, day]);
  if (cached.rows[0]) return { day, text: cached.rows[0].text, cards: cached.rows[0].cards || [], cached: true };

  const admin = tools.isManager(user);
  const [overdue, today, week] = await Promise.all([
    tools.myTasks(user, { when: 'overdue' }),
    tools.myTasks(user, { when: 'today' }),
    tools.myTasks(user, { when: 'this_week' }),
  ]);
  const facts = {
    my_overdue: overdue.tasks.slice(0, 8),
    my_due_today: today.tasks.slice(0, 8),
    my_due_this_week_count: week.count,
  };
  let reviewCount = 0;
  if (admin) {
    const [snap, review, workload, events] = await Promise.all([
      tools.snapshot(user),
      tools.run(user, 'review_queue', {}),
      tools.run(user, 'team_workload', {}),
      tools.run(user, 'calendar', { range: 'today' }),
    ]);
    reviewCount = review?.count || 0;
    facts.agency = snap;
    facts.oldest_waiting_review = (review?.tasks || []).slice(0, 5).map((t) => ({ title: t.title, project: t.project, by: t.assignees, since: t.submitted_at }));
    facts.most_overdue_people = (workload?.members || []).filter((m) => m.overdue > 0).slice(0, 4);
    facts.today_events = (events?.events || []).slice(0, 5);
  } else {
    const events = await tools.run(user, 'calendar', { range: 'today' });
    facts.today_events = (events?.events || []).slice(0, 5);
  }
  const cards = [...overdue.tasks, ...today.tasks].slice(0, 6).map((t) => ({ id: t.id, title: t.title, project: t.project, project_id: t.project_id, stage: t.stage, due: t.due, priority: t.priority }));

  let text;
  try {
    if (!gemini.isEnabled()) throw new Error('off');
    const { content } = await gemini.generate({
      lite: true,
      maxTokens: 500,
      system: systemPrompt(user, null),
      contents: [{
        role: 'user',
        parts: [{
          text: admin
            ? `Write my admin morning briefing from this data. One warm line with my first name. Then 3-6 short bullets: agency risks first (overdue, review queue waiting longest, overloaded people), then my own items and today's events. End with the single most important thing to do first. Under 120 words. Data: ${JSON.stringify(facts)}`
            : `Write my morning briefing from this data. One warm line with my first name. Then 2-5 short bullets: overdue first, then today, then the week and today's events. End with one suggested first focus. Under 90 words. Data: ${JSON.stringify(facts)}`,
        }],
      }],
    });
    await countUsage(user.id, { calls: 1 }).catch(() => {});
    text = textOf(content);
  } catch {
    text = '';
  }
  if (!text) {
    // Plain fallback (no AI / limit reached).
    const first = String(user.name || '').split(' ')[0] || 'there';
    const lines = [`Good morning, ${first}!`];
    if (facts.my_overdue.length) lines.push(`- **${facts.my_overdue.length} overdue**: ${facts.my_overdue.slice(0, 3).map((t) => t.title).join(', ')}`);
    if (facts.my_due_today.length) lines.push(`- **${facts.my_due_today.length} due today**: ${facts.my_due_today.slice(0, 3).map((t) => t.title).join(', ')}`);
    lines.push(`- ${facts.my_due_this_week_count} task${facts.my_due_this_week_count === 1 ? '' : 's'} due this week`);
    if (admin) {
      if (facts.agency?.overdue) lines.push(`- Agency: ${facts.agency.overdue} overdue tasks`);
      if (reviewCount) lines.push(`- ${reviewCount} waiting for review`);
    }
    text = lines.join('\n');
  }
  await db.query(
    `INSERT INTO ai_briefings (member_id, day, text, cards) VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (member_id, day) DO NOTHING`,
    [user.id, day, text, JSON.stringify(cards)],
  );
  return { day, text, cards, cached: false };
}

module.exports = { chat, history, clear, briefing, usage, confirmAction, cancelAction };
