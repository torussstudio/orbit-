import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/client';
import { useLiveEvents } from '../../hooks/useLiveEvents';

/*
 * Chat extras shared by both chats (Messages.jsx: member <-> admin team,
 * DirectMessages.jsx: member <-> member): reactions, read ticks, typing
 * indicator, edit rules and in-chat search.
 */

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
// Same window as the server (server/utils/chatExtras.js).
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
// How long "typing…" stays without a new typing event.
const TYPING_TTL_MS = 6000;
// The sender pings the server at most this often while typing.
const TYPING_PING_MS = 3500;

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// Same rule as the server: one reaction per person, the same emoji again
// removes it. Used for the instant (optimistic) update.
export function toggleReaction(reactions, meId, emoji) {
  const next = { ...(reactions || {}) };
  const key = String(meId);
  if (!emoji || next[key] === emoji) delete next[key];
  else next[key] = emoji;
  return next;
}

export function canEditMessage(message, meId) {
  if (!message || message.pending || message.deleted || message.forwarded_from_id) return false;
  if (!sameId(message.sender_id, meId)) return false;
  return Date.now() - new Date(message.created_at).getTime() < EDIT_WINDOW_MS;
}

/* ---------- Typing ---------- */

// Returns notify(): call it on every keystroke. Throttled, never throws.
export function useTypingSender(url) {
  const last = useRef(0);
  useEffect(() => { last.current = 0; }, [url]);
  const notify = useCallback(() => {
    if (!url) return;
    const now = Date.now();
    if (now - last.current < TYPING_PING_MS) return;
    last.current = now;
    api.post(url, null, { silent: true }).catch(() => {});
  }, [url]);
  const reset = useCallback(() => { last.current = 0; }, []);
  return { notify, reset };
}

// Who (user ids) is typing in this conversation right now.
export function useTypingIndicator(types, conversationId, meId) {
  const { subscribe } = useLiveEvents();
  const [typers, setTypers] = useState({}); // userId -> expires at (ms)

  useEffect(() => { setTypers({}); }, [conversationId]);

  useEffect(() => {
    if (conversationId == null) return undefined;
    return subscribe(types, (event) => {
      if (!sameId(event.conversationId, conversationId)) return;
      if (event.userId == null || sameId(event.userId, meId)) return;
      setTypers((old) => ({ ...old, [String(event.userId)]: Date.now() + TYPING_TTL_MS }));
    });
  }, [subscribe, types, conversationId, meId]);

  useEffect(() => {
    const times = Object.values(typers);
    if (!times.length) return undefined;
    const wait = Math.max(50, Math.min(...times) - Date.now());
    const timer = setTimeout(() => {
      setTypers((old) => {
        const now = Date.now();
        const next = {};
        for (const [id, until] of Object.entries(old)) if (until > now) next[id] = until;
        return next;
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [typers]);

  // A message from this person arrived: they stopped typing.
  const clear = useCallback((userId) => {
    setTypers((old) => {
      const key = String(userId);
      if (!(key in old)) return old;
      const next = { ...old };
      delete next[key];
      return next;
    });
  }, []);

  return { typingIds: Object.keys(typers), clear };
}

export function TypingDots({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-current motion-reduce:animate-none"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '1s' }}
        />
      ))}
    </span>
  );
}

export function TypingBubble({ label }) {
  return (
    <div className="mb-3 flex justify-start" role="status">
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[color:var(--border)] bg-[var(--bg-2)] px-3.5 py-2.5 text-[color:var(--text-3)] shadow-[0_8px_20px_-16px_rgba(15,23,42,0.5)]">
        <TypingDots />
        <span className="text-[11px]">{label}</span>
      </div>
    </div>
  );
}

/* ---------- Read ticks ---------- */

/*
 * 'sent'      ✓        the recipient is logged out of Orbit
 * 'delivered' ✓✓ grey  the recipient is logged in (or has opened Orbit since)
 * 'seen'      ✓✓ blue  the recipient opened the chat
 */
export function tickState(createdAt, deliveredAt, readAt) {
  const at = new Date(createdAt).getTime();
  if (readAt && new Date(readAt).getTime() >= at) return 'seen';
  if (deliveredAt && new Date(deliveredAt).getTime() >= at) return 'delivered';
  return 'sent';
}

const TICK_LABEL = { sent: 'Sent', delivered: 'Delivered', seen: 'Seen' };

// Colour: inherits the time's colour, blue (--chat-tick-read) once seen.
export function ReadTicks({ state = 'sent', className = 'h-3.5 w-3.5' }) {
  const label = TICK_LABEL[state] || 'Sent';
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`inline-block shrink-0 ${state === 'seen' ? 'text-[color:var(--chat-tick-read)]' : ''} ${className}`} role="img" aria-label={label}>
      <title>{label}</title>
      {state !== 'sent' ? (
        <>
          <path d="M1.5 12.5l4.5 4.5L16.5 6.5" />
          <path d="M10 15.5l1.5 1.5L22 6.5" />
        </>
      ) : (
        <path d="M5 12.5l4.5 4.5L19.5 6.5" />
      )}
    </svg>
  );
}

/* ---------- Reactions ---------- */

export function ReactionPicker({ current, onPick }) {
  return (
    <span className="flex items-center gap-0.5" role="menu" aria-label="React">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitem"
          aria-label={`React ${emoji}`}
          onClick={(event) => { event.stopPropagation(); onPick(emoji); }}
          className={`grid h-7 w-7 place-items-center rounded-md text-[17px] leading-none transition duration-150 hover:scale-125 hover:bg-black/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${current === emoji ? 'bg-black/10' : ''}`}
        >
          {emoji}
        </button>
      ))}
    </span>
  );
}

// reactions: { "<userId>": "👍" }. nameOf(userId) -> display name.
export function ReactionChips({ reactions, meId, nameOf, onToggle, alignEnd }) {
  const entries = Object.entries(reactions || {});
  if (!entries.length) return null;
  const groups = new Map();
  for (const [userId, emoji] of entries) {
    if (!groups.has(emoji)) groups.set(emoji, []);
    groups.get(emoji).push(userId);
  }
  const list = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <div className={`relative z-[1] -mt-1.5 mb-0.5 flex flex-wrap gap-1 px-1.5 ${alignEnd ? 'justify-end' : 'justify-start'}`}>
      {list.map(([emoji, ids]) => {
        const mine = ids.some((id) => sameId(id, meId));
        const names = ids.map((id) => (sameId(id, meId) ? 'You' : nameOf(id))).join(', ');
        return (
          <button
            key={emoji}
            type="button"
            title={names}
            aria-label={`${emoji} from ${names}${mine ? '. Select to remove yours' : ''}`}
            aria-pressed={mine}
            onClick={(event) => { event.stopPropagation(); onToggle(emoji); }}
            className={`inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-[13px] leading-none shadow-[0_4px_10px_-6px_rgba(15,23,42,0.45)] transition duration-150 hover:-translate-y-px active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${mine ? 'border-[color:var(--accent)] bg-[var(--accent-light)]' : 'border-[color:var(--border)] bg-[var(--bg-2)]'}`}
          >
            <span>{emoji}</span>
            {ids.length > 1 && <span className="text-[10px] font-semibold tabular-nums text-[color:var(--text-2)]">{ids.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Search ---------- */

// Marks every match of `query` in plain text. Never renders HTML.
export function Highlight({ text, query }) {
  const value = String(text || '');
  if (!query) return value;
  const lower = value.toLowerCase();
  const q = query.toLowerCase();
  const parts = [];
  let from = 0;
  let at = lower.indexOf(q);
  while (at !== -1) {
    if (at > from) parts.push(value.slice(from, at));
    parts.push(<mark key={at} className="rounded-[3px] bg-amber-200 px-0.5 text-slate-900">{value.slice(at, at + q.length)}</mark>);
    from = at + q.length;
    at = lower.indexOf(q, from);
  }
  if (from < value.length) parts.push(value.slice(from));
  return parts;
}

const SearchIcon = ({ path, className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
    {path}
  </svg>
);
const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>,
  up: <path d="M18 15l-6-6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

/*
 * Search bar under the chat header. Results come newest first; Enter / ↑
 * moves to an older match, Shift+Enter / ↓ to a newer one. onJump(result)
 * should bring that message on screen. onQueryChange(q) gets the active
 * query ('' when none) for highlighting.
 */
export function ChatSearchBar({ searchUrl, onClose, onJump, onQueryChange }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const requestRef = useRef(0);
  const jumpRef = useRef(onJump);
  const queryRef = useRef(onQueryChange);
  jumpRef.current = onJump;
  queryRef.current = onQueryChange;

  useEffect(() => {
    const term = q.trim();
    const id = ++requestRef.current;
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      queryRef.current?.('');
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(searchUrl, { params: { q: term } });
        if (id !== requestRef.current) return;
        const list = data?.results || [];
        setResults(list);
        setIndex(0);
        setSearched(true);
        queryRef.current?.(term);
        if (list[0]) jumpRef.current?.(list[0]);
      } catch {
        if (id === requestRef.current) { setResults([]); setSearched(true); }
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, searchUrl]);

  useEffect(() => () => queryRef.current?.(''), []);

  const go = (next) => {
    if (!results.length) return;
    const clamped = Math.max(0, Math.min(results.length - 1, next));
    setIndex(clamped);
    jumpRef.current?.(results[clamped]);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key === 'Enter') { event.preventDefault(); go(event.shiftKey ? index - 1 : index + 1); }
  };

  const btn = 'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] active:scale-95 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]';

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-[color:var(--border)] bg-[var(--bg-2)] px-3 py-2 sm:px-5">
      <div className="relative min-w-0 flex-1">
        <SearchIcon path={PATHS.search} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-3)]" />
        <input
          autoFocus
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search this chat"
          aria-label="Search this chat"
          className="h-9 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] pl-9 pr-3 text-[16px] text-[color:var(--text)] outline-none transition duration-200 placeholder:text-[color:var(--text-3)] focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-light)] sm:text-sm"
        />
      </div>
      <span className="min-w-[56px] text-center text-[11px] tabular-nums text-[color:var(--text-3)]" aria-live="polite">
        {loading ? '…' : results.length ? `${index + 1} of ${results.length}` : searched ? 'No matches' : ''}
      </span>
      <button type="button" className={btn} onClick={() => go(index + 1)} disabled={index >= results.length - 1} aria-label="Older match" title="Older match (Enter)">
        <SearchIcon path={PATHS.up} />
      </button>
      <button type="button" className={btn} onClick={() => go(index - 1)} disabled={index <= 0} aria-label="Newer match" title="Newer match (Shift + Enter)">
        <SearchIcon path={PATHS.down} />
      </button>
      <button type="button" className={btn} onClick={onClose} aria-label="Close search" title="Close (Esc)">
        <SearchIcon path={PATHS.close} />
      </button>
    </div>
  );
}
