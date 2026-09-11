import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";

export default function Dashboard() {
  const { user, isManager } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () =>
      api
        .get("/dashboard")
        .then((r) => setData(r.data))
        .finally(() => setLoading(false));

    fetchData();
    // Re-fetch periodically so date-dependent numbers (like Overdue Tasks)
    // stay correct if the dashboard is left open for a long time.
    const interval = setInterval(fetchData, 15 * 60 * 1000); // every 15 min
    return () => clearInterval(interval);
  }, []);

  if (loading)
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );

  return (
    <>
      <style>{`
        .dash-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }
        .dash-grid-2-1 {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 20px;
        }
        @media (max-width: 900px) {
          .dash-grid-2,
          .dash-grid-2-1 {
            grid-template-columns: 1fr;
          }
        }
        .workload-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          cursor: pointer;
        }
        .workload-name {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .workload-name span {
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .workload-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        @media (max-width: 480px) {
          .workload-row { flex-wrap: wrap; }
          .workload-meta { font-size: 12px; }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">
            Good {getGreeting()}, {user?.name?.split(" ")[0]} 👋
          </div>
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
      <div className="page-body">
        {isManager ? <ManagerDash data={data} /> : <DevDash data={data} />}
      </div>
    </>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function ManagerDash({ data }) {
  const [expandedMember, setExpandedMember] = useState(null);
  const [memberTasks, setMemberTasks] = useState({});
  const [loadingMember, setLoadingMember] = useState(null);

  const [taskModal, setTaskModal] = useState(null); // "total" | "completed" | null
  const [modalTasks, setModalTasks] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  if (!data) return null;

  const totalProjects = data.total_projects ?? data.projects?.length ?? 0;
  const totalTasks =
    data.total_main_tasks ??
    data.tasks_by_stage?.reduce((s, r) => s + parseInt(r.count), 0) ??
    0;
  const doneTasks =
    data.tasks_by_stage?.find((r) => r.stage === "Done")?.count || 0;
  const overdueCount = data.overdue_count ?? data.overdue_tasks?.length ?? 0;

  const toggleMember = async (id) => {
    if (expandedMember === id) {
      setExpandedMember(null);
      return;
    }
    setExpandedMember(id);
    if (!memberTasks[id]) {
      setLoadingMember(id);
      try {
        const r = await api.get(`/dashboard/members/${id}/tasks`);
        setMemberTasks((prev) => ({ ...prev, [id]: r.data.tasks }));
      } catch {
        setMemberTasks((prev) => ({ ...prev, [id]: [] }));
      } finally {
        setLoadingMember(null);
      }
    }
  };

  const openTaskModal = async (type) => {
    setTaskModal(type);
    setModalLoading(true);
    try {
      const r = await api.get(
        "/dashboard/tasks",
        type === "completed" ? { params: { stage: "Done" } } : undefined,
      );
      setModalTasks(r.data.tasks);
    } catch {
      setModalTasks([]);
    } finally {
      setModalLoading(false);
    }
  };

  const closeTaskModal = () => {
    setTaskModal(null);
    setModalTasks([]);
  };

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalProjects}</div>
          <div className="stat-label">Active Projects</div>
        </div>
        <div
          className="stat-card"
          onClick={() => openTaskModal("total")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-value">{totalTasks}</div>
          <div className="stat-label">Total Tasks</div>
        </div>
        <div
          className="stat-card"
          onClick={() => openTaskModal("completed")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-value" style={{ color: "var(--success)" }}>
            {parseInt(doneTasks)}
          </div>
          <div className="stat-label">Completed Tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--danger)" }}>
            {overdueCount}
          </div>
          <div className="stat-label">Overdue Tasks</div>
        </div>
      </div>

      <div className="dash-grid-2">
        {/* Projects */}
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ fontSize: "14px", fontWeight: 600 }}>Projects</h3>
            <Link to="/projects" className="btn btn-ghost btn-sm">
              View All
            </Link>
          </div>
          {data.projects?.length === 0 ? (
            <Empty text="No projects yet" />
          ) : (
            data.projects?.map((p) => {
              const pct =
                p.total_tasks > 0
                  ? Math.round((p.done_tasks / p.total_tasks) * 100)
                  : 0;
              return (
                <Link
                  to={`/projects/${p.id}`}
                  key={p.id}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "6px",
                      gap: "8px",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0 }}>
                      {pct}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-3)",
                      marginTop: "4px",
                    }}
                  >
                    {p.done_tasks}/{p.total_tasks} tasks done
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Team Workload */}
        <div className="card">
          <h3
            style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}
          >
            Team Workload
          </h3>
          {data.workload?.length === 0 ? (
            <Empty text="No members yet" />
          ) : (
            data.workload?.map((w) => {
              const isOpen = expandedMember === w.id;
              return (
                <div key={w.id}>
                  <div
                    className="workload-row"
                    onClick={() => toggleMember(w.id)}
                    style={{
                      borderBottom: isOpen ? "none" : "1px solid var(--border)",
                    }}
                  >
                    <div className="workload-name">
                      <div
                        className="user-avatar"
                        style={{
                          width: "28px",
                          height: "28px",
                          fontSize: "11px",
                          overflow: "hidden",
                          padding: 0,
                          flexShrink: 0,
                        }}
                      >
                        {w.avatar_url ? (
                          <img
                            src={w.avatar_url}
                            alt={w.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              borderRadius: "50%",
                              display: "block",
                            }}
                          />
                        ) : (
                          w.name[0]
                        )}
                      </div>
                      <span>{w.name}</span>
                    </div>
                    <div className="workload-meta">
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "13px",
                          color: "var(--accent)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {w.task_count} tasks
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--text-3)",
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.15s ease",
                          display: "inline-block",
                        }}
                      >
                        ▼
                      </span>
                    </div>
                  </div>
                  {isOpen && (
                    <div
                      style={{
                        maxHeight: "220px",
                        overflowY: "auto",
                        background: "var(--bg-2, rgba(255,255,255,0.03))",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        marginBottom: "8px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {loadingMember === w.id ? (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-3)",
                            padding: "8px 0",
                          }}
                        >
                          Loading...
                        </div>
                      ) : memberTasks[w.id]?.length === 0 ? (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-3)",
                            padding: "8px 0",
                          }}
                        >
                          No active tasks
                        </div>
                      ) : (
                        memberTasks[w.id]?.map((t) => (
                          <Link
                            to={`/projects/${t.project_id}/tasks/${t.id}`}
                            key={t.id}
                            style={{
                              display: "block",
                              textDecoration: "none",
                              padding: "6px 0",
                              borderBottom: "1px solid var(--border)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{ fontSize: "12px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
                              >
                                {t.title}
                              </span>
                              <StageBadge stage={t.stage} />
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--text-3)",
                                marginTop: "2px",
                              }}
                            >
                              {t.project_name}
                              {t.due_date ? ` · Due ${formatDate(t.due_date)}` : ""}
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="dash-grid-2" style={{ marginBottom: 0 }}>
        {/* Overdue */}
        <div className="card">
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "16px",
              color: "var(--danger)",
            }}
          >
            ⚠ Overdue Tasks
          </h3>
          {data.overdue_tasks?.length === 0 ? (
            <Empty text="All clear!" icon="✅" />
          ) : (
            <div style={{ maxHeight: "320px", overflowY: "auto" }}>
              {data.overdue_tasks?.map((t) => (
                <Link
                  to={`/projects/${t.project_id}/tasks/${t.id}`}
                  key={t.id}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ color: "var(--text)" }}>{t.title}</div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--danger)",
                      marginTop: "2px",
                    }}
                  >
                    {t.project_name} · Due {formatDate(t.due_date)} ·{" "}
                    {t.assignee_name || "Unassigned"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Rework leaders */}
        <div className="card">
          <h3
            style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}
          >
            🔁 Rework Tracker
          </h3>
          {data.cluster_rework?.length === 0 ? (
            <Empty text="No rework cycles yet" icon="🎯" />
          ) : (
            data.cluster_rework?.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                <span className="rework-counter" style={{ flexShrink: 0 }}>
                  <span className="rework-count">↺ {c.rework_count}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {taskModal && (
        <TaskListModal
          title={taskModal === "completed" ? "Completed Tasks" : "Total Tasks"}
          tasks={modalTasks}
          loading={modalLoading}
          onClose={closeTaskModal}
        />
      )}
    </>
  );
}

function TaskListModal({ title, tasks, loading, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "480px",
          maxWidth: "90vw",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ fontSize: "15px", fontWeight: 600 }}>
            {title} {!loading && `(${tasks.length})`}
          </h3>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px",
                color: "var(--text-3)",
                fontSize: "13px",
              }}
            >
              Loading...
            </div>
          ) : tasks.length === 0 ? (
            <Empty text="No tasks found" />
          ) : (
            tasks.map((t) => (
              <Link
                to={`/projects/${t.project_id}/tasks/${t.id}`}
                key={t.id}
                onClick={onClose}
                style={{
                  display: "block",
                  textDecoration: "none",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: "13px", color: "var(--text)" }}>
                    {t.title}
                  </span>
                  <StageBadge stage={t.stage} />
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-3)",
                    marginTop: "3px",
                  }}
                >
                  {t.project_name}
                  {t.due_date ? ` · Due ${formatDate(t.due_date)}` : ""}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
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

  const byStage = {};
  mainTasks.forEach((t) => {
    byStage[t.stage] = (byStage[t.stage] || 0) + 1;
  });

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{mainTasks.length}</div>
          <div className="stat-label">My Active Tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--warning)" }}>
            {byStage["In Progress"] || 0}
          </div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--accent-2)" }}>
            {byStage["In Review"] || 0}
          </div>
          <div className="stat-label">In Review</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--danger)" }}>
            {data.overdue_tasks?.length || 0}
          </div>
          <div className="stat-label">Overdue</div>
        </div>
      </div>

      <div className="dash-grid-2-1">
        <div className="card">
          <h3
            style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}
          >
            My Tasks
          </h3>
          {mainTasks.length === 0 && orphanSubtasks.length === 0 ? (
            <Empty text="No tasks assigned" icon="🎉" />
          ) : (
            <>
              {mainTasks.map((t) => {
                const subtasks = subtasksByParent[t.id] || [];
                const hasSubtasks = subtasks.length > 0;
                const isOpen = expandedIds.has(t.id);
                return (
                  <div key={t.id}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "6px",
                        padding: "10px 0",
                        borderBottom: isOpen ? "none" : "1px solid var(--border)",
                      }}
                    >
                      {hasSubtasks && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(t.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "10px",
                            color: "var(--text-3)",
                            padding: "2px 0 0",
                            flexShrink: 0,
                          }}
                          title={`${subtasks.length} sub-task${subtasks.length !== 1 ? "s" : ""}`}
                        >
                          {isOpen ? "▾" : "▸"}
                        </button>
                      )}
                      <Link
                        to={`/projects/${t.project_id}/tasks/${t.id}`}
                        style={{
                          display: "block",
                          textDecoration: "none",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontSize: "13px", color: "var(--text)" }}>
                            {t.title}
                            {hasSubtasks && (
                              <span style={{ fontSize: "10px", color: "var(--text-3)", marginLeft: "6px" }}>
                                ({subtasks.length})
                              </span>
                            )}
                          </span>
                          <StageBadge stage={t.stage} />
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-3)",
                            marginTop: "3px",
                          }}
                        >
                          {t.project_name}
                          {t.due_date ? ` · Due ${formatDate(t.due_date)}` : ""}
                        </div>
                      </Link>
                    </div>
                    {hasSubtasks && isOpen && (
                      <div
                        style={{
                          paddingLeft: "18px",
                          borderLeft: "2px solid var(--border)",
                          marginLeft: "4px",
                          marginBottom: "4px",
                        }}
                      >
                        {subtasks.map((st) => (
                          <Link
                            to={`/projects/${st.project_id}/tasks/${st.id}`}
                            key={st.id}
                            style={{
                              display: "block",
                              textDecoration: "none",
                              padding: "6px 0",
                              borderBottom: "1px solid var(--border)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontSize: "12px", color: "var(--text-2)" }}>
                                ↳ {st.title}
                              </span>
                              <StageBadge stage={st.stage} />
                            </div>
                            <div
                              style={{
                                fontSize: "10px",
                                color: "var(--text-3)",
                                marginTop: "2px",
                              }}
                            >
                              {st.project_name}
                              {st.due_date ? ` · Due ${formatDate(st.due_date)}` : ""}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {orphanSubtasks.map((st) => (
                <Link
                  to={`/projects/${st.project_id}/tasks/${st.id}`}
                  key={st.id}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "var(--text)" }}>
                      {st.title}
                      <span style={{ fontSize: "10px", color: "var(--text-3)", marginLeft: "6px" }}>
                        (sub-task)
                      </span>
                    </span>
                    <StageBadge stage={st.stage} />
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-3)",
                      marginTop: "3px",
                    }}
                  >
                    {st.project_name}
                    {st.due_date ? ` · Due ${formatDate(st.due_date)}` : ""}
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
        <div className="card">
          <h3
            style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}
          >
            Recent Comments
          </h3>
          {data.recent_comments?.length === 0 ? (
            <Empty text="No recent activity" />
          ) : (
            data.recent_comments?.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  {c.author_name}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-2)",
                    margin: "2px 0",
                  }}
                >
                  {c.content}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                  on {c.task_title}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Empty({ text, icon = "📭" }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "24px",
        color: "var(--text-3)",
        fontSize: "13px",
      }}
    >
      {icon} {text}
    </div>
  );
}

export function StageBadge({ stage }) {
  const key = stage?.toLowerCase().replace(/\s/g, "");
  return <span className={`badge badge-${key}`}>{stage}</span>;
}