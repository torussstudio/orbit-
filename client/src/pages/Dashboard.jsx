import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      <div className={GRID_ASYM}>
        <div className="card"><div className={`${SKEL} h-[260px]`} /></div>
        <div className="card"><div className={`${SKEL} h-[260px]`} /></div>
      </div>
    </div>
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

const EMPTY_LIST = [];

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