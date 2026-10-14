import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLiveRefetch, MESSAGE_EVENTS } from '../hooks/useLiveEvents';

/*
 * Messages: members <-> admin team (shared inbox).
 *
 * Manager: inbox of every active member on the left, the open thread on the
 *   right (/messages/:memberId). Phones show one pane at a time.
 * Member: one thread with "the admin team". Any manager can reply; their
 *   name is shown on their messages.
 *
 * Live updates arrive as "message.created" / "message.read" events that
 * only carry the conversationId. The thread then fetches just the messages
 * after the newest one it has (?after=), never the whole history again.
 * Without live events the usual 30 s "poll" event does the same.
 */

/* -------------------------------------------------------------------------- */
/* Constants & helpers                                                        */
/* -------------------------------------------------------------------------- */

const MAX_LEN = 4000; // same as the server and the DB check
const WARN_LEN = 3600; // counter appears from here
const READ_PING_MS = 45000; // "still reading" while a thread is open
const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 80;
const GROUP_GAP_MS = 5 * 60 * 1000; // same sender within this = one group
const COMPOSER_MAX_PX = 160;

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-2)]';

const TIME_FMT = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const DAY_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const SHORT_DAY_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const apiError = (err, fallback) => err?.response?.data?.error || fallback;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (d) => Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

function dayLabel(date) {
  const diff = daysAgo(date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return DAY_FMT.format(date);
}

// Inbox row time: "4:12 pm" today, "Yesterday", else "12 Oct".
function listTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diff = daysAgo(d);
  if (diff === 0) return TIME_FMT.format(d);
  if (diff === 1) return 'Yesterday';
  return SHORT_DAY_FMT.format(d);
}

const isNearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

// Adds messages that are not on screen yet, keeping order by time.
function mergeMessages(prev, incoming) {
  if (!incoming?.length) return prev;
  const ids = new Set(prev.map((m) => String(m.id)));
  const fresh = incoming.filter((m) => !ids.has(String(m.id)));
  if (!fresh.length) return prev;
  return [...prev, ...fresh].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)),
  );
}

/* -------------------------------------------------------------------------- */
/* Icons (one stroke weight)                                                  */
/* -------------------------------------------------------------------------- */

const ICON_PATHS = {
  chat: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>,
  down: <path d="M6 9l6 6 6-6" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.1" /></>,
  team: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
};

function Icon({ name, className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

function Avatar({ name, url, size = 'md' }) {
  const box = size === 'sm' ? 'h-7 w-7 text-[11px]' : size === 'lg' ? 'h-9 w-9 text-[13px]' : 'h-9 w-9 text-[13px]';
  return (
    <span className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-light)] font-semibold text-[color:var(--accent)] ring-1 ring-inset ring-[color:var(--border)]`}>
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{(name || '?').trim()[0]?.toUpperCase() || '?'}</span>
      )}
    </span>
  );
}

// Plain text with http(s) links made clickable. No HTML is ever rendered.
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

function Linkified({ text }) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-[0.08em] underline-offset-2 [overflow-wrap:anywhere]"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function Notice({ icon = 'alert', title, children, action }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--bg-3)] text-[color:var(--text-3)]">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <h2 className="text-[14px] font-semibold text-[color:var(--text)]">{title}</h2>
      {children && (
        <p className="max-w-[40ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">{children}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const BTN_NEUTRAL =
  `inline-flex items-center justify-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] px-3.5 py-2 text-xs font-semibold text-[color:var(--text-2)] transition duration-200 hover:text-[color:var(--text)] active:scale-[0.98] ${FOCUS_RING}`;

function ThreadSkeleton() {
  const rows = [
    ['w-2/5', false], ['w-1/3', false], ['w-1/2', true], ['w-1/4', true], ['w-3/5', false],
  ];
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 px-4 py-6 sm:px-6" aria-hidden="true">
      {rows.map(([w, right], i) => (
        <div key={i} className={`flex ${right ? 'justify-end' : ''}`}>
          <div className={`h-9 ${w} animate-pulse rounded-2xl bg-[var(--bg-3)] motion-reduce:animate-none`} />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Thread                                                                     */
/* -------------------------------------------------------------------------- */

/*
 * One conversation.
 * conversationId  the thread to show
 * memberId        the member the conversation belongs to (decides sides)
 * header          { title, subtitle, avatarName, avatarUrl }
 * onBack          phone "back to inbox" (managers)
 * onActivity      something was sent or read (manager inbox refreshes)
 */
function Thread({ conversationId, memberId, header, onBack, onActivity }) {
  const { user, isManager } = useAuth();

  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]); // { tempId, body, status, error, created_at }
  const [hasMore, setHasMore] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(null);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [draft, setDraft] = useState('');

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const stickRef = useRef(true); // keep the view pinned to the newest message
  const restoreRef = useRef(null); // scroll position to keep after loading older
  const cidRef = useRef(conversationId);
  const messagesRef = useRef(messages);
  const lastSeenIdRef = useRef(null);
  cidRef.current = conversationId;
  messagesRef.current = messages;

  const base = `/messages/conversations/${conversationId}`;

  // The other side of the conversation is "theirs". For a manager that is the
  // member; for a member that is the whole admin team.
  const isTeamMessage = useCallback((m) => !sameId(m.sender_id, memberId), [memberId]);
  const isOwnSide = useCallback(
    (m) => (isManager ? isTeamMessage(m) : !isTeamMessage(m)),
    [isManager, isTeamMessage],
  );

  const markRead = useCallback(() => {
    if (document.hidden) return;
    const cid = cidRef.current;
    api
      .post(`/messages/conversations/${cid}/read`, null, { silent: true })
      .then(({ data }) => {
        if (data?.changed) onActivity?.();
      })
      .catch(() => {});
  }, [onActivity]);

  // Newest page. Shows the skeleton only on the first load of a thread.
  const loadLatest = useCallback(async ({ silent = false } = {}) => {
    const cid = conversationId;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const { data } = await api.get(`/messages/conversations/${cid}/messages`);
      if (cidRef.current !== cid) return;
      stickRef.current = true;
      setMessages(data.messages || []);
      setHasMore(Boolean(data.has_more));
      setOtherReadAt(data.other_read_at || null);
      setReadOnly(data.conversation?.member_active === false);
      setError('');
      markRead();
    } catch (err) {
      if (cidRef.current !== cid) return;
      if (!silent) setError(apiError(err, "We couldn't load this conversation."));
    } finally {
      if (cidRef.current === cid && !silent) setLoading(false);
    }
  }, [conversationId, markRead]);

  // Only what is newer than the newest message on screen.
  const fetchNew = useCallback(async () => {
    const cid = conversationId;
    const current = messagesRef.current;
    if (!current.length) {
      await loadLatest({ silent: true });
      return;
    }

    let after = current[current.length - 1].id;
    try {
      // A burst of messages: a few pages at most, then the rest next time.
      for (let i = 0; i < 5; i += 1) {
        const { data } = await api.get(`/messages/conversations/${cid}/messages`, { params: { after } });
        if (cidRef.current !== cid) return;
        setOtherReadAt(data.other_read_at || null);
        setReadOnly(data.conversation?.member_active === false);
        const list = data.messages || [];
        if (list.length) {
          if (scrollRef.current) stickRef.current = isNearBottom(scrollRef.current);
          setMessages((prev) => mergeMessages(prev, list));
          after = list[list.length - 1].id;
        }
        if (!data.has_more) break;
      }
    } catch {
      /* the next event or poll tries again */
    }
  }, [conversationId, loadLatest]);

  // New thread: start clean.
  useEffect(() => {
    setMessages([]);
    setPending([]);
    setHasMore(false);
    setOtherReadAt(null);
    setReadOnly(false);
    setShowJump(false);
    setDraft('');
    lastSeenIdRef.current = null;
    stickRef.current = true;
    loadLatest();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useLiveRefetch(MESSAGE_EVENTS, fetchNew, {
    match: (event) => sameId(event.conversationId, cidRef.current),
    delay: 150,
  });

  // While the thread is open and the tab is visible: keep it marked as read,
  // so the server does not push to this person. Also on coming back to the tab.
  useEffect(() => {
    const timer = setInterval(markRead, READ_PING_MS);
    const onVisible = () => {
      if (!document.hidden) markRead();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [markRead]);

  // A new message from the other side: mark read, or offer "New messages".
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    const previous = lastSeenIdRef.current;
    lastSeenIdRef.current = String(last.id);
    if (previous === null || previous === String(last.id)) return;
    if (isOwnSide(last)) return;

    markRead();
    if (!stickRef.current) setShowJump(true);
  }, [messages, isOwnSide, markRead]);

  // Scroll: keep position after loading older, else stay pinned to the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreRef.current) {
      const { height, top } = restoreRef.current;
      el.scrollTop = el.scrollHeight - height + top;
      restoreRef.current = null;
      return;
    }
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending, loading]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !messagesRef.current.length) return;
    const cid = conversationId;
    setLoadingOlder(true);
    try {
      const { data } = await api.get(`/messages/conversations/${cid}/messages`, {
        params: { before: messagesRef.current[0].id },
      });
      if (cidRef.current !== cid) return;
      const el = scrollRef.current;
      if (el) restoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((prev) => mergeMessages(prev, data.messages || []));
      setHasMore(Boolean(data.has_more));
    } catch {
      /* the button stays, the person can try again */
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    stickRef.current = isNearBottom(el);
    if (stickRef.current) setShowJump(false);
    if (el.scrollTop < LOAD_OLDER_PX) loadOlder();
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  /* ---------- sending ---------- */

  const send = useCallback(async (retry) => {
    const body = (retry ? retry.body : draft).trim();
    if (!body || readOnly || body.length > MAX_LEN) return;

    const tempId = retry?.tempId || `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (retry) {
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: 'sending', error: '' } : x)));
    } else {
      setPending((p) => [...p, { tempId, body, status: 'sending', error: '', created_at: new Date().toISOString() }]);
      setDraft('');
    }
    stickRef.current = true;
    setShowJump(false);
    textareaRef.current?.focus();

    const cid = conversationId;
    try {
      const { data } = await api.post(`/messages/conversations/${cid}/messages`, { body }, { silent: true });
      if (cidRef.current !== cid) return;
      setPending((p) => p.filter((x) => x.tempId !== tempId));
      if (data?.message) setMessages((prev) => mergeMessages(prev, [data.message]));
      onActivity?.();
    } catch (err) {
      if (cidRef.current !== cid) return;
      setPending((p) =>
        p.map((x) =>
          x.tempId === tempId ? { ...x, status: 'failed', error: apiError(err, 'Not sent.') } : x,
        ),
      );
    }
  }, [conversationId, draft, onActivity, readOnly]);

  const discard = (tempId) => setPending((p) => p.filter((x) => x.tempId !== tempId));

  // Composer grows with its text, up to a limit.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, COMPOSER_MAX_PX)}px`;
  }, [draft]);

  const onComposerKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  /* ---------- rows ---------- */

  const rows = useMemo(() => {
    const all = [
      ...messages.map((m) => ({ ...m, key: String(m.id) })),
      ...pending.map((p) => ({
        id: null,
        key: p.tempId,
        sender_id: user?.id,
        sender_name: user?.name,
        body: p.body,
        created_at: p.created_at,
        pending: p,
      })),
    ];

    const out = [];
    let prevDay = null;
    let prev = null;
    for (const m of all) {
      const date = new Date(m.created_at);
      const day = date.toDateString();
      if (day !== prevDay) {
        out.push({ type: 'day', key: `day-${day}`, label: dayLabel(date) });
        prevDay = day;
        prev = null;
      }
      const grouped = Boolean(
        prev && sameId(prev.sender_id, m.sender_id) && date - new Date(prev.created_at) < GROUP_GAP_MS,
      );
      const mine = sameId(m.sender_id, user?.id);
      const team = isTeamMessage(m);
      out.push({
        type: 'msg',
        key: m.key,
        m,
        right: isOwnSide(m),
        mine,
        grouped,
        // Admin names: on the member's screen, and for the other managers'
        // replies on a manager's screen.
        name: !grouped && !mine && team ? m.sender_name || 'Admin' : null,
      });
      prev = m;
    }
    return out;
  }, [messages, pending, user?.id, user?.name, isOwnSide, isTeamMessage]);

  // "Seen" / "Sent" under the last message from this side.
  const lastOwnKey = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const r = rows[i];
      if (r.type === 'msg' && r.right && !r.m.pending) return r.key;
    }
    return null;
  }, [rows]);

  const remaining = MAX_LEN - draft.length;

  return (
    <section className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[var(--bg-2)]" aria-label={`Conversation: ${header.title}`}>
      {/* Header */}
      <header className="flex min-w-0 shrink-0 items-center gap-2 border-b border-[color:var(--border)] px-3 py-2.5 sm:gap-2.5 sm:px-4 sm:py-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to inbox"
            className={`-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--text-2)] transition-colors hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] md:hidden ${FOCUS_RING}`}
          >
            <Icon name="back" />
          </button>
        )}
        {header.team ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] text-[color:var(--accent)]">
            <Icon name="team" className="h-[18px] w-[18px]" />
          </span>
        ) : (
          <Avatar name={header.avatarName} url={header.avatarUrl} size="lg" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight tracking-[-0.01em] text-[color:var(--text)]">
            {header.title}
          </h2>
          {header.subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-[color:var(--text-3)]">{header.subtitle}</p>
          )}
        </div>
        {header.action && <div className="ml-auto shrink-0">{header.action}</div>}
      </header>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-3"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={loading}
        >
          {loading ? (
            <ThreadSkeleton />
          ) : error ? (
            <Notice
              title="We couldn't load this conversation"
              action={<button type="button" onClick={() => loadLatest()} className={BTN_NEUTRAL}>Try again</button>}
            >
              {error}
            </Notice>
          ) : rows.length === 0 ? (
            <Notice icon="chat" title={isManager ? `No messages with ${header.title} yet` : 'No messages yet'}>
              {isManager
                ? 'Write the first message below. Every admin can see this conversation.'
                : 'Send a message to the admin team. Any admin can reply.'}
            </Notice>
          ) : (
            <ol className="m-0 flex w-full min-w-0 list-none flex-col p-0">
              {hasMore && (
                <li className="mb-3 flex justify-center">
                  <button type="button" onClick={loadOlder} disabled={loadingOlder} className={`${BTN_NEUTRAL} disabled:opacity-60`}>
                    {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                  </button>
                </li>
              )}

              {rows.map((row) =>
                row.type === 'day' ? (
                  <li key={row.key} className="my-3 flex items-center gap-3 first:mt-0" aria-label={row.label}>
                    <span className="h-px flex-1 bg-[var(--border)]" aria-hidden="true" />
                    <span className="text-[11px] font-medium text-[color:var(--text-3)]">{row.label}</span>
                    <span className="h-px flex-1 bg-[var(--border)]" aria-hidden="true" />
                  </li>
                ) : (
                  <MessageRow
                    key={row.key}
                    row={row}
                    status={
                      row.key === lastOwnKey
                        ? otherReadAt && new Date(otherReadAt) >= new Date(row.m.created_at)
                          ? 'Seen'
                          : 'Sent'
                        : null
                    }
                    onRetry={send}
                    onDiscard={discard}
                  />
                ),
              )}
            </ol>
          )}
        </div>

        {showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_10px_24px_-10px_rgba(15,23,42,0.5)] transition-transform hover:brightness-110 active:scale-95 ${FOCUS_RING}`}
          >
            New messages
            <Icon name="down" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-[color:var(--border)] px-3 py-2 sm:px-4 sm:py-2">
        {readOnly ? (
          <p className="flex items-center gap-2 rounded-lg bg-[var(--bg-3)] px-3 py-2 text-xs text-[color:var(--text-3)]">
            <Icon name="lock" className="h-3.5 w-3.5 shrink-0" />
            This member is no longer active. The conversation is read-only.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex min-w-0 items-end gap-2"
          >
            <label htmlFor={`composer-${conversationId}`} className="sr-only">
              Message
            </label>
            <textarea
              id={`composer-${conversationId}`}
              ref={textareaRef}
              rows={1}
              value={draft}
              maxLength={MAX_LEN}
              disabled={loading || Boolean(error)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onComposerKey}
              placeholder={isManager ? `Message ${header.title}` : 'Message the admin team'}
              className="min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] px-3 py-2 text-[16px] leading-snug text-[color:var(--text)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[color:var(--text-3)] focus:border-[color:var(--accent)] focus:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] disabled:opacity-60 sm:text-[13px]"
            />
            <button
              type="submit"
              disabled={!draft.trim() || loading || Boolean(error)}
              aria-label="Send message"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white transition duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Icon name="send" className="h-[17px] w-[17px]" />
            </button>
          </form>
        )}
        {!readOnly && (
          <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[11px] text-[color:var(--text-3)]">
            <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
            {draft.length >= WARN_LEN && (
              <span className={`ml-auto tabular-nums ${remaining <= 0 ? 'text-[color:var(--danger)]' : ''}`}>
                {remaining} characters left
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const MessageRow = memo(function MessageRow({ row, status, onRetry, onDiscard }) {
  const { m, right, mine, grouped, name } = row;
  const p = m.pending;

  const bubble = right
    ? mine
      ? 'bg-[var(--accent)] text-white'
      : // Another admin's reply on a manager's screen: team side, softer.
        'bg-[var(--accent-light)] text-[color:var(--text)]'
    : 'bg-[var(--bg-3)] text-[color:var(--text)]';

  return (
    <li className={`flex w-full min-w-0 flex-col ${right ? 'items-end' : 'items-start'} ${grouped ? 'mt-0.5' : 'mt-2 first:mt-0'}`}>
      {name && <span className="mb-1 px-1 text-[11px] font-medium text-[color:var(--text-3)]">{name}</span>}
      <div
        className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[13px] leading-relaxed [overflow-wrap:anywhere] sm:max-w-[min(78%,560px)] ${bubble} ${
          right ? 'rounded-br-md' : 'rounded-bl-md'
        } ${p?.status === 'failed' ? 'opacity-70 ring-1 ring-[color:var(--danger)]' : ''} ${p?.status === 'sending' ? 'opacity-70' : ''}`}
      >
        <Linkified text={m.body} />
      </div>

      <div className="mt-0.5 flex items-center gap-2 px-1 text-[10px] tabular-nums text-[color:var(--text-3)]">
        {p?.status === 'sending' && <span>Sending…</span>}
        {p?.status === 'failed' && (
          <span role="alert" className="flex items-center gap-2 text-[color:var(--danger)]">
            {p.error || 'Not sent.'}
            <button type="button" onClick={() => onRetry(p)} className={`rounded font-semibold underline-offset-2 hover:underline ${FOCUS_RING}`}>
              Retry
            </button>
            <button type="button" onClick={() => onDiscard(p.tempId)} className={`rounded text-[color:var(--text-3)] underline-offset-2 hover:underline ${FOCUS_RING}`}>
              Discard
            </button>
          </span>
        )}
        {!p && (
          <time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString('en-IN')}>
            {TIME_FMT.format(new Date(m.created_at))}
          </time>
        )}
        {!p && status && <span className={status === 'Seen' ? 'font-medium text-[color:var(--accent)]' : ''}>· {status}</span>}
      </div>
    </li>
  );
});

/* -------------------------------------------------------------------------- */
/* Manager: inbox                                                             */
/* -------------------------------------------------------------------------- */

function InboxRow({ row, active, meId, onOpen }) {
  const last = row.last_message;
  const preview = last
    ? `${sameId(last.sender_id, meId) ? 'You: ' : !sameId(last.sender_id, row.member_id) ? 'Admin: ' : ''}${last.body}`
    : 'No messages yet';

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.member_id)}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${FOCUS_RING} ${
          active ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--bg-3)]'
        }`}
      >
        <Avatar name={row.name} url={row.avatar_url} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-[13px] ${row.unread ? 'font-semibold text-[color:var(--text)]' : 'font-medium text-[color:var(--text)]'}`}>
              {row.name}
            </span>
            {last && (
              <span className={`shrink-0 text-[11px] tabular-nums ${row.unread ? 'font-semibold text-[color:var(--accent)]' : 'text-[color:var(--text-3)]'}`}>
                {listTime(last.created_at)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={`truncate text-xs ${row.unread ? 'text-[color:var(--text-2)]' : 'text-[color:var(--text-3)]'} ${last ? '' : 'italic'}`}>
              {preview}
            </span>
            {row.unread > 0 && (
              <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold tabular-nums text-white">
                <span aria-hidden="true">{row.unread > 99 ? '99+' : row.unread}</span>
                <span className="sr-only">{row.unread} unread</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function ManagerInbox() {
  const { user } = useAuth();
  const { memberId } = useParams();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null); // { conversationId, memberId }
  const [openError, setOpenError] = useState('');
  const conversationIds = useRef(new Map()); // memberId -> conversationId

  const loadList = useCallback(async ({ silent = true } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const { data } = await api.get('/messages/conversations');
      const list = data?.conversations || [];
      list.forEach((r) => {
        if (r.conversation_id) conversationIds.current.set(String(r.member_id), r.conversation_id);
      });
      setRows(list);
      setError('');
    } catch (err) {
      if (!silent) setError(apiError(err, "We couldn't load your inbox."));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList({ silent: false });
  }, [loadList]);

  useLiveRefetch(MESSAGE_EVENTS, loadList, { delay: 400 });

  // The thread in the URL: use the known conversation, or create it for a
  // member who has never been messaged.
  useEffect(() => {
    let cancelled = false;
    setOpenError('');
    if (!memberId) {
      setOpen(null);
      return undefined;
    }

    const known = conversationIds.current.get(String(memberId));
    if (known) {
      setOpen({ conversationId: known, memberId });
      return undefined;
    }

    setOpen(null);
    api
      .post('/messages/conversations', { member_id: memberId }, { silent: true })
      .then(({ data }) => {
        if (cancelled || !data?.conversation) return;
        conversationIds.current.set(String(memberId), data.conversation.id);
        setOpen({ conversationId: data.conversation.id, memberId });
      })
      .catch((err) => {
        if (!cancelled) setOpenError(apiError(err, "We couldn't open this conversation."));
      });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const selected = rows.find((r) => sameId(r.member_id, memberId));
  const totalUnread = rows.reduce((sum, r) => sum + (r.unread || 0), 0);
  const openThread = useCallback((id) => navigate(`/messages/${id}`), [navigate]);
  const back = useCallback(() => navigate('/messages'), [navigate]);

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg)] md:p-5 lg:p-6">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--bg-2)] md:rounded-2xl md:border md:border-[color:var(--border)]">
        {/* Inbox */}
        <aside
          className={`${memberId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-[color:var(--border)] md:w-[320px] md:border-r lg:w-[340px]`}
          aria-label="Inbox"
        >
          <div className="shrink-0 px-3 pb-2.5 pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-base font-semibold tracking-[-0.02em] text-[color:var(--text)]">Messages</h1>
              {totalUnread > 0 && (
                <span className="text-xs font-medium tabular-nums text-[color:var(--accent)]">{totalUnread} unread</span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-3)]">Shared inbox. Every admin sees these.</p>
            <label className="relative mt-2.5 block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]">
                <Icon name="search" className="h-[15px] w-[15px]" />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members"
                aria-label="Search members"
                className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] pl-9 pr-3 text-[16px] text-[color:var(--text)] outline-none transition-colors placeholder:text-[color:var(--text-3)] focus:border-[color:var(--accent)] sm:text-[13px]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
            {loading ? (
              <ul className="m-0 list-none space-y-1 p-0" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="h-9 w-9 animate-pulse rounded-full bg-[var(--bg-3)] motion-reduce:animate-none" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3 w-1/2 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none" />
                      <span className="block h-2.5 w-3/4 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : error ? (
              <Notice
                title="We couldn't load your inbox"
                action={<button type="button" onClick={() => loadList({ silent: false })} className={BTN_NEUTRAL}>Try again</button>}
              >
                {error}
              </Notice>
            ) : rows.length === 0 ? (
              <Notice icon="team" title="No members yet">Active members will show up here.</Notice>
            ) : visible.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-[color:var(--text-3)]">No members match “{query}”.</p>
            ) : (
              <ul className="m-0 list-none space-y-0.5 p-0">
                {visible.map((row) => (
                  <InboxRow
                    key={row.member_id}
                    row={row}
                    active={sameId(row.member_id, memberId)}
                    meId={user?.id}
                    onOpen={openThread}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Thread */}
        <div className={`${memberId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {!memberId ? (
            <Notice icon="chat" title="Choose a member">
              Pick someone from the inbox to read and reply. Members can only message the admin team.
            </Notice>
          ) : openError ? (
            <Notice
              title="We couldn't open this conversation"
              action={<button type="button" onClick={back} className={BTN_NEUTRAL}>Back to inbox</button>}
            >
              {openError}
            </Notice>
          ) : !open ? (
            <ThreadSkeleton />
          ) : (
            <Thread
              conversationId={open.conversationId}
              memberId={open.memberId}
              header={{
                title: selected?.name || 'Member',
                subtitle: selected?.email || '',
                avatarName: selected?.name,
                avatarUrl: selected?.avatar_url,
              }}
              onBack={back}
              onActivity={loadList}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Member: one thread with the admin team                                     */
/* -------------------------------------------------------------------------- */

function MemberThread() {
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get('/messages/conversations/me');
      setConversation(data?.conversation || null);
    } catch (err) {
      setError(apiError(err, "We couldn't open your messages."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full bg-[var(--bg)] md:p-5 lg:p-6">
      <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-[920px] flex-1 overflow-hidden bg-[var(--bg-2)] md:rounded-2xl md:border md:border-[color:var(--border)]">
        {error ? (
          <Notice title="We couldn't open your messages" action={<button type="button" onClick={load} className={BTN_NEUTRAL}>Try again</button>}>
            {error}
          </Notice>
        ) : !conversation ? (
          <div className="flex flex-1 flex-col"><ThreadSkeleton /></div>
        ) : (
          <Thread
            conversationId={conversation.id}
            memberId={user?.id}
            header={{
              title: 'Admin team',
              subtitle: 'Your messages go to every admin. Any of them can reply.',
              team: true,
              action: <Link to="/messages/people" className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--text-2)] hover:bg-[var(--bg-3)]">Member chats</Link>,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function Messages() {
  const { isManager } = useAuth();
  return isManager ? <ManagerInbox /> : <MemberThread />;
}
