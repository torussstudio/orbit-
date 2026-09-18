import { useState, useEffect, useMemo, Fragment } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import TaskForm from "../components/tasks/TaskForm";
import Select from "../components/ui/Select";
import Loader from "../components/ui/Loader";

const PRIORITY_COLORS = {
  low: "var(--accent)",
  medium: "var(--warning)",
  high: "var(--danger)",
  critical: "var(--critical)",
};

export default function Tasks({ project: propProject }) {
  const params = useParams();
  const projectId = propProject?.id || params.id;
  const { isManager } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState("list");
  const [members, setMembers] = useState([]);
  const [projectMemberIds, setProjectMemberIds] = useState(new Set());
  const [clusters, setClusters] = useState([]);
  const [showSubTaskModal, setShowSubTaskModal] = useState(false);
  const [subTaskParent, setSubTaskParent] = useState(null);
  const [savingTask, setSavingTask] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({
    show: false,
    id: null,
    loading: false,
  });

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  const stages = propProject?.custom_stages || [
    "Todo",
    "In Progress",
    "In Review",
    "Done",
  ];

  const load = () => {
    const projectRequest = propProject
      ? Promise.resolve({ data: propProject })
      : api.get(`/projects/${projectId}`);

    Promise.all([
      api.get(`/tasks/project/${projectId}`),
      api.get("/members"),
      api.get(`/clusters/project/${projectId}`),
      projectRequest,
    ])
      .then(([t, m, c, proj]) => {
        setTasks(t.data);
        setMembers(m.data);
        setClusters(c.data);
        setProjectMemberIds(
          new Set((proj.data?.members || []).map((x) => x.id)),
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  const handleSave = async (data) => {
    setSavingTask(true);
    try {
      if (editing) await api.put(`/tasks/${editing.id}`, data);
      else await api.post("/tasks", { ...data, project_id: projectId });
      setShowModal(false);
      setEditing(null);
      load();
    } finally {
      setSavingTask(false);
    }
  };

  const handleSubTaskSave = async (data) => {
    setSavingTask(true);
    try {
      await api.post("/tasks", {
        ...data,
        project_id: projectId,
        parent_task_id: subTaskParent.id,
      });
      setShowSubTaskModal(false);
      setSubTaskParent(null);
      load();
    } finally {
      setSavingTask(false);
    }
  };

  const handleDelete = (id) => {
    setDeleteConfirm({ show: true, id, loading: false });
  };

  const confirmDelete = async () => {
    setDeleteConfirm((prev) => ({ ...prev, loading: true }));
    try {
      await api.delete(`/tasks/${deleteConfirm.id}`);
      load();
    } finally {
      setDeleteConfirm({ show: false, id: null, loading: false });
    }
  };

  // Monthly filter helpers — filter by due date (falls back to created date
  // for tasks that have no due date set, so they still show up somewhere)
  const getMonthKey = (t) => {
    const dateStr = t?.due_date || t?.created_at;
    return dateStr ? dateStr.slice(0, 7) : null;
  };

  const allMonthKeys = useMemo(
    () => [
      ...new Set([
        ...tasks.map((t) => getMonthKey(t)).filter(Boolean),
        currentMonthKey,
      ]),
    ].sort((a, b) => a.localeCompare(b)),
    [tasks, currentMonthKey],
  );

  const filteredTasks = useMemo(
    () => tasks.filter((t) => getMonthKey(t) === selectedMonth),
    [tasks, selectedMonth],
  );

  // Main tasks vs sub tasks (a sub task has parent_task_id set)
  // Newest-created task first — the API returns tasks in creation order
  // (oldest first), so we reverse-sort here rather than relying on the
  // backend query order.
  const mainTasks = useMemo(
    () =>
      filteredTasks
        .filter((t) => !t.parent_task_id)
        .sort((a, b) => {
          const bTime = b.created_at ? new Date(b.created_at).getTime() : b.id;
          const aTime = a.created_at ? new Date(a.created_at).getTime() : a.id;
          return bTime - aTime;
        }),
    [filteredTasks],
  );

  const subtasksByParent = useMemo(
    () =>
      filteredTasks.reduce((acc, t) => {
        if (t.parent_task_id) {
          if (!acc[t.parent_task_id]) acc[t.parent_task_id] = [];
          acc[t.parent_task_id].push(t);
        }
        return acc;
      }, {}),
    [filteredTasks],
  );

  const formatMonthLabel = (key) => {
    const [year, month] = key.split("-");
    return new Date(year, month - 1).toLocaleString("default", {
      month: "long",
      year: "numeric",
    });
  };

  // Count badge should reflect pending work only — completed tasks are
  // excluded. The "done" stage is taken as the last stage of the project's
  // stage list so custom stage names ("Completed", "Closed") also work.
  const doneStage = (stages[stages.length - 1] || "Done").toLowerCase();
  const pendingCount = mainTasks.filter(
    (t) => (t.stage || "").toLowerCase() !== doneStage,
  ).length;

  const currentIdx = allMonthKeys.indexOf(selectedMonth);

  if (loading)
    return (
      <div style={{ padding: "24px" }}>
        <Loader label="Loading tasks" size="lg" variant="page" />
      </div>
    );

  return (
    <div className="tasks-page" style={{ padding: "24px 32px" }}>
      {/* Toolbar */}
      <div
        className="tasks-toolbar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          rowGap: "12px",
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "var(--bg)",
          padding: "24px 32px 20px",
          margin: "-24px -32px 0",
        }}
      >
        {/* Left: Board / List toggle */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button
            className={`btn btn-ghost btn-sm ${view === "list" ? "active" : ""}`}
            onClick={() => setView("list")}
            style={
              view === "list"
                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                : {}
            }
          >
            List
          </button>
          <button
            className={`btn btn-ghost btn-sm ${view === "board" ? "active" : ""}`}
            onClick={() => setView("board")}
            style={
              view === "board"
                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                : {}
            }
          >
            Board
          </button>
        </div>

        {/* Right: Month navigator + Add Task */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "10px",
            rowGap: "8px",
          }}
        >
          {/* ‹ Prev */}
          <button
            onClick={() => {
              if (currentIdx > 0) setSelectedMonth(allMonthKeys[currentIdx - 1]);
            }}
            disabled={currentIdx === 0}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "8px",
              border: "none",
              background:
                "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "#fff",
              cursor: currentIdx === 0 ? "not-allowed" : "pointer",
              opacity: currentIdx === 0 ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              fontWeight: 600,
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            ‹
          </button>

          {/* Dropdown */}
          <Select
            value={selectedMonth}
            onChange={(val) => setSelectedMonth(val)}
            arrowColor="#fff"
            labelColor="#fff"
            style={{
              padding: "5px 12px",
              borderRadius: "8px",
              border: "none",
              background:
                "linear-gradient(135deg, var(--accent), var(--accent-2))",
              fontSize: "12px",
              fontWeight: 600,
              minWidth: "140px",
              flexShrink: 0,
            }}
          >
            {allMonthKeys.map((key) => (
              <option key={key} value={key}>
                {formatMonthLabel(key)}
              </option>
            ))}
          </Select>

          {/* › Next */}
          <button
            onClick={() => {
              if (currentIdx < allMonthKeys.length - 1)
                setSelectedMonth(allMonthKeys[currentIdx + 1]);
            }}
            disabled={currentIdx === allMonthKeys.length - 1}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "8px",
              border: "none",
              background:
                "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "#fff",
              cursor:
                currentIdx === allMonthKeys.length - 1
                  ? "not-allowed"
                  : "pointer",
              opacity: currentIdx === allMonthKeys.length - 1 ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              fontWeight: 600,
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            ›
          </button>

          {/* Task count badge — pending tasks only */}
          <span
            style={{
              fontSize: "11px",
              background: "var(--bg-4)",
              borderRadius: "10px",
              padding: "2px 8px",
              color: "var(--text-3)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {pendingCount} task{pendingCount !== 1 ? "s" : ""}
          </span>

          {/* Divider */}
          {isManager && (
            <div
              style={{
                width: "1px",
                height: "20px",
                background: "var(--border)",
                flexShrink: 0,
              }}
            />
          )}

          {/* Add Task */}
          {isManager && (
            <button
              className="btn btn-primary btn-sm"
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
              onClick={() => {
                setEditing(null);
                setShowModal(true);
              }}
            >
              + Add Task
            </button>
          )}
        </div>
      </div>

      {view === "board" ? (
        <BoardView
          tasks={mainTasks}
          subtasksByParent={subtasksByParent}
          projectId={projectId}
          onEdit={(t) => {
            setEditing(t);
            setShowModal(true);
          }}
          onDelete={handleDelete}
          isManager={isManager}
          onAddSubTask={(t) => {
            setSubTaskParent(t);
            setShowSubTaskModal(true);
          }}
        />
      ) : (
        <ListView
          tasks={mainTasks}
          subtasksByParent={subtasksByParent}
          projectId={projectId}
          onEdit={(t) => {
            setEditing(t);
            setShowModal(true);
          }}
          onDelete={handleDelete}
          isManager={isManager}
          onAddSubTask={(t) => {
            setSubTaskParent(t);
            setShowSubTaskModal(true);
          }}
        />
      )}

      {showModal && (
        <Modal
          title={editing ? "Edit Task" : "New Task"}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
        >
          <TaskForm
            initial={editing}
            members={members.filter((m) => projectMemberIds.has(m.id))}
            allMembers={members}
            clusters={clusters}
            stages={stages}
            onSave={handleSave}
            saving={savingTask}
            emptyMembersMessage="No members are assigned to this project yet — assign members on the project first."
            onCancel={() => {
              setShowModal(false);
              setEditing(null);
            }}
          />
        </Modal>
      )}

      {showSubTaskModal && subTaskParent && (
        <Modal
          title={`Sub Task — ${subTaskParent.title}`}
          onClose={() => {
            setShowSubTaskModal(false);
            setSubTaskParent(null);
          }}
        >
          <TaskForm
            members={members}
            clusters={clusters}
            stages={stages}
            onSave={handleSubTaskSave}
            saving={savingTask}
            onCancel={() => {
              setShowSubTaskModal(false);
              setSubTaskParent(null);
            }}
            hideCluster
            isSubtaskForm
          />
        </Modal>
      )}

      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() =>
          setDeleteConfirm({ show: false, id: null, loading: false })
        }
        loading={deleteConfirm.loading}
      />
    </div>
  );
}

function BoardView({
  tasks,
  subtasksByParent,
  projectId,
  onEdit,
  onDelete,
  isManager,
  onAddSubTask,
}) {
  return (
    <div className="card-grid">
      {tasks.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          subtaskCount={(subtasksByParent[t.id] || []).length}
          projectId={projectId}
          onEdit={onEdit}
          onDelete={onDelete}
          isManager={isManager}
          onAddSubTask={onAddSubTask}
        />
      ))}
    </div>
  );
}

function TaskCard({
  task,
  subtaskCount,
  projectId,
  onEdit,
  onDelete,
  isManager,
  onAddSubTask,
}) {
  const overdue = isOverdue(task.due_date, task.stage);
  return (
    <div
      className="card"
      style={{
        padding: "12px",
        borderColor: overdue ? "rgba(248,113,113,0.3)" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "6px",
        }}
      >
        <Link
          to={`/projects/${projectId}/tasks/${task.id}`}
          style={{
            fontSize: "13px",
            color: "var(--text)",
            textDecoration: "none",
            fontWeight: 500,
            lineHeight: 1.4,
            flex: 1,
          }}
        >
          {task.title}
        </Link>
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: PRIORITY_COLORS[task.priority],
            marginLeft: "8px",
            flexShrink: 0,
            marginTop: "3px",
          }}
          title={task.priority}
        />
      </div>
      <div
        style={{
          marginBottom: "6px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span
          className={`badge badge-${task.stage?.toLowerCase().replace(/\s/g, "")}`}
        >
          {task.stage}
        </span>
        {subtaskCount > 0 && (
          <span style={{ fontSize: "10px", color: "var(--text-3)" }}>
            {subtaskCount} sub-task{subtaskCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {task.cluster_name && (
        <div
          style={{
            fontSize: "10px",
            color: "var(--accent)",
            marginBottom: "4px",
          }}
        >
          📦 {task.cluster_name}
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          marginTop: "8px",
        }}
      >
        {task.due_date && (
          <span
            style={{
              fontSize: "10px",
              color: overdue ? "var(--danger)" : "var(--text-3)",
            }}
          >
            {overdue ? "⚠ " : ""}
            {formatDate(task.due_date)}
          </span>
        )}
      </div>
      {isManager && (
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginTop: "8px",
            borderTop: "1px solid var(--border)",
            paddingTop: "8px",
          }}
        >
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: "11px", padding: "2px 8px" }}
            onClick={() => onEdit(task)}
          >
            Edit
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              color: "var(--accent)",
            }}
            onClick={() => onAddSubTask(task)}
          >
            Sub Task
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              color: "var(--danger)",
            }}
            onClick={() => onDelete(task.id)}
          >
            Del
          </button>
        </div>
      )}
    </div>
  );
}

function ListView({
  tasks,
  subtasksByParent,
  projectId,
  onEdit,
  onDelete,
  isManager,
  onAddSubTask,
}) {
  const [expanded, setExpanded] = useState(new Set());

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: "28px" }}></th>
              <th>Task</th>
              <th>Priority</th>
              <th>Stage</th>
              <th>Due</th>
              {isManager && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                    color: "var(--text-3)",
                    padding: "32px",
                  }}
                >
                  No tasks yet
                </td>
              </tr>
            )}
            {tasks.map((t) => {
              const overdue = isOverdue(t.due_date, t.stage);
              const subtasks = subtasksByParent[t.id] || [];
              const isExpanded = expanded.has(t.id);
              return (
                <Fragment key={t.id}>
                  <tr className={overdue ? "overdue" : ""}>
                    <td>
                      {subtasks.length > 0 && (
                        <button
                          onClick={() => toggleExpand(t.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-3)",
                            fontSize: "11px",
                            padding: "2px 4px",
                            transform: isExpanded
                              ? "rotate(0deg)"
                              : "rotate(-90deg)",
                            transition: "transform 0.15s",
                          }}
                          title={isExpanded ? "Collapse" : "Expand"}
                        >
                          ▼
                        </button>
                      )}
                    </td>
                    <td>
                      <Link
                        to={`/projects/${projectId}/tasks/${t.id}`}
                        style={{ color: "var(--text)", textDecoration: "none" }}
                      >
                        {t.title}
                      </Link>
                      {subtasks.length > 0 && (
                        <span
                          style={{
                            fontSize: "10px",
                            color: "var(--text-3)",
                            marginLeft: "6px",
                          }}
                        >
                          ({subtasks.length} sub-task
                          {subtasks.length !== 1 ? "s" : ""})
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${t.priority}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-${t.stage?.toLowerCase().replace(/\s/g, "")}`}
                      >
                        {t.stage}
                      </span>
                    </td>
                    <td
                      style={{
                        color: overdue ? "var(--danger)" : "var(--text-2)",
                      }}
                    >
                      {formatDate(t.due_date)}
                    </td>
                    {isManager && (
                      <td>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => onEdit(t)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--accent)" }}
                            onClick={() => onAddSubTask(t)}
                          >
                            Sub Task
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            onClick={() => onDelete(t.id)}
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isExpanded &&
                    subtasks.map((st) => {
                      const stOverdue = isOverdue(st.due_date, st.stage);
                      return (
                        <tr
                          key={st.id}
                          className={stOverdue ? "overdue" : ""}
                          style={{ background: "var(--bg-2)" }}
                        >
                          <td></td>
                          <td style={{ paddingLeft: "28px" }}>
                            <Link
                              to={`/projects/${projectId}/tasks/${st.id}`}
                              style={{
                                color: "var(--text-2)",
                                textDecoration: "none",
                                fontSize: "12px",
                              }}
                            >
                              ↳ {st.title}
                            </Link>
                          </td>
                          <td>
                            <span className={`badge badge-${st.priority}`}>
                              {st.priority}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge badge-${st.stage?.toLowerCase().replace(/\s/g, "")}`}
                            >
                              {st.stage}
                            </span>
                          </td>
                          <td
                            style={{
                              color: stOverdue
                                ? "var(--danger)"
                                : "var(--text-2)",
                            }}
                          >
                            {formatDate(st.due_date)}
                          </td>
                          {isManager && (
                            <td>
                              <div style={{ display: "flex", gap: "4px" }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => onEdit(st)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: "var(--danger)" }}
                                  onClick={() => onDelete(st.id)}
                                >
                                  Del
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}