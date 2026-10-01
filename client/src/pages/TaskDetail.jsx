import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";
import DatePicker from "../components/ui/DatePicker";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import TaskForm from "../components/tasks/TaskForm";
import Loader from "../components/ui/Loader";

/* ===========================================================================
 * Constants & helpers
 * ========================================================================= */

const DEFAULT_STAGES = ["Todo", "In Progress", "In Review", "Done"];
const EMPTY = [];
const REFRESH_FAILED = "We couldn't refresh this task. Reload the page to see the latest.";

const STAGE_DOT_COLORS = {
  Todo: "#a78bfa",
  "In Progress": "#f59e0b",
  "In Review": "#3b82f6",
  Done: "#10b981",
};

// Full class literals so Tailwind's scanner can see them.
const PRIORITY_RAIL = {
  low: "before:bg-[color:var(--accent)]",
  medium: "before:bg-[color:var(--warning)]",
  high: "before:bg-[color:var(--danger)]",
  critical: "before:bg-[color:var(--critical)]",
};

const cx = (...parts) => parts.filter(Boolean).join(" ");
const initials = (name) => (name || "?").trim().charAt(0).toUpperCase();
const stageClass = (stage) => stage?.toLowerCase().replace(/\s/g, "");

const isAbort = (e) =>
  e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";

// `--c` (stage color) style objects are cached so rows don't allocate new ones.
const stageVarCache = new Map();
const stageVars = (stage) => {
  let v = stageVarCache.get(stage);
  if (!v) {
    v = { "--c": STAGE_DOT_COLORS[stage] || "var(--accent)" };
    stageVarCache.set(stage, v);
  }
  return v;
};

/* ===========================================================================
 * Styles (Tailwind literals). Keyframes are the only raw CSS; move them to
 * tailwind.config.js (theme.extend.keyframes) if you prefer zero <style> tags.
 * ========================================================================= */

const KEYFRAMES = `
@keyframes td-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes td-ping { 0% { transform: scale(1); opacity: .45; } 80%, 100% { transform: scale(2.6); opacity: 0; } }
@keyframes td-pop { from { opacity: 0; transform: scale(.96) translateY(-4px); } to { opacity: 1; transform: none; } }
`;

// Layout
const GRID = "grid grid-cols-1 min-[901px]:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start w-full max-w-[1180px] mx-auto";
const COL_BASE = "flex flex-col gap-4 min-w-0";
const COL = `${COL_BASE} [&>:nth-child(2)]:[animation-delay:45ms] [&>:nth-child(3)]:[animation-delay:90ms] [&>:nth-child(4)]:[animation-delay:135ms] [&>:nth-child(5)]:[animation-delay:180ms]`;
const PAGE_PAD = "max-[640px]:!px-4"; // mobile gutter, same as the old !important overrides

// Panels
const PANEL =
  "px-6 py-5 bg-[color:var(--bg-2)] rounded-2xl ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--border)_75%,transparent)] shadow-[0_14px_32px_-24px_rgba(15,23,42,0.32)]";
const PANEL_ANIM =
  "[animation:td-rise_.35s_cubic-bezier(.22,1,.36,1)_both] motion-reduce:[animation:none]";
const PANEL_FOCUS =
  "[&_button:focus-visible]:[outline:2px_solid_var(--accent)] [&_button:focus-visible]:[outline-offset:2px] [&_a:focus-visible]:[outline:2px_solid_var(--accent)] [&_a:focus-visible]:[outline-offset:2px]";
const PANEL_HEAD = "flex items-center justify-between gap-2.5 flex-wrap mb-4";
const PANEL_H = "m-0 flex items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-[color:var(--text)]";
const HINT = "m-0 max-w-[60ch] text-xs leading-normal text-[color:var(--text-3)]";
const NOTE = "m-0 text-[13px] text-[color:var(--text-3)]";

// Skeleton
const SKEL_BAR = "rounded-md bg-[color:var(--bg-4)]";
const SKEL_PULSE =
  "animate-pulse [animation-duration:1.4s] [animation-timing-function:ease-in-out] motion-reduce:animate-none";

// Sub tasks
const SUB =
  "relative flex items-center justify-between flex-wrap gap-3 py-3 pr-3.5 pl-[18px] bg-[color:var(--bg-3)] rounded-xl transition-[background-color,box-shadow] duration-200 hover:bg-[color:color-mix(in_srgb,var(--bg-3)_70%,var(--bg-4))] hover:shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)] motion-reduce:transition-none before:content-[''] before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px]";
const META = "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[color:var(--text-3)]";
const STAGE_BTN =
  "![font:inherit] !border-0 !cursor-pointer transition-[opacity,transform] duration-150 disabled:opacity-70 motion-reduce:transition-none";
const MENU =
  "absolute top-[calc(100%+6px)] left-0 z-40 min-w-[160px] p-1 bg-[color:var(--bg-2)] border border-[color:var(--border)] rounded-[10px] shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)] origin-top-left [animation:td-pop_.16s_ease-out_both] motion-reduce:[animation:none]";
const MENU_ITEM =
  "flex items-center gap-2 w-full px-2.5 py-[7px] border-0 rounded-md bg-transparent text-[color:var(--text)] text-xs text-left cursor-pointer transition-colors duration-150 motion-reduce:transition-none";

const CHIP =
  "px-[7px] py-px text-[11px] font-medium rounded-md tabular-nums";
const CHIP_ACCENT =
  "text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]";
const CHIP_DANGER =
  "text-[color:var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)]";

// Stage bar / steps
const STAGEBAR_BTN =
  "inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium cursor-pointer border border-transparent rounded-lg transition-[background-color,box-shadow,color,transform] duration-200 enabled:active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transition-none";

// Review modal choices
const CHOICES = [
  {
    key: "done",
    title: "Mark as done",
    hint: "Sub task is completed",
    on: "border-[color:var(--success,#10b981)] bg-[color:color-mix(in_srgb,var(--success,#10b981)_10%,transparent)] text-[color:var(--success,#10b981)]",
    icon: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  },
  {
    key: "rework",
    title: "Send for rework",
    hint: "Needs more work",
    on: "border-[color:var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)]",
    icon: (
      <>
        <path d="M4 12a8 8 0 1 1 2.5 5.8" />
        <path d="M4 19v-5h5" />
      </>
    ),
  },
];

/* ===========================================================================
 * Data hook
 * ========================================================================= */

// The task is the only request that MUST succeed. Project and members are
// best-effort: a member who was assigned a task but is not on the project gets
// 403 from /projects/:id, and that must not block the task page.
// Requests are cancelled on navigation/unmount so a slow response for a previous
// task can never overwrite the current one.
function useTaskDetail({ taskId, projectId, isManager, onNotice }) {
  const [task, setTask] = useState(null);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // null | "notfound" | "failed"
  const hasLoaded = useRef(false);
  const fullCtl = useRef(null);
  const taskCtl = useRef(null);

  // Latest values without re-creating `load` (and re-fetching) when they change.
  const ctx = useRef({ projectId, isManager });
  ctx.current = { projectId, isManager };

  const load = useCallback(() => {
    fullCtl.current?.abort();
    const c = new AbortController();
    fullCtl.current = c;
    const { signal } = c;
    const { projectId: pid, isManager: manager } = ctx.current;

    return Promise.all([
      api.get(`/tasks/${taskId}`, { signal }),
      manager
        ? api.get(`/projects/${pid}`, { signal }).catch(() => ({ data: null }))
        : Promise.resolve({ data: null }),
      api.get("/members", { signal }).catch(() => ({ data: EMPTY })),
    ])
      .then(([t, p, m]) => {
        if (signal.aborted) return;
        hasLoaded.current = true;
        setLoadError(null);
        setTask(t.data);
        setProject(p.data);
        setMembers(m.data);
      })
      .catch((err) => {
        if (isAbort(err) || signal.aborted) return;
        const status = err?.response?.status;
        const missing = status === 404 || status === 403;
        if (!hasLoaded.current || missing) {
          setTask(null);
          setLoadError(missing ? "notfound" : "failed");
        } else {
          // A refresh failed after a successful first load — keep the page.
          onNotice(REFRESH_FAILED);
        }
      })
      .finally(() => {
        if (fullCtl.current === c) setLoading(false);
      });
  }, [taskId, onNotice]);

  const loadTaskOnly = useCallback(() => {
    taskCtl.current?.abort();
    const c = new AbortController();
    taskCtl.current = c;

    return api
      .get(`/tasks/${taskId}`, { signal: c.signal })
      .then((r) => {
        if (!c.signal.aborted) setTask(r.data);
      })
      .catch((e) => {
        if (!isAbort(e)) onNotice(REFRESH_FAILED);
      });
  }, [taskId, onNotice]);

  useEffect(() => {
    hasLoaded.current = false;
    setLoading(true);
    load();
    return () => {
      fullCtl.current?.abort();
      taskCtl.current?.abort();
      fullCtl.current = null;
      taskCtl.current = null;
    };
  }, [load]);

  const retry = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    load();
  }, [load]);

  return { task, project, members, loading, loadError, load, loadTaskOnly, retry };
}

/* ===========================================================================
 * Small shared components
 * ========================================================================= */

const Avatar = memo(function Avatar({ name, large }) {
  return (
    <span
      className={cx(
        "shrink-0 inline-flex items-center justify-center font-semibold text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]",
        large ? "size-[30px] text-xs rounded-[9px]" : "size-5 text-[10px] rounded-md",
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
});

function Chip({ danger, children }) {
  return <span className={cx(CHIP, danger ? CHIP_DANGER : CHIP_ACCENT)}>{children}</span>;
}

function Count({ n }) {
  return (
    <span className="px-[7px] py-px text-[11px] font-semibold rounded-md text-[color:var(--text-3)] bg-[color:var(--bg-4)] tabular-nums">
      {n}
    </span>
  );
}

function Panel({ title, raised, children, extraHead, className }) {
  return (
    <section
      className={cx(PANEL, PANEL_ANIM, PANEL_FOCUS, raised && "relative z-[5]", className)}
    >
      <div className={PANEL_HEAD}>
        <h2 className={PANEL_H}>{title}</h2>
        {extraHead}
      </div>
      {children}
    </section>
  );
}

function Empty({ title, children, actions, alert }) {
  return (
    <div
      className="flex flex-col items-center gap-1 px-4 py-9 text-center border border-dashed border-[color:var(--border)] rounded-2xl text-[13px] text-[color:var(--text-3)]"
      role={alert ? "alert" : undefined}
    >
      <span className="grid mb-2 size-10 place-items-center rounded-xl bg-[color:var(--bg-3)] text-[color:var(--text-3)]" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 7h16M4 12h10M4 17h6" />
        </svg>
      </span>
      <strong className="text-sm font-semibold text-[color:var(--text)]">{title}</strong>
      <span>{children}</span>
      {actions && <div className="flex flex-wrap justify-center gap-2 mt-2.5">{actions}</div>}
    </div>
  );
}

function Notice({ message, onClose }) {
  return (
    <div
      className="flex items-start justify-between gap-3 mb-4 px-3.5 py-2.5 text-[13px] leading-[1.45] rounded-lg text-[color:var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_9%,var(--bg-2))] [animation:td-rise_.22s_ease-out_both] motion-reduce:[animation:none]"
      role="alert"
    >
      <span>{message}</span>
      <button
        type="button"
        className="px-0.5 [font:inherit] leading-none text-inherit bg-transparent border-0 cursor-pointer opacity-70 transition-opacity duration-150 hover:opacity-100 motion-reduce:transition-none"
        aria-label="Dismiss"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}

const DetailSkeleton = memo(function DetailSkeleton() {
  return (
    <>
      <div className={cx("page-header", PAGE_PAD)}>
        <div className={cx("w-[min(420px,80%)]", SKEL_PULSE)}>
          <div className={cx(SKEL_BAR, "h-2.5 w-2/5 mb-3")} />
          <div className={cx(SKEL_BAR, "h-5 w-full")} />
        </div>
      </div>
      <div className={cx("page-body", GRID, PAGE_PAD)} aria-busy="true">
        <div className={COL_BASE}>
          <div className={cx(PANEL, SKEL_PULSE, "h-[120px]")} />
          <div className={cx(PANEL, SKEL_PULSE, "h-[160px] [animation-delay:90ms]")} />
          <div className={cx(PANEL, SKEL_PULSE, "h-[220px] [animation-delay:180ms]")} />
        </div>
        <div className={COL_BASE}>
          <div className={cx(PANEL, SKEL_PULSE, "h-[220px]")} />
        </div>
      </div>
    </>
  );
});

/* ===========================================================================
 * Header
 * ========================================================================= */

const TaskHeader = memo(function TaskHeader({ task, project, projectId, isManager }) {
  const late = task.stage !== "Done" && !!task.due_date && isOverdue(task.due_date);
  return (
    <div className={cx("page-header", PAGE_PAD)}>
      <div className="min-w-0">
        <nav className="breadcrumb !flex-wrap" aria-label="Breadcrumb">
          {/* Managers get clickable links to the projects list / project.
              Members see the same trail as plain text (no navigation). */}
          {isManager ? (
            <>
              <Link to="/projects">Projects</Link>
              <span className="breadcrumb-sep">/</span>
              <Link to={`/projects/${projectId}`}>{project?.name || "Project"}</Link>
            </>
          ) : (
            <>
              <span>Projects</span>
              {project?.name && (
                <>
                  <span className="breadcrumb-sep">/</span>
                  <span>{project.name}</span>
                </>
              )}
            </>
          )}
          <span className="breadcrumb-sep">/</span>
          {task.parent_task_id ? (
            isManager ? (
              <>
                <Link to={`/projects/${projectId}/tasks/${task.parent_task_id}`}>Task</Link>
                <span className="breadcrumb-sep">/</span>
                <span aria-current="page">Sub task</span>
              </>
            ) : (
              <span aria-current="page">Sub task</span>
            )
          ) : (
            <span aria-current="page">Task</span>
          )}
        </nav>
        <h1 className="page-title !text-[26px] !font-semibold !tracking-[-0.03em] !leading-[1.2] max-w-[28ch] [overflow-wrap:anywhere] [text-wrap:balance] max-[640px]:!text-[22px]">
          {task.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-[color:var(--text-3)]">
          <span className="inline-flex items-center gap-1.5">
            <Avatar name={task.assignee_name} />
            {task.assignee_name || "Unassigned"}
          </span>
          {task.due_date && (
            <span
              className={cx(
                "tabular-nums",
                late && "font-medium text-[color:var(--danger)]",
              )}
            >
              {late ? "Overdue · " : "Due "}
              {formatDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
        <span className={`badge badge-${stageClass(task.stage)}`}>{task.stage}</span>
      </div>
    </div>
  );
});

/* ===========================================================================
 * Main column panels
 * ========================================================================= */

// Read-only, main tasks only: derived automatically from sub task stages.
const StatusPanel = memo(function StatusPanel({ stages, stageIdx, doneSubs, totalSubs }) {
  return (
    <Panel title="Status">
      <p className={cx(HINT, "-mt-1 mb-4")}>
        Set automatically from the sub tasks' progress. Change the stage on a sub task below to
        update this.
      </p>
      <ol className="flex m-0 p-0 list-none" aria-label="Task status">
        {stages.map((s, i) => {
          const past = i < stageIdx;
          const current = i === stageIdx;
          const filled = past || current;
          return (
            <li
              key={s}
              className={cx(
                "relative flex-1 flex flex-col items-start gap-2 text-xs",
                "before:content-[''] before:absolute before:top-[7px] before:left-[18px] before:-right-0.5 before:h-0.5 before:rounded-full last:before:hidden",
                past ? "before:bg-[color:var(--c)]" : "before:bg-[color:var(--bg-4)]",
                current
                  ? "text-[color:var(--text)] font-semibold"
                  : "text-[color:var(--text-3)]",
              )}
              style={stageVars(s)}
              aria-current={current ? "step" : undefined}
            >
              <span
                className={cx(
                  "relative z-[1] size-4 rounded-full border-2",
                  filled
                    ? "bg-[color:var(--c)] border-[color:var(--c)]"
                    : "bg-[color:var(--bg-2)] border-[color:var(--bg-4)]",
                  current && "shadow-[0_0_0_4px_color-mix(in_srgb,var(--c)_22%,transparent)]",
                )}
              >
                {current && (
                  <span className="absolute -inset-0.5 rounded-full bg-[color:var(--c)] pointer-events-none [animation:td-ping_2s_ease-out_infinite] motion-reduce:[animation:none]" />
                )}
              </span>
              {s}
            </li>
          );
        })}
      </ol>
      {totalSubs > 0 && (
        <div className="flex items-center gap-2.5 mt-[18px] text-xs text-[color:var(--text-3)] tabular-nums">
          <div
            className="flex-1 h-1.5 rounded-full bg-[color:var(--bg-4)] overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalSubs}
            aria-valuenow={doneSubs}
            aria-label="Sub task progress"
          >
            <div
              className={cx(
                "h-full w-full rounded-full origin-left transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none",
                doneSubs === totalSubs
                  ? "bg-[color:var(--success,#10b981)]"
                  : "bg-[color:var(--accent)]",
              )}
              style={{ transform: `scaleX(${doneSubs / totalSubs})` }}
            />
          </div>
          <span>
            {doneSubs} of {totalSubs} sub tasks done
          </span>
        </div>
      )}
    </Panel>
  );
});

const DescriptionPanel = memo(function DescriptionPanel({ text }) {
  return (
    <Panel title="Description">
      <p className="m-0 max-w-[68ch] text-[15px] leading-[1.75] text-[color:var(--text)] whitespace-pre-wrap [overflow-wrap:anywhere] [text-wrap:pretty]">
        {text || <span className="text-[color:var(--text-3)]">No description provided.</span>}
      </p>
    </Panel>
  );
});

const SubTaskItem = memo(function SubTaskItem({
  st,
  projectId,
  isManager,
  menuStages,
  menuOpen,
  busy,
  onToggleMenu,
  onPickStage,
  onEdit,
  onDelete,
}) {
  const locked = !isManager && st.stage === "Done";

  return (
    <div className={cx(SUB, PRIORITY_RAIL[st.priority])}>
      <div className="flex-[1_1_220px] min-w-0 flex flex-col gap-2">
        <Link
          to={`/projects/${projectId}/tasks/${st.id}`}
          className={cx(
            "text-sm font-semibold tracking-[-0.005em] no-underline [overflow-wrap:anywhere] underline-offset-[3px] hover:underline",
            st.stage === "Done" ? "text-[color:var(--text-3)]" : "text-[color:var(--text)]",
          )}
        >
          {st.title}
        </Link>

        <div className={META}>
          <span className="relative inline-block" data-stage-wrap>
            <button
              type="button"
              className={cx(
                `badge badge-${stageClass(st.stage)}`,
                STAGE_BTN,
                locked ? "!cursor-default" : "enabled:active:scale-[0.96]",
              )}
              aria-haspopup={locked ? undefined : "menu"}
              aria-expanded={locked ? undefined : menuOpen}
              disabled={busy}
              onClick={() => {
                if (busy || locked) return;
                onToggleMenu(st.id);
              }}
            >
              {busy ? "Moving…" : locked ? st.stage : `${st.stage} ▾`}
            </button>

            {menuOpen && (
              <div className={MENU} role="menu">
                {menuStages.map((s) => {
                  const current = s === st.stage;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="menuitem"
                      aria-current={current}
                      className={cx(
                        MENU_ITEM,
                        current
                          ? "font-bold !text-[color:var(--accent)] bg-[color:var(--bg-3)] !cursor-default"
                          : "hover:bg-[color:var(--bg-3)]",
                      )}
                      style={stageVars(s)}
                      onClick={() => onPickStage(st, s)}
                    >
                      <span className="size-2 shrink-0 rounded-full bg-[color:var(--c)]" />
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </span>

          <span className="inline-flex items-center gap-1.5">
            <Avatar name={st.assignee_name} />
            {st.assignee_name || "Unassigned"}
          </span>
          {st.due_date && (
            <span
              className={cx(
                "tabular-nums",
                st.stage !== "Done" && isOverdue(st.due_date) && "font-medium text-[color:var(--danger)]",
              )}
            >
              {formatDate(st.due_date)}
            </span>
          )}
          {st.time_taken > 0 && <Chip>{st.time_taken} min</Chip>}
          {st.rework_count > 0 && (
            <Chip danger>
              {st.rework_count} rework{st.rework_count > 1 ? "s" : ""}
            </Chip>
          )}
        </div>
      </div>

      <div className="flex gap-1 shrink-0">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(st)}>
          Edit
        </button>
        {isManager && (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-[color:var(--danger)]"
            onClick={() => onDelete(st.id)}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
});

const SubTasksPanel = memo(function SubTasksPanel({
  subtasks,
  totalTime,
  projectId,
  isManager,
  menuStages,
  openMenuId,
  stageLoading,
  onAdd,
  onEdit,
  onDelete,
  onToggleMenu,
  onPickStage,
}) {
  return (
    <Panel
      // Keeps an open stage menu above the panels below it.
      raised={openMenuId !== null}
      title={
        <>
          Sub tasks
          <Count n={subtasks.length} />
          {totalTime > 0 && <Chip>{totalTime} min total</Chip>}
        </>
      }
      extraHead={
        isManager && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onAdd}>
            + Add sub task
          </button>
        )
      }
    >
      {subtasks.length === 0 ? (
        <Empty
          title="No sub tasks yet"
          actions={
            isManager && (
              <button type="button" className="btn btn-primary btn-sm active:scale-[0.97] transition-transform" onClick={onAdd}>
                Add the first sub task
              </button>
            )
          }
        >
          This task counts as done once every sub task is done.
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {subtasks.map((st) => (
            <SubTaskItem
              key={st.id}
              st={st}
              projectId={projectId}
              isManager={isManager}
              menuStages={menuStages}
              menuOpen={openMenuId === st.id}
              busy={stageLoading === st.id}
              onToggleMenu={onToggleMenu}
              onPickStage={onPickStage}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </Panel>
  );
});

// The only place a leaf task's stage is edited directly.
const MoveStagePanel = memo(function MoveStagePanel({
  allowedStages,
  currentStage,
  changingStage,
  isManager,
  onChange,
}) {
  return (
    <Panel title="Move stage">
      <div className="inline-flex flex-wrap max-w-full gap-1 p-1 rounded-xl bg-[color:var(--bg-3)]" role="group" aria-label="Stage">
        {allowedStages.map((s) => {
          const pressed = currentStage === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              disabled={changingStage !== null || (!isManager && currentStage === "Done")}
              aria-pressed={pressed}
              className={cx(
                STAGEBAR_BTN,
                pressed
                  ? "text-[color:var(--text)] bg-[color:var(--bg-2)] shadow-[0_1px_2px_rgba(15,23,42,0.12),0_8px_16px_-10px_color-mix(in_srgb,var(--c)_70%,transparent)]"
                  : "text-[color:var(--text-2)] enabled:hover:bg-[color:color-mix(in_srgb,var(--bg-2)_55%,transparent)] enabled:hover:text-[color:var(--text)]",
              )}
              style={stageVars(s)}
            >
              <span className="size-2 shrink-0 rounded-full bg-[color:var(--c)]" />
              {changingStage === s ? "Moving…" : s}
            </button>
          );
        })}
      </div>
      {!isManager && (
        <p className={cx(HINT, "mt-2.5")}>
          {currentStage === "Done"
            ? "Approved as Done. Only a manager can move it back."
            : "A manager has to approve before this can be marked Done."}
        </p>
      )}
    </Panel>
  );
});

const CommentItem = memo(function CommentItem({ comment: c }) {
  return (
    <article className="flex gap-3 pt-4">
      <Avatar name={c.author_name} large />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2 mb-1">
          <b className="text-[13px] font-semibold text-[color:var(--text)]">{c.author_name}</b>
          <time
            className="text-[11px] text-[color:var(--text-3)] tabular-nums"
            dateTime={c.created_at}
          >
            {new Date(c.created_at).toLocaleString()}
          </time>
        </div>
        <div className="w-fit max-w-full px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-[color:var(--bg-3)] text-[13px] leading-[1.6] text-[color:var(--text)] whitespace-pre-wrap [overflow-wrap:anywhere] [text-wrap:pretty]">
          {c.content}
        </div>
      </div>
    </article>
  );
});

// Owns its draft state so typing never re-renders the rest of the page.
const CommentsPanel = memo(function CommentsPanel({ taskId, comments, onPosted, onError }) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/tasks/${taskId}/comments`, { content: comment });
      setComment("");
      await onPosted();
    } catch {
      onError("We couldn't post your comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel title={<>Comments <Count n={comments?.length || 0} /></>}>
      <form onSubmit={submit} className="mb-2">
        <textarea
          className="form-textarea"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(e);
          }}
          placeholder="Write a comment… (Ctrl+Enter to post)"
          aria-label="Write a comment"
          rows={3}
        />
        <div className="flex justify-end mt-2">
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={submitting || !comment.trim()}
          >
            {submitting ? <Loader label="Posting" size="sm" variant="button" /> : "Post comment"}
          </button>
        </div>
      </form>
      {comments?.length === 0 && (
        <p className={cx(NOTE, "mt-3")}>No comments yet. Start the conversation above.</p>
      )}
      {comments?.map((c) => (
        <CommentItem key={c.id} comment={c} />
      ))}
    </Panel>
  );
});

/* ===========================================================================
 * Sidebar
 * ========================================================================= */

const DetailsPanel = memo(function DetailsPanel({ details }) {
  return (
    <Panel title="Details">
      <dl className="m-0">
        {details.map(({ label, value, className }) => (
          <div
            key={label}
            className="flex justify-between gap-3 py-2.5 border-b border-[color:var(--border)] text-[13px] last:border-b-0 last:pb-0"
          >
            <dt className="shrink-0 pt-px text-xs text-[color:var(--text-3)]">{label}</dt>
            <dd
              className={cx(
                "m-0 text-right font-medium text-[color:var(--text)] [overflow-wrap:anywhere] tabular-nums",
                className,
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
});

const ActivityItem = memo(function ActivityItem({ activity: a }) {
  return (
    <li className="relative pb-3.5 pl-[18px] text-xs [overflow-wrap:anywhere] last:pb-0 before:content-[''] before:absolute before:left-0 before:top-[5px] before:size-[7px] before:rounded-full before:bg-[color:var(--text-3)] first:before:bg-[color:var(--accent)] first:before:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)] after:content-[''] after:absolute after:left-[3px] after:top-[15px] after:-bottom-[3px] after:w-px after:bg-[color:var(--border)] last:after:hidden">
      <span className="font-medium text-[color:var(--accent)]">{a.actor_name}</span>
      <span className="text-[color:var(--text-2)]"> {a.action}</span>
      {a.meta?.from && (
        <span className="text-[color:var(--text-3)]">
          {" "}
          ({a.meta.from} → {a.meta.to})
        </span>
      )}
      <time
        className="block mt-0.5 text-[11px] text-[color:var(--text-3)] tabular-nums"
        dateTime={a.created_at}
      >
        {new Date(a.created_at).toLocaleString()}
      </time>
    </li>
  );
});

const ActivityPanel = memo(function ActivityPanel({ activity }) {
  return (
    <Panel title="Activity">
      {activity?.length === 0 && <p className={NOTE}>No activity yet.</p>}
      <ol className="m-0 p-0 list-none">
        {activity?.map((a) => (
          <ActivityItem key={a.id} activity={a} />
        ))}
      </ol>
    </Panel>
  );
});

/* ===========================================================================
 * Modals (each owns its form state, so typing never re-renders the page)
 * ========================================================================= */

const MODAL_TEXT = "m-0 mb-4 text-[13px] leading-[1.55] text-[color:var(--text-2)]";

// Members moving a sub task to In Review must say how long it took.
function TimeTakenModal({ subtask, nextStage, onClose, onSaved }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (saving) return;
    const minutes = Number(value);

    if (!value || !Number.isInteger(minutes) || minutes <= 0 || minutes > 100000) {
      setError("Please enter a valid time between 1 and 100,000 minutes.");
      return;
    }

    setSaving(true);
    try {
      await api.put(`/tasks/${subtask.id}`, { stage: nextStage, time_taken: minutes });
      onClose();
      await onSaved(subtask);
    } catch (err) {
      console.error("Failed to save time taken:", err);
      setError(
        err?.response?.data?.message || "We couldn't save the time taken. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Time taken" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className={MODAL_TEXT}>
          Moving <strong className="text-[color:var(--text)]">{subtask?.title}</strong> to{" "}
          <strong className="text-[color:var(--text)]">In Review</strong>. How long did this sub
          task take?
        </p>
        <div className="form-group">
          <label className="form-label" htmlFor="td-time-taken">
            Time taken (minutes) *
          </label>
          <input
            id="td-time-taken"
            className="form-input"
            type="number"
            inputMode="numeric"
            min="1"
            max="100000"
            step="1"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="e.g. 45"
            aria-invalid={!!error}
            aria-describedby={error ? "td-time-taken-error" : undefined}
            autoFocus
          />
          {error && (
            <div
              id="td-time-taken-error"
              className="mt-1.5 text-xs text-[color:var(--danger)]"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Confirm and move"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Manager decision when a sub task is moved to Done: approve or send for rework.
function ReviewModal({ subtask, onClose, onSaved }) {
  const [action, setAction] = useState(null); // "done" | "rework"
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!action || saving) return;
    setSaving(true);
    setError("");
    try {
      await api.put(`/tasks/${subtask.id}`, {
        ...subtask,
        stage: action === "done" ? "Done" : "Rework",
        time_taken: null,
        new_due_date: action === "rework" && deadline ? deadline : null,
      });
      onClose();
      await onSaved(subtask);
    } catch (err) {
      setError(
        err?.response?.data?.message || "We couldn't save this decision. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const rework = action === "rework";

  return (
    <Modal title="Review sub task" onClose={onClose}>
      <p className={MODAL_TEXT}>
        What would you like to do with{" "}
        <strong className="text-[color:var(--text)]">"{subtask?.title}"</strong>?
      </p>

      <div
        className="grid grid-cols-1 min-[481px]:grid-cols-2 gap-3 mb-5"
        role="group"
        aria-label="Review decision"
      >
        {CHOICES.map((c) => {
          const pressed = action === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={pressed}
              onClick={() => setAction(c.key)}
              className={cx(
                "flex flex-col items-center gap-1 px-3 py-[18px] cursor-pointer border-[1.5px] rounded-xl transition-[border-color,background-color,transform] duration-200 active:scale-[0.98] motion-reduce:transition-none focus-visible:[outline:2px_solid_var(--accent)] focus-visible:outline-offset-2",
                pressed
                  ? c.on
                  : "text-[color:var(--text)] bg-[color:var(--bg-2)] border-[color:var(--border)] hover:border-[color:var(--text-3)]",
              )}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {c.icon}
              </svg>
              <b className="mt-1.5 text-[13px] font-semibold">{c.title}</b>
              <span className="text-[11px] text-[color:var(--text-3)]">{c.hint}</span>
            </button>
          );
        })}
      </div>

      {rework && (
        <div className="form-group mb-4 p-3.5 bg-[color:var(--bg-3)] border border-[color:var(--border)] rounded-[10px]">
          <label className="form-label">New deadline (optional)</label>
          <DatePicker value={deadline} onChange={setDeadline} placeholder="dd-mm-yyyy" />
          <div className={cx(HINT, "mt-1.5")}>Set a new due date for the rework cycle.</div>
        </div>
      )}

      {error && (
        <div className="-mt-2 mb-3.5 text-xs text-[color:var(--danger)]" role="alert">
          {error}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className={cx(
            "btn btn-primary",
            rework && "!bg-[color:var(--danger)] !border-[color:var(--danger)]",
          )}
          onClick={submit}
          disabled={!action || saving}
        >
          {saving
            ? "Saving…"
            : action === "done"
              ? "Mark done"
              : rework
                ? "Send for rework"
                : "Select an action"}
        </button>
      </div>
    </Modal>
  );
}

/* ===========================================================================
 * Page
 * ========================================================================= */

export default function TaskDetail() {
  const { id: projectId, taskId } = useParams();
  const { user, isManager } = useAuth();

  const [notice, setNotice] = useState("");
  const { task, project, members, loading, loadError, load, loadTaskOnly, retry } =
    useTaskDetail({ taskId, projectId, isManager, onNotice: setNotice });

  const [changingStage, setChangingStage] = useState(null);
  const [stageLoading, setStageLoading] = useState(null); // sub task id being moved
  const [stageDropdown, setStageDropdown] = useState(null); // sub task id with open menu

  // Modal state: null = closed.
  const [subModal, setSubModal] = useState(null); // { task: subtask | null }
  const [savingSubTask, setSavingSubTask] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, message, action, loading, isDangerous }
  const [timeTaken, setTimeTaken] = useState(null); // { subtask, nextStage }
  const [review, setReview] = useState(null); // { subtask }

  // Auto-dismiss the inline notice.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Close the sub task stage menu on outside click or Escape.
  useEffect(() => {
    if (stageDropdown === null) return;
    const onDown = (e) => {
      if (!e.target.closest?.("[data-stage-wrap]")) setStageDropdown(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setStageDropdown(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [stageDropdown]);

  // Everything derived from the task, computed once per task/project change.
  const view = useMemo(() => {
    if (!task) return null;

    const stages = project?.custom_stages || task.project_stages || DEFAULT_STAGES;
    const allowedStages = isManager ? stages : stages.filter((s) => s !== "Done");
    const subtasks = task.subtasks || EMPTY;
    let doneSubs = 0;
    let totalTime = 0;
    for (const s of subtasks) {
      if (s.stage === "Done") doneSubs++;
      totalTime += s.time_taken || 0;
    }
    const dueOverdue =
      task.stage !== "Done" && !!task.due_date && isOverdue(task.due_date);

    const details = [
      { label: "Assignee", value: task.assignee_name || "—" },
      { label: "Priority", value: task.priority, className: "capitalize" },
      {
        label: "Due date",
        value: task.due_date
          ? `${formatDate(task.due_date)}${dueOverdue ? " · Overdue" : ""}`
          : "—",
        className: dueOverdue ? "!text-[color:var(--danger)] font-semibold" : "",
      },
      { label: "Cluster", value: task.cluster_name || "No cluster" },
      { label: "Created", value: task.created_at ? formatDate(task.created_at) : "—" },
      ...(totalTime > 0 ? [{ label: "Total time", value: `${totalTime} min` }] : []),
    ];

    return {
      stages,
      allowedStages,
      subtasks,
      isLeaf: !!task.parent_task_id || subtasks.length === 0,
      doneSubs,
      totalTime,
      stageIdx: stages.indexOf(task.stage),
      details,
    };
  }, [task, project, isManager]);

  /* ---------- handlers ---------- */

  const dismissNotice = useCallback(() => setNotice(""), []);
  const closeSubModal = useCallback(() => setSubModal(null), []);
  const closeConfirm = useCallback(() => setConfirm(null), []);
  const closeTimeTaken = useCallback(() => setTimeTaken(null), []);
  const closeReview = useCallback(() => setReview(null), []);
  const openTimeTaken = useCallback(
    (subtask, nextStage) => setTimeTaken({ subtask, nextStage }),
    [],
  );
  const openReview = useCallback((subtask) => setReview({ subtask }), []);

  // After changing a sub task (or the task itself), refresh only what changed.
  const refreshFor = useCallback(
    (subtask) => (String(subtask.id) === String(taskId) ? load() : loadTaskOnly()),
    [taskId, load, loadTaskOnly],
  );

  // Move a sub task straight to a stage (no modal needed).
  const moveSubTask = useCallback(
    async (st, stage, extra, refresh) => {
      setStageLoading(st.id);
      try {
        await api.put(`/tasks/${st.id}`, { ...st, stage, ...extra });
        await refresh();
      } catch {
        setNotice(`We couldn't move "${st.title}" to ${stage}. Please try again.`);
      } finally {
        setStageLoading(null);
      }
    },
    [],
  );

  const handleSubTaskStageSelect = useCallback(
    async (st, chosen) => {
      setStageDropdown(null);
      if (!chosen || chosen === st.stage) return;
      // Members can't reopen a Done sub task.
      if (!isManager && st.stage === "Done") return;

      if (!isManager) {
        if (chosen === "Done") return;
        if (chosen === "In Review") return openTimeTaken(st, chosen);
        return moveSubTask(st, chosen, { time_taken: null }, loadTaskOnly);
      }

      if (chosen === "Done") return openReview(st);
      return moveSubTask(st, chosen, null, () => refreshFor(st));
    },
    [isManager, openTimeTaken, openReview, moveSubTask, loadTaskOnly, refreshFor],
  );

  // Stage buttons on a leaf task (main task stage is derived, never edited).
  const handleStageChange = useCallback(
    async (stage) => {
      if (stage === task.stage) return;
      // Members can't move a task out of Done — only a manager can reopen it.
      if (!isManager && task.stage === "Done") return;

      if (view.isLeaf) {
        // Members moving into In Review must enter time taken.
        if (!isManager && stage === "In Review" && task.stage !== "In Review") {
          return openTimeTaken(task, stage);
        }
        // Managers moving to Done go through the review decision.
        if (isManager && stage === "Done" && task.stage !== "Done") {
          return openReview(task);
        }
      }

      setChangingStage(stage);
      try {
        await api.put(`/tasks/${taskId}`, { ...task, stage });
        await load();
      } catch {
        setNotice(`We couldn't move this task to ${stage}. Please try again.`);
      } finally {
        setChangingStage(null);
      }
    },
    [task, view, isManager, taskId, load, openTimeTaken, openReview],
  );

  const handleSaveSubTask = useCallback(
    async (data) => {
      const editing = subModal?.task ?? null;

      // Manager moving In Review → Done via the edit popup gets the review modal instead.
      if (isManager && editing?.stage === "In Review" && data.stage === "Done") {
        setSubModal(null);
        openReview(editing);
        return;
      }

      setSavingSubTask(true);
      try {
        if (editing) {
          await api.put(`/tasks/${editing.id}`, data);
        } else {
          await api.post("/tasks", {
            ...data,
            project_id: projectId,
            parent_task_id: taskId,
            cluster_id: task.cluster_id,
          });
        }
        setSubModal(null);
        load();
      } catch {
        // Modal stays open so nothing typed is lost.
        setNotice("We couldn't save the sub task. Please try again.");
      } finally {
        setSavingSubTask(false);
      }
    },
    [subModal, isManager, projectId, taskId, task, load, openReview],
  );

  const handleDeleteSubTask = useCallback(
    (id) =>
      setConfirm({
        title: "Delete sub task",
        message: "Are you sure you want to delete this sub task?",
        isDangerous: true,
        loading: false,
        action: async () => {
          await api.delete(`/tasks/${id}`);
          load();
        },
      }),
    [load],
  );

  const executeConfirmAction = useCallback(async () => {
    if (!confirm?.action) return;
    setConfirm((prev) => ({ ...prev, loading: true }));
    try {
      await confirm.action();
    } catch {
      setNotice("We couldn't complete that action. Please try again.");
    } finally {
      setConfirm(null);
    }
  }, [confirm]);

  const addSubTask = useCallback(() => setSubModal({ task: null }), []);
  const editSubTask = useCallback((st) => setSubModal({ task: st }), []);
  const toggleMenu = useCallback(
    (id) => setStageDropdown((prev) => (prev === id ? null : id)),
    [],
  );

  /* ---------- render ---------- */

  let body;

  if (loading) {
    body = <DetailSkeleton />;
  } else if (!task) {
    const failed = loadError === "failed";
    body = (
      <div className={cx("page-body", PAGE_PAD)}>
        <Empty
          alert
          title={failed ? "We couldn't load this task" : "Task not found"}
          actions={
            <>
              {failed && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
                  Try again
                </button>
              )}
              <Link to={`/projects/${projectId}`} className="btn btn-ghost btn-sm">
                Back to project
              </Link>
            </>
          }
        >
          {failed
            ? "Check your connection and try again."
            : "It may have been deleted, or you may not have access to it."}
        </Empty>
      </div>
    );
  } else {
    const { stages, allowedStages, subtasks, isLeaf, doneSubs, totalTime, stageIdx, details } =
      view;
    const isMain = !task.parent_task_id;

    body = (
      <>
        <TaskHeader task={task} project={project} projectId={projectId} isManager={isManager} />

        <main className={cx("page-body", PAGE_PAD)}>
          {notice && <Notice message={notice} onClose={dismissNotice} />}

          <div className={GRID}>
            <div className={COL}>
              {isMain && (
                <StatusPanel
                  stages={stages}
                  stageIdx={stageIdx}
                  doneSubs={doneSubs}
                  totalSubs={subtasks.length}
                />
              )}

              <DescriptionPanel text={task.description || task.details || task.desc} />

              {isMain && (
                <SubTasksPanel
                  subtasks={subtasks}
                  totalTime={totalTime}
                  projectId={projectId}
                  isManager={isManager}
                  menuStages={allowedStages}
                  openMenuId={stageDropdown}
                  stageLoading={stageLoading}
                  onAdd={addSubTask}
                  onEdit={editSubTask}
                  onDelete={handleDeleteSubTask}
                  onToggleMenu={toggleMenu}
                  onPickStage={handleSubTaskStageSelect}
                />
              )}

              {isLeaf && (
                <MoveStagePanel
                  allowedStages={allowedStages}
                  currentStage={task.stage}
                  changingStage={changingStage}
                  isManager={isManager}
                  onChange={handleStageChange}
                />
              )}

              <CommentsPanel
                taskId={taskId}
                comments={task.comments}
                onPosted={load}
                onError={setNotice}
              />
            </div>

            <aside className={COL} aria-label="Task details">
              <DetailsPanel details={details} />
              <ActivityPanel activity={task.activity} />
            </aside>
          </div>
        </main>

        {subModal && (
          <Modal
            title={subModal.task ? "Edit sub task" : "New sub task"}
            onClose={closeSubModal}
          >
            <TaskForm
              initial={subModal.task}
              members={members}
              stages={stages}
              hideCluster={true}
              onSave={handleSaveSubTask}
              onCancel={closeSubModal}
              saving={savingSubTask}
              userRole={user?.role}
              isSubtaskForm
            />
          </Modal>
        )}

        <ConfirmModal
          isOpen={!!confirm}
          title={confirm?.title ?? ""}
          message={confirm?.message ?? ""}
          confirmText={confirm?.isDangerous ? "Delete" : "Confirm"}
          isDangerous={!!confirm?.isDangerous}
          onConfirm={executeConfirmAction}
          onCancel={closeConfirm}
          loading={!!confirm?.loading}
        />

        {timeTaken && (
          <TimeTakenModal
            subtask={timeTaken.subtask}
            nextStage={timeTaken.nextStage}
            onClose={closeTimeTaken}
            onSaved={refreshFor}
          />
        )}

        {review && <ReviewModal subtask={review.subtask} onClose={closeReview} onSaved={refreshFor} />}
      </>
    );
  }

  return (
    <>
      <style>{KEYFRAMES}</style>
      {body}
    </>
  );
}