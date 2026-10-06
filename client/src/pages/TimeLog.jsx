import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useLiveRefetch, TASK_AND_PROJECT_EVENTS } from '../hooks/useLiveEvents';

const IST = 'Asia/Kolkata';

const VIEWS = [
  { value: 'projects', label: 'Projects' },
  { value: 'members', label: 'Members' },
];

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
];

const SORTS = [
  { value: 'time_desc', label: 'Most time' },
  { value: 'time_asc', label: 'Least time' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'recent', label: 'Recently completed' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

// Distribution bar: biggest items, the rest folded into "Others".
const MAX_SEGMENTS = 6;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const isAbort = (e) =>
  e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';

const cx = (...parts) => parts.filter(Boolean).join(' ');

// Today as YYYY-MM-DD in IST.
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

// Range preset -> { from, to } (IST days, null = open).
function resolveRange(range, customFrom, customTo) {
  const today = istToday();
  switch (range) {
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
    default:
      return { from: null, to: null };
  }
}

// 750 -> { h: 12, m: 30 }
const splitMinutes = (minutes) => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  return { h: Math.floor(total / 60), m: total % 60 };
};

// 750 -> "12h 30m", 45 -> "45m", 120 -> "2h"
function formatMinutes(minutes) {
  const { h, m } = splitMinutes(minutes);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// For CSV: decimal hours, e.g. 90 -> 1.5
const toHours = (minutes) => Math.round(((Number(minutes) || 0) / 60) * 100) / 100;

const formatDay = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDayShort = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short' });
};

const formatDayIso = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

const rangeLabel = (from, to) => {
  if (!from && !to) return 'All time';
  if (from && to) return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
  return from ? `From ${formatDay(from)}` : `Until ${formatDay(to)}`;
};

const percentOf = (value, total) => (total > 0 ? Math.round((value / total) * 100) : 0);

const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();

// Stable hue per name (same idea as the Members page).
const hueOf = (seed) => {
  const s = String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

// Each project / member gets its own calm color, used for its mark, bar and
// distribution segment, so the page is not one flat indigo.
const hueColor = (seed, light = 56) => `hsl(${hueOf(seed)} 58% ${light}%)`;
const hueTint = (seed, pct = 14) => `color-mix(in srgb, hsl(${hueOf(seed)} 60% 52%) ${pct}%, var(--bg-2))`;

const minutesOf = (t) => Number(t.time_taken) || 0;
const isUnlogged = (t) => t.is_leaf && minutesOf(t) === 0;

function sortList(list, sort, nameKey = 'name') {
  const copy = [...list];
  copy.sort((a, b) => {
    if (sort === 'time_asc') return a.total_minutes - b.total_minutes;
    if (sort === 'name') return String(a[nameKey] || '').localeCompare(String(b[nameKey] || ''));
    if (sort === 'recent') return new Date(b.last_completed_at || 0) - new Date(a.last_completed_at || 0);
    return b.total_minutes - a.total_minutes;
  });
  return copy;
}

// Biggest items as bar segments, the rest folded into "Others".
function toSegments(items) {
  const sorted = [...items].filter((i) => i.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const top = sorted.slice(0, MAX_SEGMENTS - 1);
  const rest = sorted.slice(MAX_SEGMENTS - 1);
  if (rest.length === 1) top.push(rest[0]);
  else if (rest.length > 1) {
    top.push({ id: '__others', name: `${rest.length} others`, minutes: rest.reduce((s, i) => s + i.minutes, 0), others: true });
  }
  return top;
}

/* ---------- CSV ---------- */

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCsv(filename, header, rows) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  // BOM so Excel opens Malayalam / special characters correctly.
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s) =>
  String(s || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'export';

const fileSuffix = (from, to) => (from || to ? `${from || 'start'}_to_${to || 'today'}` : 'all-time');

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

// Project detail: completed tasks grouped under their main task.
// A main task's total = its own time + its completed sub tasks' time.
function groupByMainTask(tasks) {
  const groups = new Map();

  for (const t of tasks) {
    const key = String(t.parent_task_id ?? t.id);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        id: t.parent_task_id ?? t.id,
        title: t.parent_task_id ? t.parent_title : t.title,
        own: null, // the main task row itself, when it is Done
        subs: [],
        total: 0,
        unlogged: 0,
        last: null,
        assignees: new Map(),
      };
      groups.set(key, g);
    }

    if (t.parent_task_id) g.subs.push(t);
    else g.own = t;

    g.total += minutesOf(t);
    if (isUnlogged(t)) g.unlogged += 1;
    if (!g.last || new Date(t.completed_at) > new Date(g.last)) g.last = t.completed_at;
    for (const a of t.assignees || []) g.assignees.set(String(a.id), a.name);
  }

  return [...groups.values()].map((g) => ({
    ...g,
    hasSubs: g.subs.length > 0,
    // Sub tasks done, but the main task is not Done yet.
    mainOpen: g.subs.length > 0 && !g.own,
    assigneeNames: [...g.assignees.values()],
  }));
}

// Member detail: the member's completed tasks grouped by project.
function groupByProject(tasks) {
  const groups = new Map();

  for (const t of tasks) {
    const key = String(t.project_id);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        id: t.project_id,
        name: t.project_name,
        client_name: t.client_name,
        status: t.project_status,
        tasks: [],
        total_minutes: 0,
        task_count: 0,
        unlogged_count: 0,
        last_completed_at: null,
      };
      groups.set(key, g);
    }

    g.tasks.push(t);
    g.total_minutes += minutesOf(t);
    if (t.is_leaf) g.task_count += 1;
    if (isUnlogged(t)) g.unlogged_count += 1;
    if (!g.last_completed_at || new Date(t.completed_at) > new Date(g.last_completed_at)) {
      g.last_completed_at = t.completed_at;
    }
  }

  return [...groups.values()];
}

/* -------------------------------------------------------------------------- */
/* Data hook                                                                  */
/* -------------------------------------------------------------------------- */

// GET `url` with ?from&to. First load shows a skeleton; later loads (filter
// change, live update) keep the current content on screen. Superseded
// requests are cancelled.
function useTimeLogData(url, from, to) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const controller = useRef(null);
  const loadedKey = useRef(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!url) return;
      controller.current?.abort();
      const c = new AbortController();
      controller.current = c;

      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;

      if (!silent) setRefreshing(true);

      try {
        const res = await api.get(url, { params, signal: c.signal });
        if (c.signal.aborted) return;
        setData(res.data);
        setError(false);
        loadedKey.current = url;
      } catch (e) {
        if (isAbort(e) || c.signal.aborted) return;
        // Keep what is on screen after a failed silent refresh.
        if (!silent || loadedKey.current !== url) setError(true);
      } finally {
        if (controller.current === c) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [url, from, to],
  );

  useEffect(() => {
    // Switching to a different list/detail: show the skeleton again.
    if (loadedKey.current !== url) {
      setData(null);
      setLoading(true);
    }
    setError(false);
    load();
    return () => controller.current?.abort();
  }, [load, url]);

  const refreshSilently = useCallback(() => load({ silent: true }), [load]);
  const retry = useCallback(() => {
    setError(false);
    setLoading(true);
    load();
  }, [load]);

  return { data, loading, error, refreshing, refreshSilently, retry };
}

/* -------------------------------------------------------------------------- */
/* Styles (full literals so Tailwind can see them)                            */
/* -------------------------------------------------------------------------- */

// Row entrance. Only transform + opacity, and off for reduced motion.
const KEYFRAMES = `
@keyframes tl-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes tl-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.tl-rise { animation: tl-rise .36s cubic-bezier(.22,1,.36,1) both; }
.tl-grow { transform-origin: left; animation: tl-grow .6s cubic-bezier(.22,1,.36,1) both; }
@media (prefers-reduced-motion: reduce) { .tl-rise, .tl-grow { animation: none; } }
`;

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';
const FOCUS_INSET =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--accent)]';
const SURFACE =
  'rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-2)] shadow-[0_1px_2px_rgba(30,32,71,0.04),0_12px_32px_-24px_rgba(30,32,71,0.18)]';
const PULSE = 'animate-pulse [animation-duration:1.4s] motion-reduce:animate-none';
const BAR = 'rounded-md bg-[color:var(--bg-4)]';
// Numbers: the body font with tabular figures (Space Mono looked broken at size).
const MONO = 'tabular-nums [font-feature-settings:"tnum","cv11"]';
const LABEL = 'text-[11px] font-medium tracking-[0.01em] text-[color:var(--text-3)]';
const INPUT =
  'h-9 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-2)] px-3 text-[13px] text-[color:var(--text)] transition-[border-color,box-shadow] duration-200 placeholder:text-[color:var(--text-3)] hover:border-[color:var(--border-bright)] motion-reduce:transition-none focus-visible:border-[color:var(--accent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)] focus-visible:outline-none';
const QUIET_BTN =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-2)] px-3 text-[12.5px] font-medium text-[color:var(--text-2)] no-underline transition-[background-color,color,border-color,transform] duration-200 hover:border-[color:var(--border-bright)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--text)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none';


/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

// Underline tabs for the main switch.
const Tabs = memo(function Tabs({ label, value, onChange, options }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 border-b border-[color:var(--border)]">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative -mb-px cursor-pointer border-0 border-b-2 bg-transparent px-0.5 pb-2.5 pt-1 text-[14px] transition-colors duration-200 max-[640px]:min-h-10 motion-reduce:transition-none',
              FOCUS,
              on
                ? 'border-[color:var(--accent)] font-semibold text-[color:var(--text)]'
                : 'border-transparent font-medium text-[color:var(--text-3)] hover:text-[color:var(--text)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
});

// Compact pill group for the date range.
const Pills = memo(function Pills({ label, value, onChange, options }) {
  return (
    <div role="group" aria-label={label} className="flex max-w-full flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-8 cursor-pointer whitespace-nowrap rounded-lg border px-3 text-[12.5px] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97] max-[640px]:min-h-10 motion-reduce:transition-none',
              FOCUS,
              on
                ? 'border-[color:color-mix(in_srgb,var(--accent)_40%,var(--border))] bg-[color:color-mix(in_srgb,var(--accent)_9%,var(--bg-2))] text-[color:var(--accent)]'
                : 'border-[color:var(--border)] bg-[color:var(--bg-2)] text-[color:var(--text-2)] hover:border-[color:var(--border-bright)] hover:text-[color:var(--text)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
});

// "12h 30m" with the units set smaller, so the digits carry the weight.
function Duration({ minutes, size = 'md', className = '' }) {
  const { h, m } = splitMinutes(minutes);
  const unit =
    size === 'xl'
      ? 'ml-[0.06em] mr-[0.28em] text-[0.5em] font-semibold tracking-normal'
      : 'ml-[1px] mr-[0.3em] text-[0.82em] font-medium';
  const unitColor = 'text-[color:var(--text-3)]';
  return (
    <span className={cx(MONO, 'inline-flex items-baseline whitespace-nowrap', className)}>
      {h > 0 && (
        <>
          <span>{h}</span>
          <span className={cx(unit, unitColor)}>h</span>
        </>
      )}
      {(m > 0 || h === 0) && (
        <>
          <span>{h > 0 ? String(m).padStart(2, '0') : m}</span>
          <span className={cx(unit, unitColor, '!mr-0')}>m</span>
        </>
      )}
    </span>
  );
}

function TimeValue({ minutes, unlogged, className = '' }) {
  if (unlogged) {
    return (
      <span
        title="Completed without a time entry"
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-[color:color-mix(in_srgb,var(--warning)_55%,transparent)] px-1.5 py-px text-[11px] font-medium text-[color:color-mix(in_srgb,var(--warning)_85%,var(--text))]"
      >
        Not logged
      </span>
    );
  }
  return <Duration minutes={minutes} className={cx('text-[color:var(--text)]', className)} />;
}

function UnloggedNote({ count, className = '' }) {
  if (!count) return null;
  return (
    <span className={cx('text-[11px] font-medium tabular-nums text-[color:color-mix(in_srgb,var(--warning)_85%,var(--text))]', className)}>
      {count} not logged
    </span>
  );
}

function Avatar({ name, url, size = 34 }) {
  const hue = hueOf(name);
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[13px] font-semibold"
      style={{
        width: size,
        height: size,
        color: `hsl(${hue} 45% 38%)`,
        background: `color-mix(in srgb, hsl(${hue} 55% 50%) 14%, var(--bg-3))`,
      }}
    >
      {url ? <img src={url} alt="" loading="lazy" className="block h-full w-full object-cover" /> : initial(name)}
    </span>
  );
}

function ProjectMark({ name, size = 34 }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[13px] font-bold uppercase"
      style={{
        width: size,
        height: size,
        color: hueColor(name, 36),
        background: hueTint(name, 16),
        boxShadow: `inset 0 0 0 1px ${hueTint(name, 30)}`,
      }}
    >
      {initial(name)}
      {/* corner notch: reads as a project, not a person */}
      <span className="absolute right-0 top-0 size-[38%] rounded-bl-[6px]" style={{ background: hueTint(name, 34) }} />
    </span>
  );
}

function Chevron({ open, direction = 'right' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx(
        'shrink-0 text-[color:var(--text-3)] transition-transform duration-200 motion-reduce:transition-none',
        direction === 'right' && open && 'rotate-90',
      )}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]"
      width="15"
      height="15"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="M14 14l3.5 3.5" />
    </svg>
  );
}

// Thin bar: this item's share of the biggest item in the list.
function ShareBar({ value, max, color = 'var(--accent)', className = '' }) {
  if (!value) {
    // Nothing logged: a dashed track instead of an empty bar.
    return (
      <div
        className={cx('h-1.5 rounded-full border border-dashed border-[color:var(--border-bright)]', className)}
        aria-hidden="true"
      />
    );
  }
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-3)]', className)} aria-hidden="true">
      <div
        className="tl-grow h-full rounded-full"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 70%, white))` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary band: big total, a few figures, and where the time went           */
/* -------------------------------------------------------------------------- */

const segColor = (s) => (s.others ? 'var(--border-bright)' : hueColor(s.name));

function DistributionBar({ segments, total, title }) {
  if (!segments.length || total <= 0) {
    return (
      <div className="mt-5">
        <div className={cx(LABEL, 'mb-2')}>{title}</div>
        <div className="h-3 rounded-full border border-dashed border-[color:var(--border-bright)]" aria-hidden="true" />
        <p className="m-0 mt-2 text-[12px] text-[color:var(--text-3)]">No time logged in this period yet.</p>
      </div>
    );
  }
  return (
    <div className="mt-5">
      <div className={cx(LABEL, 'mb-2')}>{title}</div>
      <div
        className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full bg-[color:var(--bg-3)]"
        role="img"
        aria-label={`${title}: ${segments.map((s) => `${s.name} ${percentOf(s.minutes, total)}%`).join(', ')}`}
      >
        {segments.map((s, i) => (
          <div
            key={s.id}
            className="tl-grow h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.minutes / total) * 100}%`,
              minWidth: 6,
              background: segColor(s),
              animationDelay: `${i * 70}ms`,
            }}
          />
        ))}
      </div>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
        {segments.map((s) => (
          <li
            key={s.id}
            className="flex min-w-0 items-center gap-2 rounded-lg bg-[color:var(--bg-2)] py-1 pl-2 pr-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--border)]"
          >
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[4px]" style={{ background: segColor(s) }} />
            <span className="max-w-[20ch] truncate font-medium text-[color:var(--text)]">{s.name}</span>
            <span className={cx(MONO, 'text-[color:var(--text-3)]')}>{formatMinutes(s.minutes)}</span>
            <span className={cx(MONO, 'font-semibold text-[color:var(--text-2)]')}>{percentOf(s.minutes, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// How many completed tasks actually have time on them.
function CoverageRing({ logged, total }) {
  const pct = total > 0 ? logged / total : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const good = pct >= 0.8;
  const color = good ? 'var(--success)' : pct >= 0.4 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="flex items-center gap-4">
      <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--bg-4)" strokeWidth="9" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(pct * c, pct > 0 ? 4 : 0)} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
        />
        <text
          x="44"
          y="44"
          textAnchor="middle"
          dominantBaseline="central"
          transform="rotate(90 44 44)"
          className="fill-[color:var(--text)] text-[17px] font-bold [font-feature-settings:'tnum']"
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[color:var(--text)]">Logging coverage</div>
        <div className="mt-0.5 text-[12px] leading-snug text-[color:var(--text-2)]">
          <span className={cx(MONO, 'font-semibold text-[color:var(--text)]')}>{logged}</span> of{' '}
          <span className={MONO}>{total}</span> completed tasks have time
        </div>
        {!good && total > 0 && (
          <div className="mt-1 text-[11.5px] font-medium" style={{ color: `color-mix(in srgb, ${color} 85%, var(--text))` }}>
            {total - logged} finished without a time entry
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryBand({ totalMinutes, taskCount, unlogged, countLabel, countValue, segments, segmentsTitle }) {
  const avg = taskCount - unlogged > 0 ? totalMinutes / (taskCount - unlogged) : 0;
  return (
    <section
      className={cx(SURFACE, 'tl-rise relative mb-6 overflow-hidden')}
      aria-label="Summary"
    >
      {/* soft accent light from the top left */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 11%, transparent) 0%, transparent 46%), radial-gradient(80% 120% at 100% 0%, color-mix(in srgb, var(--accent-2) 6%, transparent) 0%, transparent 50%)',
        }}
      />
      <div className="relative grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-[color:var(--accent)] text-white" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2" />
              </svg>
            </span>
            <span className="text-[12.5px] font-semibold text-[color:var(--text-2)]">Total time logged</span>
          </div>
          <Duration
            minutes={totalMinutes}
            size="xl"
            className="mt-3 text-[48px] font-extrabold leading-none tracking-[-0.04em] text-[color:var(--text)] sm:text-[60px]"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <StatChip label="Tasks done" value={taskCount} />
            <StatChip label={countLabel} value={countValue} />
            <StatChip label="Avg per logged task" value={avg ? formatMinutes(avg) : '—'} />
          </div>
        </div>
        <div className="rounded-xl bg-[color:color-mix(in_srgb,var(--bg-2)_75%,transparent)] p-4 shadow-[inset_0_0_0_1px_var(--border)] backdrop-blur-sm lg:min-w-[300px]">
          <CoverageRing logged={taskCount - unlogged} total={taskCount} />
        </div>
      </div>
      <div className="relative border-t border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--bg-3)_45%,transparent)] px-5 pb-5 pt-1 sm:px-7">
        <DistributionBar segments={segments} total={totalMinutes} title={segmentsTitle} />
      </div>
    </section>
  );
}

function StatChip({ label, value }) {
  return (
    <span className="inline-flex items-baseline gap-2 rounded-lg bg-[color:var(--bg-2)] px-3 py-1.5 shadow-[inset_0_0_0_1px_var(--border)]">
      <span className={cx(MONO, 'text-[15px] font-bold text-[color:var(--text)]')}>{value}</span>
      <span className="text-[11.5px] font-medium text-[color:var(--text-3)]">{label}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

function EmptyState({ title, children, action, alert }) {
  return (
    <div
      role={alert ? 'alert' : undefined}
      className={cx(SURFACE, 'flex flex-col items-start gap-2 px-6 py-10 sm:px-8')}
    >
      <span
        aria-hidden="true"
        className={cx(
          'mb-1 flex size-10 items-center justify-center rounded-xl',
          alert
            ? 'bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)]'
            : 'bg-[color:var(--bg-3)] text-[color:var(--text-3)]',
        )}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {alert ? <path d="M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" /> : <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2" />}
        </svg>
      </span>
      <h3 className="m-0 text-[15px] font-semibold text-[color:var(--text)]">{title}</h3>
      <p className="m-0 max-w-[52ch] text-[13px] leading-relaxed text-[color:var(--text-2)] [text-wrap:pretty]">{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const SummarySkeleton = memo(function SummarySkeleton() {
  return (
    <div className={cx(SURFACE, PULSE, 'mb-6 px-5 py-6 sm:px-7')} aria-hidden="true">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className={`${BAR} mb-3 h-2.5 w-24`} />
          <div className={`${BAR} h-11 w-44`} />
        </div>
        <div className="flex gap-8">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className={`${BAR} mb-2 h-2.5 w-14`} />
              <div className={`${BAR} h-4 w-8`} />
            </div>
          ))}
        </div>
      </div>
      <div className={`${BAR} mt-7 h-2.5 w-full`} />
    </div>
  );
});

const RowsSkeleton = memo(function RowsSkeleton({ rows = SKELETON_ROWS }) {
  return (
    <div className={cx(SURFACE, 'overflow-hidden')} aria-hidden="true">
      {rows.map((i) => (
        <div
          key={i}
          className={cx(PULSE, 'flex items-center gap-4 border-b border-[color:var(--border)] px-5 py-4 last:border-b-0')}
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <div className="size-[34px] shrink-0 rounded-[10px] bg-[color:var(--bg-4)]" />
          <div className="flex flex-1 flex-col gap-2">
            <div className={`${BAR} h-3 w-2/5`} />
            <div className={`${BAR} h-2 w-1/4`} />
          </div>
          <div className={`${BAR} hidden h-1 w-40 md:block`} />
          <div className={`${BAR} h-4 w-16`} />
        </div>
      ))}
    </div>
  );
});

function PageSkeleton() {
  return (
    <>
      <SummarySkeleton />
      <RowsSkeleton />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Ranked ledger (Projects / Members lists, and members inside a project)     */
/* -------------------------------------------------------------------------- */

const RANKED_ROW =
  'group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 border-0 border-b border-[color:var(--border)] bg-transparent px-4 py-3.5 text-left transition-colors duration-150 last:border-b-0 hover:bg-[color:color-mix(in_srgb,var(--bg-3)_70%,transparent)] active:bg-[color:var(--bg-3)] motion-reduce:transition-none sm:px-5 md:grid-cols-[2rem_minmax(0,1.25fr)_minmax(0,1fr)_7.5rem_1rem]';

function RankBadge({ rank, color, empty }) {
  if (empty) return <span className="hidden text-[13px] text-[color:var(--text-3)] md:block">–</span>;
  const top = rank <= 3;
  return (
    <span
      className={cx(
        MONO,
        'hidden size-7 items-center justify-center rounded-lg text-[12px] font-bold md:flex',
        !top && 'text-[color:var(--text-3)]',
      )}
      style={top ? { background: hueTint(color, 16), color: hueColor(color, 36) } : undefined}
    >
      {rank}
    </span>
  );
}

const RankedRow = memo(function RankedRow({ rank, seed, mark, title, subtitle, badge, minutes, max, total, meta, unlogged, onOpen, index }) {
  const share = percentOf(minutes, total);
  const empty = !minutes;
  const color = hueColor(seed || title);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(RANKED_ROW, FOCUS_INSET, 'tl-rise relative', empty && 'bg-[color:color-mix(in_srgb,var(--bg-3)_35%,transparent)]')}
      style={{ animationDelay: `${Math.min(index, 10) * 28}ms` }}
    >
      {/* colored edge on hover */}
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
        style={{ background: color }}
      />

      <RankBadge rank={rank} color={seed || title} empty={empty} />

      <span className={cx('flex min-w-0 items-center gap-3', empty && 'opacity-75')}>
        {mark}
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[color:var(--text)]">{title}</span>
            {badge}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-[color:var(--text-3)]">{subtitle}</span>
        </span>
      </span>

      <span className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1 md:row-auto">
        <span className="flex items-center gap-2.5">
          <ShareBar value={minutes} max={max} color={color} className="flex-1" />
          <span className={cx(MONO, 'w-9 shrink-0 text-right text-[11.5px] font-semibold', empty ? 'text-[color:var(--text-3)]' : 'text-[color:var(--text-2)]')}>
            {empty ? '—' : `${share}%`}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] tabular-nums text-[color:var(--text-3)]">
          {meta}
          {unlogged > 0 && <UnloggedNote count={unlogged} />}
        </span>
      </span>

      <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
        {empty ? (
          <span className="text-[12px] font-medium text-[color:var(--text-3)]">No time</span>
        ) : (
          <Duration minutes={minutes} className="text-[17px] font-bold tracking-[-0.01em] text-[color:var(--text)]" />
        )}
      </span>

      <span className="hidden -translate-x-1 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none md:block">
        <Chevron />
      </span>
    </button>
  );
});

function LedgerHead({ cols }) {
  return (
    <div className="hidden items-center gap-x-4 border-b border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--bg-3)_60%,var(--bg-2))] px-5 py-2.5 md:grid md:grid-cols-[2rem_minmax(0,1.25fr)_minmax(0,1fr)_7.5rem_1rem]">
      <span className={LABEL}>#</span>
      <span className={LABEL}>{cols[0]}</span>
      <span className={LABEL}>{cols[1]}</span>
      <span className={cx(LABEL, 'text-right')}>Time</span>
      <span />
    </div>
  );
}

function Dot() {
  return <span aria-hidden="true" className="text-[color:var(--border-bright)]">•</span>;
}

/* -------------------------------------------------------------------------- */
/* Task ledger rows                                                           */
/* -------------------------------------------------------------------------- */

const TASK_ROW =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1fr)_11rem_6rem_6.5rem]';

function TaskLink({ projectId, task, children, className = '' }) {
  return (
    <Link
      to={`/projects/${projectId}/tasks/${task.id}`}
      className={cx(
        'rounded text-[13.5px] font-medium text-[color:var(--text)] no-underline decoration-[color:var(--border-bright)] underline-offset-[3px] [overflow-wrap:anywhere] hover:text-[color:var(--accent)] hover:underline',
        FOCUS,
        className,
      )}
    >
      {children}
    </Link>
  );
}

function ReworkChip({ count }) {
  if (!count) return null;
  return (
    <span className="ml-2 inline-block rounded-[5px] bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] px-1.5 py-px align-middle text-[10.5px] font-semibold tabular-nums text-[color:var(--danger)]">
      {count}× rework
    </span>
  );
}

function TaskRow({ projectId, task, indent = false, label, secondary }) {
  const names = (task.assignees || []).map((a) => a.name).join(', ') || 'Unassigned';
  return (
    <div
      className={cx(
        TASK_ROW,
        'transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--bg-3)_55%,transparent)] motion-reduce:transition-none',
        indent && 'relative bg-[color:color-mix(in_srgb,var(--bg-3)_40%,transparent)] md:pl-[3.25rem]',
      )}
    >
      {indent && (
        <span aria-hidden="true" className="absolute bottom-0 left-[1.6rem] top-0 hidden w-px bg-[color:var(--border)] md:block" />
      )}
      <div className="min-w-0 max-md:col-span-2">
        {label && (
          <span className="mr-2 rounded-[5px] bg-[color:var(--bg-4)] px-1.5 py-px align-middle text-[10.5px] font-semibold text-[color:var(--text-3)]">
            {label}
          </span>
        )}
        <TaskLink projectId={projectId} task={task}>
          {task.title}
        </TaskLink>
        <ReworkChip count={task.rework_count} />
      </div>
      <div className="truncate text-[12px] text-[color:var(--text-2)]">{secondary ?? names}</div>
      <div className="text-[12px] tabular-nums text-[color:var(--text-3)]">{formatDayShort(task.completed_at)}</div>
      <div className="justify-self-end text-[13.5px]">
        <TimeValue minutes={minutesOf(task)} unlogged={isUnlogged(task)} className="font-medium" />
      </div>
    </div>
  );
}

function TaskHead({ second = 'Assignee' }) {
  return (
    <div className={cx(TASK_ROW, 'hidden !py-2.5 bg-[color:color-mix(in_srgb,var(--bg-3)_60%,var(--bg-2))] md:grid')}>
      <span className={LABEL}>Task</span>
      <span className={LABEL}>{second}</span>
      <span className={LABEL}>Completed</span>
      <span className={cx(LABEL, 'justify-self-end')}>Time</span>
    </div>
  );
}

function SectionHead({ title, count, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] px-4 py-3.5 sm:px-5">
      <h3 className="m-0 flex items-center gap-2 text-[14px] font-semibold text-[color:var(--text)]">
        {title}
        {count !== undefined && (
          <span className={cx(MONO, 'rounded-[5px] bg-[color:var(--bg-3)] px-1.5 py-px text-[11px] font-medium text-[color:var(--text-3)]')}>
            {count}
          </span>
        )}
      </h3>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Project detail                                                             */
/* -------------------------------------------------------------------------- */

function MainTaskGroup({ projectId, group, open, onToggle }) {
  if (!group.hasSubs) {
    // Plain task (no sub tasks).
    return <TaskRow projectId={projectId} task={group.own} />;
  }

  const panelId = `tl-group-${group.key}`;
  return (
    <div>
      <div className={cx(TASK_ROW, open && 'bg-[color:color-mix(in_srgb,var(--accent)_4%,transparent)]')}>
        <div className="flex min-w-0 items-start gap-2 max-md:col-span-2">
          <button
            type="button"
            onClick={() => onToggle(group.key)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? 'Hide' : 'Show'} sub tasks of ${group.title}`}
            className={cx(
              '-ml-1 mt-px flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent transition-colors hover:bg-[color:var(--bg-3)] max-[640px]:size-9',
              FOCUS,
            )}
          >
            <Chevron open={open} />
          </button>
          <div className="min-w-0">
            <TaskLink projectId={projectId} task={{ id: group.id }} className="font-semibold">
              {group.title || 'Main task'}
            </TaskLink>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-[color:var(--text-3)]">
              <span>
                {group.subs.length} sub task{group.subs.length !== 1 ? 's' : ''}
              </span>
              {group.mainOpen && (
                <>
                  <Dot />
                  <span>main task still open</span>
                </>
              )}
              {group.unlogged > 0 && (
                <>
                  <Dot />
                  <UnloggedNote count={group.unlogged} />
                </>
              )}
            </div>
          </div>
        </div>
        <div className="truncate text-[12px] text-[color:var(--text-2)]">{group.assigneeNames.join(', ') || '—'}</div>
        <div className="text-[12px] tabular-nums text-[color:var(--text-3)]">{formatDayShort(group.last)}</div>
        <div className="justify-self-end text-[14px]">
          <Duration minutes={group.total} className="font-semibold text-[color:var(--text)]" />
        </div>
      </div>

      {open && (
        <div id={panelId} className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
          {group.own && minutesOf(group.own) > 0 && (
            <TaskRow projectId={projectId} task={group.own} indent label="Main" />
          )}
          {group.subs.map((st) => (
            <TaskRow key={st.id} projectId={projectId} task={st} indent />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDetailView({ projectId, from, to, onBack, onOpenMember }) {
  const { data, loading, error, refreshing, refreshSilently, retry } = useTimeLogData(
    `/time-log/projects/${projectId}`,
    from,
    to,
  );
  useLiveRefetch(TASK_AND_PROJECT_EVENTS, refreshSilently, {
    match: (e) => e.projectId == null || String(e.projectId) === String(projectId),
  });

  const [openKeys, setOpenKeys] = useState(() => new Set());

  const tasks = data?.tasks || [];
  const project = data?.project;

  const { groups, totals, perMember } = useMemo(() => {
    const g = groupByMainTask(tasks).sort((a, b) => new Date(b.last) - new Date(a.last));
    const t = tasks.reduce(
      (acc, task) => {
        acc.minutes += minutesOf(task);
        if (task.is_leaf) acc.count += 1;
        if (isUnlogged(task)) acc.unlogged += 1;
        return acc;
      },
      { minutes: 0, count: 0, unlogged: 0 },
    );
    const pm = new Map();
    for (const task of tasks) {
      for (const a of task.assignees || []) {
        const k = String(a.id);
        const row = pm.get(k) || { id: a.id, name: a.name, minutes: 0, count: 0, unlogged: 0 };
        row.minutes += minutesOf(task);
        if (task.is_leaf) row.count += 1;
        if (isUnlogged(task)) row.unlogged += 1;
        pm.set(k, row);
      }
    }
    return { groups: g, totals: t, perMember: [...pm.values()].sort((a, b) => b.minutes - a.minutes) };
  }, [tasks]);

  const toggle = useCallback((key) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allKeys = useMemo(() => groups.filter((g) => g.hasSubs).map((g) => g.key), [groups]);
  const allOpen = allKeys.length > 0 && allKeys.every((k) => openKeys.has(k));
  const toggleAll = () => setOpenKeys(allOpen ? new Set() : new Set(allKeys));

  const exportCsv = () => {
    const rows = tasks
      .slice()
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
      .map((t) => [
        t.parent_task_id ? t.parent_title : t.title,
        t.parent_task_id ? t.title : '',
        (t.assignees || []).map((a) => a.name).join('; '),
        formatDayIso(t.completed_at),
        isUnlogged(t) ? '' : minutesOf(t),
        isUnlogged(t) ? '' : toHours(minutesOf(t)),
        isUnlogged(t) ? 'Not logged' : '',
        t.rework_count || 0,
      ]);
    downloadCsv(
      `time-log_${slug(project?.name)}_${fileSuffix(from, to)}.csv`,
      ['Task', 'Sub task', 'Assignees', 'Completed (IST)', 'Minutes', 'Hours', 'Note', 'Reworks'],
      rows,
    );
  };

  const memberMax = perMember[0]?.minutes || 0;

  return (
    <>
      <DetailHeader
        onBack={onBack}
        backLabel="All projects"
        mark={project ? <ProjectMark name={project.name} size={44} /> : null}
        title={project?.name || (loading ? 'Loading…' : 'Project')}
        subtitle={project ? project.client_name || 'No client' : ''}
        badge={project?.status && project.status !== 'active' ? project.status : null}
        actions={
          <>
            {project && (
              <Link to={`/projects/${project.id}`} className={cx(QUIET_BTN, FOCUS)}>
                Open project
              </Link>
            )}
            <button type="button" className={cx(QUIET_BTN, FOCUS)} onClick={exportCsv} disabled={!tasks.length}>
              <DownloadIcon /> Export CSV
            </button>
          </>
        }
        refreshing={refreshing && !loading}
      />

      {loading ? (
        <PageSkeleton />
      ) : error ? (
        <EmptyState
          alert
          title="We couldn't load this project's time"
          action={
            <button type="button" className={cx(QUIET_BTN, FOCUS)} onClick={retry}>
              Try again
            </button>
          }
        >
          Check your connection and try again.
        </EmptyState>
      ) : tasks.length === 0 ? (
        <EmptyState title="No completed tasks in this period">
          Pick a wider date range above, or check back once tasks in this project are marked Done.
        </EmptyState>
      ) : (
        <>
          <SummaryBand
            totalMinutes={totals.minutes}
            taskCount={totals.count}
            unlogged={totals.unlogged}
            countLabel="Members"
            countValue={perMember.length}
            segments={toSegments(perMember)}
            segmentsTitle="Time by member"
          />

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className={cx(SURFACE, 'tl-rise overflow-hidden [animation-delay:60ms]')} aria-label="Completed tasks">
              <SectionHead title="Completed tasks" count={groups.length}>
                {allKeys.length > 0 && (
                  <button type="button" className={cx(QUIET_BTN, FOCUS, '!h-8')} onClick={toggleAll}>
                    {allOpen ? 'Collapse all' : 'Expand all'}
                  </button>
                )}
              </SectionHead>
              <TaskHead />
              <div className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)] md:border-t-0">
                {groups.map((g) => (
                  <MainTaskGroup
                    key={g.key}
                    projectId={projectId}
                    group={g}
                    open={openKeys.has(g.key)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            </section>

            {perMember.length > 0 && (
              <aside className={cx(SURFACE, 'tl-rise overflow-hidden [animation-delay:120ms] xl:sticky xl:top-4')} aria-label="Time by member">
                <SectionHead title="Members" count={perMember.length} />
                <ul className="m-0 list-none p-0">
                  {perMember.map((m) => (
                    <li key={m.id} className="border-b border-[color:var(--border)] last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onOpenMember(m.id)}
                        className={cx(
                          'group flex w-full cursor-pointer flex-col gap-2 border-0 bg-transparent px-4 py-3 text-left transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--bg-3)_70%,transparent)] motion-reduce:transition-none sm:px-5',
                          FOCUS_INSET,
                        )}
                      >
                        <span className="flex w-full items-center gap-3">
                          <Avatar name={m.name} size={28} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-[color:var(--text)]">{m.name}</span>
                            <span className="block text-[11px] tabular-nums text-[color:var(--text-3)]">
                              {m.count} task{m.count !== 1 ? 's' : ''}
                              {m.unlogged > 0 && (
                                <span className="text-[color:color-mix(in_srgb,var(--warning)_85%,var(--text))]"> · {m.unlogged} not logged</span>
                              )}
                            </span>
                          </span>
                          <Duration minutes={m.minutes} className="text-[13.5px] font-semibold text-[color:var(--text)]" />
                        </span>
                        <span className="flex w-full items-center gap-2.5 pl-10">
                          <ShareBar value={m.minutes} max={memberMax} color={hueColor(m.name)} className="flex-1" />
                          <span className={cx(MONO, 'w-8 shrink-0 text-right text-[10.5px] text-[color:var(--text-3)]')}>
                            {percentOf(m.minutes, totals.minutes)}%
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Member detail                                                              */
/* -------------------------------------------------------------------------- */

function MemberProjectGroup({ group, open, onToggle, max, total, onOpenProject, index }) {
  const panelId = `tl-mp-${group.key}`;
  return (
    <section className={cx(SURFACE, 'tl-rise overflow-hidden')} style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5', open && 'border-b border-[color:var(--border)]')}>
        <button
          type="button"
          onClick={() => onToggle(group.key)}
          aria-expanded={open}
          aria-controls={panelId}
          className={cx('flex min-w-0 flex-[1_1_260px] cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent p-0 text-left', FOCUS)}
        >
          <Chevron open={open} />
          <ProjectMark name={group.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-[color:var(--text)]">{group.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-[color:var(--text-3)]">
              <span>{group.client_name || 'No client'}</span>
              <Dot />
              <span>
                {group.task_count} task{group.task_count !== 1 ? 's' : ''}
              </span>
              <Dot />
              <span>last {formatDayShort(group.last_completed_at)}</span>
              {group.unlogged_count > 0 && (
                <>
                  <Dot />
                  <UnloggedNote count={group.unlogged_count} />
                </>
              )}
            </span>
          </span>
        </button>

        <div className="flex flex-[1_1_200px] items-center gap-2.5">
          <ShareBar value={group.total_minutes} max={max} color={hueColor(group.name)} className="flex-1" />
          <span className={cx(MONO, 'w-9 text-right text-[11px] text-[color:var(--text-3)]')}>
            {percentOf(group.total_minutes, total)}%
          </span>
        </div>

        <Duration minutes={group.total_minutes} className="min-w-[5.5rem] text-right text-[17px] font-semibold text-[color:var(--text)]" />

        <button type="button" className={cx(QUIET_BTN, FOCUS, '!h-8')} onClick={() => onOpenProject(group.id)}>
          Project log
        </button>
      </div>

      {open && (
        <div id={panelId}>
          <TaskHead second="Main task" />
          <div className="divide-y divide-[color:var(--border)]">
            {group.tasks.map((t) => (
              <TaskRow key={t.id} projectId={group.id} task={t} secondary={t.parent_title || '—'} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MemberDetailView({ memberId, from, to, onBack, onOpenProject }) {
  const { data, loading, error, refreshing, refreshSilently, retry } = useTimeLogData(
    `/time-log/members/${memberId}`,
    from,
    to,
  );
  useLiveRefetch(TASK_AND_PROJECT_EVENTS, refreshSilently);

  const [openKeys, setOpenKeys] = useState(() => new Set());

  const tasks = data?.tasks || [];
  const member = data?.member;

  const { groups, totals } = useMemo(() => {
    const g = groupByProject(tasks).sort((a, b) => b.total_minutes - a.total_minutes);
    const t = g.reduce(
      (acc, p) => ({
        minutes: acc.minutes + p.total_minutes,
        count: acc.count + p.task_count,
        unlogged: acc.unlogged + p.unlogged_count,
      }),
      { minutes: 0, count: 0, unlogged: 0 },
    );
    return { groups: g, totals: t };
  }, [tasks]);

  const toggle = useCallback((key) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allOpen = groups.length > 0 && groups.every((g) => openKeys.has(g.key));
  const toggleAll = () => setOpenKeys(allOpen ? new Set() : new Set(groups.map((g) => g.key)));

  const exportCsv = () => {
    const rows = tasks
      .slice()
      .sort((a, b) => String(a.project_name).localeCompare(String(b.project_name)) || new Date(b.completed_at) - new Date(a.completed_at))
      .map((t) => [
        t.project_name,
        t.client_name || '',
        t.parent_task_id ? t.parent_title : '',
        t.title,
        formatDayIso(t.completed_at),
        isUnlogged(t) ? '' : minutesOf(t),
        isUnlogged(t) ? '' : toHours(minutesOf(t)),
        isUnlogged(t) ? 'Not logged' : '',
        t.rework_count || 0,
      ]);
    downloadCsv(
      `time-log_${slug(member?.name)}_${fileSuffix(from, to)}.csv`,
      ['Project', 'Client', 'Main task', 'Task', 'Completed (IST)', 'Minutes', 'Hours', 'Note', 'Reworks'],
      rows,
    );
  };

  return (
    <>
      <DetailHeader
        onBack={onBack}
        backLabel="All members"
        mark={member ? <Avatar name={member.name} url={member.avatar_url} size={44} /> : null}
        title={member?.name || (loading ? 'Loading…' : 'Member')}
        subtitle={member?.email || ''}
        badge={member && !member.active ? 'inactive' : null}
        actions={
          <button type="button" className={cx(QUIET_BTN, FOCUS)} onClick={exportCsv} disabled={!tasks.length}>
            <DownloadIcon /> Export CSV
          </button>
        }
        refreshing={refreshing && !loading}
      />

      {loading ? (
        <PageSkeleton />
      ) : error ? (
        <EmptyState
          alert
          title="We couldn't load this member's time"
          action={
            <button type="button" className={cx(QUIET_BTN, FOCUS)} onClick={retry}>
              Try again
            </button>
          }
        >
          Check your connection and try again.
        </EmptyState>
      ) : tasks.length === 0 ? (
        <EmptyState title="No completed tasks in this period">
          {member?.name || 'This member'} has no tasks marked Done in this date range. Try a wider range above.
        </EmptyState>
      ) : (
        <>
          <SummaryBand
            totalMinutes={totals.minutes}
            taskCount={totals.count}
            unlogged={totals.unlogged}
            countLabel="Projects"
            countValue={groups.length}
            segments={toSegments(groups.map((g) => ({ id: g.key, name: g.name, minutes: g.total_minutes })))}
            segmentsTitle="Time by project"
          />
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="m-0 text-[14px] font-semibold text-[color:var(--text)]">Projects</h3>
            <button type="button" className={cx(QUIET_BTN, FOCUS, '!h-8')} onClick={toggleAll}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {groups.map((g, i) => (
              <MemberProjectGroup
                key={g.key}
                index={i}
                group={g}
                open={openKeys.has(g.key)}
                onToggle={toggle}
                max={groups[0]?.total_minutes || 0}
                total={totals.minutes}
                onOpenProject={onOpenProject}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail header                                                              */
/* -------------------------------------------------------------------------- */

function DetailHeader({ onBack, backLabel, mark, title, subtitle, badge, actions, refreshing }) {
  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={onBack}
        className={cx(
          'group mb-4 inline-flex cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent p-0 text-[12.5px] font-medium text-[color:var(--text-3)] transition-colors hover:text-[color:var(--accent)] max-[640px]:min-h-10',
          FOCUS,
        )}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {backLabel}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {mark}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="m-0 text-[22px] font-bold leading-tight tracking-[-0.025em] text-[color:var(--text)] [overflow-wrap:anywhere] [text-wrap:balance]">
                {title}
              </h2>
              {badge && (
                <span className="rounded-[5px] bg-[color:var(--bg-4)] px-1.5 py-px text-[11px] font-semibold capitalize text-[color:var(--text-3)]">
                  {String(badge).replace('_', ' ')}
                </span>
              )}
              {refreshing && <UpdatingDot />}
            </div>
            {subtitle && <div className="mt-0.5 truncate text-[13px] text-[color:var(--text-3)]">{subtitle}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
    </div>
  );
}

function UpdatingDot() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--text-3)]" role="status">
      <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-[color:var(--accent)] motion-reduce:animate-none" />
      Updating
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Lists                                                                      */
/* -------------------------------------------------------------------------- */

function ListError({ retry }) {
  return (
    <EmptyState
      alert
      title="We couldn't load the time log"
      action={
        <button type="button" className={cx(QUIET_BTN, FOCUS)} onClick={retry}>
          Try again
        </button>
      }
    >
      Check your connection and try again.
    </EmptyState>
  );
}

function ProjectsList({ from, to, query, sort, onOpen, setExport }) {
  const { data, loading, error, refreshing, refreshSilently, retry } = useTimeLogData('/time-log/projects', from, to);
  useLiveRefetch(TASK_AND_PROJECT_EVENTS, refreshSilently);

  const all = data?.projects || [];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? all.filter((p) => `${p.name} ${p.client_name || ''}`.toLowerCase().includes(q))
      : all;
    return sortList(list, sort);
  }, [all, query, sort]);

  const totals = useMemo(
    () =>
      all.reduce(
        (acc, p) => ({
          minutes: acc.minutes + p.total_minutes,
          count: acc.count + p.task_count,
          unlogged: acc.unlogged + p.unlogged_count,
        }),
        { minutes: 0, count: 0, unlogged: 0 },
      ),
    [all],
  );

  // Rank by time, whatever the sort: the number tells you where it stands.
  const ranks = useMemo(() => {
    const byTime = [...all].sort((a, b) => b.total_minutes - a.total_minutes);
    return new Map(byTime.map((p, i) => [String(p.id), i + 1]));
  }, [all]);

  // The toolbar's Export button exports what is on screen.
  useEffect(() => {
    setExport(
      visible.length
        ? () =>
            downloadCsv(
              `time-log_projects_${fileSuffix(from, to)}.csv`,
              ['Project', 'Client', 'Status', 'Tasks done', 'Members', 'Minutes', 'Hours', 'Not logged', 'Last completed (IST)'],
              visible.map((p) => [
                p.name,
                p.client_name || '',
                p.status || '',
                p.task_count,
                p.member_count,
                p.total_minutes,
                toHours(p.total_minutes),
                p.unlogged_count,
                formatDayIso(p.last_completed_at),
              ]),
            )
        : null,
    );
  }, [visible, from, to, setExport]);

  const max = useMemo(() => Math.max(0, ...all.map((p) => p.total_minutes)), [all]);

  if (loading) return <PageSkeleton />;
  if (error) return <ListError retry={retry} />;
  if (all.length === 0) {
    return (
      <EmptyState title="No completed tasks in this period">
        Time shows up here once tasks are marked Done. Pick a wider date range above.
      </EmptyState>
    );
  }

  return (
    <>
      <SummaryBand
        totalMinutes={totals.minutes}
        taskCount={totals.count}
        unlogged={totals.unlogged}
        countLabel="Projects"
        countValue={all.length}
        segments={toSegments(all.map((p) => ({ id: p.id, name: p.name, minutes: p.total_minutes })))}
        segmentsTitle="Time by project"
      />
      {visible.length === 0 ? (
        <EmptyState title="No matches">Nothing matches “{query}”. Try a different project or client name.</EmptyState>
      ) : (
        <section className={cx(SURFACE, 'overflow-hidden')} aria-label="Projects">
          <SectionHead title="Projects" count={visible.length}>
            {refreshing && <UpdatingDot />}
          </SectionHead>
          <LedgerHead cols={['Project', 'Share of total']} />
          {visible.map((p, i) => (
            <RankedRow
              key={p.id}
              index={i}
              rank={ranks.get(String(p.id))}
              mark={<ProjectMark name={p.name} />}
              title={p.name}
              subtitle={p.client_name || 'No client'}
              badge={
                p.status && p.status !== 'active' ? (
                  <span className="shrink-0 rounded-[5px] bg-[color:var(--bg-4)] px-1.5 py-px text-[10.5px] font-semibold capitalize text-[color:var(--text-3)]">
                    {String(p.status).replace('_', ' ')}
                  </span>
                ) : null
              }
              minutes={p.total_minutes}
              max={max}
              total={totals.minutes}
              unlogged={p.unlogged_count}
              meta={
                <>
                  <span>
                    {p.task_count} task{p.task_count !== 1 ? 's' : ''}
                  </span>
                  <Dot />
                  <span>
                    {p.member_count} member{p.member_count !== 1 ? 's' : ''}
                  </span>
                  <Dot />
                  <span>last {formatDayShort(p.last_completed_at)}</span>
                </>
              }
              onOpen={() => onOpen(p.id)}
            />
          ))}
        </section>
      )}
    </>
  );
}

function MembersList({ from, to, query, sort, onOpen, setExport }) {
  const { data, loading, error, refreshing, refreshSilently, retry } = useTimeLogData('/time-log/members', from, to);
  useLiveRefetch(TASK_AND_PROJECT_EVENTS, refreshSilently);

  const all = data?.members || [];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? all.filter((m) => `${m.name} ${m.email || ''}`.toLowerCase().includes(q)) : all;
    return sortList(list, sort);
  }, [all, query, sort]);

  const totals = useMemo(
    () =>
      all.reduce(
        (acc, m) => ({
          minutes: acc.minutes + m.total_minutes,
          count: acc.count + m.task_count,
          unlogged: acc.unlogged + m.unlogged_count,
        }),
        { minutes: 0, count: 0, unlogged: 0 },
      ),
    [all],
  );

  const ranks = useMemo(() => {
    const byTime = [...all].sort((a, b) => b.total_minutes - a.total_minutes);
    return new Map(byTime.map((m, i) => [String(m.id), i + 1]));
  }, [all]);

  useEffect(() => {
    setExport(
      visible.length
        ? () =>
            downloadCsv(
              `time-log_members_${fileSuffix(from, to)}.csv`,
              ['Member', 'Email', 'Projects', 'Tasks done', 'Minutes', 'Hours', 'Not logged', 'Last completed (IST)'],
              visible.map((m) => [
                m.name,
                m.email || '',
                m.project_count,
                m.task_count,
                m.total_minutes,
                toHours(m.total_minutes),
                m.unlogged_count,
                formatDayIso(m.last_completed_at),
              ]),
            )
        : null,
    );
  }, [visible, from, to, setExport]);

  const max = useMemo(() => Math.max(0, ...all.map((m) => m.total_minutes)), [all]);

  if (loading) return <PageSkeleton />;
  if (error) return <ListError retry={retry} />;
  if (all.length === 0) {
    return (
      <EmptyState title="No completed tasks in this period">
        Members show up here once tasks assigned to them are marked Done.
      </EmptyState>
    );
  }

  return (
    <>
      <SummaryBand
        totalMinutes={totals.minutes}
        taskCount={totals.count}
        unlogged={totals.unlogged}
        countLabel="Members"
        countValue={all.length}
        segments={toSegments(all.map((m) => ({ id: m.id, name: m.name, minutes: m.total_minutes })))}
        segmentsTitle="Time by member"
      />
      {visible.length === 0 ? (
        <EmptyState title="No matches">Nothing matches “{query}”. Try a different name or email.</EmptyState>
      ) : (
        <section className={cx(SURFACE, 'overflow-hidden')} aria-label="Members">
          <SectionHead title="Members" count={visible.length}>
            {refreshing && <UpdatingDot />}
          </SectionHead>
          <LedgerHead cols={['Member', 'Share of total']} />
          {visible.map((m, i) => (
            <RankedRow
              key={m.id}
              index={i}
              rank={ranks.get(String(m.id))}
              mark={<Avatar name={m.name} url={m.avatar_url} />}
              title={m.name}
              subtitle={m.email}
              badge={
                !m.active ? (
                  <span className="shrink-0 rounded-[5px] bg-[color:var(--bg-4)] px-1.5 py-px text-[10.5px] font-semibold text-[color:var(--text-3)]">
                    Inactive
                  </span>
                ) : null
              }
              minutes={m.total_minutes}
              max={max}
              total={totals.minutes}
              unlogged={m.unlogged_count}
              meta={
                <>
                  <span>
                    {m.project_count} project{m.project_count !== 1 ? 's' : ''}
                  </span>
                  <Dot />
                  <span>
                    {m.task_count} task{m.task_count !== 1 ? 's' : ''}
                  </span>
                  <Dot />
                  <span>last {formatDayShort(m.last_completed_at)}</span>
                </>
              }
              onOpen={() => onOpen(m.id)}
            />
          ))}
        </section>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function TimeLog() {
  const [params, setParams] = useSearchParams();

  const view = params.get('view') === 'members' ? 'members' : 'projects';
  const range = RANGES.some((r) => r.value === params.get('range')) ? params.get('range') : 'all';
  const customFrom = params.get('from') || '';
  const customTo = params.get('to') || '';
  const projectId = params.get('project');
  const memberId = params.get('member');

  const { from, to } = useMemo(() => {
    const r = resolveRange(range, customFrom, customTo);
    // Swap a reversed custom range instead of showing nothing.
    if (r.from && r.to && r.from > r.to) return { from: r.to, to: r.from };
    return r;
  }, [range, customFrom, customTo]);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState('time_desc');
  // List views hand their CSV export up here so the button sits in the toolbar.
  const [exportFn, setExportFn] = useState(null);
  const setExport = useCallback((fn) => setExportFn(() => fn), []);

  // Merge changes into the URL. Detail views push a history entry, so the
  // browser Back button returns to the list.
  const update = useCallback(
    (changes, { push = false } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: !push },
      );
    },
    [setParams],
  );

  const setView = useCallback(
    (v) => {
      setQuery('');
      update({ view: v === 'projects' ? null : v, project: null, member: null });
    },
    [update],
  );

  const setRange = useCallback(
    (r) => {
      if (r === 'custom') {
        // Start the custom range from what is showing now.
        const cur = resolveRange(range, customFrom, customTo);
        const today = istToday();
        update({ range: 'custom', from: cur.from || `${today.slice(0, 8)}01`, to: cur.to || today });
      } else {
        update({ range: r === 'all' ? null : r, from: null, to: null });
      }
    },
    [update, range, customFrom, customTo],
  );

  const openProject = useCallback(
    (id) => update({ view: null, project: String(id), member: null }, { push: true }),
    [update],
  );
  const openMember = useCallback(
    (id) => update({ view: 'members', member: String(id), project: null }, { push: true }),
    [update],
  );
  const backToList = useCallback(() => update({ project: null, member: null }, { push: true }), [update]);

  const inDetail = Boolean(projectId || memberId);
  const today = istToday();

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title !tracking-[-0.03em]">Time log</h1>
          <div className="page-subtitle">
            Time spent on completed tasks
            <span aria-hidden="true" className="mx-1.5 text-[color:var(--border-bright)]">/</span>
            <span className="font-medium text-[color:var(--text)]">{rangeLabel(from, to)}</span>
          </div>
        </div>
      </div>

      <div className="page-body mx-auto w-full max-w-[1320px]">
        {/* Controls */}
        <div className="mb-6 flex flex-col gap-4">
          {!inDetail && (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Tabs label="Show time by" value={view} onChange={setView} options={VIEWS} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Pills label="Date range" value={range} onChange={setRange} options={RANGES} />

            {!inDetail && (
              <div className="flex flex-[1_1_auto] flex-wrap items-center justify-end gap-2 max-[640px]:justify-start">
                <label className="relative flex-[1_1_220px] sm:max-w-[280px]">
                  <SearchIcon />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={view === 'projects' ? 'Search project or client' : 'Search name or email'}
                    aria-label={view === 'projects' ? 'Search projects' : 'Search members'}
                    className={cx(INPUT, 'w-full pl-9')}
                  />
                </label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className={cx(INPUT, 'cursor-pointer pr-8')}
                  aria-label="Sort by"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={cx(QUIET_BTN, FOCUS)}
                  onClick={() => exportFn?.()}
                  disabled={!exportFn}
                >
                  <DownloadIcon /> Export
                </button>
              </div>
            )}
          </div>

          {range === 'custom' && (
            <div className="tl-rise flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-[color:var(--border-bright)] bg-[color:color-mix(in_srgb,var(--bg-3)_50%,transparent)] px-4 py-3">
              <label className="flex flex-col gap-1">
                <span className={LABEL}>From</span>
                <input
                  type="date"
                  className={INPUT}
                  value={customFrom}
                  max={customTo || today}
                  onChange={(e) => update({ from: e.target.value || null })}
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
                  onChange={(e) => update({ to: e.target.value || null })}
                />
              </label>
              <span className="pb-2.5 text-[11.5px] text-[color:var(--text-3)]">Calendar days in IST</span>
            </div>
          )}
        </div>

        {projectId ? (
          <ProjectDetailView
            key={`p-${projectId}`}
            projectId={projectId}
            from={from}
            to={to}
            onBack={backToList}
            onOpenMember={openMember}
          />
        ) : memberId ? (
          <MemberDetailView
            key={`m-${memberId}`}
            memberId={memberId}
            from={from}
            to={to}
            onBack={backToList}
            onOpenProject={openProject}
          />
        ) : view === 'members' ? (
          <MembersList from={from} to={to} query={deferredQuery} sort={sort} onOpen={openMember} setExport={setExport} />
        ) : (
          <ProjectsList from={from} to={to} query={deferredQuery} sort={sort} onOpen={openProject} setExport={setExport} />
        )}
      </div>
    </>
  );
}