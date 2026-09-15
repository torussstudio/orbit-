import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatDate, isOverdue } from "../utils/helpers";
import { StageBadge } from "./Dashboard";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";

// Todo / In Progress switch instantly. In Review needs a time-taken
// value first, so it's handled separately (see handleStageSelect) —
// listed here too so it shows up as a pickable option in the dropdown.
const QUICK_STAGES = ["Todo", "In Progress", "In Review"];

function StageDropdown({ task, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <span
        className={`badge badge-${task.stage?.toLowerCase().replace(/\s/g, "")}`}
        style={{ cursor: "pointer" }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((p) => !p); }}
      >
        {task.stage} ▾
      </span>
      {open && (
        <div
          onClick={(e) => e.preventDefault()}
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0,
            background: "var(--bg-2)", border: "1px solid var(--border)",
            borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
            zIndex: 50, minWidth: "140px", overflow: "hidden",
          }}
        >
          {QUICK_STAGES.filter((s) => s !== task.stage).map((s) => (
            <div
              key={s}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onChange(task, s); }}
              style={{ padding: "8px 12px", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span className={`badge badge-${s.toLowerCase().replace(/\s/g, "")}`}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskView() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState("all");

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
  const myTasks =
    projectFilter === "all"
      ? tasks
      : tasks.filter((t) => String(t.project_id) === String(projectFilter));

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
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Task View</div>
          <div className="page-subtitle">Every task assigned to you, across all projects</div>
        </div>
        {projectOptions.length > 0 && (
          <div style={{ minWidth: "200px" }}>
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
        <div className="card">
          {myTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "var(--text-3)", fontSize: "13px" }}>
              📭 No tasks assigned to you
            </div>
          ) : (
            myTasks.map((t) => {
              const overdue = t.stage !== "Done" && isOverdue?.(t.due_date);
              return (
                <Link
                  to={`/projects/${t.project_id}/tasks/${t.id}`}
                  key={t.id}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    padding: "12px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "var(--text)", fontWeight: 500 }}>
                      {t.title}
                    </span>
                    <StageDropdown task={t} onChange={handleStageSelect} />
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-3)",
                      marginTop: "4px",
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{t.project_name}</span>
                    <span>·</span>
                    <span>{t.cluster_name || "No cluster"}</span>
                    {t.parent_title && (
                      <>
                        <span>·</span>
                        <span>Parent: {t.parent_title}</span>
                      </>
                    )}
                    {t.due_date && (
                      <>
                        <span>·</span>
                        <span style={{ color: overdue ? "var(--danger)" : "var(--text-3)" }}>
                          Due {formatDate(t.due_date)}
                        </span>
                      </>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {timeTakenModal.show && (
        <Modal
          title="Time Taken"
          onClose={() => setTimeTakenModal({ show: false, task: null })}
        >
          <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "16px" }}>
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
            {timeTakenError && (
              <div style={{ color: "var(--danger)", fontSize: "12px", marginTop: "6px" }}>
                {timeTakenError}
              </div>
            )}
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