import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";

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
// stage-colour classes (tv-dot-*) in the style block below.
const stageKey = (s) => s?.toLowerCase().replace(/\s/g, "");

function StageDropdown({ task, onChange, locked = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
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

  // Done tasks are approved by a manager — members see a plain badge,
  // no dropdown, so they can't reopen them.
  if (locked) {
    return (
      <span className={`badge badge-${stageKey(task.stage)}`}>{task.stage}</span>
    );
  }

  const activate = (e, fn) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };

  return (
    <div ref={ref} className="tv-stage">
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Stage: ${task.stage}. Change stage`}
        className={`badge badge-${stageKey(task.stage)} tv-stage-badge`}
        onClick={() => setOpen((p) => !p)}
        onKeyDown={(e) => activate(e, () => setOpen((p) => !p))}
      >
        {task.stage} ▾
      </span>
      {open && (
        <div className="tv-stage-menu" role="menu">
          {QUICK_STAGES.filter((s) => s !== task.stage).map((s) => {
            const pick = () => {
              setOpen(false);
              triggerRef.current?.focus();
              onChange(task, s);
            };
            return (
              <div
                key={s}
                role="menuitem"
                tabIndex={0}
                className="tv-stage-item"
                onClick={pick}
                onKeyDown={(e) => activate(e, pick)}
              >
                <span className={`tv-dot tv-dot-${stageKey(s)}`} />
                <span className={`badge badge-${stageKey(s)}`}>{s}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskSkeleton() {
  return (
    <ul className="tv-list" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="tv-item">
          <div className="tv-row">
            <div className="tv-skel tv-skel-title" />
            <div className="tv-skel tv-skel-meta" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function TaskView() {
  const { isManager } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [timeTakenModal, setTimeTakenModal] = useState({ show: false, task: null });
  const [timeTakenInput, setTimeTakenInput] = useState("");
  const [timeTakenError, setTimeTakenError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/dashboard/my-tasks")
      .then((r) => setTasks(r.data.tasks || []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  // Auto-dismiss the inline notice.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);

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

  const filtersActive = statusFilter !== "all" || projectFilter !== "all";

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

  // Returns true on success so callers (the time-taken modal) know
  // whether to close.
  const handleStageChange = async (task, newStage, extra = {}) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, stage: newStage, ...extra } : t))
    );
    try {
      await api.put(`/tasks/${task.id}`, { ...task, stage: newStage, ...extra });
      return true;
    } catch (err) {
      console.error("Failed to update stage:", err.message);
      // revert on failure (restores time_taken too, not just stage)
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setNotice(`We couldn't move "${task.title}" to ${newStage}. Please try again.`);
      return false;
    }
  };

  const closeModal = () => {
    setTimeTakenModal({ show: false, task: null });
    setTimeTakenInput("");
    setTimeTakenError("");
  };

  const handleTimeTakenSubmit = async (e) => {
    e?.preventDefault();
    const minutes = Number(timeTakenInput);
    if (!timeTakenInput || !Number.isInteger(minutes) || minutes <= 0) {
      setTimeTakenError("Enter the time in whole minutes.");
      return;
    }
    const { task } = timeTakenModal;
    setSaving(true);
    const ok = await handleStageChange(task, "In Review", { time_taken: minutes });
    setSaving(false);
    if (ok) closeModal();
    else setTimeTakenError("We couldn't save this. Please try again.");
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setProjectFilter("all");
  };

  return (
    <>
      <style>{`
        .tv-project-filter {
          min-width: 200px;
        }

        .tv-notice {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
          padding: 10px 14px;
          font-size: 13px;
          line-height: 1.45;
          color: var(--danger);
          background: color-mix(in srgb, var(--danger) 9%, var(--bg-2));
          border-radius: 8px;
          animation: tv-rise 0.22s ease-out both;
        }
        .tv-notice-close {
          padding: 0 2px;
          font: inherit;
          line-height: 1;
          color: inherit;
          background: none;
          border: 0;
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.15s ease;
        }
        .tv-notice-close:hover { opacity: 1; }

        /* ---------- Status filter tabs ---------- */
        .tv-tabs {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .tv-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          font-family: inherit;
          letter-spacing: 0.01em;
          color: var(--text-2);
          background: transparent;
          border: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease,
            color 0.2s ease, transform 0.12s ease;
        }
        .tv-tab:hover { background: var(--bg-2); }
        .tv-tab:active { transform: scale(0.97); }
        .tv-tab:focus-visible,
        .tv-stage-badge:focus-visible,
        .tv-stage-item:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .tv-tab.active {
          font-weight: 600;
          color: #fff;
          background: var(--accent);
          border-color: var(--accent);
        }
        .tv-tab-count {
          min-width: 22px;
          padding: 1px 6px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          text-align: center;
          color: var(--text-3);
          background: var(--bg-3);
        }
        .tv-tab.active .tv-tab-count {
          color: #fff;
          background: rgba(255, 255, 255, 0.22);
        }

        /* ---------- Stage colours ---------- */
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

        /* ---------- Task list: one grouped surface, hairline dividers ---------- */
        .tv-list {
          list-style: none;
          margin: 0;
          padding: 0;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 14px;
        }
        .tv-item {
          position: relative;
          animation: tv-rise 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
          animation-delay: calc(var(--i, 0) * 35ms);
        }
        .tv-item + .tv-item { border-top: 1px solid var(--border); }
        .tv-item:first-child { border-radius: 13px 13px 0 0; }
        .tv-item:last-child { border-radius: 0 0 13px 13px; }
        .tv-item:only-child { border-radius: 13px; }
        /* keep an open stage menu above the rows below it */
        .tv-item:has(.tv-stage-menu) { z-index: 5; }

        .tv-row {
          position: relative;
          padding: 16px 18px 15px;
          border-radius: inherit;
          transition: background 0.2s ease;
        }
        .tv-item:hover .tv-row { background: var(--bg-3); }

        .tv-row-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
        }
        .tv-row-main {
          min-width: 0;
          flex: 1;
        }
        .tv-parent {
          margin-bottom: 3px;
          font-size: 11px;
          letter-spacing: 0.01em;
          color: var(--text-3);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tv-title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.4;
          letter-spacing: -0.005em;
          color: var(--text);
          overflow-wrap: anywhere;
          text-wrap: pretty;
        }
        .tv-row-done .tv-title { color: var(--text-2); }

        /* Whole row is clickable via the title link; the stage control
           sits above it (z-index) so it never triggers navigation. */
        .tv-link {
          color: inherit;
          text-decoration: none;
        }
        .tv-link::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
        }
        .tv-link:focus-visible { outline: none; }
        .tv-link:focus-visible::after {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
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
          padding: 2px 7px;
          border-radius: 5px;
          font-weight: 600;
          color: var(--text-2);
          background: var(--bg-3);
        }
        .tv-item:hover .tv-chip { background: var(--bg-2); }
        .tv-meta-sep { opacity: 0.5; }
        .tv-due {
          font-variant-numeric: tabular-nums;
        }
        .tv-due-overdue {
          font-weight: 600;
          color: var(--danger);
        }

        /* ---------- Stage dropdown ---------- */
        .tv-stage {
          position: relative;
          z-index: 2;
          flex-shrink: 0;
        }
        .tv-stage-badge {
          cursor: pointer;
          transition: transform 0.12s ease, filter 0.2s ease;
        }
        .tv-stage-badge:hover { filter: brightness(0.96); }
        .tv-stage-badge:active { transform: scale(0.96); }
        .tv-stage-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          z-index: 10;
          min-width: 160px;
          padding: 4px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
          transform-origin: top right;
          animation: tv-pop 0.16s ease-out both;
        }
        .tv-stage-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .tv-stage-item:hover { background: var(--bg-3); }

        /* ---------- Skeleton ---------- */
        .tv-skel {
          position: relative;
          overflow: hidden;
          border-radius: 6px;
          background: var(--bg-3);
        }
        .tv-skel::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18), transparent);
          transform: translateX(-100%);
          animation: tv-shimmer 1.4s ease-in-out infinite;
        }
        .tv-skel-title { width: 62%; height: 14px; }
        .tv-skel-meta { width: 34%; height: 11px; margin-top: 12px; }

        /* ---------- Empty / error state ---------- */
        .tv-empty {
          padding: 56px 16px 60px;
          text-align: center;
          color: var(--text-3);
        }
        .tv-empty-icon {
          display: inline-flex;
          margin-bottom: 14px;
          color: var(--text-3);
        }
        .tv-empty-title {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.005em;
          color: var(--text-2);
        }
        .tv-empty-sub {
          margin: 4px auto 0;
          max-width: 34ch;
          font-size: 12px;
          line-height: 1.5;
          text-wrap: balance;
        }
        .tv-empty-action { margin-top: 16px; }

        /* ---------- Time taken modal ---------- */
        .tv-modal-text {
          margin-bottom: 16px;
          font-size: 13px;
          line-height: 1.5;
          color: var(--text-2);
        }
        .tv-modal-error {
          margin-top: 6px;
          font-size: 12px;
          color: var(--danger);
        }

        @keyframes tv-rise {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes tv-pop {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes tv-shimmer {
          to { transform: translateX(100%); }
        }

        @media (max-width: 640px) {
          .tv-project-filter { min-width: 0; width: 100%; }
          .tv-row { padding: 14px 14px 13px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .tv-item, .tv-notice, .tv-stage-menu { animation: none; }
          .tv-skel::after { animation: none; }
          .tv-tab, .tv-row, .tv-stage-badge { transition: none; }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">Task view</div>
          <div className="page-subtitle">Every task assigned to you, across all projects</div>
        </div>
        {projectOptions.length > 0 && (
          <div className="tv-project-filter">
            <Select value={projectFilter} onChange={setProjectFilter}>
              <option value="all">All projects</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="page-body" aria-busy={loading}>
        {notice && (
          <div className="tv-notice" role="alert">
            <span>{notice}</span>
            <button
              type="button"
              className="tv-notice-close"
              aria-label="Dismiss"
              onClick={() => setNotice("")}
            >
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <TaskSkeleton />
        ) : loadError ? (
          <div className="card tv-empty" role="alert">
            <div className="tv-empty-title">We couldn't load your tasks</div>
            <div className="tv-empty-sub">Check your connection and try again.</div>
            <div className="tv-empty-action">
              <button className="btn btn-ghost" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        ) : (
          <>
            {tasks.length > 0 && (
              <div className="tv-tabs" role="group" aria-label="Filter by status">
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={statusFilter === s}
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
                <div className="tv-empty-icon" aria-hidden="true">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 13.5 5.6 5.9A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.4L21 13.5" />
                    <path d="M3 13.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18v-4.5h-5.2a1 1 0 0 0-.9.6 3.2 3.2 0 0 1-5.8 0 1 1 0 0 0-.9-.6H3Z" />
                  </svg>
                </div>
                <div className="tv-empty-title">
                  {tasks.length === 0
                    ? "No tasks assigned to you"
                    : statusFilter === "all"
                      ? "No active tasks"
                      : "No tasks match these filters"}
                </div>
                {tasks.length > 0 && (
                  <div className="tv-empty-sub">
                    {statusFilter === "all" && projectFilter === "all"
                      ? "Completed tasks are under the Done tab."
                      : "Try a different status or project."}
                  </div>
                )}
                {tasks.length > 0 && filtersActive && (
                  <div className="tv-empty-action">
                    <button className="btn btn-ghost" onClick={resetFilters}>
                      Reset filters
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ul className="tv-list">
                {myTasks.map((t, i) => {
                  const overdue = t.stage !== "Done" && isOverdue?.(t.due_date);
                  return (
                    <li key={t.id} className="tv-item" style={{ "--i": Math.min(i, 8) }}>
                      <article className={`tv-row tv-row-${stageKey(t.stage)}`}>
                        <div className="tv-row-top">
                          <div className="tv-row-main">
                            {t.parent_title && <div className="tv-parent">{t.parent_title} ›</div>}
                            <h2 className="tv-title">
                              <Link className="tv-link" to={`/projects/${t.project_id}/tasks/${t.id}`}>
                                {t.title}
                              </Link>
                            </h2>
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
                              <span className={`tv-due ${overdue ? "tv-due-overdue" : ""}`}>
                                Due {formatDate(t.due_date)}
                                {overdue ? " · Overdue" : ""}
                              </span>
                            </>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {timeTakenModal.show && (
        <Modal title="Time taken" onClose={closeModal}>
          <form onSubmit={handleTimeTakenSubmit} noValidate>
            <p className="tv-modal-text">
              Moving <strong>{timeTakenModal.task?.title}</strong> to <strong>In Review</strong>.
              How long did this task take?
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
                value={timeTakenInput}
                onChange={(e) => { setTimeTakenInput(e.target.value); setTimeTakenError(""); }}
                placeholder="e.g. 45"
                aria-invalid={!!timeTakenError}
                aria-describedby={timeTakenError ? "tv-time-taken-error" : undefined}
                autoFocus
              />
              {timeTakenError && (
                <div id="tv-time-taken-error" className="tv-modal-error" role="alert">
                  {timeTakenError}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Confirm & move"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}