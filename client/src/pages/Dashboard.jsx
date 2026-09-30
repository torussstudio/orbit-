import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/helpers";
import Modal from "../components/ui/Modal";

const STYLES = `
.dash-title { margin: 0; }

/* ---------- Entry motion (transform + opacity only) ---------- */
.dash-page .stats-grid > *,
.dash-page .dash-grid-2 > *,
.dash-page .dash-grid-2-1 > * {
  animation: dash-rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.dash-page .stats-grid > :nth-child(2) { animation-delay: 40ms; }
.dash-page .stats-grid > :nth-child(3) { animation-delay: 80ms; }
.dash-page .stats-grid > :nth-child(4) { animation-delay: 120ms; }
.dash-page .dash-grid-2 > :nth-child(2),
.dash-page .dash-grid-2-1 > :nth-child(2) { animation-delay: 60ms; }
@keyframes dash-rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
@keyframes dash-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

/* ---------- Layout ---------- */
.dash-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
.dash-grid-2.is-last { margin-bottom: 0; }
.dash-grid-2-1 {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}
.dash-grid-2 > *, .dash-grid-2-1 > * { min-width: 0; }
@media (max-width: 900px) {
  .dash-grid-2, .dash-grid-2-1 { grid-template-columns: 1fr; }
}

/* ---------- Stat cards ---------- */
.dash-page .stat-value { font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.stat-success .stat-value { color: var(--success); }
.stat-danger .stat-value { color: var(--danger); }
.stat-warning .stat-value { color: var(--warning); }
.stat-info .stat-value { color: var(--accent-2); }
.dash-stat-link {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.dash-stat-link:hover { transform: translateY(-1px); box-shadow: 0 8px 20px -10px rgba(15, 23, 42, 0.28); }
.dash-stat-link:active { transform: scale(0.99); }
.dash-stat-link:focus-visible,
.workload-row:focus-visible,
.dash-toggle:focus-visible,
.dash-task:focus-visible,
.dash-proj:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---------- Card headings ---------- */
.dash-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.dash-h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.dash-h.is-danger { color: var(--danger); }
.dash-h-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--danger); flex-shrink: 0; }
.dash-count {
  padding: 1px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
  background: var(--bg-3);
}

/* ---------- Projects ---------- */
.dash-proj {
  display: block;
  margin: 0 -10px;
  padding: 10px 10px 11px;
  border-radius: 8px;
  text-decoration: none;
  transition: background 0.2s ease;
}
.dash-proj + .dash-proj { margin-top: 2px; }
.dash-proj:hover { background: var(--bg-3); }
.dash-proj-top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
.dash-proj-name {
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-proj-pct { flex-shrink: 0; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-3); }
.dash-proj .progress-fill {
  width: 100%;
  transform-origin: left center;
  transform: scaleX(var(--pct, 0));
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.dash-proj-meta { margin-top: 5px; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-3); }

/* ---------- Team workload ---------- */
.workload-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  width: calc(100% + 20px);
  margin: 0 -10px;
  padding: 8px 10px;
  font: inherit;
  color: inherit;
  text-align: left;
  background: none;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}
.workload-row:hover { background: var(--bg-3); }
.workload-item + .workload-item { border-top: 1px solid var(--border); }
.workload-item.is-open + .workload-item { border-top-color: transparent; }
.workload-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.workload-name span {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workload-avatar {
  width: 28px;
  height: 28px;
  padding: 0;
  overflow: hidden;
  flex-shrink: 0;
  font-size: 11px;
}
.workload-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; }
.workload-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.workload-count {
  font-family: var(--font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  white-space: nowrap;
}
.workload-chevron {
  font-size: 10px;
  color: var(--text-3);
  transition: transform 0.15s ease;
}
.workload-item.is-open .workload-chevron { transform: rotate(180deg); }
.workload-panel {
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 8px;
  padding: 2px 10px;
  border-radius: 8px;
  background: var(--bg-3);
  animation: dash-fade 0.18s ease-out both;
}
@keyframes dash-fade { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 480px) {
  .workload-row { flex-wrap: wrap; }
  .workload-meta { font-size: 12px; }
}

/* ---------- Task rows (shared) ---------- */
.dash-task {
  display: block;
  padding: 9px 0;
  text-decoration: none;
  border-radius: 6px;
}
.dash-task + .dash-task,
.dash-task-wrap + .dash-task-wrap { border-top: 1px solid var(--border); }
.dash-task-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dash-task-title {
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text);
  overflow-wrap: anywhere;
}
.dash-task-title small { margin-left: 6px; font-size: 10px; font-weight: 400; color: var(--text-3); }
.dash-task-meta {
  margin-top: 3px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}
.dash-task-meta.is-danger { color: var(--danger); }
.dash-task-parent {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
  font-size: 10px;
  color: var(--text-3);
}
.dash-task:hover .dash-task-title { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--text-3); }
.dash-task.is-sm { padding: 7px 0; }
.dash-task.is-sm .dash-task-title { font-size: 12px; }
.dash-task.is-sub .dash-task-title { color: var(--text-2); font-weight: 400; }
.dash-task.is-sub .dash-task-meta { font-size: 10px; }
.dash-scroll { max-height: 320px; overflow-y: auto; }

/* ---------- Dev task tree ---------- */
.dash-task-wrap { display: flex; flex-direction: column; }
.dash-task-line { display: flex; align-items: flex-start; gap: 6px; }
.dash-task-line > .dash-task { flex: 1; min-width: 0; }
.dash-toggle {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-top: 8px;
  padding: 0;
  font-size: 11px;
  color: var(--text-3);
  background: none;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.dash-toggle:hover { color: var(--text); background: var(--bg-3); }
.dash-toggle-spacer { width: 22px; flex-shrink: 0; }
.dash-subtree {
  margin: 0 0 4px 10px;
  padding-left: 16px;
  border-left: 2px solid var(--border);
  animation: dash-fade 0.18s ease-out both;
}

/* ---------- Rework ---------- */
.dash-rework-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 9px 0;
}
.dash-rework-row + .dash-rework-row { border-top: 1px solid var(--border); }
.dash-rework-name { min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dash-rework-row .rework-counter { flex-shrink: 0; }

/* ---------- Comments ---------- */
.dash-comment { padding: 10px 0; }
.dash-comment + .dash-comment { border-top: 1px solid var(--border); }
.dash-comment-author { font-size: 12px; font-weight: 600; color: var(--accent); }
.dash-comment-text {
  margin: 2px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dash-comment-on { font-size: 11px; color: var(--text-3); }

/* ---------- Empty / error / loading ---------- */
.dash-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}
.dash-empty svg { opacity: 0.8; }
.dash-empty .btn { margin-top: 4px; }
.dash-note { padding: 10px 0; font-size: 12px; color: var(--text-3); }
.dash-note .btn { margin-left: 8px; }
.dash-skel-bar {
  border-radius: 6px;
  background: var(--bg-3);
  animation: dash-pulse 1.4s ease-in-out infinite;
}
.dash-skel-line { height: 12px; margin: 12px 0; }
.dash-skel-stat { height: 68px; }
.dash-skel-card { height: 220px; }
.dash-modal-list { max-height: 60vh; overflow-y: auto; }
.dash-modal-title-count { font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
  .dash-page .stats-grid > *,
  .dash-page .dash-grid-2 > *,
  .dash-page .dash-grid-2-1 > *,
  .workload-panel,
  .dash-subtree { animation: none; }
  .dash-skel-bar { animation: none; }
  .dash-proj .progress-fill,
  .dash-stat-link,
  .workload-chevron { transition: none; }
}
`;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export default function Dashboard() {
  const { user, isManager } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const hasData = useRef(false);

  const fetchData = () =>
    api
      .get("/dashboard")
      .then((r) => {
        hasData.current = true;
        setError(false);
        setData(r.data);
      })
      .catch(() => {
        // A failed background refresh keeps the numbers already on screen.
        if (!hasData.current) setError(true);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchData();
    // Re-fetch periodically so date-dependent numbers (like Overdue Tasks)
    // stay correct if the dashboard is left open for a long time.
    const interval = setInterval(fetchData, 15 * 60 * 1000); // every 15 min
    return () => clearInterval(interval);
  }, []);

  const retry = () => {
    setError(false);
    setLoading(true);
    fetchData();
  };

  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      <style>{STYLES}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title dash-title">
            Good {getGreeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <div className="page-subtitle">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>
      </div>

      <div className="page-body dash-page" aria-busy={loading}>
        {loading ? (
          <DashSkeleton />
        ) : error ? (
          <div className="card">
            <div className="dash-empty" role="alert">
              <span>We couldn't load your dashboard.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
                Try again
              </button>
            </div>
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

function DashSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="stats-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat-card">
            <div className="dash-skel-bar dash-skel-stat" />
          </div>
        ))}
      </div>
      <div className="dash-grid-2 is-last">
        <div className="card"><div className="dash-skel-bar dash-skel-card" /></div>
        <div className="card"><div className="dash-skel-bar dash-skel-card" /></div>
      </div>
    </div>
  );
}

function Stat({ value, label, tone, onClick }) {
  const clickable = typeof onClick === "function";
  const props = clickable
    ? {
        role: "button",
        tabIndex: 0,
        onClick,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};
  return (
    <div
      className={`stat-card${tone ? ` stat-${tone}` : ""}${clickable ? " dash-stat-link" : ""}`}
      {...props}
    >
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// One task row, used everywhere a task is listed on the dashboard.
function TaskLink({ task, size, sub, prefix, suffix, onClick }) {
  return (
    <Link
      to={`/projects/${task.project_id}/tasks/${task.id}`}
      className={`dash-task${size === "sm" ? " is-sm" : ""}${sub ? " is-sub" : ""}`}
      onClick={onClick}
    >
      <div className="dash-task-top">
        <span className="dash-task-title">
          {prefix}
          {task.title}
          {suffix && <small>{suffix}</small>}
        </span>
        <StageBadge stage={task.stage} />
      </div>
      <div className="dash-task-meta">
        {task.project_name}
        {task.due_date ? ` · Due ${formatDate(task.due_date)}` : ""}
      </div>
    </Link>
  );
}

function ManagerDash({ data }) {
  const [expandedMember, setExpandedMember] = useState(null);
  const [memberTasks, setMemberTasks] = useState({});
  const [memberErrors, setMemberErrors] = useState({});
  const [loadingMember, setLoadingMember] = useState(null);

  const [taskModal, setTaskModal] = useState(null); // "total" | "completed" | null
  const [modalTasks, setModalTasks] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(false);

  if (!data) return null;

  const totalProjects = data.total_projects ?? data.projects?.length ?? 0;
  const totalTasks =
    data.total_main_tasks ??
    data.tasks_by_stage?.reduce((s, r) => s + parseInt(r.count), 0) ??
    0;
  const doneTasks = parseInt(
    data.tasks_by_stage?.find((r) => r.stage === "Done")?.count || 0,
    10,
  );
  const overdueCount = data.overdue_count ?? data.overdue_tasks?.length ?? 0;

  // Sorted (not mutated) copy so members with the most tasks show first.
  const sortedWorkload = data.workload
    ? [...data.workload].sort((a, b) => b.task_count - a.task_count)
    : [];

  const loadMemberTasks = async (id) => {
    setLoadingMember(id);
    setMemberErrors((prev) => ({ ...prev, [id]: false }));
    try {
      const r = await api.get(`/dashboard/members/${id}/tasks`);
      setMemberTasks((prev) => ({ ...prev, [id]: r.data.tasks || [] }));
    } catch {
      // Not cached, so opening the row again (or Retry) tries again.
      setMemberErrors((prev) => ({ ...prev, [id]: true }));
    } finally {
      setLoadingMember(null);
    }
  };

  const toggleMember = (id) => {
    if (expandedMember === id) {
      setExpandedMember(null);
      return;
    }
    setExpandedMember(id);
    if (!memberTasks[id]) loadMemberTasks(id);
  };

  const openTaskModal = async (type) => {
    setTaskModal(type);
    setModalLoading(true);
    setModalError(false);
    try {
      const r = await api.get(
        "/dashboard/tasks",
        type === "completed" ? { params: { stage: "Done" } } : undefined,
      );
      setModalTasks(r.data.tasks || []);
    } catch {
      setModalTasks([]);
      setModalError(true);
    } finally {
      setModalLoading(false);
    }
  };

  const closeTaskModal = () => {
    setTaskModal(null);
    setModalTasks([]);
    setModalError(false);
  };

  const modalTitle = taskModal === "completed" ? "Completed tasks" : "Total tasks";

  return (
    <>
      <div className="stats-grid">
        <Stat value={totalProjects} label="Active projects" />
        <Stat value={totalTasks} label="Total tasks" onClick={() => openTaskModal("total")} />
        <Stat
          value={doneTasks}
          label="Completed tasks"
          tone="success"
          onClick={() => openTaskModal("completed")}
        />
        <Stat value={overdueCount} label="Overdue tasks" tone="danger" />
      </div>

      <div className="dash-grid-2">
        {/* Projects */}
        <section className="card">
          <div className="dash-card-head">
            <h2 className="dash-h">Projects</h2>
            <Link to="/projects" className="btn btn-ghost btn-sm">
              View all
            </Link>
          </div>
          {!data.projects?.length ? (
            <Empty title="No projects yet" />
          ) : (
            data.projects.map((p) => {
              const pct =
                p.total_tasks > 0
                  ? Math.round((p.done_tasks / p.total_tasks) * 100)
                  : 0;
              return (
                <Link to={`/projects/${p.id}`} key={p.id} className="dash-proj">
                  <div className="dash-proj-top">
                    <span className="dash-proj-name">{p.name}</span>
                    <span className="dash-proj-pct">{pct}%</span>
                  </div>
                  <div
                    className="progress-bar"
                    role="progressbar"
                    aria-label={`${p.name} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                  >
                    <div className="progress-fill" style={{ "--pct": pct / 100 }} />
                  </div>
                  <div className="dash-proj-meta">
                    {p.done_tasks}/{p.total_tasks} tasks done
                  </div>
                </Link>
              );
            })
          )}
        </section>

        {/* Team workload */}
        <section className="card">
          <div className="dash-card-head">
            <h2 className="dash-h">Team workload</h2>
          </div>
          {sortedWorkload.length === 0 ? (
            <Empty title="No members yet" />
          ) : (
            sortedWorkload.map((w) => {
              const isOpen = expandedMember === w.id;
              const tasks = memberTasks[w.id];
              const panelId = `workload-panel-${w.id}`;
              return (
                <div key={w.id} className={`workload-item${isOpen ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="workload-row"
                    onClick={() => toggleMember(w.id)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                  >
                    <span className="workload-name">
                      <span className="user-avatar workload-avatar" aria-hidden="true">
                        {w.avatar_url ? (
                          <img src={w.avatar_url} alt="" />
                        ) : (
                          (w.name || "?")[0]
                        )}
                      </span>
                      <span>{w.name}</span>
                    </span>
                    <span className="workload-meta">
                      <span className="workload-count">{w.task_count} tasks</span>
                      <span className="workload-chevron" aria-hidden="true">▼</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="workload-panel" id={panelId}>
                      {loadingMember === w.id || (!tasks && !memberErrors[w.id]) ? (
                        <div aria-hidden="true">
                          <div className="dash-skel-bar dash-skel-line" />
                          <div className="dash-skel-bar dash-skel-line" />
                        </div>
                      ) : memberErrors[w.id] ? (
                        <div className="dash-note" role="alert">
                          We couldn't load these tasks.
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => loadMemberTasks(w.id)}
                          >
                            Retry
                          </button>
                        </div>
                      ) : tasks.length === 0 ? (
                        <div className="dash-note">No active tasks</div>
                      ) : (
                        tasks.map((t) => <TaskLink key={t.id} task={t} size="sm" />)
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>

      <div className="dash-grid-2 is-last">
        {/* Overdue */}
        <section className="card">
          <div className="dash-card-head">
            <h2 className="dash-h is-danger">
              <span className="dash-h-dot" aria-hidden="true" />
              Overdue tasks
            </h2>
            {!!data.overdue_tasks?.length && (
              <span className="dash-count">{data.overdue_tasks.length}</span>
            )}
          </div>
          {!data.overdue_tasks?.length ? (
            <Empty title="No overdue tasks" icon="check" />
          ) : (
            <div className="dash-scroll">
              {data.overdue_tasks.map((t) => (
                <Link
                  to={`/projects/${t.project_id}/tasks/${t.id}`}
                  key={t.id}
                  className="dash-task"
                >
                  {t.parent_title && (
                    <div className="dash-task-parent">
                      <span aria-hidden="true">•</span>
                      {t.parent_title}
                    </div>
                  )}
                  <div className="dash-task-title">{t.title}</div>
                  <div className="dash-task-meta is-danger">
                    {t.project_name} · Due {formatDate(t.due_date)} ·{" "}
                    {t.assignee_name || "Unassigned"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Rework leaders */}
        <section className="card">
          <div className="dash-card-head">
            <h2 className="dash-h">Rework tracker</h2>
          </div>
          {!data.cluster_rework?.length ? (
            <Empty title="No rework cycles yet" icon="cycle" />
          ) : (
            data.cluster_rework.map((c) => (
              <div key={c.id} className="dash-rework-row">
                <span className="dash-rework-name">{c.name}</span>
                <span className="rework-counter">
                  <span className="rework-count">↺ {c.rework_count}</span>
                </span>
              </div>
            ))
          )}
        </section>
      </div>

      {taskModal && (
        <Modal
          title={
            modalLoading || modalError
              ? modalTitle
              : `${modalTitle} (${modalTasks.length})`
          }
          onClose={closeTaskModal}
        >
          <div className="dash-modal-list">
            {modalLoading ? (
              <div aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="dash-skel-bar dash-skel-line" />
                ))}
              </div>
            ) : modalError ? (
              <div className="dash-empty" role="alert">
                <span>We couldn't load these tasks.</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openTaskModal(taskModal)}
                >
                  Try again
                </button>
              </div>
            ) : modalTasks.length === 0 ? (
              <Empty title="No tasks found" />
            ) : (
              modalTasks.map((t) => (
                <TaskLink key={t.id} task={t} onClick={closeTaskModal} />
              ))
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function DevDash({ data }) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  if (!data) return null;

  const myTasks = data.my_tasks || [];

  // Split into main tasks and sub-tasks so sub-tasks nest under their
  // parent instead of showing as their own flat row. If a sub-task's
  // parent isn't in this list (e.g. parent assigned to someone else),
  // it's shown as its own row so it isn't hidden.
  const mainTasks = myTasks.filter((t) => !t.parent_task_id);
  const mainTaskIds = new Set(mainTasks.map((t) => t.id));
  const subtasksByParent = {};
  const orphanSubtasks = [];
  myTasks.forEach((t) => {
    if (!t.parent_task_id) return;
    if (mainTaskIds.has(t.parent_task_id)) {
      if (!subtasksByParent[t.parent_task_id]) subtasksByParent[t.parent_task_id] = [];
      subtasksByParent[t.parent_task_id].push(t);
    } else {
      orphanSubtasks.push(t);
    }
  });

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Stat cards count every task assigned to this member — main tasks
  // AND sub-tasks — not just main tasks. A member's work is very often
  // entirely sub-tasks (see: Vishnu's dashboard), so basing these on
  // mainTasks alone left the stat cards at 0 even with a full task list.
  const byStage = {};
  myTasks.forEach((t) => {
    byStage[t.stage] = (byStage[t.stage] || 0) + 1;
  });

  return (
    <>
      <div className="stats-grid">
        <Stat value={myTasks.length} label="My active tasks" />
        <Stat value={byStage["In Progress"] || 0} label="In progress" tone="warning" />
        <Stat value={byStage["In Review"] || 0} label="In review" tone="info" />
        <Stat value={data.overdue_tasks?.length || 0} label="Overdue" tone="danger" />
      </div>

      <div className="dash-grid-2-1">
        <section className="card">
          <div className="dash-card-head">
            <h2 className="dash-h">My tasks</h2>
          </div>
          {mainTasks.length === 0 && orphanSubtasks.length === 0 ? (
            <Empty title="No tasks assigned" icon="check" />
          ) : (
            <>
              {mainTasks.map((t) => {
                const subtasks = subtasksByParent[t.id] || [];
                const hasSubtasks = subtasks.length > 0;
                const isOpen = expandedIds.has(t.id);
                const treeId = `dash-subtree-${t.id}`;
                return (
                  <div key={t.id} className="dash-task-wrap">
                    <div className="dash-task-line">
                      {hasSubtasks ? (
                        <button
                          type="button"
                          className="dash-toggle"
                          onClick={() => toggleExpanded(t.id)}
                          aria-expanded={isOpen}
                          aria-controls={treeId}
                          aria-label={`${isOpen ? "Hide" : "Show"} ${subtasks.length} sub-task${subtasks.length !== 1 ? "s" : ""}`}
                        >
                          {isOpen ? "▾" : "▸"}
                        </button>
                      ) : (
                        <span className="dash-toggle-spacer" aria-hidden="true" />
                      )}
                      <TaskLink task={t} suffix={hasSubtasks ? `(${subtasks.length})` : null} />
                    </div>
                    {hasSubtasks && isOpen && (
                      <div className="dash-subtree" id={treeId}>
                        {subtasks.map((st) => (
                          <TaskLink key={st.id} task={st} size="sm" sub prefix="↳ " />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {orphanSubtasks.map((st) => (
                <div key={st.id} className="dash-task-wrap">
                  <div className="dash-task-line">
                    <span className="dash-toggle-spacer" aria-hidden="true" />
                    <TaskLink task={st} suffix="(sub-task)" />
                  </div>
                </div>
              ))}
            </>
          )}
        </section>

        <section className="card">
          <div className="dash-card-head">
            <h2 className="dash-h">Recent comments</h2>
          </div>
          {!data.recent_comments?.length ? (
            <Empty title="No recent activity" />
          ) : (
            data.recent_comments.map((c) => (
              <div key={c.id} className="dash-comment">
                <div className="dash-comment-author">{c.author_name}</div>
                <div className="dash-comment-text">{c.content}</div>
                <div className="dash-comment-on">on {c.task_title}</div>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}

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
};

function Empty({ title, icon = "inbox" }) {
  return (
    <div className="dash-empty">
      <svg
        width="32"
        height="32"
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
      <span>{title}</span>
    </div>
  );
}

export function StageBadge({ stage }) {
  const key = stage?.toLowerCase().replace(/\s/g, "");
  return <span className={`badge badge-${key}`}>{stage}</span>;
}