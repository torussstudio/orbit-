import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api, { refreshAccessToken } from '../../api/client';
import { getAccessToken, getSessionId } from '../../api/tokenStore';
import { useAuth } from '../../context/AuthContext';

/*
 * Orbit AI: the ✨ button in the top bar and its side panel.
 * Ctrl / ⌘ + J opens it anywhere. Answers stream in word by word
 * (POST /api/assistant/chat/stream); changes it prepares show as cards
 * that need Confirm (server/services/ai).
 */

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-2)]';
const SEEN_KEY = 'orbit_ai_briefing_seen';
const WIDE_KEY = 'orbit_ai_wide';
const STREAM_URL = `${(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')}/assistant/chat/stream`;
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const apiError = (err, fallback) => err?.response?.data?.error || fallback;
const readStore = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeStore = (key, value) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } };
const TIME_FMT = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

const MEMBER_STARTERS = [
  { icon: 'target', label: 'What should I do first?', hint: 'Prioritise my day', text: 'Look at my tasks and tell me what to work on first today, and why.' },
  { icon: 'alert', label: 'My overdue tasks', hint: 'What is late', text: 'Which of my tasks are overdue?' },
  { icon: 'note', label: 'Write my standup', hint: 'Yesterday · today · blockers', text: 'Write my standup for today: what I did yesterday, what I am doing today, any blockers.' },
  { icon: 'clock', label: 'Log time', hint: 'e.g. 1 hour on a task', text: 'Log 1 hour on ', fill: true },
  { icon: 'pen', label: 'Rewrite for client', hint: 'Manglish → polished English', text: 'Rewrite this as a clear, polite message for the client:\n', fill: true },
  { icon: 'chart', label: 'My hours this week', hint: 'Per project', text: 'How many hours have I logged this week, per project?' },
];
const ADMIN_STARTERS = [
  { icon: 'pulse', label: 'Agency overview', hint: 'Risks first', text: 'Give me a quick overview of the agency right now: risks first.' },
  { icon: 'eye', label: 'Waiting for review', hint: 'Oldest first', text: 'What is waiting for my review, oldest first?' },
  { icon: 'users', label: 'Team workload', hint: 'Who is overloaded, who has room', text: 'Who has the most open and overdue tasks right now? Who has room for more?' },
  { icon: 'note', label: 'What happened today?', hint: 'Grouped by project', text: 'What happened today across all projects? Group by project.' },
  { icon: 'alert', label: 'Projects at risk', hint: 'Overdue · rework · deadlines', text: 'Which projects are at risk (overdue tasks, rework, close end dates)?' },
  { icon: 'plus', label: 'Create a task', hint: 'e.g. for Hari, due Friday', text: 'Create a task in ', fill: true },
];
const QUICK_CHIPS = { member: [0, 1, 4, 3], admin: [0, 1, 2, 5] };

const PATHS = {
  sparkles: <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  check: <path d="M5 12.5l4.5 4.5L19.5 7" />,
  pen: <><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  link: <><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
  expand: <><path d="M15 3h6v6M9 21H3v-6" /><path d="M21 3l-7 7M3 21l7-7" /></>,
  shrink: <><path d="M4 14h6v6M20 10h-6V4" /><path d="M14 10l7-7M10 14l-7 7" /></>,
  chevron: <path d="M6 9l6 6 6-6" />,
  down: <path d="M12 5v14M5 12l7 7 7-7" />,
  retry: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.1" /></>,
  note: <><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4z" /><path d="M9 13h6M9 17h4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
};

function Icon({ name, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

function AiAvatar({ size = 'h-7 w-7', icon = 'h-3.5 w-3.5' }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white shadow-[0_6px_14px_-8px_#6366f1]`}>
      <Icon name="sparkles" className={icon} />
    </span>
  );
}

// Tiny safe renderer: bullets, numbered lists, **bold**, `code`, line breaks.
// Never renders HTML.
function Rich({ text }) {
  const inline = (line) => line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i} className="font-semibold text-[color:var(--text)]">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="rounded bg-[var(--bg-3)] px-1 py-px text-[12px]">{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part.replace(/^#+\s*/, '')}</Fragment>;
  });
  const out = [];
  let list = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    out.push(<Tag key={`l-${out.length}`} className={`my-1.5 space-y-1 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'} marker:text-[color:var(--text-3)]`}>{list.items}</Tag>);
    list = null;
  };
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push(<li key={i} className="pl-0.5">{inline((bullet || numbered)[1])}</li>);
      return;
    }
    flush();
    if (line.trim()) out.push(<p key={i} className="my-1.5 first:mt-0 last:mb-0">{inline(line)}</p>);
  });
  flush();
  return out;
}

const DUE_FMT = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function TaskCards({ cards, onOpen }) {
  if (!cards?.length) return null;
  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      {cards.map((card) => {
        const late = card.due && new Date(card.due) < new Date(todayKey());
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onOpen(card)}
            className={`flex w-full items-center gap-2.5 rounded-xl border border-[color:var(--border)] bg-[var(--bg)] px-3 py-2 text-left transition duration-200 hover:border-[color:var(--accent)] hover:bg-[var(--bg-3)] active:scale-[0.99] ${FOCUS_RING}`}
          >
            <span className={`h-8 w-1 shrink-0 rounded-full ${late ? 'bg-red-500' : card.stage === 'In Review' ? 'bg-amber-400' : 'bg-[var(--accent)]'}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-[color:var(--text)]">{card.title}</span>
              <span className="block truncate text-[11px] text-[color:var(--text-3)]">{card.project}{card.stage ? ` · ${card.stage}` : ''}</span>
            </span>
            {card.due && (
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${late ? 'bg-red-500/10 text-red-500' : 'bg-[var(--bg-3)] text-[color:var(--text-2)]'}`}>
                {DUE_FMT.format(new Date(card.due))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const ACTION_STATUS = {
  done: { label: 'Done', cls: 'text-emerald-600' },
  cancelled: { label: 'Cancelled', cls: 'text-[color:var(--text-3)]' },
  expired: { label: 'Expired — ask again', cls: 'text-[color:var(--text-3)]' },
  failed: { label: 'Not done', cls: 'text-red-500' },
  running: { label: 'Working…', cls: 'text-[color:var(--text-3)]' },
};

// A change Orbit AI prepared. Nothing happens until Confirm.
function ActionCard({ action, onConfirm, onCancel, onOpenLink, busyId }) {
  const pending = action.status === 'pending';
  const working = busyId === action.id;
  const status = ACTION_STATUS[action.status];
  return (
    <div className={`mt-2.5 overflow-hidden rounded-xl border ${pending ? 'border-[color:var(--accent)] shadow-[0_10px_24px_-18px_var(--accent)]' : 'border-[color:var(--border)]'}`}>
      <div className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold ${pending ? 'bg-[var(--accent-light)] text-[color:var(--text)]' : 'bg-[var(--bg-3)] text-[color:var(--text-2)]'}`}>
        <Icon name="bolt" className="h-3.5 w-3.5 text-[color:var(--accent)]" />{action.preview?.title || 'Change'}
        {pending && <span className="ml-auto text-[10px] font-medium text-[color:var(--text-3)]">Needs your OK</span>}
      </div>
      <div className="bg-[var(--bg-2)] px-3 py-2.5">
        <dl className="space-y-1 text-[12px] leading-relaxed">
          {(action.preview?.lines || []).map((line, i) => {
            const at = line.indexOf(': ');
            return at > 0 && at < 20 ? (
              <div key={i} className="flex gap-2">
                <dt className="w-[74px] shrink-0 text-[color:var(--text-3)]">{line.slice(0, at)}</dt>
                <dd className="min-w-0 break-words font-medium text-[color:var(--text)]">{line.slice(at + 2)}</dd>
              </div>
            ) : <p key={i} className="break-words text-[color:var(--text-2)]">{line}</p>;
          })}
        </dl>
        {action.preview?.note && <p className="mt-1.5 text-[11px] italic text-[color:var(--text-3)]">{action.preview.note}</p>}
        {pending ? (
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={working} onClick={() => onConfirm(action)} className={`inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--accent)] px-3 text-[12px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 sm:flex-none ${FOCUS_RING}`}>
              <Icon name="check" className="h-3.5 w-3.5" />{working ? 'Working…' : 'Confirm'}
            </button>
            <button type="button" disabled={working} onClick={() => onCancel(action)} className={`h-8 rounded-lg border border-[color:var(--border)] px-3 text-[12px] font-medium text-[color:var(--text-2)] transition hover:bg-[var(--bg-3)] disabled:opacity-60 ${FOCUS_RING}`}>
              Cancel
            </button>
          </div>
        ) : (
          <p className={`mt-2 flex flex-wrap items-center gap-2 text-[12px] font-medium ${status?.cls || ''}`}>
            {action.status === 'done' && <Icon name="check" className="h-3.5 w-3.5" />}
            {action.result?.text || status?.label || action.status}
            {action.status === 'done' && action.result?.link && (
              <button type="button" onClick={() => onOpenLink(action.result.link)} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[color:var(--accent)] underline-offset-2 hover:underline ${FOCUS_RING}`}>
                <Icon name="link" className="h-3 w-3" />Open
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ }
      }}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--text-3)] transition hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] ${FOCUS_RING}`}
      aria-label="Copy answer"
    >
      <Icon name={done ? 'check' : 'copy'} className="h-3 w-3" />{done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--accent)] motion-reduce:animate-none" style={{ animationDelay: `${i * 140}ms` }} />)}
    </span>
  );
}

// Reads the SSE stream of a fetch response, calling onEvent per event.
async function readEvents(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop();
    for (const block of blocks) {
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      try { onEvent(JSON.parse(data)); } catch { /* ignore a broken line */ }
    }
  }
}

export default function OrbitAssistant() {
  const { user, isManager } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // slide-in animation
  const [wide, setWide] = useState(() => readStore(WIDE_KEY) === '1');
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [usage, setUsage] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null); // { text, status } while streaming
  const [actionBusy, setActionBusy] = useState(null);
  const [error, setError] = useState(null); // { text, retry }
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(() => readStore(SEEN_KEY) !== todayKey());
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const stickRef = useRef(true);

  // Ctrl / ⌘ + J anywhere; Escape closes.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setOpen((v) => !v);
      } else if (event.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) { setShown(false); return undefined; }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    if (unseen) {
      setUnseen(false);
      writeStore(SEEN_KEY, todayKey());
    }
    requestAnimationFrame(() => inputRef.current?.focus());
    if (loaded) return;
    setLoaded(true);
    api.get('/assistant/history', { silent: true })
      .then(({ data }) => {
        const list = data?.messages || [];
        setMessages(list);
        setUsage(data?.usage || null);
        // Briefing starts folded once the person has been chatting.
        if (list.length > 2) setBriefingOpen(false);
      })
      .catch(() => {});
    api.get('/assistant/briefing', { silent: true })
      .then(({ data }) => setBriefing(data))
      .catch(() => {});
  }, [open, user, loaded, unseen]);

  // Follow the conversation while at the bottom (the welcome screen starts
  // at the top).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || (!messages.length && !live)) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, live, busy, open, briefingOpen]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    stickRef.current = bottom;
    setAtBottom(bottom);
  };

  const jumpDown = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  // Composer grows with its text.
  useLayoutEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [draft, open]);

  const ask = useCallback(async (raw) => {
    const text = String(raw ?? draft).trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setDraft('');
    stickRef.current = true;
    const temp = { id: `tmp-${Date.now()}`, role: 'user', content: text, cards: [], created_at: new Date().toISOString() };
    setMessages((old) => [...old, temp]);
    setLive({ text: '', status: 'Thinking' });
    const controller = new AbortController();
    abortRef.current = controller;
    let finished = false;
    let streamedSoFar = '';

    const finish = (data) => {
      finished = true;
      setMessages((old) => [...old.filter((m) => m.id !== temp.id), data.user_message, data.reply]);
      if (data.usage) setUsage(data.usage);
    };
    const failWith = (message) => {
      setMessages((old) => old.filter((m) => m.id !== temp.id));
      setDraft(text);
      setError({ text: message, retry: text });
    };

    try {
      let token = getAccessToken();
      if (!token) token = await refreshAccessToken();
      const request = (bearer) => fetch(STREAM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${bearer}`,
          'X-Orbit-Client': '1',
          ...(getSessionId() ? { 'X-Orbit-Session-Id': getSessionId() } : {}),
        },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });
      let res = await request(token);
      if (res.status === 401) res = await request(await refreshAccessToken());

      if (!res.ok || !res.body) {
        // Streaming not available: one normal request instead.
        const { data } = await api.post('/assistant/chat', { message: text }, { silent: true });
        finish(data);
        return;
      }
      await readEvents(res, (event) => {
        if (event.type === 'delta') {
          streamedSoFar += event.text;
          setLive((s) => ({ text: (s?.text || '') + event.text, status: null }));
        } else if (event.type === 'status') {
          setLive((s) => ({ text: s?.text || '', status: event.text }));
        } else if (event.type === 'done') {
          finish(event);
        } else if (event.type === 'error') {
          finished = true;
          failWith(event.error || 'Orbit AI could not answer. Try again.');
        }
      });
      if (!finished) failWith('The answer was cut off. Try again.');
    } catch (err) {
      if (controller.signal.aborted) {
        // Stopped: keep what arrived so far.
        setMessages((old) => [...old, { id: `stopped-${Date.now()}`, role: 'assistant', content: streamedSoFar ? `${streamedSoFar} …` : '(Stopped)', cards: [], actions: [], created_at: new Date().toISOString() }]);
      } else {
        failWith(apiError(err, 'Orbit AI could not answer. Check your connection and try again.'));
      }
    } finally {
      abortRef.current = null;
      setLive(null);
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [busy, draft]);

  const stop = () => abortRef.current?.abort();

  const reset = async () => {
    if (busy) return;
    try {
      await api.delete('/assistant/history', { silent: true });
      setMessages([]);
      setError(null);
      setBriefingOpen(true);
    } catch (err) {
      setError({ text: apiError(err, 'Could not clear the chat.') });
    }
  };

  const setAction = (updated) => setMessages((old) => old.map((m) => (
    m.actions?.some((a) => a.id === updated.id)
      ? { ...m, actions: m.actions.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)) }
      : m
  )));

  const confirmAction = async (action) => {
    setActionBusy(action.id);
    setError(null);
    try {
      const { data } = await api.post(`/assistant/actions/${action.id}/confirm`, null, { silent: true });
      if (data?.action) setAction(data.action);
      if (data?.message) setMessages((old) => [...old, data.message]);
    } catch (err) {
      setError({ text: apiError(err, 'That did not work. Nothing was changed.') });
      if (err?.response?.status === 410) setAction({ id: action.id, status: 'expired' });
    } finally {
      setActionBusy(null);
    }
  };

  const cancelAction = async (action) => {
    setActionBusy(action.id);
    try {
      const { data } = await api.post(`/assistant/actions/${action.id}/cancel`, null, { silent: true });
      if (data?.action) setAction(data.action);
    } catch { /* keep the card */ } finally {
      setActionBusy(null);
    }
  };

  const go = (link) => {
    if (window.innerWidth < 768) setOpen(false);
    navigate(link);
  };

  const pick = (starter) => {
    if (starter.fill) {
      setDraft(starter.text);
      inputRef.current?.focus();
      requestAnimationFrame(() => {
        const ta = inputRef.current;
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      });
    } else {
      ask(starter.text);
    }
  };

  const toggleWide = () => {
    setWide((v) => { writeStore(WIDE_KEY, v ? '0' : '1'); return !v; });
  };

  if (!user) return null;
  const starters = isManager ? ADMIN_STARTERS : MEMBER_STARTERS;
  const chips = (isManager ? QUICK_CHIPS.admin : QUICK_CHIPS.member).map((i) => starters[i]);
  const disabled = usage && usage.enabled === false;
  const limitReached = usage && usage.used >= usage.limit;
  const firstName = String(user.name || '').split(' ')[0] || 'there';
  const empty = !messages.length && !busy;
  const openCard = (card) => go(`/projects/${card.project_id}/tasks/${card.id}`);

  const panel = open && createPortal(
    <div className="fixed inset-0 z-[2100] flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close Orbit AI"
        onClick={() => setOpen(false)}
        className={`absolute inset-0 cursor-default bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 md:bg-black/10 ${shown ? 'opacity-100' : 'opacity-0'}`}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Orbit AI"
        className={`relative flex h-full w-full flex-col border-l border-[color:var(--border)] bg-[var(--bg-2)] shadow-[0_0_60px_-20px_rgba(15,23,42,0.5)] transition-[transform,opacity,width] duration-300 ease-out motion-reduce:transition-none ${wide ? 'sm:w-[min(760px,92vw)]' : 'sm:w-[460px]'} ${shown ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'}`}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[color:var(--border)] px-4 py-3">
          <AiAvatar size="h-9 w-9" icon="h-[18px] w-[18px]" />
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[color:var(--text)]">
              Orbit AI
              <span className="rounded-md bg-[var(--accent-light)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-[color:var(--accent)]">{isManager ? 'Admin' : 'Beta'}</span>
            </h2>
            <p className="truncate text-[11px] text-[color:var(--text-3)]">{isManager ? 'Knows the whole agency · makes changes you confirm' : 'Knows your work · makes changes you confirm'}</p>
          </div>
          <button type="button" onClick={toggleWide} title={wide ? 'Narrow' : 'Wide'} aria-label={wide ? 'Make narrower' : 'Make wider'} className={`hidden h-8 w-8 place-items-center rounded-lg text-[color:var(--text-2)] transition hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] sm:grid ${FOCUS_RING}`}>
            <Icon name={wide ? 'shrink' : 'expand'} />
          </button>
          <button type="button" onClick={reset} disabled={busy} title="New chat" aria-label="New chat" className={`grid h-8 w-8 place-items-center rounded-lg text-[color:var(--text-2)] transition hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] disabled:opacity-40 ${FOCUS_RING}`}>
            <Icon name="reset" />
          </button>
          <button type="button" onClick={() => setOpen(false)} title="Close (Esc)" aria-label="Close" className={`grid h-8 w-8 place-items-center rounded-lg text-[color:var(--text-2)] transition hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] ${FOCUS_RING}`}>
            <Icon name="close" />
          </button>
        </header>

        {/* Conversation */}
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain bg-[var(--bg)] px-4 py-4">
            <div className={`mx-auto space-y-4 ${wide ? 'max-w-[680px]' : ''}`}>
              {briefing?.text && (
                <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[var(--bg-2)] shadow-[0_8px_20px_-18px_rgba(15,23,42,0.5)]">
                  <button
                    type="button"
                    onClick={() => setBriefingOpen((v) => !v)}
                    aria-expanded={briefingOpen}
                    className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left ${FOCUS_RING}`}
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-amber-400/15 text-amber-500"><Icon name="sun" className="h-3.5 w-3.5" /></span>
                    <span className="flex-1 text-[12px] font-semibold text-[color:var(--text)]">Today&apos;s briefing</span>
                    <Icon name="chevron" className={`h-4 w-4 text-[color:var(--text-3)] transition-transform ${briefingOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {briefingOpen && (
                    <div className="border-t border-[color:var(--border)] px-3.5 pb-3.5 pt-2.5">
                      <div className="text-[13px] leading-relaxed text-[color:var(--text-2)]"><Rich text={briefing.text} /></div>
                      <TaskCards cards={briefing.cards} onOpen={openCard} />
                    </div>
                  )}
                </div>
              )}

              {empty && (
                <div className="pt-2">
                  <div className="mb-4 flex items-center gap-3">
                    <AiAvatar size="h-10 w-10" icon="h-5 w-5" />
                    <div>
                      <p className="text-[15px] font-semibold tracking-tight text-[color:var(--text)]">Hi {firstName} 👋</p>
                      <p className="text-[12px] text-[color:var(--text-3)]">
                        {isManager ? 'Ask about any project, person or deadline — or tell me what to do.' : 'Ask about your work — or tell me what to do. English or Manglish.'}
                      </p>
                    </div>
                  </div>
                  <div className={`grid gap-2 ${wide ? 'sm:grid-cols-3' : 'grid-cols-2'}`}>
                    {starters.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        disabled={disabled || busy || limitReached}
                        onClick={() => pick(s)}
                        className={`flex flex-col items-start gap-1.5 rounded-xl border border-[color:var(--border)] bg-[var(--bg-2)] p-3 text-left transition duration-200 hover:-translate-y-px hover:border-[color:var(--accent)] hover:shadow-[0_10px_24px_-18px_var(--accent)] active:translate-y-0 disabled:opacity-50 ${FOCUS_RING}`}
                      >
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent-light)] text-[color:var(--accent)]"><Icon name={s.icon} className="h-3.5 w-3.5" /></span>
                        <span className="text-[12.5px] font-semibold leading-tight text-[color:var(--text)]">{s.label}</span>
                        <span className="text-[11px] leading-tight text-[color:var(--text-3)]">{s.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div
                      title={m.created_at ? TIME_FMT.format(new Date(m.created_at)) : undefined}
                      className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--chat-out-bg)] px-3.5 py-2 text-[13px] leading-relaxed text-[color:var(--chat-out-text)] shadow-[var(--chat-out-shadow)]"
                    >
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="group flex gap-2.5">
                    <AiAvatar />
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-[13.5px] leading-relaxed text-[color:var(--text-2)]">
                        <Rich text={m.content} />
                        <TaskCards cards={m.cards} onOpen={openCard} />
                        {(m.actions || []).map((a) => (
                          <ActionCard key={a.id} action={a} busyId={actionBusy} onConfirm={confirmAction} onCancel={cancelAction} onOpenLink={go} />
                        ))}
                      </div>
                      <div className="mt-1 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-70">
                        <CopyButton text={m.content} />
                        {m.created_at && <span className="text-[10px] text-[color:var(--text-3)]">{TIME_FMT.format(new Date(m.created_at))}</span>}
                      </div>
                    </div>
                  </div>
                )
              ))}

              {live && (
                <div className="flex gap-2.5" aria-live="polite">
                  <AiAvatar />
                  <div className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-[color:var(--text-2)]">
                    {live.text ? <Rich text={`${live.text}▍`} /> : null}
                    {live.status && (
                      <p className="mt-0.5 flex items-center gap-2 text-[12px] text-[color:var(--text-3)]">
                        <Dots />{live.status}…
                      </p>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-600">
                  <Icon name="alert" className="mt-px h-4 w-4" />
                  <span className="flex-1">{error.text}</span>
                  {error.retry && !limitReached && (
                    <button type="button" onClick={() => { setDraft(''); ask(error.retry); }} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold hover:bg-red-500/10 ${FOCUS_RING}`}>
                      <Icon name="retry" className="h-3.5 w-3.5" />Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {!atBottom && (
            <button
              type="button"
              onClick={jumpDown}
              aria-label="Jump to latest"
              className={`absolute bottom-3 left-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text-2)] shadow-[0_8px_20px_-10px_rgba(15,23,42,0.5)] transition hover:text-[color:var(--text)] ${FOCUS_RING}`}
            >
              <Icon name="down" className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-[color:var(--border)] bg-[var(--bg-2)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
          <div className={`mx-auto ${wide ? 'max-w-[680px]' : ''}`}>
            {disabled ? (
              <p className="rounded-xl bg-[var(--bg-3)] px-3.5 py-3 text-xs leading-relaxed text-[color:var(--text-2)]">
                Orbit AI isn&apos;t switched on yet. An admin needs to add the Gemini API key on the server.
              </p>
            ) : (
              <>
                {!empty && (
                  <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                    {chips.map((s) => (
                      <button key={s.label} type="button" disabled={busy || limitReached} onClick={() => pick(s)} className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--border)] bg-[var(--bg-2)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--text-2)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--text)] disabled:opacity-50 ${FOCUS_RING}`}>
                        <Icon name={s.icon} className="h-3 w-3" />{s.label}
                      </button>
                    ))}
                  </div>
                )}
                <form
                  onSubmit={(e) => { e.preventDefault(); if (busy) stop(); else ask(); }}
                  className="flex items-end gap-1.5 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-3)] p-1.5 transition focus-within:border-[color:var(--accent)] focus-within:ring-4 focus-within:ring-[color:var(--accent-light)]"
                >
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    maxLength={4000}
                    disabled={limitReached}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) ask(); } }}
                    placeholder={limitReached ? 'Daily limit reached. Back tomorrow.' : isManager ? 'Ask anything, or "create a task for Hari…"' : 'Ask anything, or "log 2 hours on…"'}
                    aria-label="Ask Orbit AI"
                    className="min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[16px] leading-5 text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-3)] disabled:opacity-60 sm:text-sm"
                  />
                  {busy ? (
                    <button type="submit" aria-label="Stop" title="Stop" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--text)] text-[color:var(--bg-2)] transition hover:opacity-90 active:scale-95 ${FOCUS_RING}`}>
                      <Icon name="stop" className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="submit" disabled={!draft.trim() || limitReached} aria-label="Ask" title="Ask (Enter)" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40 ${FOCUS_RING}`}>
                      <Icon name="send" className="h-[17px] w-[17px]" />
                    </button>
                  )}
                </form>
                <p className="mt-1.5 flex justify-between gap-2 px-1 text-[10px] text-[color:var(--text-3)]">
                  <span className="truncate"><span className="hidden sm:inline">Ctrl + J · Enter to send · Shift + Enter new line · </span>Changes need your Confirm</span>
                  {usage && <span className="shrink-0 tabular-nums">{usage.used}/{usage.limit} today{isManager && usage.team_questions != null ? ` · team ${usage.team_questions}` : ''}</span>}
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Orbit AI"
        title="Orbit AI (Ctrl + J)"
        className={`relative flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-1.5 text-[var(--text-2)] transition hover:bg-[var(--bg-3)] hover:text-[var(--accent)] ${FOCUS_RING}`}
      >
        <Icon name="sparkles" className="h-[19px] w-[19px]" />
        {unseen && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#8b5cf6] ring-2 ring-[color:var(--bg-2)]" aria-hidden="true" />}
      </button>
      {panel}
    </>
  );
}
