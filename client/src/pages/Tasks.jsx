import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { cachedMembers, rememberMembers } from "../api/membersCache";
import { takePrefetched } from "../api/prefetch";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import TaskForm from "../components/tasks/TaskForm";
import Select from "../components/ui/Select";
import { useLiveRefetch, TASK_EVENTS } from "../hooks/useLiveEvents";

/* ===========================================================================
 * Constants & helpers
 * ========================================================================= */

const DEFAULT_STAGES = ["Todo", "In Progress", "In Review", "Done"];
const EMPTY = [];
const NO_STAGES = [];
const DAY_MS = 86400000;

// The only raw CSS: one entry keyframe. Move to tailwind.config.js if preferred.
const KEYFRAMES = `
@keyframes ts-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
`;

// Full class literals so Tailwind's scanner can see them.
const PRIORITY_DOT = {
  low: "bg-[color:var(--accent)]",
  medium: "bg-[color:var(--warning)]",
  high: "bg-[color:var(--danger)]",
  critical: "bg-[color:var(--critical)]",
};

const cx = (...parts) => parts.filter(Boolean).join(" ");

const isAbort = (e) =>
  e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";

const getMonthKey = (t) => {
  const dateStr = t?.due_date || t?.created_at;
  return dateStr ? dateStr.slice(0, 7) : null;
};

const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const monthLabelCache = new Map();
const formatMonthLabel = (key) => {
  let label = monthLabelCache.get(key);
  if (!label) {
    const [year, month] = key.split("-");
    label = MONTH_FORMAT.format(new Date(Number(year), Number(month) - 1));
    monthLabelCache.set(key, label);
  }
  return label;
};

// Newest first; falls back to id when there is no created_at.
const sortTime = (t) => (t.created_at ? new Date(t.created_at).getTime() : t.id);
const byNewest = (a, b) => sortTime(b) - sortTime(a);

const stageClass = (stage) => stage?.toLowerCase().replace(/\s/g, "");

// "Today", "Tomorrow", "in 3d", "2d late"... null when it adds nothing.
function relativeDue(due, late) {
  const d = new Date(due);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / DAY_MS);
  if (late) return diff < 0 ? `${-diff}d late` : null;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff <= 14) return `in ${diff}d`;
  return null;
}

/* ===========================================================================
 * Styles (Tailwind literals)
 * ========================================================================= */

const FOCUS =
  "focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-2";

// Toolbar also styles focus on buttons rendered inside <Select>.
const TOOLBAR_FOCUS =
  "[&_button:focus-visible]:[outline:2px_solid_var(--accent)] [&_button:focus-visible]:[outline-offset:2px]";

const PAGE = "pt-6 px-8 pb-12 max-[720px]:pt-4 max-[720px]:px-4 max-[720px]:pb-10";
const BOARD = "grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4";

const SEG_BTN =
  "px-3.5 py-[5px] text-xs font-medium border-0 rounded-[8px] max-[640px]:min-h-10 cursor-pointer text-[color:var(--text-3)] bg-transparent transition-[background-color,color,transform] duration-200 hover:text-[color:var(--text)] active:scale-[0.97] aria-pressed:text-[color:var(--text)] aria-pressed:bg-[color:var(--bg-2)] aria-pressed:shadow-[0_1px_3px_rgba(15,23,42,0.14)] motion-reduce:transition-none";

const MONTH_BTN =
  "w-8 border-0 cursor-pointer text-base text-[color:var(--text-2)] bg-transparent transition-colors duration-200 enabled:hover:bg-[color:var(--bg-3)] enabled:hover:text-[color:var(--text)] enabled:active:bg-[color:var(--bg-4)] disabled:opacity-[.35] disabled:cursor-not-allowed motion-reduce:transition-none";

// Cards: tinted slate shadows, state-colored left rail (accent / danger / success)
const CARD_BASE =
  "relative flex flex-col gap-3 px-4 py-4 rounded-2xl border border-l-[3px] shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-18px_rgba(15,23,42,0.4)] active:translate-y-0 active:scale-[0.995] [animation:ts-rise_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:transition-none motion-reduce:[animation:none]";
const CARD_TONE = {
  normal:
    "bg-[color:var(--bg-2)] border-[color:var(--border)] hover:border-[color:color-mix(in_srgb,var(--accent)_40%,var(--border))]",
  overdue:
    "bg-[color:color-mix(in_srgb,var(--danger)_4%,var(--bg-2))] border-[color:color-mix(in_srgb,var(--danger)_35%,var(--border))] hover:border-[color:color-mix(in_srgb,var(--danger)_45%,var(--border))]",
  none: "bg-transparent border-dashed border-[color:var(--border)] hover:border-[color:color-mix(in_srgb,var(--accent)_40%,var(--border))]",
};
const CARD_RAIL = {
  accent: "border-l-[color:var(--accent)] hover:border-l-[color:var(--accent)]",
  danger: "border-l-[color:var(--danger)] hover:border-l-[color:var(--danger)]",
  success:
    "border-l-[color:var(--success,#10b981)] hover:border-l-[color:var(--success,#10b981)]",
  none: "border-l-[color:var(--border)] hover:border-l-[color:var(--border)]",
};

const CHIP =
  "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md whitespace-nowrap tabular-nums";
const CHIP_SUBS =
  "text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]";
const CHIP_NONE =
  "text-[color:var(--text-3)] bg-transparent border border-dashed border-[color:var(--border)]";

const ACTION_BTN =
  "transition-[background-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:transition-none";
const CARD_ACTION_BTN = `${ACTION_BTN} !text-[11px] !px-2 !py-0.5`;

const NAME_BASE = `no-underline [overflow-wrap:anywhere] [text-wrap:pretty] underline-offset-[3px] hover:underline ${FOCUS}`;
const nameClass = (done, sub) =>
  cx(
    NAME_BASE,
    done
      ? "text-[color:var(--text-3)] line-through"
      : sub
        ? "text-[color:var(--text-2)]"
        : "text-[color:var(--text)]",
    sub ? "text-[12.5px] font-normal" : "text-[13.5px] font-medium tracking-[-0.005em]",
  );

const ROW =
  "transition-colors duration-150 hover:bg-[color:var(--bg-3)] motion-reduce:transition-none";
const ROW_OVERDUE = "[&>td:first-child]:shadow-[inset_3px_0_0_var(--danger)]";
const ROW_SUB = "bg-[color:color-mix(in_srgb,var(--bg-3)_55%,transparent)]";
const CELL_ALERT = "text-[color:var(--danger)] font-semibold";

const CHEV =
  "inline-flex p-1 border-0 rounded-md bg-transparent text-[color:var(--text-3)] cursor-pointer transition-[transform,background-color,color] duration-200 hover:bg-[color:var(--bg-4)] hover:text-[color:var(--text)] focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-1 aria-[expanded=false]:-rotate-90 motion-reduce:transition-none";

const MONTH_SELECT_STYLE = {
  padding: "6px 12px",
  borderRadius: 0,
  border: "none",
  background: "transparent",
  fontSize: "12px",
  fontWeight: 500,
  minWidth: "140px",
};

/* ===========================================================================
 * Data hooks
 * ========================================================================= */

// Project tasks + members + clusters. Latest request wins; in-flight requests
// are cancelled on unmount. `loading` only covers the first load, so refetches
// (tab re-activation, after saves) stay silent with no blink.
function useProjectData(projectId, active) {
  const [tasks, setTasks] = useState(EMPTY);
  // Members from the previous page (if any) are shown until the fresh list arrives.
  const [members, setMembers] = useState(() => cachedMembers() || EMPTY);
  const [clusters, setClusters] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const controller = useRef(null);

  const reload = useCallback(() => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const { signal } = c;

    // The first load picks up the requests Project Detail already started
    // from the URL id (api/prefetch.js); every later load sends its own.
    const get = (url) => takePrefetched(url) || api.get(url, { signal });

    // Members only fill the task form, so the list does not wait for them.
    get("/members")
      .then((m) => {
        if (!signal.aborted) setMembers(rememberMembers(m.data));
      })
      .catch((e) => {
        if (!isAbort(e)) console.error(e);
      });

    return Promise.all([
      get(`/tasks/project/${projectId}`),
      get(`/clusters/project/${projectId}`),
    ])
      .then(([t, cl]) => {
        if (signal.aborted) return;
        setTasks(t.data);
        setClusters(cl.data);
      })
      .catch((e) => {
        if (!isAbort(e)) console.error(e);
      })
      .finally(() => {
        if (controller.current === c) setLoading(false);
      });
  }, [projectId]);

  // Fetch on mount and every time this tab becomes active.
  useEffect(() => {
    if (projectId && active) reload();
  }, [projectId, active, reload]);

  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  return { tasks, members, clusters, loading, reload };
}

// Indexes over ALL tasks (every month) so edit/delete rules also see sub tasks
// hidden by the month filter. One pass, then O(1) lookups.
function useTaskIndex(tasks) {
  return useMemo(() => {
    const subCounts = new Map();
    const byId = new Map();
    const months = new Set([getCurrentMonthKey()]);
    for (const t of tasks) {
      byId.set(String(t.id), t);
      if (t.parent_task_id) {
        const k = String(t.parent_task_id);
        subCounts.set(k, (subCounts.get(k) || 0) + 1);
      }
      const m = getMonthKey(t);
      if (m) months.add(m);
    }
    return { subCounts, byId, monthKeys: [...months].sort() };
  }, [tasks]);
}

// Everything the views need for one month, computed in a single pass.
// A main task has no stage of its own: it is "Done" only once it has sub tasks
// and every one of them is Done.
function useMonthModel(tasks, month) {
  return useMemo(() => {
    const main = [];
    const subsByParent = {};
    for (const t of tasks) {
      if (getMonthKey(t) !== month) continue;
      if (t.parent_task_id) (subsByParent[t.parent_task_id] ||= []).push(t);
      else main.push(t);
    }
    main.sort(byNewest);

    let withSubs = 0;
    let done = 0;
    let overdue = 0;
    const rows = main.map((task) => {
      const subtasks = subsByParent[task.id] || EMPTY;
      let doneSubs = 0;
      for (const s of subtasks) if (s.stage === "Done") doneSubs++;
      const mainDone = subtasks.length > 0 && doneSubs === subtasks.length;
      const isLate = isOverdue(task.due_date, mainDone ? "Done" : undefined);
      if (subtasks.length) withSubs++;
      if (mainDone) done++;
      if (isLate) overdue++;
      const rel =
        task.due_date && !mainDone ? relativeDue(task.due_date, isLate) : null;
      return { task, subtasks, doneSubs, mainDone, overdue: isLate, rel };
    });

    return {
      rows,
      counts: {
        total: rows.length,
        withSubs,
        withoutSubs: rows.length - withSubs,
        done,
        overdue,
      },
    };
  }, [tasks, month]);
}

/* ===========================================================================
 * Toolbar
 * ========================================================================= */

function SegControl({ label, value, options, onChange, className }) {
  return (
    <div
      className={cx("inline-flex p-[3px] gap-0.5 bg-[color:var(--bg-3)] rounded-xl", className)}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={SEG_BTN}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const MonthNav = memo(function MonthNav({ monthKeys, selected, onChange }) {
  const idx = monthKeys.indexOf(selected);
  const last = monthKeys.length - 1;
  return (
    <div className="inline-flex items-stretch border border-[color:var(--border)] rounded-xl bg-[color:var(--bg-2)] overflow-hidden">
      <button
        type="button"
        className={MONTH_BTN}
        aria-label="Previous month"
        onClick={() => idx > 0 && onChange(monthKeys[idx - 1])}
        disabled={idx <= 0}
      >
        ‹
      </button>

      <Select
        value={selected}
        onChange={onChange}
        arrowColor="var(--text-3)"
        labelColor="var(--text)"
        style={MONTH_SELECT_STYLE}
      >
        {monthKeys.map((key) => (
          <option key={key} value={key}>
            {formatMonthLabel(key)}
          </option>
        ))}
      </Select>

      <button
        type="button"
        className={MONTH_BTN}
        aria-label="Next month"
        onClick={() => idx < last && onChange(monthKeys[idx + 1])}
        disabled={idx === last}
      >
        ›
      </button>
    </div>
  );
});

const VIEW_OPTIONS = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
];

const Count = ({ n }) => <span className="ml-1.5 tabular-nums opacity-55">{n}</span>;

// Completion at a glance: "5 of 12 done", a thin progress bar, overdue pill.
function Summary({ counts }) {
  const ratio = counts.total ? counts.done / counts.total : 0;
  return (
    <div className="flex items-center gap-3 text-xs text-[color:var(--text-3)] tabular-nums whitespace-nowrap">
      {counts.total === 0 ? (
        <span>No tasks</span>
      ) : (
        <>
          <span>
            <b className="font-semibold text-[color:var(--text)]">{counts.done}</b> of{" "}
            <b className="font-semibold text-[color:var(--text)]">{counts.total}</b> done
          </span>
          <span
            className="hidden sm:block h-1 w-16 rounded-full overflow-hidden bg-[color:var(--bg-4)]"
            aria-hidden="true"
          >
            <span
              className="block h-full w-full origin-left rounded-full bg-[color:var(--success,#10b981)] transition-transform duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${ratio})` }}
            />
          </span>
        </>
      )}
      {counts.overdue > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold text-[color:var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)]">
          <span className="size-1.5 rounded-full bg-[color:var(--danger)]" aria-hidden="true" />
          {counts.overdue} overdue
        </span>
      )}
    </div>
  );
}

/* ===========================================================================
 * Shared bits
 * ========================================================================= */

const Chip = memo(function Chip({ none, className, children }) {
  return <span className={cx(CHIP, none ? CHIP_NONE : CHIP_SUBS, className)}>{children}</span>;
});

const Priority = memo(function Priority({ value }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium capitalize text-[color:var(--text-2)]">
      <span className={cx("size-1.5 rounded-full", PRIORITY_DOT[value])} aria-hidden="true" />
      {value}
    </span>
  );
});

function EmptyState({ filtered, canAdd, onAdd, onResetFilter }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-16 text-center border border-dashed border-[color:var(--border)] rounded-2xl text-[color:var(--text-3)]">
      <span className="mb-2 grid place-items-center size-12 rounded-[14px] bg-[color:var(--bg-3)]">
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
          <rect x="5" y="4" width="14" height="16" rx="2.5" />
          <path d="M9 9.5h6M9 13h3.5" />
        </svg>
      </span>
      <h3 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-[color:var(--text)]">
        {filtered ? "No tasks match this filter" : "No tasks this month"}
      </h3>
      <p className="m-0 max-w-[40ch] text-[13px] leading-normal [text-wrap:balance]">
        {filtered
          ? "Switch the filter back to All to see every task for this month."
          : "Tasks due or created in this month will show up here. Use the arrows to check another month."}
      </p>
      {filtered ? (
        <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={onResetFilter}>
          Show all tasks
        </button>
      ) : (
        canAdd && (
          <button type="button" className="btn btn-primary btn-sm mt-3" onClick={onAdd}>
            + Add task
          </button>
        )
      )}
    </div>
  );
}

const SKELETON_DELAYS = [0, 1, 2, 3, 4, 5].map((i) => ({ animationDelay: `${i * 80}ms` }));
const SKEL_BAR = "rounded-md bg-[color:var(--bg-4)]";

// Matches the default list view: toolbar strip + table rows.
function TasksSkeleton() {
  return (
    <div className={PAGE} aria-busy="true">
      <div className={cx(SKEL_BAR, "h-9 w-64 mb-5 animate-pulse motion-reduce:animate-none")} />
      <div className="overflow-hidden bg-[color:var(--bg-2)] border border-[color:var(--border)] rounded-2xl">
        {SKELETON_DELAYS.map((style, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-4 border-b border-[color:var(--border)] last:border-b-0 animate-pulse [animation-duration:1.4s] [animation-timing-function:ease-in-out] motion-reduce:animate-none"
            style={style}
          >
            <div className={cx(SKEL_BAR, "size-4 shrink-0")} />
            <div className={cx(SKEL_BAR, "h-3.5 flex-1 max-w-[46%]")} />
            <div className={cx(SKEL_BAR, "h-3 w-16 ml-auto")} />
            <div className={cx(SKEL_BAR, "h-3 w-20")} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================================
 * Page
 * ========================================================================= */

export default function Tasks({ project: propProject, active = true }) {
  const params = useParams();
  const projectId = propProject?.id || params.id;
  const { isManager } = useAuth();

  const { tasks, members, clusters, loading, reload } = useProjectData(projectId, active);

  // Live updates: a task in this project changed (for example a member
  // moved a sub task). `reload` is silent after the first load. A hidden tab
  // skips it; it reloads anyway when it becomes active.
  const isThisProject = useCallback(
    (event) => String(event.projectId) === String(projectId),
    [projectId],
  );
  useLiveRefetch(TASK_EVENTS, reload, { match: isThisProject, enabled: !!projectId && active });
  const index = useTaskIndex(tasks);

  const [view, setView] = useState("list");
  const [subFilter, setSubFilter] = useState("all"); // all | with | without
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey);
  const [errorMsg, setErrorMsg] = useState("");

  // Modal state: null = closed. `{ task }` = main task modal (task null = new).
  const [mainModal, setMainModal] = useState(null);
  const [subParent, setSubParent] = useState(null);
  const [savingTask, setSavingTask] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Delete rule: a main task can only be deleted once all its sub tasks are gone.
  const [deleteBlocked, setDeleteBlocked] = useState(null); // { title, subtaskCount }

  // Main tasks do not use stages. Stages are still available for SUB TASKS.
  const stages = propProject?.custom_stages || DEFAULT_STAGES;

  const { rows, counts } = useMonthModel(tasks, selectedMonth);

  const visibleRows = useMemo(() => {
    if (subFilter === "all") return rows;
    const wantSubs = subFilter === "with";
    return rows.filter((r) => r.subtasks.length > 0 === wantSubs);
  }, [rows, subFilter]);

  const filterOptions = useMemo(
    () => [
      {
        value: "all",
        label: (
          <>
            All
            <Count n={counts.total} />
          </>
        ),
      },
      {
        value: "with",
        label: (
          <>
            With sub tasks
            <Count n={counts.withSubs} />
          </>
        ),
      },
      {
        value: "without",
        label: (
          <>
            No sub tasks
            <Count n={counts.withoutSubs} />
          </>
        ),
      },
    ],
    [counts],
  );

  /* ---------- handlers (stable identities for the memoized rows) ---------- */

  const openNew = useCallback(() => setMainModal({ task: null }), []);
  const openEdit = useCallback((task) => setMainModal({ task }), []);
  const closeMain = useCallback(() => setMainModal(null), []);
  const openSubTask = useCallback((task) => setSubParent(task), []);
  const closeSub = useCallback(() => setSubParent(null), []);
  const dismissError = useCallback(() => setErrorMsg(""), []);
  const closeBlocked = useCallback(() => setDeleteBlocked(null), []);
  const cancelDelete = useCallback(() => setDeleteId(null), []);
  const resetFilter = useCallback(() => setSubFilter("all"), []);

  // MAIN TASK CREATE / EDIT
  const editing = mainModal?.task ?? null;
  const handleSave = useCallback(
    async (data) => {
      setSavingTask(true);
      try {
        // Main tasks do not use status/stage.
        const payload = { ...data, stage: undefined };
        if (editing) {
          await api.put(`/tasks/${editing.id}`, payload);
        } else {
          await api.post("/tasks", { ...payload, project_id: projectId });
        }
        setMainModal(null);
        reload();
      } finally {
        setSavingTask(false);
      }
    },
    [editing, projectId, reload],
  );

  // SUB TASK CREATE (sub tasks keep stages)
  const handleSubTaskSave = useCallback(
    async (data) => {
      setSavingTask(true);
      try {
        await api.post("/tasks", {
          ...data,
          project_id: projectId,
          parent_task_id: subParent.id,
        });
        setSubParent(null);
        reload();
      } finally {
        setSavingTask(false);
      }
    },
    [subParent, projectId, reload],
  );

  const handleDelete = useCallback(
    (id) => {
      const subtaskCount = index.subCounts.get(String(id)) || 0;
      if (subtaskCount > 0) {
        const task = index.byId.get(String(id));
        setDeleteBlocked({ title: task?.title || "This task", subtaskCount });
        return;
      }
      setErrorMsg("");
      setDeleteId(id);
    },
    [index],
  );

  const confirmDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await api.delete(`/tasks/${deleteId}`);
    } catch (error) {
      setErrorMsg(
        "We couldn't delete the task: " + (error.response?.data?.error || error.message),
      );
    } finally {
      reload();
      setDeleteId(null);
      setDeleting(false);
    }
  }, [deleteId, reload]);

  if (loading) return <TasksSkeleton />;

  const filtered = subFilter !== "all";
  const ViewComponent = view === "board" ? BoardView : ListView;

  return (
    <div className={PAGE}>
      <style>{KEYFRAMES}</style>

      {/* TOOLBAR (frosted so content scrolls softly beneath it) */}
      <div
        className={cx(
          "sticky top-0 z-30 -mt-6 -mx-8 mb-5 px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-[color:color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur-md border-b border-[color:var(--border)]",
          "max-[720px]:-mt-4 max-[720px]:-mx-4 max-[720px]:mb-4 max-[720px]:px-4 max-[720px]:py-3",
          TOOLBAR_FOCUS,
        )}
      >
        <SegControl label="View" value={view} options={VIEW_OPTIONS} onChange={setView} />

        <SegControl
          label="Filter by sub tasks"
          value={subFilter}
          options={filterOptions}
          onChange={setSubFilter}
          className="mr-auto ml-3"
        />

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Summary counts={counts} />
          <MonthNav
            monthKeys={index.monthKeys}
            selected={selectedMonth}
            onChange={setSelectedMonth}
          />
          {isManager && (
            <button
              type="button"
              className="btn btn-primary btn-sm whitespace-nowrap active:scale-[0.97] transition-transform"
              onClick={openNew}
            >
              + Add task
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          className="flex items-center justify-between gap-3 mb-4 px-3.5 py-2.5 text-[13px] text-[color:var(--danger)] rounded-xl bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--danger)_28%,transparent)]"
          role="alert"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            className={cx(
              "bg-transparent border-0 text-inherit cursor-pointer text-lg leading-none",
              FOCUS,
            )}
            onClick={dismissError}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {/* BOARD / LIST */}
      <ViewComponent
        rows={visibleRows}
        filtered={filtered}
        projectId={projectId}
        isManager={isManager}
        onEdit={openEdit}
        onDelete={handleDelete}
        onAddSubTask={openSubTask}
        onAdd={openNew}
        onResetFilter={resetFilter}
      />

      {/* MAIN TASK MODAL */}
      {mainModal && (
        <Modal title={editing ? "Edit task" : "New task"} onClose={closeMain}>
          <TaskForm
            initial={editing}
            hasExistingSubtasks={!!editing && (index.subCounts.get(String(editing.id)) || 0) > 0}
            members={members}
            allMembers={members}
            clusters={clusters}
            stages={NO_STAGES}
            onSave={handleSave}
            saving={savingTask}
            onCancel={closeMain}
          />
        </Modal>
      )}

      {/* SUB TASK MODAL */}
      {subParent && (
        <Modal title={`Sub task — ${subParent.title}`} onClose={closeSub}>
          <TaskForm
            members={members}
            clusters={clusters}
            // Sub tasks KEEP stages.
            stages={stages}
            onSave={handleSubTaskSave}
            saving={savingTask}
            onCancel={closeSub}
            hideCluster
            isSubtaskForm
          />
        </Modal>
      )}

      {/* CANNOT DELETE — task still has sub tasks */}
      {deleteBlocked && (
        <Modal title="Cannot delete task" onClose={closeBlocked}>
          <p className="mb-2 text-[13px] leading-relaxed text-[var(--text-2)]">
            <strong className="text-[var(--text)]">{deleteBlocked.title}</strong> still has{" "}
            {deleteBlocked.subtaskCount}{" "}
            {deleteBlocked.subtaskCount === 1 ? "sub task" : "sub tasks"}.
          </p>
          <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
            Delete all of its sub tasks first. Once none are left, you can delete the task.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={closeBlocked}>
              Got it
            </button>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRM */}
      <ConfirmModal
        isOpen={deleteId != null}
        title="Delete task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        loading={deleting}
      />
    </div>
  );
}

/* ===========================================================================
 * Board view
 * ========================================================================= */

// One segment per sub task (up to 10), a smooth bar beyond that.
const SubProgress = memo(function SubProgress({ done, total, complete }) {
  const fill = complete ? "bg-[color:var(--success,#10b981)]" : "bg-[color:var(--accent)]";
  return (
    <div className="flex items-center gap-2.5 text-[11px] tabular-nums text-[color:var(--text-3)]">
      <div
        className="flex flex-1 gap-0.5"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Sub task progress"
      >
        {total <= 10 ? (
          Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cx(
                "h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
                i < done ? fill : "bg-[color:var(--bg-4)]",
              )}
            />
          ))
        ) : (
          <span className="relative h-1 flex-1 rounded-full overflow-hidden bg-[color:var(--bg-4)]">
            <span
              className={cx(
                "absolute inset-0 origin-left rounded-full transition-transform duration-[400ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none",
                fill,
              )}
              style={{ transform: `scaleX(${done / total})` }}
            />
          </span>
        )}
      </div>
      <span>
        {done}/{total} sub tasks
      </span>
    </div>
  );
});

// Main tasks have no stage of their own but show a "Done" badge once every sub
// task is Done. When Done, priority and due date are hidden.
const TaskCard = memo(function TaskCard({
  row,
  position,
  projectId,
  isManager,
  onEdit,
  onDelete,
  onAddSubTask,
}) {
  const { task, subtasks, doneSubs, mainDone, overdue, rel } = row;
  const hasSubs = subtasks.length > 0;

  const tone = overdue ? "overdue" : hasSubs ? "normal" : "none";
  const rail = mainDone ? "success" : overdue ? "danger" : hasSubs ? "accent" : "none";

  return (
    <article
      className={cx(CARD_BASE, CARD_TONE[tone], CARD_RAIL[rail])}
      style={{ animationDelay: `${Math.min(position, 12) * 35}ms` }}
    >
      <div className="flex items-start justify-between gap-2.5">
        {/* The ::after stretches the link over the whole card */}
        <Link
          to={`/projects/${projectId}/tasks/${task.id}`}
          className={cx(
            "text-sm font-semibold leading-[1.4] tracking-[-0.01em] no-underline [overflow-wrap:anywhere] [text-wrap:pretty] after:content-[''] after:absolute after:inset-0 after:rounded-2xl",
            mainDone
              ? "text-[color:var(--text-3)] line-through decoration-[color:var(--text-3)]"
              : "text-[color:var(--text)]",
            FOCUS,
          )}
        >
          {task.title}
        </Link>

        {mainDone && <span className="badge badge-done shrink-0">Done</span>}
      </div>

      {(task.cluster_name || !mainDone) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs tabular-nums text-[color:var(--text-3)]">
          {task.cluster_name && (
            <span className="text-[color:var(--accent)]">{task.cluster_name}</span>
          )}
          {!mainDone && <Priority value={task.priority} />}
          {task.due_date && !mainDone && (
            <span className={overdue ? CELL_ALERT : undefined}>
              {overdue ? "Overdue · " : "Due "}
              {formatDate(task.due_date)}
              {!overdue && rel && <span className="opacity-60"> · {rel}</span>}
            </span>
          )}
        </div>
      )}

      {hasSubs ? (
        <SubProgress done={doneSubs} total={subtasks.length} complete={mainDone} />
      ) : (
        <Chip none className="self-start">
          No sub tasks
        </Chip>
      )}

      {isManager && (
        <div className="relative z-[1] flex gap-1 mt-auto pt-3 border-t border-[color:var(--border)]">
          {!mainDone && (
            <button
              type="button"
              className={cx("btn btn-ghost btn-sm", CARD_ACTION_BTN)}
              onClick={() => onEdit(task)}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className={cx("btn btn-ghost btn-sm", CARD_ACTION_BTN, "!text-[color:var(--accent)]")}
            onClick={() => onAddSubTask(task)}
          >
            + Sub task
          </button>
          <button
            type="button"
            className={cx(
              "btn btn-ghost btn-sm ml-auto",
              CARD_ACTION_BTN,
              "!text-[color:var(--danger)]",
            )}
            onClick={() => onDelete(task.id)}
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
});

function BoardView({
  rows,
  filtered,
  projectId,
  isManager,
  onEdit,
  onDelete,
  onAddSubTask,
  onAdd,
  onResetFilter,
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        filtered={filtered}
        canAdd={isManager}
        onAdd={onAdd}
        onResetFilter={onResetFilter}
      />
    );
  }

  return (
    <section className={BOARD} aria-label="Tasks board">
      {rows.map((row, i) => (
        <TaskCard
          key={row.task.id}
          row={row}
          position={i}
          projectId={projectId}
          isManager={isManager}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddSubTask={onAddSubTask}
        />
      ))}
    </section>
  );
}

/* ===========================================================================
 * List view
 * ===========================================================================
 * Columns: (expand) | Task | Priority | Stage | Due | Actions
 *
 * Main task: Stage column shows a derived "Done" badge once all sub tasks are
 *            Done (otherwise empty). Sub task: shows its own stage.
 * Once a task (main or sub) is Done, its priority and due date are hidden.
 */

// Date plus a muted relative hint ("in 3d", "2d late") underneath.
const DueCell = memo(function DueCell({ date, late, rel }) {
  return (
    <>
      <span className={late ? CELL_ALERT : undefined}>{formatDate(date)}</span>
      {rel && (
        <span
          className={cx(
            "block mt-0.5 text-[11px]",
            late ? "text-[color:var(--danger)] opacity-80" : "text-[color:var(--text-3)]",
          )}
        >
          {rel}
        </span>
      )}
    </>
  );
});

const SubTaskRow = memo(function SubTaskRow({
  task: st,
  projectId,
  isManager,
  onEdit,
  onDelete,
}) {
  const late = isOverdue(st.due_date, st.stage);
  const done = st.stage === "Done";

  return (
    <tr className={cx(ROW, ROW_SUB, late && ROW_OVERDUE)}>
      <td />

      <td className="!pl-11 before:content-[''] before:absolute before:left-6 before:top-0 before:h-1/2 before:w-3 before:border-l before:border-b before:border-[color:var(--border)] before:rounded-bl-md">
        <Link to={`/projects/${projectId}/tasks/${st.id}`} className={nameClass(done, true)}>
          {st.title}
        </Link>
      </td>

      <td>{!done && <span className={`badge badge-${st.priority}`}>{st.priority}</span>}</td>

      <td>
        <span className={`badge badge-${stageClass(st.stage)}`}>{st.stage}</span>
      </td>

      <td>
        {!done && st.due_date && (
          <DueCell
            date={st.due_date}
            late={late}
            rel={relativeDue(st.due_date, late)}
          />
        )}
      </td>

      {isManager && (
        <td>
          <div className="flex gap-1">
            {!done && (
              <button
                type="button"
                className={cx("btn btn-ghost btn-sm", ACTION_BTN)}
                onClick={() => onEdit(st)}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              className={cx("btn btn-ghost btn-sm", ACTION_BTN, "!text-[color:var(--danger)]")}
              onClick={() => onDelete(st.id)}
            >
              Delete
            </button>
          </div>
        </td>
      )}
    </tr>
  );
});

const TaskRow = memo(function TaskRow({
  row,
  projectId,
  isManager,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onAddSubTask,
}) {
  const { task: t, subtasks, doneSubs, mainDone, overdue, rel } = row;
  const hasSubs = subtasks.length > 0;

  return (
    <>
      {/* MAIN TASK */}
      <tr className={cx(ROW, overdue && ROW_OVERDUE)}>
        <td>
          {hasSubs ? (
            <button
              type="button"
              className={CHEV}
              onClick={() => onToggle(t.id)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "Collapse sub tasks" : "Expand sub tasks"}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2.5 4.5L6 8l3.5-3.5" />
              </svg>
            </button>
          ) : (
            <span
              className="inline-block size-1.5 mx-[9px] rounded-full bg-[color:var(--border)] align-middle"
              title="No sub tasks"
              role="img"
              aria-label="No sub tasks"
            />
          )}
        </td>

        <td>
          <Link to={`/projects/${projectId}/tasks/${t.id}`} className={nameClass(mainDone, false)}>
            {t.title}
          </Link>
          {hasSubs ? (
            <Chip className="ml-2">
              {doneSubs}/{subtasks.length} sub tasks
            </Chip>
          ) : (
            <Chip none className="ml-2">
              No sub tasks
            </Chip>
          )}
        </td>

        {/* Priority hidden once Done */}
        <td>{!mainDone && <span className={`badge badge-${t.priority}`}>{t.priority}</span>}</td>

        {/* Derived Done badge (same style as sub tasks) */}
        <td>{mainDone && <span className="badge badge-done">Done</span>}</td>

        <td>
          {!mainDone && t.due_date && <DueCell date={t.due_date} late={overdue} rel={rel} />}
        </td>

        {isManager && (
          <td>
            <div className="flex gap-1">
              {!mainDone && (
                <button
                  type="button"
                  className={cx("btn btn-ghost btn-sm", ACTION_BTN)}
                  onClick={() => onEdit(t)}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                className={cx("btn btn-ghost btn-sm", ACTION_BTN, "!text-[color:var(--accent)]")}
                onClick={() => onAddSubTask(t)}
              >
                + Sub task
              </button>
              <button
                type="button"
                className={cx("btn btn-ghost btn-sm", ACTION_BTN, "!text-[color:var(--danger)]")}
                onClick={() => onDelete(t.id)}
              >
                Delete
              </button>
            </div>
          </td>
        )}
      </tr>

      {/* SUB TASKS */}
      {isExpanded &&
        subtasks.map((st) => (
          <SubTaskRow
            key={st.id}
            task={st}
            projectId={projectId}
            isManager={isManager}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
    </>
  );
});

function ListView({
  rows,
  filtered,
  projectId,
  isManager,
  onEdit,
  onDelete,
  onAddSubTask,
  onAdd,
  onResetFilter,
}) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (rows.length === 0) {
    return (
      <EmptyState
        filtered={filtered}
        canAdd={isManager}
        onAdd={onAdd}
        onResetFilter={onResetFilter}
      />
    );
  }

  return (
    <div className="overflow-x-auto bg-[color:var(--bg-2)] border border-[color:var(--border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <table className="w-full border-separate border-spacing-0 text-[13px] text-[color:var(--text-2)] tabular-nums">
        <thead className="[&_th]:px-3.5 [&_th]:py-[11px] [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-[color:var(--text-3)] [&_th]:bg-[color:color-mix(in_srgb,var(--bg-3)_55%,var(--bg-2))] [&_th]:border-b [&_th]:border-[color:var(--border)] [&_th]:whitespace-nowrap">
          <tr>
            <th className="w-10" />
            <th>Task</th>
            <th>Priority</th>
            <th>Stage</th>
            <th>Due</th>
            {isManager && <th>Actions</th>}
          </tr>
        </thead>

        <tbody className="[&_td]:relative [&_td]:px-3.5 [&_td]:py-3.5 [&_td]:align-middle [&_td]:border-b [&_td]:border-[color:var(--border)] [&>tr:last-child>td]:border-b-0">
          {rows.map((row) => (
            <TaskRow
              key={row.task.id}
              row={row}
              projectId={projectId}
              isManager={isManager}
              isExpanded={expanded.has(row.task.id)}
              onToggle={toggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSubTask={onAddSubTask}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}