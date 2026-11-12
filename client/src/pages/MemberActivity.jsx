import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { TIMELOG_EVENTS, TASK_REQUEST_EVENTS, useLiveRefetch } from '../hooks/useLiveEvents';
import OverdueTab, { useOverdueData } from '../components/overdue/OverdueTab';

/*
 * Member Activity (managers only).
 *
 * Per member, for an IST date range: tasks created, sent to In Review,
 * done and sent to rework. A task counts once per metric per day.
 * Done / rework are credited to the task's assignee.
 */

const IST = 'Asia/Kolkata';

// Any task / project change or task request refreshes the numbers on screen,
// without a spinner or a page refresh. Must be a stable array.
const ACTIVITY_EVENTS = [...new Set([...TIMELOG_EVENTS, ...TASK_REQUEST_EVENTS])];

// Returns [reload, retry, silentRef, refreshSilently]: `retry` reloads with the usual loading
// state, the live refetch reloads quietly and keeps the old numbers on error.
function useReloader() {
  const [reload, setReload] = useState(0);
  const silentRef = useRef(false);
  const retry = useCallback(() => {
    silentRef.current = false;
    setReload((n) => n + 1);
  }, []);
  const refreshSilently = useCallback(() => {
    silentRef.current = true;
    setReload((n) => n + 1);
  }, []);
  useLiveRefetch(ACTIVITY_EVENTS, refreshSilently);
  return [reload, retry, silentRef, refreshSilently];
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
];

const SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'active', label: 'Most active' },
];

// One colour per metric, used for dots, chips and bars so the page reads at a glance.
const METRICS = [
  { key: 'created', label: 'Created', hint: 'Tasks created or requested', dot: 'bg-sky-500', chip: 'bg-sky-500/10 text-sky-600', bar: 'bg-sky-500', edge: 'border-l-sky-500' },
  { key: 'in_review', label: 'In Review', hint: 'Sent to review', dot: 'bg-amber-500', chip: 'bg-amber-500/10 text-amber-600', bar: 'bg-amber-500', edge: 'border-l-amber-500' },
  { key: 'done', label: 'Done', hint: 'Marked done', dot: 'bg-emerald-500', chip: 'bg-emerald-500/10 text-emerald-600', bar: 'bg-emerald-500', edge: 'border-l-emerald-500' },
  { key: 'rework', label: 'Rework', hint: 'Sent back', dot: 'bg-rose-500', chip: 'bg-rose-500/10 text-rose-600', bar: 'bg-rose-500', edge: 'border-l-rose-500' },
];
const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));

const cx = (...parts) => parts.filter(Boolean).join(' ');

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';
const SURFACE =
  'rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-2)] shadow-[0_1px_1px_rgba(30,32,71,0.03),0_16px_40px_-28px_rgba(30,32,71,0.22)]';
const NUM = 'tabular-nums [font-feature-settings:"tnum","cv11"]';
const LABEL = 'text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--text-3)]';
const INPUT =
  'h-9 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-2)] px-3 text-[13px] text-[color:var(--text)] transition-[border-color,box-shadow] duration-200 placeholder:text-[color:var(--text-3)] hover:border-[color:var(--border-bright)] focus-visible:border-[color:var(--accent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)] focus-visible:outline-none';
const QUIET_BTN =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--bg-2)] px-4 text-[12.5px] font-medium text-[color:var(--text-2)] no-underline transition-[background-color,color,border-color] duration-200 hover:border-[color:var(--border-bright)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-50';
const SMALL_BTN = '!h-8 !px-3.5 !text-[12px]';
const SKELETON = 'animate-pulse rounded-md bg-[color:var(--bg-4)] motion-reduce:animate-none';

/* ------------------------------------------------------------------ */
/* Date helpers (IST calendar days as YYYY-MM-DD)                       */
/* ------------------------------------------------------------------ */

const istToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function resolveRange(range, customFrom, customTo) {
  const today = istToday();
  switch (range) {
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'week': {
      // Week starts Monday.
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
      return { from: addDays(today, -((dow + 6) % 7)), to: today };
    }
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last_month': {
      const end = addDays(`${today.slice(0, 8)}01`, -1);
      return { from: `${end.slice(0, 8)}01`, to: end };
    }
    case 'custom':
      return {
        from: DATE_RE.test(customFrom || '') ? customFrom : null,
        to: DATE_RE.test(customTo || '') ? customTo : null,
      };
    case 'today':
    default:
      return { from: today, to: today };
  }
}

const fmt = (ymd, opts) =>
  DATE_RE.test(ymd || '')
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${ymd}T00:00:00Z`))
    : '';

const formatShort = (ymd) => fmt(ymd, { day: '2-digit', month: 'short' });
const formatLong = (ymd) => fmt(ymd, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

const rangeLabel = (from, to) => {
  if (!from && !to) return 'All time';
  if (from && to) return from === to ? formatLong(from) : `${formatShort(from)} – ${formatLong(to)}`;
  return from ? `From ${formatLong(from)}` : `Until ${formatLong(to)}`;
};

// "Today" / "Yesterday" / "Wednesday"
const dayHeading = (ymd) => {
  const today = istToday();
  if (ymd === today) return { main: 'Today', sub: formatLong(ymd) };
  if (ymd === addDays(today, -1)) return { main: 'Yesterday', sub: formatLong(ymd) };
  return { main: fmt(ymd, { weekday: 'long' }), sub: fmt(ymd, { day: '2-digit', month: 'short', year: 'numeric' }) };
};

const isAbort = (e) =>
  e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';

const totalOf = (row) => METRICS.reduce((sum, m) => sum + (row?.[m.key] || 0), 0);

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

function Segmented({ label, value, onChange, options }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-[color:var(--bg-3)] p-1"
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-8 cursor-pointer whitespace-nowrap rounded-full border-0 px-3.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200 max-[640px]:min-h-10',
              FOCUS,
              on
                ? 'bg-[color:var(--bg-2)] text-[color:var(--text)] shadow-[0_1px_3px_rgba(30,32,71,0.14)]'
                : 'bg-transparent text-[color:var(--text-2)] hover:text-[color:var(--text)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Avatar({ name, url, size = 36 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (url) {
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--bg-3))] font-semibold text-[color:var(--accent)]"
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Dot({ metric, className }) {
  return <span aria-hidden="true" className={cx('inline-block h-2 w-2 shrink-0 rounded-full', metric.dot, className)} />;
}

function StatTiles({ totals, loading }) {
  return (
    <div className={cx(SURFACE, 'grid grid-cols-2 lg:grid-cols-4')}>
      {METRICS.map((m, i) => (
        <div
          key={m.key}
          className={cx(
            'px-5 py-4',
            i % 2 === 1 && 'border-l border-[color:var(--border)]',
            i > 1 && 'border-t border-[color:var(--border)] lg:border-t-0',
            i > 0 && 'lg:border-l lg:border-[color:var(--border)]',
          )}
        >
          <div className="flex items-center gap-2">
            <Dot metric={m} />
            <span className={LABEL}>{m.label}</span>
          </div>
          {loading ? (
            <div className={cx(SKELETON, 'mt-3 h-8 w-12')} />
          ) : (
            <div className={cx(NUM, 'mt-2 text-[32px] font-semibold leading-none tracking-[-0.03em] text-[color:var(--text)]')}>
              {totals[m.key] || 0}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ErrorBox({ message, onRetry }) {
  return (
    <div className={cx(SURFACE, 'flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] text-[color:var(--text-2)]')}>
      <span>{message}</span>
      <button type="button" onClick={onRetry} className={cx(QUIET_BTN, FOCUS)}>
        Retry
      </button>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[color:var(--border)] px-4 py-14 text-center">
      <svg className="mb-1 h-8 w-8 text-[color:var(--text-3)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
      <div className="text-[14px] font-semibold text-[color:var(--text)]">{title}</div>
      {text && <div className="max-w-[360px] text-[12.5px] text-[color:var(--text-3)]">{text}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Idle today: who has done nothing yet, and a way to remind them        */
/* ------------------------------------------------------------------ */

const toast = (type, message) =>
  window.dispatchEvent(new CustomEvent('orbit:toast', { detail: { type, message } }));

// wa.me needs the number with country code and digits only (10 digits = India).
function whatsappLink(phone, name) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11) return null;
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const text = `Hi ${first}, quick check-in: what did you get done today? Please update your tasks and log your time on Orbit.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const remindedAt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x) => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(x);
  const sameDay = day(d) === day(new Date());
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    ...(sameDay ? { hour: 'numeric', minute: '2-digit', hour12: true } : { day: '2-digit', month: 'short' }),
  }).format(d);
};

function IdlePanel({ onLoaded }) {
  const [state, setState] = useState({ loading: true, error: '', members: [] });
  const [reload, retry, silentRef, refreshSilently] = useReloader();
  const [busy, setBusy] = useState(() => new Set());

  useEffect(() => {
    const c = new AbortController();
    const silent = silentRef.current;
    silentRef.current = false;
    if (!silent) setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get('/member-activity/idle', { signal: c.signal })
      .then((res) => {
        if (c.signal.aborted) return;
        const list = res.data?.members || [];
        setState({ loading: false, error: '', members: list });
        onLoaded?.(list.map((m) => String(m.id)));
      })
      .catch((e) => {
        if (isAbort(e) || c.signal.aborted || silent) return;
        setState({ loading: false, error: e?.response?.data?.error || 'Could not load idle members.', members: [] });
        onLoaded?.(null);
      });
    return () => c.abort();
  }, [reload]);

  const remind = async (ids) => {
    if (!ids.length) return;
    setBusy((cur) => new Set([...cur, ...ids.map(String)]));
    try {
      const { data } = await api.post('/member-activity/nudge', { member_ids: ids });
      if (data.sent > 0) {
        toast('success', data.sent === 1 ? 'Reminder sent' : `Reminder sent to ${data.sent} members`);
      }
      if (data.recent > 0) {
        toast('error', `${data.recent === 1 ? 'One member was' : `${data.recent} members were`} already reminded in the last 30 minutes`);
      }
      if (data.sent === 0 && data.recent === 0) toast('error', 'Could not send the reminder');
      refreshSilently();
    } catch (e) {
      toast('error', e?.response?.data?.error || 'Could not send the reminder');
    } finally {
      setBusy((cur) => {
        const next = new Set(cur);
        ids.forEach((id) => next.delete(String(id)));
        return next;
      });
    }
  };

  const { members } = state;

  return (
    <section className={cx(SURFACE, 'mt-6 overflow-hidden')} aria-label="Members with no activity today">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[14px] font-semibold text-[color:var(--text)]">Not active today</h2>
            {!state.loading && (
              <span className={cx('rounded-full bg-[color:var(--bg-3)] px-2 py-0.5 text-[11.5px] font-medium text-[color:var(--text-2)]', NUM)}>
                {members.length}
              </span>
            )}
          </div>
          <p className="m-0 mt-0.5 text-[12px] text-[color:var(--text-3)]">
            No task update, comment, request or time log yet today (IST).
          </p>
        </div>
        {members.length > 1 && (
          <button
            type="button"
            className={cx(QUIET_BTN, SMALL_BTN, FOCUS)}
            disabled={members.some((m) => busy.has(String(m.id)))}
            onClick={() => remind(members.map((m) => m.id))}
          >
            Remind all
          </button>
        )}
      </header>

      {state.error ? (
        <div className="px-5 py-4"><ErrorBox message={state.error} onRetry={retry} /></div>
      ) : state.loading ? (
        <div className="divide-y divide-[color:var(--border)]">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className={cx(SKELETON, 'h-8 w-8 !rounded-full')} />
              <div className={cx(SKELETON, 'h-4 w-40')} />
            </div>
          ))}
        </div>
      ) : !members.length ? (
        <div className="px-4 py-6 text-center text-[13px] text-[color:var(--text-3)]">Everyone has been active today.</div>
      ) : (
        <ul className="m-0 list-none divide-y divide-[color:var(--border)] p-0">
          {members.map((m) => {
            const wa = whatsappLink(m.phone, m.name);
            const sending = busy.has(String(m.id));
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={m.name} url={m.avatar_url} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-[color:var(--text)]">{m.name}</div>
                    <div className="text-[11.5px] text-[color:var(--text-3)]">
                      {m.open_tasks > 0 ? `${m.open_tasks} open ${m.open_tasks === 1 ? 'task' : 'tasks'}` : 'No open tasks'}
                      {m.last_nudged_at && <> · Reminded {remindedAt(m.last_nudged_at)}</>}
                    </div>
                  </div>
                </div>

                <span
                  title={m.has_push ? 'A device is subscribed to push' : 'No device subscribed: the reminder reaches the bell only. Use WhatsApp.'}
                  className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-3)]"
                >
                  <span aria-hidden="true" className={cx('h-1.5 w-1.5 rounded-full', m.has_push ? 'bg-emerald-500' : 'bg-amber-500')} />
                  {m.has_push ? 'Push on' : 'No push'}
                </span>

                <div className="flex items-center gap-2">
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className={cx(QUIET_BTN, SMALL_BTN, FOCUS)}>
                      WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    className={cx(QUIET_BTN, SMALL_BTN, FOCUS)}
                    disabled={sending}
                    onClick={() => remind([m.id])}
                  >
                    {sending ? 'Sending…' : 'Remind'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Summary: one row per member                                          */
/* ------------------------------------------------------------------ */

function MetricCell({ metric, value }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className={cx(NUM, 'text-[15px]', value ? 'font-semibold text-[color:var(--text)]' : 'text-[color:var(--border-bright)]')}>
        {value || '–'}
      </span>
      <span className="text-[11px] text-[color:var(--text-3)] md:hidden">{metric.label}</span>
    </div>
  );
}

const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.8fr))_20px] md:items-center md:gap-4';

function SummaryView({ from, to, onOpenMember, hideIds }) {
  const [state, setState] = useState({ loading: true, error: '', members: [] });
  const [reload, retry, silentRef] = useReloader();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [activeOnly, setActiveOnly] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    const silent = silentRef.current;
    silentRef.current = false;
    if (!silent) setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get('/member-activity/members', { params: { from: from || undefined, to: to || undefined }, signal: c.signal })
      .then((res) => {
        if (c.signal.aborted) return;
        setState({ loading: false, error: '', members: res.data?.members || [] });
      })
      .catch((e) => {
        if (isAbort(e) || c.signal.aborted || silent) return;
        setState({ loading: false, error: e?.response?.data?.error || 'Could not load member activity.', members: [] });
      });
    return () => c.abort();
  }, [from, to, reload]);

  const totals = useMemo(
    () =>
      state.members.reduce(
        (acc, m) => {
          METRICS.forEach(({ key }) => {
            acc[key] += m[key] || 0;
          });
          return acc;
        },
        { created: 0, in_review: 0, done: 0, rework: 0 },
      ),
    [state.members],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = state.members.filter((m) => !q || (m.name || '').toLowerCase().includes(q));
    if (hideIds) rows = rows.filter((m) => !hideIds.includes(String(m.id)));
    if (activeOnly) rows = rows.filter((m) => totalOf(m) > 0);
    rows = [...rows].sort((a, b) =>
      sort === 'active'
        ? totalOf(b) - totalOf(a) || (a.name || '').localeCompare(b.name || '')
        : (a.name || '').localeCompare(b.name || ''),
    );
    return rows;
  }, [state.members, query, sort, activeOnly, hideIds]);

  const inactiveCount = state.members.filter((m) => totalOf(m) === 0).length;
  const hasHidden = Boolean(hideIds && hideIds.length);

  return (
    <div className="flex flex-col gap-6">
      <StatTiles totals={totals} loading={state.loading && !state.members.length} />

      {state.error ? (
        <ErrorBox message={state.error} onRetry={retry} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="relative flex-[1_1_220px] sm:max-w-[300px]">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-3)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 21l-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0 0116 0z" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search member"
                aria-label="Search members"
                className={cx(INPUT, 'w-full !rounded-full pl-9')}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {!hasHidden && (
              <button
                type="button"
                aria-pressed={activeOnly}
                onClick={() => setActiveOnly((v) => !v)}
                className={cx(
                  QUIET_BTN,
                  FOCUS,
                  activeOnly && '!border-[color:var(--text)] !bg-[color:var(--text)] !text-[color:var(--bg-2)]',
                )}
              >
                Active only{inactiveCount > 0 && !activeOnly ? ` · ${inactiveCount} idle` : ''}
              </button>
              )}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className={cx(INPUT, 'cursor-pointer !rounded-full pr-8')}
                aria-label="Sort members"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {state.loading && !state.members.length ? (
            <div className={cx(SURFACE, 'divide-y divide-[color:var(--border)]')}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <div className={cx(SKELETON, 'h-9 w-9 !rounded-full')} />
                  <div className={cx(SKELETON, 'h-4 w-32')} />
                  <div className={cx(SKELETON, 'ml-auto h-4 w-40')} />
                </div>
              ))}
            </div>
          ) : !state.members.length ? (
            <EmptyState title="No active members" text="Members you add will show up here." />
          ) : !visible.length ? (
            <EmptyState
              title={(activeOnly || hasHidden) && !query ? 'No activity in this range' : 'No members match'}
              text={hasHidden && !query ? 'Everyone who has activity today will show up here.' : activeOnly && !query ? 'Try a wider date range, or turn off "Active only".' : 'Try a different name.'}
            />
          ) : (
            <div className={cx(SURFACE, 'overflow-hidden', state.loading && 'opacity-70 transition-opacity')}>
              <div className={cx(ROW_GRID, 'hidden border-b border-[color:var(--border)] px-5 py-3')} aria-hidden="true">
                <span className={LABEL}>Member</span>
                {METRICS.map((m) => (
                  <span key={m.key} className={cx(LABEL, 'flex items-center gap-1.5')}>
                    <Dot metric={m} className="!h-1.5 !w-1.5" /> {m.label}
                  </span>
                ))}
                <span />
              </div>
              <ul className="m-0 list-none divide-y divide-[color:var(--border)] p-0">
                {visible.map((m) => {
                  const idle = totalOf(m) === 0;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => onOpenMember(m.id)}
                        aria-label={`Open ${m.name}'s activity`}
                        className={cx(
                          ROW_GRID,
                          'group flex w-full cursor-pointer flex-col gap-3 border-0 bg-transparent px-5 py-4 text-left transition-colors duration-150 hover:bg-[color:var(--bg-3)] motion-reduce:transition-none',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--accent)]',
                        )}
                      >
                        <span className={cx('flex min-w-0 items-center gap-3', idle && 'opacity-60')}>
                          <Avatar name={m.name} url={m.avatar_url} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-[color:var(--text)]">{m.name}</span>
                            {idle && <span className="block text-[11.5px] text-[color:var(--text-3)]">No activity</span>}
                          </span>
                        </span>
                        <span className="grid grid-cols-4 gap-3 md:contents">
                          {METRICS.map((metric) => (
                            <MetricCell key={metric.key} metric={metric} value={m[metric.key] || 0} />
                          ))}
                        </span>
                        <svg className="hidden h-4 w-4 text-[color:var(--text-3)] transition-transform duration-150 group-hover:translate-x-0.5 md:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail: one member, day by day                                       */
/* ------------------------------------------------------------------ */

function DetailView({ memberId, from, to, onBack }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [reload, retry, silentRef] = useReloader();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const c = new AbortController();
    const silent = silentRef.current;
    silentRef.current = false;
    if (!silent) setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get(`/member-activity/members/${memberId}`, { params: { from: from || undefined, to: to || undefined }, signal: c.signal })
      .then((res) => {
        if (c.signal.aborted) return;
        setState({ loading: false, error: '', data: res.data });
      })
      .catch((e) => {
        if (isAbort(e) || c.signal.aborted || silent) return;
        setState({ loading: false, error: e?.response?.data?.error || 'Could not load this member.', data: null });
      });
    return () => c.abort();
  }, [memberId, from, to, reload]);

  const { data } = state;

  const days = useMemo(() => {
    if (!data) return [];
    return data.days
      .map((d) => ({ ...d, items: filter === 'all' ? d.items : d.items.filter((it) => it.metric === filter) }))
      .filter((d) => d.items.length > 0);
  }, [data, filter]);

  const filterOptions = [{ value: 'all', label: 'All' }, ...METRICS.map((m) => ({ value: m.key, label: m.label }))];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={onBack} className={cx(QUIET_BTN, FOCUS)}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          All members
        </button>
        {data ? (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={data.member.name} url={data.member.avatar_url} size={44} />
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold tracking-[-0.01em] text-[color:var(--text)]">{data.member.name}</div>
              <div className="text-[12px] text-[color:var(--text-3)]">{rangeLabel(from, to)}</div>
            </div>
          </div>
        ) : (
          <div className={cx(SKELETON, 'h-10 w-48')} />
        )}
      </div>

      {state.error && <ErrorBox message={state.error} onRetry={retry} />}

      {!state.error && <StatTiles totals={data?.totals || {}} loading={!data} />}

      {data && (
        <>
          {data.days.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented label="Filter by activity" value={filter} onChange={setFilter} options={filterOptions} />
              <span className="text-[12px] text-[color:var(--text-3)]">
                {data.days.length} {data.days.length === 1 ? 'day' : 'days'} with activity
              </span>
            </div>
          )}

          {!data.days.length ? (
            <EmptyState title="No activity in this range" text="Nothing was created, sent to review, done or sent to rework." />
          ) : !days.length ? (
            <EmptyState title={`No ${METRIC_BY_KEY[filter]?.label || ''} activity`} text="Try another filter." />
          ) : (
            <div className="flex flex-col gap-4">
              {days.map((d) => {
                const heading = dayHeading(d.day);
                return (
                  <section key={d.day} className={cx(SURFACE, 'overflow-hidden')}>
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] px-5 py-3.5">
                      <div className="flex items-baseline gap-2">
                        <h2 className="m-0 text-[13.5px] font-semibold text-[color:var(--text)]">{heading.main}</h2>
                        <span className="text-[12px] text-[color:var(--text-3)]">{heading.sub}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        {METRICS.filter((m) => d.counts[m.key] > 0).map((m) => (
                          <span key={m.key} className={cx('inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-2)]', NUM)}>
                            <Dot metric={m} className="!h-1.5 !w-1.5" />
                            {m.label}
                            <b className="font-semibold text-[color:var(--text)]">{d.counts[m.key]}</b>
                          </span>
                        ))}
                      </div>
                    </header>
                    <ul className="m-0 list-none divide-y divide-[color:var(--border)] p-0">
                      {d.items.map((it) => {
                        const metric = METRIC_BY_KEY[it.metric];
                        return (
                          <li key={`${it.metric}-${it.task_id || `r${it.request_id}`}`}>
                            <Link
                              to={it.request_id ? '/requested-tasks' : `/projects/${it.project_id}/tasks/${it.task_id}`}
                              className={cx(
                                'flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-inherit no-underline transition-colors duration-150 hover:bg-[color:var(--bg-3)] motion-reduce:transition-none',
                                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--accent)]',
                              )}
                            >
                              {metric && <Dot metric={metric} />}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-[color:var(--text)]">{it.title}</span>
                                <span className="block truncate text-[11.5px] text-[color:var(--text-3)]">
                                  {metric?.label}
                                  {it.parent_title && <> · in {it.parent_title}</>}
                                  {it.request_status && <span className="capitalize"> · {it.request_status}</span>}
                                </span>
                              </span>
                              <span className="max-w-[220px] truncate text-[12px] text-[color:var(--text-3)]">
                                {it.project_name}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filter bar: presets, prev / next period, custom dates                */
/* ------------------------------------------------------------------ */

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

const lastDayOfMonth = (ymd) => {
  const d = new Date(`${ymd.slice(0, 8)}01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};

const shiftMonth = (ymd, dir) => {
  const d = new Date(`${ymd.slice(0, 8)}01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 10);
};

// Previous / next period of the same length (whole months for month ranges).
function stepRange(from, to, dir, today) {
  if (!from || !to) return null;

  const wholeMonth = from.endsWith('-01') && (to === lastDayOfMonth(to) || to === today) && from.slice(0, 7) === to.slice(0, 7);
  let next;
  if (wholeMonth) {
    const start = shiftMonth(from, dir);
    next = { from: start, to: lastDayOfMonth(start) };
  } else {
    const span = daysBetween(from, to) + 1;
    next = { from: addDays(from, dir * span), to: addDays(to, dir * span) };
  }

  if (next.from > today) return null;
  if (next.to > today) next.to = today;
  return next;
}

const compactRange = (from, to) => {
  if (!from && !to) return 'All time';
  if (from && to && from === to) return formatLong(from);
  if (from && to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${sameYear ? formatShort(from) : fmt(from, { day: '2-digit', month: 'short', year: 'numeric' })} – ${fmt(to, { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }
  return rangeLabel(from, to);
};

const ChevronIcon = ({ d }) => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

function FilterBar({ range, from, to, today, customFrom, customTo, onRange, onStep, onCustom }) {
  const prev = stepRange(from, to, -1, today);
  const next = stepRange(from, to, 1, today);
  const STEP_BTN = cx(
    'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--bg-2)] p-0 text-[color:var(--text-2)] transition-[background-color,color,border-color] duration-200 hover:border-[color:var(--border-bright)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[color:var(--bg-2)]',
    FOCUS,
  );

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="max-w-full overflow-x-auto">
          <Segmented label="Date range" value={range} onChange={onRange} options={RANGES} />
        </div>

        <div className="flex items-center gap-1.5">
          <button type="button" className={STEP_BTN} onClick={() => onStep(prev)} disabled={!prev} aria-label="Previous period" title="Previous period">
            <ChevronIcon d="M15 18l-6-6 6-6" />
          </button>
          <span className={cx(NUM, 'min-w-[170px] whitespace-nowrap px-2 text-center text-[13px] font-medium text-[color:var(--text)]')}>
            {compactRange(from, to)}
          </span>
          <button type="button" className={STEP_BTN} onClick={() => onStep(next)} disabled={!next} aria-label="Next period" title="Next period">
            <ChevronIcon d="M9 18l6-6-6-6" />
          </button>
        </div>
      </div>

      {range === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>From</span>
            <input
              type="date"
              className={INPUT}
              value={customFrom}
              max={customTo || today}
              onChange={(e) => onCustom({ from: e.target.value || null })}
            />
          </label>
          <span aria-hidden="true" className="pb-2 text-[color:var(--text-3)]">→</span>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>To</span>
            <input
              type="date"
              className={INPUT}
              value={customTo}
              min={customFrom || undefined}
              max={today}
              onChange={(e) => onCustom({ to: e.target.value || null })}
            />
          </label>
          <span className="pb-2.5 text-[11.5px] text-[color:var(--text-3)]">Calendar days in IST</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function MemberActivity() {
  const [params, setParams] = useSearchParams();

  const range = RANGES.some((r) => r.value === params.get('range')) ? params.get('range') : 'today';
  const customFrom = params.get('from') || '';
  const customTo = params.get('to') || '';
  const memberId = params.get('member') || '';
  const today = istToday();
  const [idleIds, setIdleIds] = useState(null);
  const tab = params.get('tab') === 'overdue' ? 'overdue' : 'activity';
  const overdue = useOverdueData();
  const overdueSummary = overdue.data?.summary;

  const { from, to } = useMemo(
    () => resolveRange(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    });
    setParams(next, { replace: true });
  };

  const setRange = (value) => {
    if (value === 'custom') {
      update({ range: value, from: customFrom || addDays(today, -6), to: customTo || today });
    } else {
      update({ range: value === 'today' ? null : value, from: null, to: null });
    }
  };

  // Prev / next arrows: jump to the neighbouring period. Single days that land
  // on today / yesterday go back to those presets.
  const stepTo = (next) => {
    if (!next) return;
    if (next.from === today && next.to === today) return update({ range: null, from: null, to: null });
    if (next.from === addDays(today, -1) && next.to === next.from) return update({ range: 'yesterday', from: null, to: null });
    update({ range: 'custom', from: next.from, to: next.to });
  };

  const showIdle = !memberId && from === today && to === today;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title !tracking-[-0.03em]">Member activity</h1>
          <div className="page-subtitle">
            {tab === 'overdue'
              ? 'Late tasks, why they slipped, and what to do about it'
              : 'Who created, reviewed, finished and reworked what'}
          </div>
        </div>
      </div>

      <div className="page-body w-full max-w-[1180px]">
        <div className="mb-5">
          <Segmented
            label="Section"
            value={tab}
            onChange={(v) => update({ tab: v === 'overdue' ? 'overdue' : null, member: null })}
            options={[
              { value: 'activity', label: 'Activity' },
              {
                value: 'overdue',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    Overdue
                    {overdueSummary?.total > 0 && (
                      <span
                        className={cx(
                          NUM,
                          'rounded-full px-1.5 text-[11px] font-semibold leading-[18px]',
                          overdueSummary.awaiting_decision > 0
                            ? 'bg-amber-500/15 text-amber-600'
                            : 'bg-[color:var(--bg-4)] text-[color:var(--text-2)]',
                        )}
                      >
                        {overdueSummary.awaiting_decision > 0 ? overdueSummary.awaiting_decision : overdueSummary.total}
                      </span>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </div>

        {tab === 'overdue' ? (
          <OverdueTab state={overdue} retry={overdue.retry} refresh={overdue.refresh} />
        ) : (
          <>
            <FilterBar
              range={range}
              from={from}
              to={to}
              today={today}
              customFrom={customFrom}
              customTo={customTo}
              onRange={setRange}
              onStep={stepTo}
              onCustom={update}
            />

            {memberId ? (
              <DetailView
                key={memberId}
                memberId={memberId}
                from={from}
                to={to}
                onBack={() => update({ member: null })}
              />
            ) : (
              <SummaryView
                from={from}
                to={to}
                hideIds={showIdle ? idleIds : null}
                onOpenMember={(id) => update({ member: String(id) })}
              />
            )}

            {showIdle && <IdlePanel onLoaded={setIdleIds} />}

            <p className="mt-6 text-[11.5px] leading-relaxed text-[color:var(--text-3)]">
              Each item counts once per day. Done and Rework go to the task&apos;s assignee; Created includes sub
              tasks and task requests.
            </p>
          </>
        )}
      </div>
    </>
  );
}
