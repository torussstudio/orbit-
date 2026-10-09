import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/helpers";
import { useCountUp } from "../utils/motion";
import Modal from "../components/ui/Modal";
import { useLiveRefetch, TASK_AND_PROJECT_EVENTS } from "../hooks/useLiveEvents";

/* ===========================================================================
 * Constants & helpers
 * ========================================================================= */

const REFRESH_MS = 15 * 60 * 1000;

// Hoisted: constructing Intl formatters is expensive, so do it once.
const TODAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long" });

const cx = (...parts) => parts.filter(Boolean).join(" ");

const isAbort = (e) =>
  e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function daysOverdue(due) {
  const t = new Date(due);
  if (isNaN(t)) return null;
  const n = Math.floor((Date.now() - t.getTime()) / 86400000);
  return n > 0 ? n : null;
}

// "2026-10-07" -> local Date (avoids the UTC shift of new Date("YYYY-MM-DD"))
const parseDay = (s) => new Date(`${s}T00:00:00`);

/* ===========================================================================
 * Styles (Tailwind class strings, kept as full literals so the compiler sees them)
 * Keyframes are the only raw CSS; move into tailwind.config.js if you prefer.
 * ========================================================================= */

const KEYFRAMES = `
@keyframes dash-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
@keyframes dash-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes dash-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dash-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
`;

const FOCUS =
  "focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-2";

// Staggered entry (transform + opacity only)
const RISE =
  "[&>*]:animate-[dash-rise_0.5s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:[&>*]:animate-none";
const STAGGER_4 =
  "[&>:nth-child(2)]:[animation-delay:50ms] [&>:nth-child(3)]:[animation-delay:100ms] [&>:nth-child(4)]:[animation-delay:150ms]";
const STAGGER_2 = "[&>:nth-child(2)]:[animation-delay:80ms]";

const GRID_ASYM = `grid grid-cols-1 min-[901px]:grid-cols-[1.4fr_1fr] gap-5 [&>*]:min-w-0 ${RISE} ${STAGGER_2}`;
const GRID_DEV = `grid grid-cols-1 min-[901px]:grid-cols-[2fr_1fr] gap-5 [&>*]:min-w-0 ${RISE} ${STAGGER_2}`;
const STATS_GRID = `stats-grid ${RISE} ${STAGGER_4}`;

const DIVIDE = "divide-y divide-[color:var(--border)]";
const CARD_HEAD = "flex justify-between items-center gap-2.5 mb-4";
const CARD_H = "flex items-center gap-2 m-0 text-[15px] font-semibold tracking-[-0.015em]";

const SKEL =
  "rounded-lg bg-[color:var(--bg-3)] animate-[dash-pulse_1.4s_ease-in-out_infinite] motion-reduce:animate-none";
const SKEL_LINE = `${SKEL} h-3 my-3`;
const FADE_IN = "animate-[dash-fade_0.18s_ease-out_both] motion-reduce:animate-none";
const NOTE = "py-2.5 text-xs text-[color:var(--text-3)]";

const TASK_BASE = `group block no-underline rounded-md transition-colors duration-200 motion-reduce:transition-none ${FOCUS}`;
const TASK_TITLE =
  "min-w-0 text-[13px] font-medium leading-[1.4] text-[color:var(--text)] [overflow-wrap:anywhere] [text-wrap:pretty] underline-offset-[3px] decoration-[color:var(--text-3)] group-hover:underline";
const TASK_META = "mt-[3px] text-[11px] tabular-nums text-[color:var(--text-3)]";

// Slate-tinted shadow so the lift reads as one consistent light source
const LIFT =
  "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-14px_rgba(15,23,42,0.38)] active:translate-y-0 active:scale-[0.985] motion-reduce:transition-none";

const STAT_TONE = {
  success: "text-[color:var(--success)]",
  danger: "text-[color:var(--danger)]",
  warning: "text-[color:var(--warning)]",
  info: "text-[color:var(--accent-2)]",
};

/* ===========================================================================
 * Data hooks
 * ========================================================================= */

// Dashboard payload: cancels stale requests, skips polling while the tab is
// hidden, and refreshes on return if the data is older than REFRESH_MS.
function useDashboardData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const hasData = useRef(false);
  const lastLoaded = useRef(0);
  const controller = useRef(null);

  const load = useCallback(() => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;

    return api
      .get("/dashboard", { signal: c.signal })
      .then((r) => {
        hasData.current = true;
        lastLoaded.current = Date.now();
        setError(false);
        setData(r.data);
      })
      .catch((e) => {
        if (isAbort(e)) return;
        // A failed background refresh keeps the numbers already on screen.
        if (!hasData.current) setError(true);
      })
      .finally(() => {
        if (controller.current === c) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
    // Keeps date-dependent numbers (like overdue) correct on a long-open tab.
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastLoaded.current > REFRESH_MS) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      controller.current?.abort();
      controller.current = null;
    };
  }, [load]);

  const retry = useCallback(() => {
    setError(false);
    setLoading(true);
    load();
  }, [load]);

  // `load` never shows the skeleton again after the first load, so it is
  // also the silent refresh used by live updates.
  return { data, loading, error, retry, refresh: load };
}

// "Total tasks" / "Completed tasks" modal. Latest request wins.
function useTaskModal() {
  const [kind, setKind] = useState(null); // "total" | "completed" | null
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef(null);

  const open = useCallback(async (type) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setKind(type);
    setLoading(true);
    setError(false);
    try {
      const r = await api.get("/dashboard/tasks", {
        ...(type === "completed" ? { params: { stage: "Done" } } : {}),
        signal: c.signal,
      });
      if (controller.current !== c) return;
      setTasks(r.data.tasks || []);
    } catch (e) {
      if (isAbort(e) || controller.current !== c) return;
      setTasks([]);
      setError(true);
    } finally {
      if (controller.current === c) setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setKind(null);
    setTasks([]);
    setError(false);
    setLoading(false);
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return { kind, tasks, loading, error, open, close };
}

// Per-member task lists for the workload accordion (cached after first load).
function useMemberTasks() {
  const [expanded, setExpanded] = useState(null);
  const [tasksById, setTasksById] = useState({});
  const [errors, setErrors] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const controller = useRef(null);
  const expandedRef = useRef(null);
  const tasksRef = useRef(tasksById);
  expandedRef.current = expanded;
  tasksRef.current = tasksById;

  const load = useCallback(async (id) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setLoadingId(id);
    setErrors((prev) => ({ ...prev, [id]: false }));
    try {
      const r = await api.get(`/dashboard/members/${id}/tasks`, { signal: c.signal });
      setTasksById((prev) => ({ ...prev, [id]: r.data.tasks || [] }));
    } catch (e) {
      if (isAbort(e)) return;
      // Not cached, so opening the row again (or Retry) tries again.
      setErrors((prev) => ({ ...prev, [id]: true }));
    } finally {
      if (controller.current === c) setLoadingId(null);
    }
  }, []);

  // Stable identity (reads state through refs) so memoized rows don't re-render.
  const toggle = useCallback(
    (id) => {
      if (expandedRef.current === id) {
        setExpanded(null);
        return;
      }
      setExpanded(id);
      if (!tasksRef.current[id]) load(id);
    },
    [load],
  );

  useEffect(() => () => controller.current?.abort(), []);

  return { expanded, tasksById, errors, loadingId, toggle, retry: load };
}

/* ===========================================================================
 * Small shared components
 * ========================================================================= */

export const StageBadge = memo(function StageBadge({ stage }) {
  const key = stage?.toLowerCase().replace(/\s/g, "");
  return <span className={`badge badge-${key}`}>{stage}</span>;
});

const EMPTY_ICONS = {
  inbox: (
    <>
      <path d="M3 13.5 5.6 5.9A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.4L21 13.5" />
      <path d="M3 13.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18v-4.5h-5.2a1 1 0 0 0-.9.6 3.2 3.2 0 0 1-5.8 0 1 1 0 0 0-.9-.6H3Z" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  cycle: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16.2v.1" />
    </>
  ),
};

function Empty({ title, hint, icon = "inbox", action, role }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-9 text-center" role={role}>
      <span className="mb-2 grid place-items-center size-12 rounded-[14px] bg-[color:var(--bg-3)] text-[color:var(--text-3)]">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {EMPTY_ICONS[icon] || EMPTY_ICONS.inbox}
        </svg>
      </span>
      <span className="text-[13px] font-medium text-[color:var(--text-2)]">{title}</span>
      {hint && (
        <span className="max-w-[28ch] text-xs leading-normal text-[color:var(--text-3)] [text-wrap:balance]">
          {hint}
        </span>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function CardHead({ title, danger, children }) {
  return (
    <div className={CARD_HEAD}>
      <h2 className={cx(CARD_H, danger && "text-[color:var(--danger)]")}>
        {danger && (
          <span
            className="size-[7px] rounded-full shrink-0 bg-[color:var(--danger)]"
            aria-hidden="true"
          />
        )}
        {title}
      </h2>
      {children}
    </div>
  );
}

const Stat = memo(function Stat({ value, label, tone, kind, onSelect }) {
  const valueRef = useCountUp(value);
  const clickable = typeof onSelect === "function";
  const interactive = clickable
    ? {
        role: "button",
        tabIndex: 0,
        onClick: () => onSelect(kind),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(kind);
          }
        },
      }
    : null;

  return (
    <div
      className={cx("stat-card", clickable && `group cursor-pointer ${LIFT} ${FOCUS}`)}
      {...interactive}
    >
      <div
        className={cx(
          "stat-value !text-[34px] !font-semibold !leading-none tabular-nums !tracking-[-0.04em]",
          STAT_TONE[tone],
        )}
      >
        <span ref={valueRef}>{value}</span>
      </div>
      <div className="stat-label mt-2.5 flex items-center gap-1.5">
        {label}
        {clickable && (
          <span
            aria-hidden="true"
            className="text-[11px] opacity-50 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
          >
            →
          </span>
        )}
      </div>
    </div>
  );
});

// One task row, used everywhere a task is listed on the dashboard.
const TaskLink = memo(function TaskLink({
  task,
  size,
  sub,
  prefix,
  suffix,
  onClick,
  className = "",
}) {
  const sm = size === "sm";
  return (
    <Link
      to={`/projects/${task.project_id}/tasks/${task.id}`}
      className={cx(TASK_BASE, sm ? "py-[7px]" : "py-[10px]", className)}
      onClick={onClick}
    >
      <div className="flex justify-between items-center flex-wrap gap-2">
        <span
          className={cx(
            "min-w-0 leading-[1.4] [overflow-wrap:anywhere] [text-wrap:pretty] underline-offset-[3px] decoration-[color:var(--text-3)] group-hover:underline",
            sm ? "text-xs" : "text-[13px]",
            sub
              ? "font-normal text-[color:var(--text-2)]"
              : "font-medium text-[color:var(--text)]",
          )}
        >
          {prefix}
          {task.title}
          {suffix && (
            <small className="ml-1.5 text-[10px] font-normal tabular-nums text-[color:var(--text-3)]">
              {suffix}
            </small>
          )}
        </span>
        <StageBadge stage={task.stage} />
      </div>
      <div className={cx(TASK_META, sub && "text-[10px]")}>
        {task.project_name}
        {task.due_date ? ` · Due ${formatDate(task.due_date)}` : ""}
      </div>
    </Link>
  );
});

const DashSkeleton = memo(function DashSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={STATS_GRID}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat-card">
            <div className={`${SKEL} h-[72px]`} />
          </div>
        ))}
      </div>
      <div className="card mb-5">
        <div className={`${SKEL} h-[360px]`} />
      </div>
      <div className={GRID_ASYM}>
        <div className="card"><div className={`${SKEL} h-[260px]`} /></div>
        <div className="card"><div className={`${SKEL} h-[260px]`} /></div>
      </div>
    </div>
  );
});

/* ===========================================================================
 * Activity chart (manager view, shown first)
 * ========================================================================= */

const CHART_H = 280;
const PAD = { l: 34, r: 16, t: 14, b: 30 };
const TIP_W = 184;

// `key` matches the field on each row of data.activity. `on` = shown by default;
// the rest are toggled from the legend chips. `glow` = area gradient opacity.
// Hex colors are muted on purpose (low saturation, one cool family) so the
// extra series blend in instead of competing with the theme accent.
const SERIES = [
  {
    key: "created",
    label: "Tasks created",
    on: true,
    glow: 0.26,
    stroke: "stroke-[color:var(--accent)]",
    fill: "fill-[color:var(--accent)]",
    stop: "[stop-color:var(--accent)]",
    dot: "bg-[color:var(--accent)]",
  },
  {
    key: "completed",
    label: "Completed",
    on: true,
    glow: 0.18,
    stroke: "stroke-[color:var(--success)]",
    fill: "fill-[color:var(--success)]",
    stop: "[stop-color:var(--success)]",
    dot: "bg-[color:var(--success)]",
  },
  {
    key: "comments",
    label: "Comments",
    on: true,
    glow: 0.12,
    stroke: "stroke-[color:var(--accent-2)]",
    fill: "fill-[color:var(--accent-2)]",
    stop: "[stop-color:var(--accent-2)]",
    dot: "bg-[color:var(--accent-2)]",
  },
  {
    key: "in_progress",
    label: "In progress",
    on: false,
    glow: 0.1,
    stroke: "stroke-[color:var(--warning)]",
    fill: "fill-[color:var(--warning)]",
    stop: "[stop-color:var(--warning)]",
    dot: "bg-[color:var(--warning)]",
  },
  {
    key: "in_review",
    label: "In review",
    on: false,
    glow: 0.1,
    stroke: "stroke-[#5fa8d3]",
    fill: "fill-[#5fa8d3]",
    stop: "[stop-color:#5fa8d3]",
    dot: "bg-[#5fa8d3]",
  },
  {
    key: "rework",
    label: "Sent back",
    on: false,
    glow: 0.1,
    stroke: "stroke-[color:var(--danger)]",
    fill: "fill-[color:var(--danger)]",
    stop: "[stop-color:var(--danger)]",
    dot: "bg-[color:var(--danger)]",
  },
  {
    key: "projects",
    label: "Projects",
    on: false,
    glow: 0.1,
    stroke: "stroke-[#4fb3a5]",
    fill: "fill-[#4fb3a5]",
    stop: "[stop-color:#4fb3a5]",
    dot: "bg-[#4fb3a5]",
  },
];

const DEFAULT_ON = () => new Set(SERIES.filter((s) => s.on).map((s) => s.key));

const DRAW =
  "[stroke-dasharray:1] animate-[dash-draw_1.1s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none";
const AREA_IN = "animate-[dash-fade_0.9s_ease-out_both] motion-reduce:animate-none";

// Glass surface for the tooltip: translucent, blurred, with a slate-tinted
// shadow that matches the rest of the dashboard's light source.
const TIP_SURFACE =
  "bg-[color-mix(in_srgb,var(--bg-3)_82%,transparent)] backdrop-blur-md border border-[color:var(--border)] shadow-[0_18px_36px_-16px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]";

// Monotone cubic curve through the points: smooth, and never dips below the
// data (so a zero day can't swing under the baseline).
function smoothPath(pts) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i].x + h).toFixed(1)} ${(pts[i].y + t[i] * h).toFixed(1)} ${(pts[i + 1].x - h).toFixed(1)} ${(pts[i + 1].y - t[i + 1] * h).toFixed(1)} ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

// Measures the wrapper so the SVG is drawn at real pixel size (text stays crisp
// and the right size instead of scaling with a viewBox).
function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(Math.floor(el.clientWidth));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const ActivityChart = memo(function ActivityChart({ activity }) {
  const gid = useId().replace(/:/g, "");
  const [wrapRef, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const [enabled, setEnabled] = useState(DEFAULT_ON);

  const active = useMemo(() => SERIES.filter((s) => enabled.has(s.key)), [enabled]);

  const toggle = useCallback((key) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Totals for every series (shown on the chips even when a series is off).
  const totals = useMemo(() => {
    const out = {};
    for (const s of SERIES) out[s.key] = activity.reduce((sum, d) => sum + (d[s.key] || 0), 0);
    return out;
  }, [activity]);

  // Hero number: everything currently charted, over the whole window.
  const heroTotal = useMemo(
    () => active.reduce((sum, s) => sum + totals[s.key], 0),
    [active, totals],
  );
  const heroRef = useCountUp(heroTotal);

  const chart = useMemo(() => {
    const n = activity.length;
    if (n < 2 || width < 200 || active.length === 0) return null;

    const peak = Math.max(
      0,
      ...activity.map((d) => Math.max(0, ...active.map((s) => d[s.key] || 0))),
    );
    // Even ceiling so the three gridlines (0, half, max) land on whole numbers.
    const yMax = Math.max(4, Math.ceil(peak / 2) * 2);
    const innerW = width - PAD.l - PAD.r;
    const innerH = CHART_H - PAD.t - PAD.b;
    const base = PAD.t + innerH;
    const step = innerW / (n - 1);

    const x = (i) => PAD.l + i * step;
    const y = (v) => base - (v / yMax) * innerH;

    const shapes = {};
    for (const s of active) {
      const pts = activity.map((d, i) => ({ x: x(i), y: y(d[s.key] || 0) }));
      const line = smoothPath(pts);
      shapes[s.key] = {
        line,
        area: `${line} L${pts[n - 1].x.toFixed(1)} ${base} L${pts[0].x.toFixed(1)} ${base} Z`,
      };
    }

    // Trend compares the selected series: last 7 days vs the 7 before.
    const sumRows = (rows) =>
      rows.reduce((acc, d) => acc + active.reduce((a, s) => a + (d[s.key] || 0), 0), 0);
    const recent = sumRows(activity.slice(-7));
    const before = sumRows(activity.slice(-14, -7));

    return {
      n,
      yMax,
      base,
      innerH,
      step,
      x,
      y,
      shapes,
      ticks: [0, yMax / 2, yMax],
      labelEvery: width < 480 ? 4 : width < 760 ? 3 : 2,
      trend: before > 0 ? Math.round(((recent - before) / before) * 100) : null,
    };
  }, [activity, width, active]);

  const noData =
    activity.length < 2 ||
    activity.every((d) => SERIES.every((s) => !d[s.key]));

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left) / chart.step);
    setHover(Math.min(chart.n - 1, Math.max(0, i)));
  };

  // Keyboard: arrows step through days, Escape / blur clears.
  const onKeyDown = (e) => {
    if (!chart) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      setHover((h) => {
        const from = h === null ? (dir === 1 ? -1 : chart.n) : h;
        return Math.min(chart.n - 1, Math.max(0, from + dir));
      });
    } else if (e.key === "Escape") {
      setHover(null);
    }
  };

  const hd = chart && hover !== null ? activity[hover] : null;
  const hx = hd ? chart.x(hover) : 0;
  const tipX = hd ? (hx + 18 + TIP_W > width - 4 ? hx - 18 - TIP_W : hx + 18) : 0;
  const hdTotal = hd ? active.reduce((sum, s) => sum + (hd[s.key] || 0), 0) : 0;

  const summary = active.map((s) => `${totals[s.key]} ${s.label.toLowerCase()}`).join(", ");

  return (
    <section className="card relative mb-5 overflow-hidden" aria-labelledby="activity-heading">
      {/* ambient glow: depth without a hard edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-24 size-80 rounded-full bg-[color:var(--accent)] opacity-[0.07] blur-3xl"
      />

      <div className="relative">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div>
            <div className="flex items-baseline gap-2.5">
              <h2 id="activity-heading" className={CARD_H}>
                Activity
              </h2>
              <span className="text-xs text-[color:var(--text-3)]">Last 14 days</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span
                ref={heroRef}
                className="text-[38px] font-semibold leading-none tabular-nums tracking-[-0.045em] text-[color:var(--text)]"
              >
                {heroTotal}
              </span>
              {chart?.trend !== null && chart?.trend !== undefined && (
                <span
                  className={cx(
                    "rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums bg-[color:var(--bg-3)]",
                    chart.trend >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]",
                  )}
                  title="Selected series: last 7 days vs the 7 days before"
                >
                  {chart.trend >= 0 ? "↑" : "↓"} {Math.abs(chart.trend)}%
                  <span className="ml-1 font-normal text-[color:var(--text-3)]">vs prior week</span>
                </span>
              )}
            </div>
          </div>

          <ul className="m-0 flex max-w-[560px] list-none flex-wrap items-center gap-1.5 p-0">
            {SERIES.map((s) => {
              const on = enabled.has(s.key);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s.key)}
                    className={cx(
                      "flex cursor-pointer items-center gap-2 rounded-lg border-0 px-2.5 py-1.5 text-[11px] tabular-nums transition-[opacity,background-color,transform] duration-200 hover:bg-[color:var(--bg-3)] active:scale-[0.97] motion-reduce:transition-none",
                      FOCUS,
                      on
                        ? "bg-[color:var(--bg-3)] text-[color:var(--text-2)]"
                        : "bg-transparent text-[color:var(--text-3)] opacity-60 hover:opacity-100",
                    )}
                  >
                    <span
                      className={cx(
                        "size-[7px] shrink-0 rounded-full",
                        on
                          ? s.dot
                          : "border border-[color:var(--text-3)] bg-transparent",
                      )}
                      aria-hidden="true"
                    />
                    {s.label}
                    <span
                      className={cx(
                        "font-semibold",
                        on ? "text-[color:var(--text)]" : "text-[color:var(--text-3)]",
                      )}
                    >
                      {totals[s.key]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div ref={wrapRef} className="relative w-full">
          {noData ? (
            <Empty
              title="No activity yet"
              hint="Task, comment and project activity from the last 14 days will be charted here."
              icon="cycle"
            />
          ) : active.length === 0 ? (
            <Empty
              title="No series selected"
              hint="Turn on at least one series above to see it charted."
              icon="cycle"
            />
          ) : (
            chart && (
              <>
                <svg
                  width={width}
                  height={CHART_H}
                  className={cx("block overflow-visible rounded-lg", FOCUS)}
                  role="img"
                  tabIndex={0}
                  onKeyDown={onKeyDown}
                  onBlur={() => setHover(null)}
                  aria-label={`Activity over the last 14 days: ${summary}. Use the left and right arrow keys to inspect each day.`}
                >
                  <defs>
                    {active.map((s) => (
                      <linearGradient
                        key={s.key}
                        id={`${gid}-${s.key}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopOpacity={s.glow} className={s.stop} />
                        <stop offset="85%" stopOpacity="0" className={s.stop} />
                      </linearGradient>
                    ))}
                  </defs>

                  {/* gridlines + y labels */}
                  {chart.ticks.map((t) => (
                    <g key={t}>
                      <line
                        x1={PAD.l}
                        x2={width - PAD.r}
                        y1={chart.y(t)}
                        y2={chart.y(t)}
                        className="stroke-[color:var(--border)]"
                        strokeWidth="1"
                        strokeDasharray={t === 0 ? undefined : "1 6"}
                        strokeLinecap="round"
                        opacity={t === 0 ? 0.9 : 0.8}
                      />
                      <text
                        x={PAD.l - 12}
                        y={chart.y(t)}
                        textAnchor="end"
                        dominantBaseline="middle"
                        className="fill-[color:var(--text-3)] text-[10px] tabular-nums"
                      >
                        {t}
                      </text>
                    </g>
                  ))}

                  {/* x labels, counted back from today so today is always labelled */}
                  {activity.map((d, i) =>
                    (chart.n - 1 - i) % chart.labelEvery === 0 ? (
                      <text
                        key={d.day}
                        x={chart.x(i)}
                        y={CHART_H - 8}
                        textAnchor="middle"
                        className={cx(
                          "text-[11px]",
                          i === chart.n - 1 || i === hover
                            ? "fill-[color:var(--text)] font-medium"
                            : "fill-[color:var(--text-3)]",
                        )}
                      >
                        {DAY_FORMAT.format(parseDay(d.day))}
                      </text>
                    ) : null,
                  )}

                  {/* hover column: soft band behind the lines */}
                  {hd && (
                    <rect
                      x={hx - chart.step / 2}
                      y={PAD.t}
                      width={chart.step}
                      height={chart.innerH}
                      rx="10"
                      className="pointer-events-none fill-[color:var(--text-3)] opacity-[0.08]"
                    />
                  )}

                  {/* areas (first series drawn last so it sits on top) */}
                  {[...active].reverse().map((s) => (
                    <path
                      key={s.key}
                      d={chart.shapes[s.key].area}
                      fill={`url(#${gid}-${s.key})`}
                      className={AREA_IN}
                    />
                  ))}

                  {/* lines (draw in on load) */}
                  {[...active].reverse().map((s) => (
                    <path
                      key={s.key}
                      d={chart.shapes[s.key].line}
                      pathLength="1"
                      fill="none"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={cx(s.stroke, DRAW)}
                    />
                  ))}

                  {/* today: a quiet pulsing dot at the end of every line */}
                  {!hd &&
                    active.map((s) => {
                      const cx0 = chart.x(chart.n - 1);
                      const cy0 = chart.y(activity[chart.n - 1][s.key] || 0);
                      return (
                        <g key={s.key} aria-hidden="true" className="pointer-events-none">
                          <circle
                            cx={cx0}
                            cy={cy0}
                            r="7"
                            className={cx(
                              s.fill,
                              "origin-center opacity-25 [transform-box:fill-box] animate-ping motion-reduce:animate-none",
                            )}
                          />
                          <circle
                            cx={cx0}
                            cy={cy0}
                            r="3.5"
                            strokeWidth="2"
                            className={cx(s.fill, "stroke-[color:var(--bg-2,var(--bg-3))]")}
                          />
                        </g>
                      );
                    })}

                  {/* hover: crosshair + points */}
                  {hd && (
                    <g aria-hidden="true" className="pointer-events-none">
                      <line
                        x1={hx}
                        x2={hx}
                        y1={PAD.t}
                        y2={chart.base}
                        strokeWidth="1"
                        className="stroke-[color:var(--text-3)] opacity-40"
                      />
                      {active.map((s) => (
                        <g key={s.key}>
                          <circle
                            cx={hx}
                            cy={chart.y(hd[s.key] || 0)}
                            r="9"
                            className={cx(s.fill, "opacity-15")}
                          />
                          <circle
                            cx={hx}
                            cy={chart.y(hd[s.key] || 0)}
                            r="4"
                            strokeWidth="2.5"
                            className={cx(s.fill, "stroke-[color:var(--bg-2,var(--bg-3))]")}
                          />
                        </g>
                      ))}
                    </g>
                  )}

                  {/* pointer surface (covers the plot, one column per day) */}
                  <rect
                    x={PAD.l - chart.step / 2}
                    y={PAD.t}
                    width={width - PAD.l - PAD.r + chart.step}
                    height={chart.base - PAD.t}
                    className="fill-transparent"
                    onPointerMove={onMove}
                    onPointerDown={onMove}
                    onPointerLeave={() => setHover(null)}
                  />
                </svg>

                {/* tooltip: HTML so it can use real glass (blur) styling */}
                {hd && (
                  <div
                    aria-hidden="true"
                    className={cx(
                      "pointer-events-none absolute left-0 top-2 z-10 rounded-xl p-3 transition-transform duration-100 ease-out motion-reduce:transition-none",
                      TIP_SURFACE,
                    )}
                    style={{ width: TIP_W, transform: `translate3d(${tipX}px, 0, 0)` }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[color:var(--text)]">
                        {DAY_FORMAT.format(parseDay(hd.day))}
                      </span>
                      <span className="text-[10px] text-[color:var(--text-3)]">
                        {WEEKDAY_FORMAT.format(parseDay(hd.day))}
                      </span>
                    </div>
                    <ul className="m-0 mt-2.5 flex list-none flex-col gap-1.5 p-0">
                      {active.map((s) => (
                        <li
                          key={s.key}
                          className="flex items-center justify-between gap-3 text-[11px]"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-[color:var(--text-3)]">
                            <span className={cx("size-[6px] shrink-0 rounded-full", s.dot)} />
                            <span className="truncate">{s.label}</span>
                          </span>
                          <span className="font-semibold tabular-nums text-[color:var(--text)]">
                            {hd[s.key] || 0}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {active.length > 1 && (
                      <div className="mt-2.5 flex items-center justify-between border-t border-[color:var(--border)] pt-2 text-[11px]">
                        <span className="text-[color:var(--text-3)]">Total</span>
                        <span className="font-semibold tabular-nums text-[color:var(--text)]">
                          {hdTotal}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>
    </section>
  );
});

/* ===========================================================================
 * Page
 * ========================================================================= */

export default function Dashboard() {
  const { user, isManager } = useAuth();
  const { data, loading, error, retry, refresh } = useDashboardData();

  // Live updates: a task or project changed (for example a member moved a
  // task to In Review). Numbers and lists update in place.
  useLiveRefetch(TASK_AND_PROJECT_EVENTS, refresh);
  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title m-0 !text-[30px] !font-semibold !leading-[1.1] !tracking-[-0.035em] [text-wrap:balance]">
            Good {getGreeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <div className="page-subtitle mt-1.5 tabular-nums">
            {TODAY_FORMAT.format(new Date())}
          </div>
        </div>
      </div>

      <div className="page-body" aria-busy={loading}>
        {loading ? (
          <DashSkeleton />
        ) : error ? (
          <div className="card">
            <Empty
              role="alert"
              icon="alert"
              title="We couldn't load your dashboard"
              hint="Check your connection and try again."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
                  Try again
                </button>
              }
            />
          </div>
        ) : isManager ? (
          <ManagerDash data={data} />
        ) : (
          <DevDash data={data} />
        )}
      </div>
    </>
  );
}

/* ===========================================================================
 * Manager view
 * ========================================================================= */

const ProjectRow = memo(function ProjectRow({ project: p }) {
  const pct = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0;
  return (
    <Link
      to={`/projects/${p.id}`}
      className={`block -mx-3 px-3 pt-3 pb-3.5 rounded-xl no-underline transition-colors duration-200 hover:bg-[color:var(--bg-3)] active:scale-[0.995] motion-reduce:transition-none ${FOCUS}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="min-w-0 text-[13px] font-medium text-[color:var(--text)] truncate">
          {p.name}
        </span>
        <span
          className={cx(
            "shrink-0 font-[family-name:var(--font-mono)] text-[11px] tabular-nums",
            pct === 100 ? "text-[color:var(--success)]" : "text-[color:var(--text-3)]",
          )}
        >
          {pct}%
        </span>
      </div>
      <div
        className="progress-bar !h-1.5 !rounded-full overflow-hidden"
        role="progressbar"
        aria-label={`${p.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="progress-fill !rounded-full w-full origin-left scale-x-[var(--pct,0)] transition-transform duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ "--pct": pct / 100 }}
        />
      </div>
      <div className="mt-2 text-[11px] tabular-nums text-[color:var(--text-3)]">
        {p.done_tasks} of {p.total_tasks} tasks done
      </div>
    </Link>
  );
});

const WorkloadRow = memo(function WorkloadRow({
  member: w,
  load,
  isFirst,
  isOpen,
  prevOpen,
  tasks,
  hasError,
  isLoading,
  onToggle,
  onRetry,
}) {
  const panelId = `workload-panel-${w.id}`;
  return (
    <div
      className={
        isFirst
          ? ""
          : cx("border-t", prevOpen ? "border-transparent" : "border-[color:var(--border)]")
      }
    >
      <button
        type="button"
        className={`flex justify-between items-center gap-3 w-[calc(100%+24px)] -mx-3 px-3 py-2.5 text-left bg-transparent border-0 rounded-xl cursor-pointer transition-colors duration-200 hover:bg-[color:var(--bg-3)] active:scale-[0.995] motion-reduce:transition-none max-[480px]:flex-wrap ${FOCUS}`}
        onClick={() => onToggle(w.id)}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className="user-avatar size-8 p-0 !rounded-[10px] overflow-hidden shrink-0 text-[11px]"
            aria-hidden="true"
          >
            {w.avatar_url ? (
              <img
                src={w.avatar_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="block size-full object-cover"
              />
            ) : (
              (w.name || "?")[0]
            )}
          </span>
          <span className="text-[13px] font-medium truncate">{w.name}</span>
        </span>
        <span className="flex items-center gap-3 shrink-0 max-[480px]:text-xs">
          <span
            className="hidden sm:block w-16 h-1 rounded-full overflow-hidden bg-[color:var(--border)]"
            aria-hidden="true"
          >
            <span
              className="block h-full w-full origin-left rounded-full bg-[color:var(--accent)] opacity-70 transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${load})` }}
            />
          </span>
          <span className="min-w-[56px] text-right font-[family-name:var(--font-mono)] text-[13px] tabular-nums text-[color:var(--accent)] whitespace-nowrap">
            {w.task_count} tasks
          </span>
          <span
            className={cx(
              "text-[10px] text-[color:var(--text-3)] transition-transform duration-200 motion-reduce:transition-none",
              isOpen && "rotate-180",
            )}
            aria-hidden="true"
          >
            ▼
          </span>
        </span>
      </button>

      {isOpen && (
        <div
          className={cx(
            "max-h-[240px] overflow-y-auto mb-2 px-3 py-0.5 rounded-xl bg-[color:var(--bg-3)]",
            DIVIDE,
            FADE_IN,
          )}
          id={panelId}
        >
          {isLoading || (!tasks && !hasError) ? (
            <div aria-hidden="true">
              <div className={SKEL_LINE} />
              <div className={SKEL_LINE} />
            </div>
          ) : hasError ? (
            <div className={NOTE} role="alert">
              We couldn't load these tasks.
              <button
                type="button"
                className="btn btn-ghost btn-sm ml-2"
                onClick={() => onRetry(w.id)}
              >
                Retry
              </button>
            </div>
          ) : tasks.length === 0 ? (
            <div className={NOTE}>No active tasks</div>
          ) : (
            tasks.map((t) => <TaskLink key={t.id} task={t} size="sm" />)
          )}
        </div>
      )}
    </div>
  );
});

const OverdueRow = memo(function OverdueRow({ task: t }) {
  const late = daysOverdue(t.due_date);
  return (
    <Link
      to={`/projects/${t.project_id}/tasks/${t.id}`}
      className={`${TASK_BASE} px-3 py-[10px] hover:bg-[color:var(--bg-3)]`}
    >
      {t.parent_title && (
        <div className="flex items-center gap-1 mb-0.5 text-[10px] text-[color:var(--text-3)]">
          <span aria-hidden="true">•</span>
          {t.parent_title}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className={TASK_TITLE}>{t.title}</div>
        {late && (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[color:var(--danger)]">
            {late}d late
          </span>
        )}
      </div>
      <div className={cx(TASK_META, "text-[color:var(--danger)]")}>
        {t.project_name} · Due {formatDate(t.due_date)} · {t.assignee_name || "Unassigned"}
      </div>
    </Link>
  );
});

const EMPTY_LIST = [];

function ManagerDash({ data }) {
  const modal = useTaskModal();
  const members = useMemberTasks();

  const { totalProjects, totalTasks, doneTasks, overdueCount } = useMemo(
    () => ({
      totalProjects: data?.total_projects ?? data?.projects?.length ?? 0,
      totalTasks:
        data?.total_main_tasks ??
        data?.tasks_by_stage?.reduce((s, r) => s + parseInt(r.count, 10), 0) ??
        0,
      doneTasks: parseInt(
        data?.tasks_by_stage?.find((r) => r.stage === "Done")?.count || 0,
        10,
      ),
      overdueCount: data?.overdue_count ?? data?.overdue_tasks?.length ?? 0,
    }),
    [data],
  );

  // Sorted copy (never mutates the payload): most tasks first.
  const { sortedWorkload, maxLoad } = useMemo(() => {
    const sorted = data?.workload
      ? [...data.workload].sort((a, b) => b.task_count - a.task_count)
      : [];
    return {
      sortedWorkload: sorted,
      maxLoad: Math.max(1, ...sorted.map((w) => Number(w.task_count) || 0)),
    };
  }, [data?.workload]);

  if (!data) return null;

  const modalTitle = modal.kind === "completed" ? "Completed tasks" : "Total tasks";

  return (
    <>
      <div className={STATS_GRID}>
        <Stat value={totalProjects} label="Active projects" />
        <Stat value={totalTasks} label="Total tasks" kind="total" onSelect={modal.open} />
        <Stat
          value={doneTasks}
          label="Completed tasks"
          tone="success"
          kind="completed"
          onSelect={modal.open}
        />
        <Stat value={overdueCount} label="Overdue tasks" tone="danger" />
      </div>

      <ActivityChart activity={data.activity ?? EMPTY_LIST} />

      <div className={`${GRID_ASYM} mb-5`}>
        <section className="card">
          <CardHead title="Projects">
            <Link to="/projects" className="btn btn-ghost btn-sm">
              View all
            </Link>
          </CardHead>
          {!data.projects?.length ? (
            <Empty
              title="No projects yet"
              hint="Projects you create will show their progress here."
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {data.projects.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <CardHead title="Team workload" />
          {sortedWorkload.length === 0 ? (
            <Empty
              title="No members yet"
              hint="Assigned work will be balanced across the team here."
            />
          ) : (
            sortedWorkload.map((w, i) => (
              <WorkloadRow
                key={w.id}
                member={w}
                load={(Number(w.task_count) || 0) / maxLoad}
                isFirst={i === 0}
                isOpen={members.expanded === w.id}
                prevOpen={i > 0 && members.expanded === sortedWorkload[i - 1].id}
                tasks={members.tasksById[w.id]}
                hasError={!!members.errors[w.id]}
                isLoading={members.loadingId === w.id}
                onToggle={members.toggle}
                onRetry={members.retry}
              />
            ))
          )}
        </section>
      </div>

      <div className={GRID_ASYM}>
        <section className="card">
          <CardHead title="Overdue tasks" danger>
            {!!data.overdue_tasks?.length && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums text-[color:var(--danger)] bg-[color:var(--bg-3)]">
                {data.overdue_tasks.length}
              </span>
            )}
          </CardHead>
          {!data.overdue_tasks?.length ? (
            <Empty title="Nothing is overdue" hint="Every task is on schedule." icon="check" />
          ) : (
            // -mx-3 here + px-3 on rows keeps the hover background unclipped
            <div className={cx("-mx-3 max-h-[340px] overflow-y-auto", DIVIDE)}>
              {data.overdue_tasks.map((t) => (
                <OverdueRow key={t.id} task={t} />
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <CardHead title="Rework tracker" />
          {!data.cluster_rework?.length ? (
            <Empty
              title="No rework cycles yet"
              hint="Tasks sent back for changes will be counted here."
              icon="cycle"
            />
          ) : (
            <div className={DIVIDE}>
              {data.cluster_rework.map((c) => (
                <div key={c.id} className="flex justify-between items-center gap-2 py-[10px]">
                  <span className="min-w-0 text-[13px] font-medium truncate">{c.name}</span>
                  <span className="rework-counter shrink-0 tabular-nums">
                    <span className="rework-count">↺ {c.rework_count}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {modal.kind && (
        <Modal
          title={
            modal.loading || modal.error ? modalTitle : `${modalTitle} (${modal.tasks.length})`
          }
          onClose={modal.close}
        >
          <div className="max-h-[60vh] overflow-y-auto">
            {modal.loading ? (
              <div aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={SKEL_LINE} />
                ))}
              </div>
            ) : modal.error ? (
              <Empty
                role="alert"
                icon="alert"
                title="We couldn't load these tasks"
                action={
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => modal.open(modal.kind)}
                  >
                    Try again
                  </button>
                }
              />
            ) : modal.tasks.length === 0 ? (
              <Empty title="No tasks found" />
            ) : (
              <div className={DIVIDE}>
                {modal.tasks.map((t) => (
                  <TaskLink key={t.id} task={t} onClick={modal.close} />
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ===========================================================================
 * Developer view
 * ========================================================================= */

const TaskTreeItem = memo(function TaskTreeItem({ task, subtasks, isOpen, onToggle }) {
  const count = subtasks.length;
  const hasSubtasks = count > 0;
  const treeId = `dash-subtree-${task.id}`;
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-1.5">
        {hasSubtasks ? (
          <button
            type="button"
            className={`shrink-0 size-[22px] mt-2.5 p-0 text-[11px] text-[color:var(--text-3)] bg-transparent border-0 rounded-md cursor-pointer transition-[background-color,color,transform] duration-150 hover:text-[color:var(--text)] hover:bg-[color:var(--bg-3)] active:scale-90 motion-reduce:transition-none ${FOCUS}`}
            onClick={() => onToggle(task.id)}
            aria-expanded={isOpen}
            aria-controls={treeId}
            aria-label={`${isOpen ? "Hide" : "Show"} ${count} sub-task${count !== 1 ? "s" : ""}`}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-[22px] shrink-0" aria-hidden="true" />
        )}
        <TaskLink
          task={task}
          className="flex-1 min-w-0"
          suffix={hasSubtasks ? `(${count})` : null}
        />
      </div>
      {hasSubtasks && isOpen && (
        <div
          className={cx(
            "mb-1 ml-2.5 pl-4 border-l-2 border-l-[color:var(--border)]",
            DIVIDE,
            FADE_IN,
          )}
          id={treeId}
        >
          {subtasks.map((st) => (
            <TaskLink key={st.id} task={st} size="sm" sub prefix="↳ " />
          ))}
        </div>
      )}
    </div>
  );
});

function DevDash({ data }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const myTasks = data?.my_tasks ?? EMPTY_LIST;

  // Main tasks, sub-tasks nested under their parent, and orphan sub-tasks
  // (parent assigned to someone else) shown as their own rows so none hide.
  const { mainTasks, subtasksByParent, orphanSubtasks } = useMemo(() => {
    const main = myTasks.filter((t) => !t.parent_task_id);
    const mainIds = new Set(main.map((t) => t.id));
    const byParent = {};
    const orphans = [];
    for (const t of myTasks) {
      if (!t.parent_task_id) continue;
      if (mainIds.has(t.parent_task_id)) (byParent[t.parent_task_id] ||= []).push(t);
      else orphans.push(t);
    }
    return { mainTasks: main, subtasksByParent: byParent, orphanSubtasks: orphans };
  }, [myTasks]);

  // Stat cards count every task assigned to this member (main tasks AND
  // sub-tasks): a member's work is often entirely sub-tasks.
  const byStage = useMemo(() => {
    const counts = {};
    for (const t of myTasks) counts[t.stage] = (counts[t.stage] || 0) + 1;
    return counts;
  }, [myTasks]);

  const toggleExpanded = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!data) return null;

  return (
    <>
      <div className={STATS_GRID}>
        <Stat value={myTasks.length} label="My active tasks" />
        <Stat value={byStage["In Progress"] || 0} label="In progress" tone="warning" />
        <Stat value={byStage["In Review"] || 0} label="In review" tone="info" />
        <Stat value={data.overdue_tasks?.length || 0} label="Overdue" tone="danger" />
      </div>

      <div className={GRID_DEV}>
        <section className="card">
          <CardHead title="My tasks" />
          {mainTasks.length === 0 && orphanSubtasks.length === 0 ? (
            <Empty title="No tasks assigned" hint="New assignments will appear here." icon="check" />
          ) : (
            <div className={DIVIDE}>
              {mainTasks.map((t) => (
                <TaskTreeItem
                  key={t.id}
                  task={t}
                  subtasks={subtasksByParent[t.id] || EMPTY_LIST}
                  isOpen={expandedIds.has(t.id)}
                  onToggle={toggleExpanded}
                />
              ))}
              {orphanSubtasks.map((st) => (
                <div key={st.id} className="flex items-start gap-1.5">
                  <span className="w-[22px] shrink-0" aria-hidden="true" />
                  <TaskLink task={st} className="flex-1 min-w-0" suffix="(sub-task)" />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <CardHead title="Recent comments" />
          {!data.recent_comments?.length ? (
            <Empty
              title="No recent activity"
              hint="Comments on your tasks will show up here."
            />
          ) : (
            <div className={DIVIDE}>
              {data.recent_comments.map((c) => (
                <div key={c.id} className="flex gap-3 py-3">
                  <span
                    className="size-7 shrink-0 grid place-items-center rounded-[9px] bg-[color:var(--bg-3)] text-[11px] font-semibold text-[color:var(--accent)]"
                    aria-hidden="true"
                  >
                    {(c.author_name || "?")[0]}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[color:var(--text)]">
                      {c.author_name}
                    </div>
                    <div className="my-0.5 text-xs leading-[1.55] text-[color:var(--text-2)] [overflow-wrap:anywhere] [text-wrap:pretty] line-clamp-3">
                      {c.content}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-3)]">
                      on {c.task_title}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}