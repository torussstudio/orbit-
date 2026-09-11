import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatDate, isOverdue } from "../utils/helpers";
import { StageBadge } from "./Dashboard";

export default function TaskView() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks"); // "tasks" | "subtasks"

  useEffect(() => {
    api
      .get("/dashboard/my-tasks")
      .then((r) => setTasks(r.data.tasks || []))
      .finally(() => setLoading(false));
  }, []);

  const mainTasks = tasks.filter((t) => !t.parent_task_id);
  const subTasks = tasks.filter((t) => t.parent_task_id);

  const list = activeTab === "tasks" ? mainTasks : subTasks;

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
      </div>

      <div className="page-body">
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <TabButton
            active={activeTab === "tasks"}
            onClick={() => setActiveTab("tasks")}
            label={`Tasks (${mainTasks.length})`}
          />
          <TabButton
            active={activeTab === "subtasks"}
            onClick={() => setActiveTab("subtasks")}
            label={`Sub-tasks (${subTasks.length})`}
          />
        </div>

        <div className="card">
          {list.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "var(--text-3)", fontSize: "13px" }}>
              📭 No {activeTab === "tasks" ? "tasks" : "sub-tasks"} assigned to you
            </div>
          ) : (
            list.map((t) => {
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
                      {activeTab === "subtasks" ? "↳ " : ""}
                      {t.title}
                    </span>
                    <StageBadge stage={t.stage} />
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
                    {activeTab === "subtasks" && t.parent_title && (
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
    </>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "10px 4px",
        fontSize: "13px",
        fontWeight: 600,
        color: active ? "var(--accent)" : "var(--text-3)",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        marginBottom: "-1px",
      }}
    >
      {label}
    </button>
  );
}