import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import TaskForm from "../components/tasks/TaskForm";
import Select from "../components/ui/Select";

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
  const [view, setView] = useState("board");
  const [members, setMembers] = useState([]);
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
    Promise.all([
      api.get(`/tasks/project/${projectId}`),
      api.get("/members"),
      api.get(`/clusters/project/${projectId}`),
    ])
      .then(([t, m, c]) => {
        setTasks(t.data);
        setMembers(m.data);
        setClusters(c.data);
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

  // Monthly filter helpers
  const getMonthKey = (dateStr) => (dateStr ? dateStr.slice(0, 7) : null);

  const allMonthKeys = [
    ...new Set([
      ...tasks.map((t) => getMonthKey(t.created_at)).filter(Boolean),
      currentMonthKey,
    ]),
  ].sort((a, b) => a.localeCompare(b));

  const filteredTasks = tasks.filter(
    (t) => getMonthKey(t.created_at) === selectedMonth
  );

  const formatMonthLabel = (key) => {
    const [year, month] = key.split("-");
    return new Date(year, month - 1).toLocaleString("default", {
      month: "long",
      year: "numeric",
    });
  };

  const currentIdx = allMonthKeys.indexOf(selectedMonth);

  if (loading)
    return (
      <div style={{ padding: "24px" }}>
        <div className="spinner" />
      </div>
    );

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "var(--bg)",
          padding: "24px 32px 20px",
          margin: "-24px -32px 0",
        }}
      >
        {/* Left: Board / List toggle */}
        <div style={{ display: "flex", gap: "8px" }}>
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
        </div>

        {/* Right: Month navigator + Add Task */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
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
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              fontSize: "12px",
              fontWeight: 600,
              minWidth: "140px",
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
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
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

          {/* Task count badge */}
          <span
            style={{
              fontSize: "11px",
              background: "var(--bg-4)",
              borderRadius: "10px",
              padding: "2px 8px",
              color: "var(--text-3)",
              textWrap: "nowrap"
            }}
          >
            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
          </span>

          {/* Divider */}
          {isManager && (
            <div
              style={{
                width: "1px",
                height: "20px",
                background: "var(--border)",
              }}
            />
          )}

          {/* Add Task */}
          {isManager && (
            <button
              className="btn btn-primary btn-sm"
              style={{ textWrap: "nowrap"}}
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
          tasks={filteredTasks}
          stages={stages}
          projectId={projectId}
          onEdit={(t) => {
            setEditing(t);
            setShowModal(true);
          }}
          onDelete={handleDelete}
          onUpdate={load}
          isManager={isManager}
          onAddSubTask={(t) => {
            setSubTaskParent(t);
            setShowSubTaskModal(true);
          }}
        />
      ) : (
        <ListView
          tasks={filteredTasks}
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
            members={members}
            clusters={clusters}
            stages={stages}
            onSave={handleSave}
            saving={savingTask}
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
  stages,
  projectId,
  onEdit,
  onDelete,
  onUpdate,
  isManager,
  onAddSubTask,
}) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(null);

  const boardWrapRef = useRef(null);
  const [boardMaxHeight, setBoardMaxHeight] = useState(null);

  useLayoutEffect(() => {
    const calc = () => {
      const el = boardWrapRef.current;
      if (!el) return;
      const scrollParent = el.closest(".main-content") || document.scrollingElement;
      if (!scrollParent) return;
      const rect = el.getBoundingClientRect();
      const parentRect = scrollParent.getBoundingClientRect();
      const offset = rect.top - parentRect.top + scrollParent.scrollTop;
      setBoardMaxHeight(scrollParent.clientHeight - offset - 16);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const handleDrop = async (taskId, newStage) => {
    const task = tasks.find((t) => String(t.id) === String(taskId));
    if (!task) return;
    if (task.stage === newStage) return;
    const managerOnly = ["Done"];
    if (user.role === "member" && managerOnly.includes(newStage)) return;
    try {
      await api.put(`/tasks/${task.id}`, { ...task, stage: newStage });
      onUpdate();
    } catch (e) {
      console.error("Drop failed:", e);
    }
  };

  return (
    <div
      ref={boardWrapRef}
      style={{
        overflow: "auto",
        maxHeight: boardMaxHeight ? `${boardMaxHeight}px` : undefined,
      }}
    >
      {/* Sticky stage-header row — pinned below the toolbar so TODO / IN
          PROGRESS / IN REVIEW / DONE stay visible while cards scroll under
          it. Shares this same overflowX container with the cards row below
          so both scroll horizontally in sync. */}
      <div
        style={{
          display: "flex",
          gap: "20px",
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--bg)",
          padding: "12px 0 8px",
          width: "fit-content",
          minWidth: "100%",
        }}
      >
        {stages.map((stage) => {
          const stageTasks = tasks.filter((t) => t.stage === stage);
          return (
            <div
              key={stage}
              style={{
                minWidth: "290px",
                width: "290px",
                display: "flex",
                justifyContent: "start",
                alignItems: "center",
                flexDirection: "row-reverse",
                gap: "15px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--text-2)",
                }}
              >
                {stage}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  background: "var(--bg-4)",
                  borderRadius: "10px",
                  padding: "1px 7px",
                  color: "var(--text-3)",
                }}
              >
                {stageTasks.length}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scrolling cards row */}
      <div
        style={{
          display: "flex",
          gap: "20px",
          paddingTop: "8px",
          paddingBottom: "12px",
          width: "fit-content",
          minWidth: "100%",
        }}
      >
        {stages.map((stage) => {
          const stageTasks = tasks.filter((t) => t.stage === stage);
          return (
            <div
              key={stage}
              style={{
                minWidth: "290px",
                width: "290px",
                borderRadius: "10px",
                padding: "8px",
                transition: "background 0.2s",
                background: dragOver === stage ? "var(--bg-3)" : "transparent",
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                handleDrop(e.dataTransfer.getData("taskId"), stage);
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  minHeight: "80px",
                }}
              >
                {stageTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    projectId={projectId}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    isManager={isManager}
                    onAddSubTask={onAddSubTask}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  projectId,
  onEdit,
  onDelete,
  isManager,
  onAddSubTask,
}) {
  const overdue = isOverdue(task.due_date, task.stage);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("taskId", String(task.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      className="card"
      style={{
        padding: "12px",
        cursor: "grab",
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
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "8px",
        }}
      >
        {task.assignee_name ? (
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
            👤 {task.assignee_name}
          </span>
        ) : (
          <span />
        )}
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
  projectId,
  onEdit,
  onDelete,
  isManager,
  onAddSubTask,
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Assignee</th>
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
              return (
                <tr key={t.id} className={overdue ? "overdue" : ""}>
                  <td>
                    <Link
                      to={`/projects/${projectId}/tasks/${t.id}`}
                      style={{ color: "var(--text)", textDecoration: "none" }}
                    >
                      {t.title}
                    </Link>
                  </td>
                  <td style={{ color: "var(--text-2)" }}>
                    {t.assignee_name || "—"}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}