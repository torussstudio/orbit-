import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";
import Select from "../components/ui/Select";
import ConfirmModal from "../components/ui/ConfirmModal";
import ProjectLinks from "../components/projects/ProjectLinks";
import { useLiveRefetch, TASK_AND_PROJECT_EVENTS } from "../hooks/useLiveEvents";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

// Todo / In Progress switch instantly. In Review needs a time-taken value first
// (see handleStageSelect). "Done" is intentionally missing: members can't mark
// tasks Done, that needs manager approval.
const QUICK_STAGES = ["Todo", "In Progress", "In Review"];

// "Done" is included so members can see approved tasks. Done tasks are hidden
// from "All" and only show under Done.
const STATUS_FILTERS = ["all", "Todo", "In Progress", "In Review", "Done"];

// The tab that is selected when the page opens (and after "Reset filters").
const DEFAULT_STATUS = "Todo";

const SKELETON_ROWS = [0, 1, 2, 3, 4];

// Rows rendered at once. Long lists grow in steps via "Show more", so the first
// paint and every filter change stay cheap no matter how many tasks exist.
const PAGE_SIZE = 40;

// "In Progress" -> "inprogress" (used for the global `badge-*` classes).
const stageKey = (s) => s?.toLowerCase().replace(/\s/g, "");

// Full class literals so Tailwind's scanner can see them.
const DOT_COLOR = {
  todo: "bg-[#a78bfa]",
  inprogress: "bg-[#f59e0b]",
  inreview: "bg-[#3b82f6]",
  done: "bg-[#10b981]",
};

// Keyframes for the dropdown, skeleton shimmer and notice. Both only animate
// transform / opacity, so they stay on the GPU. (Or move them to
// tailwind.config.js -> theme.extend.keyframes and drop this <style> tag.)
const KEYFRAMES = `
@keyframes tv-pop { from { opacity: 0; transform: scale(.96) translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes tv-fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes tv-shimmer { to { transform: translateX(100%); } }
`;

const DAY_MS = 86400000;

// Local midnight, computed once per calendar day instead of once per row.
let todayCache = { key: "", ms: 0 };
function startOfToday() {
  const now = new Date();
  const key = now.toDateString();
  if (todayCache.key !== key) {
    now.setHours(0, 0, 0, 0);
    todayCache = { key, ms: now.getTime() };
  }
  return todayCache.ms;
}

const DUE_TONE = {
  overdue: "font-semibold text-[color:var(--danger)]",
  soon: "font-medium text-[hsl(32_80%_36%)]",
  normal: "",
};

// Relative due label: "3d overdue", "Due today", "Due tomorrow", otherwise the date.
function dueChip(due, overdue, done) {
  const plain = { label: `Due ${formatDate(due)}`, tone: "normal" };
  const d = new Date(due);
  if (done || Number.isNaN(d.getTime())) return overdue ? { ...plain, tone: "overdue" } : plain;
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - startOfToday()) / DAY_MS);
  if (overdue) return { label: diff < 0 ? `${-diff}d overdue` : "Overdue", tone: "overdue" };
  if (diff === 0) return { label: "Due today", tone: "soon" };
  if (diff === 1) return { label: "Due tomorrow", tone: "soon" };
  return plain;
}

// Stable hue per project name (cached), so each project chip keeps its dot colour.
const hueCache = new Map();
function hueOf(seed) {
  const str = String(seed ?? "");
  let h = hueCache.get(str);
  if (h === undefined) {
    h = 0;
    for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 360;
    hueCache.set(str, h);
  }
  return h;
}

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";

// One grouped surface with hairline dividers; rows round only at the ends
// (no overflow-hidden, so the stage menu can open past the last row).
const LIST =
  "m-0 p-0 list-none rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-2)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]";
const ITEM =
  "relative group border-t border-[color:var(--border)] first:border-t-0 first:rounded-t-xl last:rounded-b-xl [&:has([role=menu])]:z-[5]";
const ROW_PAD = "px-5 py-4 max-[640px]:px-4 max-[640px]:py-3.5";

const SKEL =
  "relative overflow-hidden rounded-md bg-[color:var(--bg-3)] after:content-[''] after:absolute after:inset-0 after:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)] after:[transform:translateX(-100%)] after:[animation:tv-shimmer_1.4s_ease-in-out_infinite] motion-reduce:after:[animation:none]";

const isAbort = (e) =>
  e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function Dot({ stage, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${DOT_COLOR[stageKey(stage)] || "bg-[color:var(--text-3)]"} ${className}`}
    />
  );
}

const StageDropdown = memo(function StageDropdown({ task, onChange, locked = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);

  // Listeners exist only while the menu is open.
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Done tasks are approved by a manager: members see a plain badge, no dropdown.
  if (locked) {
    return <span className={`badge badge-${stageKey(task.stage)} shrink-0`}>{task.stage}</span>;
  }

  return (
    <div ref={ref} className="relative z-[2] shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Stage: ${task.stage}. Change stage`}
        className={`badge badge-${stageKey(task.stage)} inline-flex cursor-pointer items-center border-0 px-3 py-1.5 text-xs font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.18)] ring-1 ring-inset ring-[color:color-mix(in_srgb,currentColor_30%,transparent)] max-sm:min-h-8 max-[640px]:relative max-[640px]:after:absolute max-[640px]:after:-inset-2.5 max-[640px]:after:content-[''] transition-[transform,filter] duration-150 [font-family:inherit] hover:brightness-95 active:scale-[0.97] motion-reduce:transition-none ${FOCUS}`}
        onClick={() => setOpen((p) => !p)}
      >
        {task.stage}
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ml-1.5 inline-block transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        >
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] z-10 min-w-[168px] origin-top-left rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-2)] p-1 shadow-[0_12px_28px_-8px_rgba(15,23,42,0.22)] [animation:tv-pop_.14s_ease-out_both] motion-reduce:[animation:none] sm:left-auto sm:right-0 sm:origin-top-right"
        >
          {QUICK_STAGES.filter((s) => s !== task.stage).map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-2 text-left transition-colors duration-150 [font-family:inherit] hover:bg-[color:var(--bg-3)] max-sm:min-h-10 motion-reduce:transition-none ${FOCUS}`}
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
                onChange(task, s);
              }}
            >
              <Dot stage={s} />
              <span className="text-[13px] font-medium text-[color:var(--text)]">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

const TaskSkeleton = memo(function TaskSkeleton() {
  return (
    <ul className={LIST} aria-hidden="true">
      {SKELETON_ROWS.map((i) => (
        <li key={i} className={ITEM}>
          <div className={`${ROW_PAD} flex items-start justify-between gap-4 [border-radius:inherit]`}>
            <div className="min-w-0 flex-1">
              <div className={`${SKEL} h-3.5 w-[58%]`} />
              <div className="mt-3 flex gap-2">
                <div className={`${SKEL} h-[18px] w-24`} />
                <div className={`${SKEL} h-[18px] w-16`} />
              </div>
            </div>
            <div className={`${SKEL} h-5 w-20 rounded-full`} />
          </div>
        </li>
      ))}
    </ul>
  );
});

const StatusTab = memo(function StatusTab({ status, active, count, onSelect }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(status)}
      className={`inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border-0 py-1.5 pl-3 pr-2 text-xs max-[640px]:min-h-10 tracking-[0.01em] transition-[background-color,color,box-shadow] duration-200 [font-family:inherit] active:scale-[0.98] motion-reduce:transition-none ${FOCUS} ${
        active
          ? "bg-[color:var(--bg-2)] font-semibold text-[color:var(--text)] shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
          : "bg-transparent font-medium text-[color:var(--text-2)] hover:bg-[color:color-mix(in_srgb,var(--bg-2)_55%,transparent)] hover:text-[color:var(--text)]"
      }`}
    >
      {status !== "all" && <Dot stage={status} />}
      {status === "all" ? "All" : status}
      <span
        className={`min-w-[22px] rounded-[5px] px-1.5 py-px text-center text-[11px] font-semibold tabular-nums ${
          active
            ? "bg-[color:var(--bg-3)] text-[color:var(--text-2)]"
            : "bg-[color:color-mix(in_srgb,var(--bg-2)_60%,transparent)] text-[color:var(--text-3)]"
        }`}
      >
        {count}
      </span>
    </button>
  );
});

function EmptyCard({ title, sub, action, alert, icon }) {
  return (
    <div
      className="card !px-4 !pb-[60px] !pt-14 text-center text-[color:var(--text-3)]"
      role={alert ? "alert" : undefined}
    >
      {icon && (
        <div
          className="mb-4 inline-grid size-14 place-items-center rounded-xl bg-[color:var(--bg-3)] text-[color:var(--text-3)]"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <div className="text-[15px] font-semibold tracking-[-0.005em] text-[color:var(--text-2)]">{title}</div>
      {sub && (
        <div className="mx-auto mt-1 max-w-[34ch] text-xs leading-normal [text-wrap:balance]">{sub}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const INBOX_ICON = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 13.5 5.6 5.9A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.4L21 13.5" />
    <path d="M3 13.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18v-4.5h-5.2a1 1 0 0 0-.9.6 3.2 3.2 0 0 1-5.8 0 1 1 0 0 0-.9-.6H3Z" />
  </svg>
);

const TaskRow = memo(function TaskRow({ task: t, locked, onStageSelect, canLogTime, returnTo }) {
  const done = t.stage === "Done";
  const inProgress = t.stage === "In Progress";
  const overdue = !done && isOverdue(t.due_date);
  const due = t.due_date ? dueChip(t.due_date, overdue, done) : null;
  const loggedMinutes = Math.max(0, Number(t.logged_minutes) || 0);
  const loggedHours = Math.floor(loggedMinutes / 60);
  const remainingMinutes = loggedMinutes % 60;

  // The project's Milanote / Docs links, as returned with each task by
  // /dashboard/my-tasks (project_milanote_url, project_docs_url).
  const projectLinks = useMemo(
    () => ({
      name: t.project_name,
      milanote_url: t.project_milanote_url,
      docs_url: t.project_docs_url,
    }),
    [t.project_name, t.project_milanote_url, t.project_docs_url],
  );

  return (
    <li className={ITEM}>
      <article
        className={`relative ${ROW_PAD} transition-colors duration-150 [border-radius:inherit] motion-reduce:transition-none ${
          inProgress
            ? "bg-[color:color-mix(in_srgb,#f59e0b_8%,var(--bg-2))] group-hover:bg-[color:color-mix(in_srgb,#f59e0b_14%,var(--bg-2))]"
            : "group-hover:bg-[color:var(--bg-3)]"
        } ${
          overdue
            ? "before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[3px] before:rounded-full before:bg-[color:var(--danger)] before:content-['']"
            : ""
        }`}
      >
        {/* Small screens: title on top, stage control below it (left aligned).
            sm and up: title left, stage control right. */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            {t.parent_title && (
              <div className="mb-0.5 truncate text-[12px] tracking-[0.01em] text-[#000000]">
                {t.parent_title} ›
              </div>
            )}
            <h2
              className={`m-0 text-[15px] font-normal leading-[1.4] tracking-[-0.01em] [overflow-wrap:anywhere] [text-wrap:balance] ${
                done ? "text-[color:var(--text-2)]" : "text-[color:var(--text)]"
              }`}
            >
              {/* The link's ::after covers the whole row; the stage control and
                  project links sit above it (z-[2] / z-[1]). */}
              <Link
                to={`/projects/${t.project_id}/tasks/${t.id}`}
                className="text-inherit no-underline after:absolute after:inset-0 after:content-[''] after:[border-radius:inherit] focus-visible:outline-none focus-visible:after:[outline-offset:-2px] focus-visible:after:[outline:2px_solid_var(--accent)]"
              >
                {t.title}
              </Link>
            </h2>
          </div>
          <div className="flex shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-col sm:items-end sm:gap-2">
            <StageDropdown task={t} onChange={onStageSelect} locked={locked} />
            {done && (
              <span className="text-left text-[13px] font-semibold leading-tight text-[color:var(--text-2)] tabular-nums sm:text-right">
                Completed · {loggedHours} {loggedHours === 1 ? "hour" : "hours"} {remainingMinutes} {remainingMinutes === 1 ? "minute" : "minutes"}
              </span>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[11px] text-[color:var(--text-3)]">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-[color:var(--bg-3)] px-2 py-0.5 font-medium text-[color:var(--text-2)] group-hover:bg-[color:var(--bg-2)]">
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: `hsl(${hueOf(t.project_name)} 55% 50%)` }}
            />
            <span className="truncate">{t.project_name}</span>
          </span>
          {t.cluster_name && <span className="truncate">{t.cluster_name}</span>}
          {Number(t.my_logged_minutes) > 0 && (
            <span className="relative z-[2] inline-flex items-center rounded-full bg-[color:var(--accent-glow)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--accent)]">
              Logged
            </span>
          )}
          {canLogTime && (
            <Link
              to={`/time-log?project_id=${encodeURIComponent(t.project_id)}&task_id=${encodeURIComponent(t.id)}&return_to=${encodeURIComponent(returnTo)}`}
              aria-label={`Log time for ${t.title}`}
              className={`relative z-[2] inline-flex min-h-7 items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--bg-2)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--text-2)] no-underline transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] max-sm:min-h-9 ${FOCUS}`}
            >
              <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Log time
            </Link>
          )}
          {due && (
            <>
              {t.cluster_name && (
                <span aria-hidden="true" className="opacity-50">
                  ·
                </span>
              )}
              <span className={`tabular-nums ${DUE_TONE[due.tone]}`}>{due.label}</span>
            </>
          )}
          {/* Renders nothing if the project has no links. On small screens the
              links drop to their own full-width line instead of squeezing in. */}
          <ProjectLinks project={projectLinks} className="max-sm:basis-full sm:ml-auto" />
        </div>
      </article>
    </li>
  );
});

// Simple "send to In Review?" confirmation (replaces the old time taken popup).
function ReviewConfirm({ task, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false);
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onConfirm(task);
    if (ok) onClose();
    else setSaving(false);
  };
  return (
    <ConfirmModal
      isOpen
      title="Send to In Review?"
      message={<>Move <strong>{task?.title}</strong> to <strong>In Review</strong>?</>}
      confirmText="Yes, send"
      cancelText="No"
      loadingText="Sending…"
      isDangerous={false}
      loading={saving}
      onCancel={onClose}
      onConfirm={confirm}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

// The project filter is remembered per user, so leaving the page and coming
// back keeps the selection. Storage can be blocked (private mode), so every
// read/write is guarded and the page still works without it.
const projectFilterKey = (userId) => `orbit.taskView.projectFilter.${userId ?? "anon"}`;

function readStoredFilter(key) {
  try {
    return window.localStorage.getItem(key) || "all";
  } catch {
    return "all";
  }
}

function writeStoredFilter(key, value) {
  try {
    if (value === "all") window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable: the filter just won't be remembered */
  }
}

export default function TaskView() {
  const { isManager, user } = useAuth();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const filterKey = projectFilterKey(user?.id);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [projectFilter, setProjectFilter] = useState(() => readStoredFilter(filterKey));
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [reviewTask, setReviewTask] = useState(null);

  const listCtl = useRef(null);
  // Stage changes being saved right now (see liveRefresh).
  const pendingSaves = useRef(0);
  const refreshAfterSave = useRef(false);

  // `silent` is used by live updates: no skeleton and no error screen, the
  // list on screen stays as it is until the new one arrives.
  const load = useCallback(({ silent = false } = {}) => {
    listCtl.current?.abort();
    const controller = new AbortController();
    listCtl.current = controller;
    return api
      .get("/dashboard/my-tasks", { signal: controller.signal })
      .then((r) => setTasks(r.data.tasks || []))
      .catch((e) => {
        if (!isAbort(e) && !silent) setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
    return () => listCtl.current?.abort();
  }, [load]);

  // Live updates: a manager assigned, changed or removed one of my tasks.
  // While one of my own stage changes is still saving, wait for it, so an
  // older list can't briefly undo the change on screen.
  const liveRefresh = useCallback(() => {
    if (pendingSaves.current > 0) {
      refreshAfterSave.current = true;
      return;
    }
    load({ silent: true });
  }, [load]);

  useLiveRefetch(TASK_AND_PROJECT_EVENTS, liveRefresh);

  // Auto-dismiss the inline notice.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // A new filter starts from the first page again.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [statusFilter, projectFilter]);

  /* ---------- derived data ---------- */

  // One pass over all tasks: project options + overdue total.
  const { projectOptions, overdueCount } = useMemo(() => {
    const byId = new Map();
    let overdue = 0;
    for (const t of tasks) {
      byId.set(t.project_id, t.project_name);
      if (t.stage !== "Done" && isOverdue(t.due_date)) overdue += 1;
    }
    const options = Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""),
    );
    return { projectOptions: options, overdueCount: overdue };
  }, [tasks]);

  // Remember the selection.
  useEffect(() => {
    writeStoredFilter(filterKey, projectFilter);
  }, [filterKey, projectFilter]);

  // A remembered project that no longer has any of your tasks falls back to "All".
  useEffect(() => {
    if (loading || loadError || projectFilter === "all") return;
    if (!projectOptions.some((p) => String(p.id) === String(projectFilter))) {
      setProjectFilter("all");
    }
  }, [loading, loadError, projectFilter, projectOptions]);

  // The API already scopes this to the current member (sub tasks and standalone
  // main tasks). Main tasks that use sub tasks aren't assigned directly.
  const projectTasks = useMemo(
    () =>
      projectFilter === "all"
        ? tasks
        : tasks.filter((t) => String(t.project_id) === String(projectFilter)),
    [tasks, projectFilter],
  );

  // One pass: pill counts (follow the project filter) and the visible list.
  // "All" only shows active work; Done tasks appear under the Done filter.
  const { statusCounts, visibleTasks } = useMemo(() => {
    const counts = { all: 0, Todo: 0, "In Progress": 0, "In Review": 0, Done: 0 };
    const list = [];
    for (const t of projectTasks) {
      if (t.stage in counts) counts[t.stage] += 1;
      if (t.stage !== "Done") counts.all += 1;
      const show = statusFilter === "all" ? t.stage !== "Done" : t.stage === statusFilter;
      if (show) list.push(t);
    }
    return { statusCounts: counts, visibleTasks: list };
  }, [projectTasks, statusFilter]);

  const shownTasks = useMemo(() => visibleTasks.slice(0, limit), [visibleTasks, limit]);
  const remaining = visibleTasks.length - shownTasks.length;
  const filtersActive = statusFilter !== DEFAULT_STATUS || projectFilter !== "all";

  /* ---------- actions ---------- */

  // Optimistic update; resolves true on success so the modal knows whether to close.
  const handleStageChange = useCallback(async (task, newStage, extra = {}) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, stage: newStage, ...extra } : t)));
    pendingSaves.current += 1;
    try {
      // Only the changed fields: resending the whole task would also resend
      // its due date, which the server would then store 5 h 30 min earlier.
      await api.put(`/tasks/${task.id}`, { stage: newStage, ...extra });
      return true;
    } catch (err) {
      console.error("Failed to update stage:", err.message);
      // Revert on failure.
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setNotice(`We couldn't move "${task.title}" to ${newStage}. Please try again.`);
      return false;
    } finally {
      pendingSaves.current -= 1;
      // A live update arrived while saving: apply it now.
      if (pendingSaves.current === 0 && refreshAfterSave.current) {
        refreshAfterSave.current = false;
        load({ silent: true });
      }
    }
  }, [load]);

  // In Review asks for a simple confirmation first.
  const handleStageSelect = useCallback(
    (task, newStage) => {
      if (newStage === "In Review") setReviewTask(task);
      else handleStageChange(task, newStage);
    },
    [handleStageChange],
  );

  const confirmReview = useCallback(
    (task) => handleStageChange(task, "In Review"),
    [handleStageChange],
  );
  const closeModal = useCallback(() => setReviewTask(null), []);
  const dismissNotice = useCallback(() => setNotice(""), []);
  const reload = useCallback(() => window.location.reload(), []);
  const showMore = useCallback(() => setLimit((n) => n + PAGE_SIZE), []);
  const resetFilters = useCallback(() => {
    setStatusFilter(DEFAULT_STATUS);
    setProjectFilter("all");
  }, []);

  /* ---------- render ---------- */

  let emptyTitle = "No tasks match these filters";
  if (tasks.length === 0) emptyTitle = "No tasks assigned to you";
  else if (statusFilter === "all") emptyTitle = "No active tasks";

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div className="page-header">
        <div>
          <div className="page-title">Task view</div>
          <div className="page-subtitle">
            Every task assigned to you, across all projects
            {!loading && !loadError && overdueCount > 0 && (
              <span className="ml-2 font-medium tabular-nums text-[color:var(--danger)]">
                · {overdueCount} overdue
              </span>
            )}
          </div>
        </div>
        {projectOptions.length > 0 && (
          <div className="min-w-[200px] max-[640px]:w-full max-[640px]:min-w-0">
            <Select value={projectFilter} onChange={setProjectFilter}>
              <option value="all">All projects</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="page-body" aria-busy={loading}>
        {notice && (
          <div
            className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--bg-2))] px-3.5 py-2.5 text-[13px] leading-[1.45] text-[color:var(--danger)] [animation:tv-fade_.2s_ease-out_both] motion-reduce:[animation:none]"
            role="alert"
          >
            <span>{notice}</span>
            <button
              type="button"
              className={`cursor-pointer rounded border-0 bg-transparent px-1 leading-none text-inherit opacity-70 transition-opacity duration-150 [font:inherit] hover:opacity-100 motion-reduce:transition-none ${FOCUS}`}
              aria-label="Dismiss"
              onClick={dismissNotice}
            >
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <TaskSkeleton />
        ) : loadError ? (
          <EmptyCard
            alert
            title="We couldn't load your tasks"
            sub="Check your connection and try again."
            action={
              <button type="button" className="btn btn-ghost" onClick={reload}>
                Reload
              </button>
            }
          />
        ) : (
          <>
            {tasks.length > 0 && (
              // Small screens: one swipeable row of tabs (no ragged wrapping).
              // sm and up: the original wrapping pill group.
              <div
                className="mb-5 flex w-full max-w-full gap-1 overflow-x-auto rounded-xl bg-[color:var(--bg-3)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:inline-flex sm:w-auto sm:flex-wrap sm:overflow-visible"
                role="group"
                aria-label="Filter by status"
              >
                {STATUS_FILTERS.map((s) => (
                  <StatusTab
                    key={s}
                    status={s}
                    active={statusFilter === s}
                    count={statusCounts[s]}
                    onSelect={setStatusFilter}
                  />
                ))}
              </div>
            )}

            {visibleTasks.length === 0 ? (
              <EmptyCard
                icon={INBOX_ICON}
                title={emptyTitle}
                sub={
                  tasks.length > 0
                    ? statusFilter === "all" && projectFilter === "all"
                      ? "Completed tasks are under the Done tab."
                      : "Try a different status or project."
                    : undefined
                }
                action={
                  tasks.length > 0 && filtersActive ? (
                    <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                      Reset filters
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <ul className={LIST}>
                  {shownTasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      locked={t.stage === "Done" && !isManager}
                      canLogTime={!isManager && !["Done", "In Review"].includes(t.stage)}
                      returnTo={returnTo}
                      onStageSelect={handleStageSelect}
                    />
                  ))}
                </ul>
                {remaining > 0 && (
                  <div className="mt-4 flex justify-center">
                    <button type="button" className="btn btn-ghost" onClick={showMore}>
                      Show more ({remaining} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {reviewTask && (
        <ReviewConfirm task={reviewTask} onClose={closeModal} onConfirm={confirmReview} />
      )}
    </>
  );
}