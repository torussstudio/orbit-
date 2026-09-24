import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";
import Loader from "../components/ui/Loader";

// Todo / In Progress switch instantly. In Review needs a time-taken
// value first, so it's handled separately (see handleStageSelect) —
// listed here too so it shows up as a pickable option in the dropdown.
// "Done" is intentionally not here: members can't mark tasks Done, that
// needs manager approval.
const QUICK_STAGES = ["Todo", "In Progress", "In Review"];

// Options for the status filter bar. "Done" is included here so members
// can see their approved / completed tasks, even though they can't set it.
// Done tasks are hidden from "All" and only show under the Done filter.
const STATUS_FILTERS = ["all", "Todo", "In Progress", "In Review", "Done"];

// "In Progress" -> "inprogress". Used for badge classes and the
// stage-colour classes (tv-dot-*, tv-row-*) in the style block below.
const stageKey = (s) => s?.toLowerCase().replace(/\s/g, "");

function StageDropdown({ task, onChange, locked = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Done tasks are approved by a manager — members see a plain badge,
  // no dropdown, so they can't reopen them.
  if (locked) {
    return (
      <span className={`badge badge-${stageKey(task.stage)}`}>{task.stage}</span>
    );
  }

  return (
    <div ref={ref} className="tv-stage">
      <span
        className={`badge badge-${stageKey(task.stage)} tv-stage-badge`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((p) => !p);
        }}
      >
        {task.stage} ▾
      </span>
      {open && (
        <div className="tv-stage-menu" onClick={(e) => e.preventDefault()}>
          {QUICK_STAGES.filter((s) => s !== task.stage).map((s) => (
            <div
              key={s}
              className="tv-stage-item"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onChange(task, s);
              }}
            >
              <span className={`tv-dot tv-dot-${stageKey(s)}`} />
              <span className={`badge badge-${stageKey(s)}`}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskView() {
  const { isManager } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [timeTakenModal, setTimeTakenModal] = useState({ show: false, task: null });
  const [timeTakenInput, setTimeTakenInput] = useState("");
  const [timeTakenError, setTimeTakenError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard/my-tasks")
      .then((r) => setTasks(r.data.tasks || []))
      .finally(() => setLoading(false));
  }, []);

  // Distinct projects across everything assigned to this member — drives
  // the filter dropdown. If a member has tasks in 8 different projects,
  // all 8 show up here as options.
  const projectOptions = Array.from(
    new Map(tasks.map((t) => [t.project_id, t.project_name])).entries()
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // The API already scopes this to tasks assigned to the current member —
  // that includes sub tasks AND standalone main tasks (created with the
  // "Enable Subtask" toggle off, which get a direct assignee of their own).
  // Main tasks that use subtasks aren't assigned to anyone directly, so
  // they won't show up here regardless.
  const projectTasks =
    projectFilter === "all"
      ? tasks
      : tasks.filter((t) => String(t.project_id) === String(projectFilter));

  // Counts shown on the status filter pills. Based on the project filter,
  // so the numbers always match what you'd see after picking that pill.
  const statusCounts = {
    all: projectTasks.filter((t) => t.stage !== "Done").length,
  };
  STATUS_FILTERS.slice(1).forEach((s) => {
    statusCounts[s] = projectTasks.filter((t) => t.stage === s).length;
  });

  // "All" only shows active work. Completed (Done) tasks are visible
  // only when the Done filter is selected.
  const myTasks =
    statusFilter === "all"
      ? projectTasks.filter((t) => t.stage !== "Done")
      : projectTasks.filter((t) => t.stage === statusFilter);

  const handleStageSelect = (task, newStage) => {
    // In Review needs a time-taken value first — same popup as the task
    // detail page — so it doesn't switch instantly like Todo/In Progress.
    if (newStage === "In Review") {
      setTimeTakenInput("");
      setTimeTakenError("");
      setTimeTakenModal({ show: true, task });
      return;
    }
    handleStageChange(task, newStage);
  };

  const handleStageChange = async (task, newStage, extra = {}) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, stage: newStage, ...extra } : t))
    );
    try {
      await api.put(`/tasks/${task.id}`, { ...task, stage: newStage, ...extra });
    } catch (err) {
      console.error("Failed to update stage:", err.message);
      // revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, stage: task.stage } : t))
      );
    }
  };

  const handleTimeTakenSubmit = async () => {
    if (!timeTakenInput || isNaN(timeTakenInput) || parseInt(timeTakenInput) <= 0) {
      setTimeTakenError("Please enter a valid time in minutes.");
      return;
    }
    const { task } = timeTakenModal;
    await handleStageChange(task, "In Review", { time_taken: parseInt(timeTakenInput) });
    setTimeTakenModal({ show: false, task: null });
    setTimeTakenInput("");
  };

  if (loading)
    return (
      <Loader label="Loading tasks" size="lg" variant="page" />
    );

  return (
    <>
      <style>{`
        .tv-project-filter {
          min-width: 200px;
        }

        /* ---------- Status filter tabs ---------- */
        .tv-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .tv-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 8px 7px 14px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          font-family: inherit;
          color: var(--text-2);
          background: var(--bg-2);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .tv-tab:hover {
          background: var(--bg-3);
        }
        .tv-tab.active {
          color: #fff;
          background: var(--accent);
          border-color: var(--accent);
        }
        .tv-tab-count {
          min-width: 22px;
          padding: 1px 7px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          text-align: center;
          color: var(--text-3);
          background: var(--bg-3);
        }
        .tv-tab.active .tv-tab-count {
          color: #fff;
          background: rgba(255, 255, 255, 0.22);
        }

        /* ---------- Stage colours (dots + row accent) ---------- */
        .tv-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          background: var(--text-3);
        }
        .tv-dot-todo { background: #a78bfa; }
        .tv-dot-inprogress { background: #f59e0b; }
        .tv-dot-inreview { background: #3b82f6; }
        .tv-dot-done { background: #10b981; }
        .tv-tab.active .tv-dot { background: rgba(255, 255, 255, 0.9); }

        /* ---------- Task list ---------- */
        .tv-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .tv-row {
          display: block;
          padding: 14px 16px;
          text-decoration: none;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-left: 3px solid var(--border);
          border-radius: 10px;
          transition: box-shadow 0.15s ease, transform 0.15s ease;
        }
        .tv-row:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
        }
        .tv-row-todo { border-left-color: #a78bfa; }
        .tv-row-inprogress { border-left-color: #f59e0b; }
        .tv-row-inreview { border-left-color: #3b82f6; }
        .tv-row-done { border-left-color: #10b981; }

        .tv-row-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .tv-row-main {
          min-width: 0;
          flex: 1;
        }
        .tv-parent {
          margin-bottom: 3px;
          font-size: 11px;
          color: var(--text-3);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tv-title {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.4;
          color: var(--text);
          overflow-wrap: anywhere;
        }
        .tv-row.tv-row-done .tv-title {
          color: var(--text-2);
        }

        .tv-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 10px;
          font-size: 11px;
          color: var(--text-3);
        }
        .tv-chip {
          padding: 2px 8px;
          border-radius: 6px;
          font-weight: 600;
          color: var(--text-2);
          background: var(--bg-3);
        }
        .tv-meta-sep {
          opacity: 0.5;
        }
        .tv-due-overdue {
          font-weight: 600;
          color: var(--danger);
        }

        /* ---------- Stage dropdown ---------- */
        .tv-stage {
          position: relative;
          flex-shrink: 0;
        }
        .tv-stage-badge {
          cursor: pointer;
        }
        .tv-stage-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          z-index: 50;
          min-width: 160px;
          padding: 4px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
        }
        .tv-stage-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        .tv-stage-item:hover {
          background: var(--bg-3);
        }

        /* ---------- Empty state ---------- */
        .tv-empty {
          padding: 48px 16px;
          text-align: center;
          color: var(--text-3);
        }
        .tv-empty-icon {
          margin-bottom: 8px;
          font-size: 32px;
        }
        .tv-empty-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-2);
        }
        .tv-empty-sub {
          margin-top: 4px;
          font-size: 12px;
        }

        /* ---------- Time taken modal ---------- */
        .tv-modal-text {
          margin-bottom: 16px;
          font-size: 13px;
          color: var(--text-2);
        }
        .tv-modal-error {
          margin-top: 6px;
          font-size: 12px;
          color: var(--danger);
        }

        @media (max-width: 640px) {
          .tv-project-filter { min-width: 0; width: 100%; }
          .tv-row { padding: 12px; }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">Task View</div>
          <div className="page-subtitle">Every task assigned to you, across all projects</div>
        </div>
        {projectOptions.length > 0 && (
          <div className="tv-project-filter">
            <Select value={projectFilter} onChange={setProjectFilter}>
              <option value="all">All Projects</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="page-body">
        {tasks.length > 0 && (
          <div className="tv-tabs">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`tv-tab ${statusFilter === s ? "active" : ""}`}
              >
                {s !== "all" && <span className={`tv-dot tv-dot-${stageKey(s)}`} />}
                {s === "all" ? "All" : s}
                <span className="tv-tab-count">{statusCounts[s]}</span>
              </button>
            ))}
          </div>
        )}

        {myTasks.length === 0 ? (
          <div className="card tv-empty">
            <div className="tv-empty-icon">📭</div>
            <div className="tv-empty-title">
              {tasks.length === 0
                ? "No tasks assigned to you"
                : statusFilter === "all"
                  ? "No active tasks"
                  : "No tasks match the selected filters"}
            </div>
            {tasks.length > 0 && (
              <div className="tv-empty-sub">
                {statusFilter === "all"
                  ? "Completed tasks are under the Done tab."
                  : "Try a different status or project."}
              </div>
            )}
          </div>
        ) : (
          <div className="tv-list">
            {myTasks.map((t) => {
              const overdue = t.stage !== "Done" && isOverdue?.(t.due_date);
              return (
                <Link
                  to={`/projects/${t.project_id}/tasks/${t.id}`}
                  key={t.id}
                  className={`tv-row tv-row-${stageKey(t.stage)}`}
                >
                  <div className="tv-row-top">
                    <div className="tv-row-main">
                      {t.parent_title && <div className="tv-parent">{t.parent_title} ›</div>}
                      <div className="tv-title">{t.title}</div>
                    </div>
                    <StageDropdown
                      task={t}
                      onChange={handleStageSelect}
                      locked={t.stage === "Done" && !isManager}
                    />
                  </div>
                  <div className="tv-meta">
                    <span className="tv-chip">{t.project_name}</span>
                    <span>{t.cluster_name || "No cluster"}</span>
                    {t.due_date && (
                      <>
                        <span className="tv-meta-sep">·</span>
                        <span className={overdue ? "tv-due-overdue" : ""}>
                          Due {formatDate(t.due_date)}
                          {overdue ? " · Overdue" : ""}
                        </span>
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {timeTakenModal.show && (
        <Modal
          title="Time Taken"
          onClose={() => setTimeTakenModal({ show: false, task: null })}
        >
          <p className="tv-modal-text">
            Moving <strong>{timeTakenModal.task?.title}</strong> to <strong>In Review</strong>.
            How long did this task take?
          </p>
          <div className="form-group">
            <label className="form-label">Time Taken (minutes) *</label>
            <input
              className="form-input"
              type="number"
              min="1"
              value={timeTakenInput}
              onChange={(e) => { setTimeTakenInput(e.target.value); setTimeTakenError(""); }}
              placeholder="e.g. 45"
              autoFocus
            />
            {timeTakenError && <div className="tv-modal-error">{timeTakenError}</div>}
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setTimeTakenModal({ show: false, task: null })}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleTimeTakenSubmit}>
              Confirm & Move
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}