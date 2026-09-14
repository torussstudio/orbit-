// import { useState, useEffect } from "react";
// import { Link } from "react-router-dom";
// import api from "../api/client";
// import { formatDate, isOverdue } from "../utils/helpers";
// import { StageBadge } from "./Dashboard";

// export default function TaskView() {
//   const [tasks, setTasks] = useState([]);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     api
//       .get("/dashboard/my-tasks")
//       .then((r) => setTasks(r.data.tasks || []))
//       .finally(() => setLoading(false));
//   }, []);

//   // Members are assigned sub tasks, not main tasks — so "Tasks" here
//   // means the sub tasks assigned to them.
//   const myTasks = tasks.filter((t) => t.parent_task_id);

//   if (loading)
//     return (
//       <div className="loading-screen">
//         <div className="spinner" />
//       </div>
//     );

//   return (
//     <>
//       <div className="page-header">
//         <div>
//           <div className="page-title">Task View</div>
//           <div className="page-subtitle">Every task assigned to you, across all projects</div>
//         </div>
//       </div>

//       <div className="page-body">
//         <div className="card">
//           {myTasks.length === 0 ? (
//             <div style={{ textAlign: "center", padding: "32px", color: "var(--text-3)", fontSize: "13px" }}>
//               📭 No tasks assigned to you
//             </div>
//           ) : (
//             myTasks.map((t) => {
//               const overdue = t.stage !== "Done" && isOverdue?.(t.due_date);
//               return (
//                 <Link
//                   to={`/projects/${t.project_id}/tasks/${t.id}`}
//                   key={t.id}
//                   style={{
//                     display: "block",
//                     textDecoration: "none",
//                     padding: "12px 0",
//                     borderBottom: "1px solid var(--border)",
//                   }}
//                 >
//                   <div
//                     style={{
//                       display: "flex",
//                       justifyContent: "space-between",
//                       alignItems: "center",
//                       gap: "10px",
//                       flexWrap: "wrap",
//                     }}
//                   >
//                     <span style={{ fontSize: "13px", color: "var(--text)", fontWeight: 500 }}>
//                       {t.title}
//                     </span>
//                     <StageBadge stage={t.stage} />
//                   </div>
//                   <div
//                     style={{
//                       fontSize: "11px",
//                       color: "var(--text-3)",
//                       marginTop: "4px",
//                       display: "flex",
//                       gap: "6px",
//                       flexWrap: "wrap",
//                     }}
//                   >
//                     <span>{t.project_name}</span>
//                     {t.parent_title && (
//                       <>
//                         <span>·</span>
//                         <span>Parent: {t.parent_title}</span>
//                       </>
//                     )}
//                     {t.due_date && (
//                       <>
//                         <span>·</span>
//                         <span style={{ color: overdue ? "var(--danger)" : "var(--text-3)" }}>
//                           Due {formatDate(t.due_date)}
//                         </span>
//                       </>
//                     )}
//                   </div>
//                 </Link>
//               );
//             })
//           )}
//         </div>
//       </div>
//     </>
//   );
// }


import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { formatDate, isOverdue } from "../utils/helpers";
import { StageBadge } from "./Dashboard";

const STAGES = ["Todo", "In Progress", "In Review", "Done"];

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
          {STAGES.filter((s) => s !== task.stage).map((s) => (
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

  useEffect(() => {
    api
      .get("/dashboard/my-tasks")
      .then((r) => setTasks(r.data.tasks || []))
      .finally(() => setLoading(false));
  }, []);

  const myTasks = tasks.filter((t) => t.parent_task_id);

  const handleStageChange = async (task, newStage) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, stage: newStage } : t))
    );
    try {
      await api.put(`/tasks/${task.id}`, { ...task, stage: newStage });
    } catch (err) {
      console.error("Failed to update stage:", err.message);
      // revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, stage: task.stage } : t))
      );
    }
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
                    <StageDropdown task={t} onChange={handleStageChange} />
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
    </>
  );
}