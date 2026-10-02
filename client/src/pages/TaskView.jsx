import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";
import ProjectLinks from "../components/projects/ProjectLinks";

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
        className={`badge badge-${stageKey(task.stage)} cursor-pointer border-0 transition-[transform,filter] duration-150 [font-family:inherit] hover:brightness-95 active:scale-[0.97] motion-reduce:transition-none ${FOCUS}`}
        onClick={() => setOpen((p) => !p)}
      >
        {task.stage}
        <svg
          aria-hidden="true"
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ml-1 inline-block transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        >
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-10 min-w-[168px] origin-top-right rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-2)] p-1 shadow-[0_12px_28px_-8px_rgba(15,23,42,0.22)] [animation:tv-pop_.14s_ease-out_both] motion-reduce:[animation:none]"
        >
          {QUICK_STAGES.filter((s) => s !== task.stage).map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-2 text-left transition-colors duration-150 [font-family:inherit] hover:bg-[color:var(--bg-3)] motion-reduce:transition-none ${FOCUS}`}
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
      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border-0 py-1.5 pl-3 pr-2 text-xs tracking-[0.01em] transition-[background-color,color,box-shadow] duration-200 [font-family:inherit] active:scale-[0.98] motion-reduce:transition-none ${FOCUS} ${
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

const TaskRow = memo(function TaskRow({ task: t, locked, onStageSelect }) {
  const done = t.stage === "Done";
  const overdue = !done && isOverdue(t.due_date);
  const due = t.due_date ? dueChip(t.due_date, overdue, done) : null;

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
        className={`relative ${ROW_PAD} transition-colors duration-150 [border-radius:inherit] group-hover:bg-[color:var(--bg-3)] motion-reduce:transition-none ${
          overdue
            ? "before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[3px] before:rounded-full before:bg-[color:var(--danger)] before:content-['']"
            : ""
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {t.parent_title && (
              <div className="mb-0.5 truncate text-[11px] tracking-[0.01em] text-[color:var(--text-3)]">
                {t.parent_title} ›
              </div>
            )}
            <h2
              className={`m-0 text-[15px] font-semibold leading-[1.4] tracking-[-0.01em] [overflow-wrap:anywhere] [text-wrap:balance] ${
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
          <StageDropdown task={t} onChange={onStageSelect} locked={locked} />
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
          {/* Renders nothing if the project has no links. */}
          <ProjectLinks project={projectLinks} className="sm:ml-auto" />
        </div>
      </article>
    </li>
  );
});

// Owns its input state, so typing never re-renders the task list.
function TimeTakenModal({ task, onClose, onConfirm }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const minutes = Number(value);
    if (!value || !Number.isInteger(minutes) || minutes <= 0) {
      setError("Enter the time in whole minutes.");
      return;
    }
    setSaving(true);
    const ok = await onConfirm(task, minutes);
    if (ok) {
      onClose();
    } else {
      setSaving(false);
      setError("We couldn't save this. Please try again.");
    }
  };

  return (
    <Modal title="Time taken" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <p className="mb-4 text-[13px] leading-normal text-[color:var(--text-2)]">
          Moving <strong>{task?.title}</strong> to <strong>In Review</strong>. How long did this task take?
        </p>
        <div className="form-group">
          <label className="form-label" htmlFor="tv-time-taken">
            Time taken (minutes) *
          </label>
          <input
            id="tv-time-taken"
            className="form-input"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="e.g. 45"
            aria-invalid={!!error}
            aria-describedby={error ? "tv-time-taken-error" : undefined}
            autoFocus
          />
          {error && (
            <div id="tv-time-taken-error" className="mt-1.5 text-xs text-[color:var(--danger)]" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Confirm & move"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function TaskView() {
  const { isManager } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [timeTakenTask, setTimeTakenTask] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/dashboard/my-tasks", { signal: controller.signal })
      .then((r) => setTasks(r.data.tasks || []))
      .catch((e) => {
        if (!isAbort(e)) setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

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
  const filtersActive = statusFilter !== "all" || projectFilter !== "all";

  /* ---------- actions ---------- */

  // Optimistic update; resolves true on success so the modal knows whether to close.
  const handleStageChange = useCallback(async (task, newStage, extra = {}) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, stage: newStage, ...extra } : t)));
    try {
      await api.put(`/tasks/${task.id}`, { ...task, stage: newStage, ...extra });
      return true;
    } catch (err) {
      console.error("Failed to update stage:", err.message);
      // Revert on failure (restores time_taken too, not just stage).
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setNotice(`We couldn't move "${task.title}" to ${newStage}. Please try again.`);
      return false;
    }
  }, []);

  // In Review needs a time-taken value first (same popup as the task detail page).
  const handleStageSelect = useCallback(
    (task, newStage) => {
      if (newStage === "In Review") setTimeTakenTask(task);
      else handleStageChange(task, newStage);
    },
    [handleStageChange],
  );

  const confirmTimeTaken = useCallback(
    (task, minutes) => handleStageChange(task, "In Review", { time_taken: minutes }),
    [handleStageChange],
  );
  const closeModal = useCallback(() => setTimeTakenTask(null), []);
  const dismissNotice = useCallback(() => setNotice(""), []);
  const reload = useCallback(() => window.location.reload(), []);
  const showMore = useCallback(() => setLimit((n) => n + PAGE_SIZE), []);
  const resetFilters = useCallback(() => {
    setStatusFilter("all");
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
              <div
                className="mb-5 inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-[color:var(--bg-3)] p-1"
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

      {timeTakenTask && (
        <TimeTakenModal task={timeTakenTask} onClose={closeModal} onConfirm={confirmTimeTaken} />
      )}
    </>
  );
}