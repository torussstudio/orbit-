// import { useState, useEffect, useMemo, Fragment } from "react";
// import { useParams, Link } from "react-router-dom";
// import api from "../api/client";
// import { useAuth } from "../context/AuthContext";
// import { formatDate, isOverdue } from "../utils/helpers";
// import Modal from "../components/ui/Modal";
// import ConfirmModal from "../components/ui/ConfirmModal";
// import TaskForm from "../components/tasks/TaskForm";
// import Select from "../components/ui/Select";
// import Loader from "../components/ui/Loader";

// const PRIORITY_COLORS = {
//   low: "var(--accent)",
//   medium: "var(--warning)",
//   high: "var(--danger)",
//   critical: "var(--critical)",
// };

// // A main task has no stage of its own — its "Done" status is derived
// // entirely from its sub tasks: Done only once every sub task is Done,
// // and only when it actually has sub tasks.
// const allSubtasksDone = (subtasks) =>
//   subtasks.length > 0 && subtasks.every((st) => st.stage === "Done");

// const gradientBtn = {
//   width: "24px",
//   height: "24px",
//   borderRadius: "8px",
//   border: "none",
//   background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
//   color: "#fff",
//   display: "flex",
//   alignItems: "center",
//   justifyContent: "center",
//   fontSize: "16px",
//   fontWeight: 600,
//   transition: "all 0.15s",
//   flexShrink: 0,
// };

// export default function Tasks({ project: propProject, active = true }) {
//   const params = useParams();
//   const projectId = propProject?.id || params.id;
//   const { isManager } = useAuth();

//   const [tasks, setTasks] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [showModal, setShowModal] = useState(false);
//   const [editing, setEditing] = useState(null);
//   const [view, setView] = useState("list");
//   const [members, setMembers] = useState([]);
//   const [clusters, setClusters] = useState([]);
//   const [showSubTaskModal, setShowSubTaskModal] = useState(false);
//   const [subTaskParent, setSubTaskParent] = useState(null);
//   const [savingTask, setSavingTask] = useState(false);

//   const [deleteConfirm, setDeleteConfirm] = useState({
//     show: false,
//     id: null,
//     loading: false,
//   });

//   // Delete rule: a main task can only be deleted once all its sub tasks are gone.
//   const [deleteBlocked, setDeleteBlocked] = useState(null); // { title, subtaskCount }

//   const now = new Date();
//   const currentMonthKey = `${now.getFullYear()}-${String(
//     now.getMonth() + 1,
//   ).padStart(2, "0")}`;

//   const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

//   // Main tasks do not use stages. Stages are still available for SUB TASKS.
//   const stages = propProject?.custom_stages || [
//     "Todo",
//     "In Progress",
//     "In Review",
//     "Done",
//   ];

//   const load = () => {
//     Promise.all([
//       api.get(`/tasks/project/${projectId}`),
//       api.get("/members"),
//       api.get(`/clusters/project/${projectId}`),
//     ])
//       .then(([t, m, c]) => {
//         setTasks(t.data);
//         setMembers(m.data);
//         setClusters(c.data);
//       })
//       .finally(() => setLoading(false));
//   };

//    // Fetch on mount and every time this tab becomes active.
//   // `load` never sets loading=true, so the refetch is silent (no blink).
//   useEffect(() => {
//     if (projectId && active) {
//       load();
//     }
//   }, [projectId, active]);

//   // Does the task being edited already have sub tasks? (checks all months)
// const editingHasSubtasks =
//   !!editing &&
//   tasks.some((t) => String(t.parent_task_id) === String(editing.id));

//   // MAIN TASK CREATE / EDIT
//   const handleSave = async (data) => {
//     setSavingTask(true);

//     try {
//       const mainTaskData = {
//         ...data,
//         // Main tasks do not use status/stage.
//         stage: undefined,
//       };

//       if (editing) {
//         await api.put(`/tasks/${editing.id}`, mainTaskData);
//       } else {
//         await api.post("/tasks", {
//           ...mainTaskData,
//           project_id: projectId,
//         });
//       }

//       setShowModal(false);
//       setEditing(null);
//       load();
//     } finally {
//       setSavingTask(false);
//     }
//   };

//   // SUB TASK CREATE (sub tasks keep stages)
//   const handleSubTaskSave = async (data) => {
//     setSavingTask(true);

//     try {
//       await api.post("/tasks", {
//         ...data,
//         project_id: projectId,
//         parent_task_id: subTaskParent.id,
//       });

//       setShowSubTaskModal(false);
//       setSubTaskParent(null);
//       load();
//     } finally {
//       setSavingTask(false);
//     }
//   };

//   // `tasks` holds every task of the project (all months), so this also
//   // catches sub tasks that are hidden by the month filter.
//   const handleDelete = (id) => {
//     const subtaskCount = tasks.filter(
//       (t) => String(t.parent_task_id) === String(id),
//     ).length;

//     if (subtaskCount > 0) {
//       const task = tasks.find((t) => String(t.id) === String(id));
//       setDeleteBlocked({ title: task?.title || "This task", subtaskCount });
//       return;
//     }

//     setDeleteConfirm({ show: true, id, loading: false });
//   };

//   const confirmDelete = async () => {
//     setDeleteConfirm((prev) => ({ ...prev, loading: true }));

//     try {
//       await api.delete(`/tasks/${deleteConfirm.id}`);
//       load();
//     } catch (error) {
//       alert(
//         "Failed to delete task: " +
//           (error.response?.data?.error || error.message),
//       );
//       load();
//     } finally {
//       setDeleteConfirm({ show: false, id: null, loading: false });
//     }
//   };

//   // MONTH FILTER
//   const getMonthKey = (t) => {
//     const dateStr = t?.due_date || t?.created_at;
//     return dateStr ? dateStr.slice(0, 7) : null;
//   };

//   const allMonthKeys = useMemo(
//     () =>
//       [
//         ...new Set([
//           ...tasks.map((t) => getMonthKey(t)).filter(Boolean),
//           currentMonthKey,
//         ]),
//       ].sort((a, b) => a.localeCompare(b)),
//     [tasks, currentMonthKey],
//   );

//   const filteredTasks = useMemo(
//     () => tasks.filter((t) => getMonthKey(t) === selectedMonth),
//     [tasks, selectedMonth],
//   );

//   // MAIN TASKS (no parent_task_id), newest first
//   const mainTasks = useMemo(
//     () =>
//       filteredTasks
//         .filter((t) => !t.parent_task_id)
//         .sort((a, b) => {
//           const bTime = b.created_at ? new Date(b.created_at).getTime() : b.id;
//           const aTime = a.created_at ? new Date(a.created_at).getTime() : a.id;
//           return bTime - aTime;
//         }),
//     [filteredTasks],
//   );

//   // SUB TASKS GROUPED BY PARENT
//   const subtasksByParent = useMemo(
//     () =>
//       filteredTasks.reduce((acc, t) => {
//         if (t.parent_task_id) {
//           if (!acc[t.parent_task_id]) {
//             acc[t.parent_task_id] = [];
//           }
//           acc[t.parent_task_id].push(t);
//         }
//         return acc;
//       }, {}),
//     [filteredTasks],
//   );

//   const formatMonthLabel = (key) => {
//     const [year, month] = key.split("-");
//     return new Date(year, month - 1).toLocaleString("default", {
//       month: "long",
//       year: "numeric",
//     });
//   };

//   const taskCount = mainTasks.length;
//   const currentIdx = allMonthKeys.indexOf(selectedMonth);

//   if (loading) {
//     return (
//       <div style={{ padding: "24px" }}>
//         <Loader label="Loading tasks" size="lg" variant="page" />
//       </div>
//     );
//   }

//   const activeViewStyle = {
//     borderColor: "var(--accent)",
//     color: "var(--accent)",
//   };

//   return (
//     <div className="tasks-page" style={{ padding: "24px 32px" }}>
//       {/* TOOLBAR */}
//       <div
//         className="tasks-toolbar"
//         style={{
//           display: "flex",
//           flexWrap: "wrap",
//           justifyContent: "space-between",
//           alignItems: "center",
//           rowGap: "12px",
//           position: "sticky",
//           top: 0,
//           zIndex: 30,
//           background: "var(--bg)",
//           padding: "24px 32px 20px",
//           margin: "-24px -32px 0",
//         }}
//       >
//         {/* LIST / BOARD */}
//         <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
//           <button
//             className={`btn btn-ghost btn-sm ${view === "list" ? "active" : ""}`}
//             onClick={() => setView("list")}
//             style={view === "list" ? activeViewStyle : {}}
//           >
//             List
//           </button>

//           <button
//             className={`btn btn-ghost btn-sm ${view === "board" ? "active" : ""}`}
//             onClick={() => setView("board")}
//             style={view === "board" ? activeViewStyle : {}}
//           >
//             Board
//           </button>
//         </div>

//         {/* MONTH + TASK COUNT + ADD TASK */}
//         <div
//           style={{
//             display: "flex",
//             flexWrap: "wrap",
//             alignItems: "center",
//             justifyContent: "flex-end",
//             gap: "10px",
//             rowGap: "8px",
//           }}
//         >
//           {/* PREVIOUS MONTH */}
//           <button
//             onClick={() => {
//               if (currentIdx > 0) {
//                 setSelectedMonth(allMonthKeys[currentIdx - 1]);
//               }
//             }}
//             disabled={currentIdx === 0}
//             style={{
//               ...gradientBtn,
//               cursor: currentIdx === 0 ? "not-allowed" : "pointer",
//               opacity: currentIdx === 0 ? 0.4 : 1,
//             }}
//           >
//             ‹
//           </button>

//           {/* MONTH */}
//           <Select
//             value={selectedMonth}
//             onChange={(val) => setSelectedMonth(val)}
//             arrowColor="#fff"
//             labelColor="#fff"
//             style={{
//               padding: "5px 12px",
//               borderRadius: "8px",
//               border: "none",
//               background:
//                 "linear-gradient(135deg, var(--accent), var(--accent-2))",
//               fontSize: "12px",
//               fontWeight: 600,
//               minWidth: "140px",
//               flexShrink: 0,
//             }}
//           >
//             {allMonthKeys.map((key) => (
//               <option key={key} value={key}>
//                 {formatMonthLabel(key)}
//               </option>
//             ))}
//           </Select>

//           {/* NEXT MONTH */}
//           <button
//             onClick={() => {
//               if (currentIdx < allMonthKeys.length - 1) {
//                 setSelectedMonth(allMonthKeys[currentIdx + 1]);
//               }
//             }}
//             disabled={currentIdx === allMonthKeys.length - 1}
//             style={{
//               ...gradientBtn,
//               cursor:
//                 currentIdx === allMonthKeys.length - 1
//                   ? "not-allowed"
//                   : "pointer",
//               opacity: currentIdx === allMonthKeys.length - 1 ? 0.4 : 1,
//             }}
//           >
//             ›
//           </button>

//           {/* TASK COUNT */}
//           <span
//             style={{
//               fontSize: "11px",
//               background: "var(--bg-4)",
//               borderRadius: "10px",
//               padding: "2px 8px",
//               color: "var(--text-3)",
//               whiteSpace: "nowrap",
//               flexShrink: 0,
//             }}
//           >
//             {taskCount} task{taskCount !== 1 ? "s" : ""}
//           </span>

//           {/* DIVIDER */}
//           {isManager && (
//             <div
//               style={{
//                 width: "1px",
//                 height: "20px",
//                 background: "var(--border)",
//                 flexShrink: 0,
//               }}
//             />
//           )}

//           {/* ADD TASK */}
//           {isManager && (
//             <button
//               className="btn btn-primary btn-sm"
//               style={{ whiteSpace: "nowrap", flexShrink: 0 }}
//               onClick={() => {
//                 setEditing(null);
//                 setShowModal(true);
//               }}
//             >
//               + Add Task
//             </button>
//           )}
//         </div>
//       </div>

//       {/* BOARD / LIST */}
//       {view === "board" ? (
//         <BoardView
//           tasks={mainTasks}
//           subtasksByParent={subtasksByParent}
//           projectId={projectId}
//           onEdit={(t) => {
//             setEditing(t);
//             setShowModal(true);
//           }}
//           onDelete={handleDelete}
//           isManager={isManager}
//           onAddSubTask={(t) => {
//             setSubTaskParent(t);
//             setShowSubTaskModal(true);
//           }}
//         />
//       ) : (
//         <ListView
//           tasks={mainTasks}
//           subtasksByParent={subtasksByParent}
//           projectId={projectId}
//           onEdit={(t) => {
//             setEditing(t);
//             setShowModal(true);
//           }}
//           onDelete={handleDelete}
//           isManager={isManager}
//           onAddSubTask={(t) => {
//             setSubTaskParent(t);
//             setShowSubTaskModal(true);
//           }}
//         />
//       )}

//       {/* MAIN TASK MODAL */}
//       {showModal && (
//         <Modal
//           title={editing ? "Edit Task" : "New Task"}
//           onClose={() => {
//             setShowModal(false);
//             setEditing(null);
//           }}
//         >
//           <TaskForm
//   initial={editing}
//   hasExistingSubtasks={editingHasSubtasks}
//   members={members}
//   allMembers={members}
//   clusters={clusters}
//   stages={[]}
//   onSave={handleSave}
//   saving={savingTask}
//   onCancel={() => {
//     setShowModal(false);
//     setEditing(null);
//   }}
// />
//         </Modal>
//       )}

//       {/* SUB TASK MODAL */}
//       {showSubTaskModal && subTaskParent && (
//         <Modal
//           title={`Sub Task — ${subTaskParent.title}`}
//           onClose={() => {
//             setShowSubTaskModal(false);
//             setSubTaskParent(null);
//           }}
//         >
//           <TaskForm
//             members={members}
//             clusters={clusters}
//             // Sub tasks KEEP stages.
//             stages={stages}
//             onSave={handleSubTaskSave}
//             saving={savingTask}
//             onCancel={() => {
//               setShowSubTaskModal(false);
//               setSubTaskParent(null);
//             }}
//             hideCluster
//             isSubtaskForm
//           />
//         </Modal>
//       )}

//       {/* CANNOT DELETE — task still has sub tasks */}
//       {deleteBlocked && (
//         <Modal title="Cannot delete task" onClose={() => setDeleteBlocked(null)}>
//           <p className="mb-2 text-[13px] leading-relaxed text-[var(--text-2)]">
//             <strong className="text-[var(--text)]">{deleteBlocked.title}</strong>{" "}
//             still has {deleteBlocked.subtaskCount}{" "}
//             {deleteBlocked.subtaskCount === 1 ? "sub task" : "sub tasks"}.
//           </p>
//           <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
//             Delete all of its sub tasks first. Once none are left, you can
//             delete the task.
//           </p>
//           <div className="modal-actions">
//             <button
//               className="btn btn-primary"
//               onClick={() => setDeleteBlocked(null)}
//             >
//               Got it
//             </button>
//           </div>
//         </Modal>
//       )}

//       {/* DELETE CONFIRM */}
//       <ConfirmModal
//         isOpen={deleteConfirm.show}
//         title="Delete Task"
//         message="Are you sure you want to delete this task? This action cannot be undone."
//         confirmText="Delete"
//         onConfirm={confirmDelete}
//         onCancel={() =>
//           setDeleteConfirm({ show: false, id: null, loading: false })
//         }
//         loading={deleteConfirm.loading}
//       />
//     </div>
//   );
// }

// /*
//  * ============================================================
//  * BOARD VIEW
//  * ============================================================
//  */

// function BoardView({
//   tasks,
//   subtasksByParent,
//   projectId,
//   onEdit,
//   onDelete,
//   isManager,
//   onAddSubTask,
// }) {
//   return (
//     <div className="card-grid">
//       {tasks.map((t) => {
//         const subtasks = subtasksByParent[t.id] || [];

//         return (
//           <TaskCard
//             key={t.id}
//             task={t}
//             subtaskCount={subtasks.length}
//             mainTaskDone={allSubtasksDone(subtasks)}
//             projectId={projectId}
//             onEdit={onEdit}
//             onDelete={onDelete}
//             isManager={isManager}
//             onAddSubTask={onAddSubTask}
//           />
//         );
//       })}
//     </div>
//   );
// }

// /*
//  * ============================================================
//  * MAIN TASK CARD
//  * ============================================================
//  *
//  * Main Task has no stage field of its own, but shows a "Done"
//  * badge once every sub task is Done. When Done, the priority dot
//  * and due date are hidden (they no longer matter).
//  */

// function TaskCard({
//   task,
//   subtaskCount,
//   mainTaskDone,
//   projectId,
//   onEdit,
//   onDelete,
//   isManager,
//   onAddSubTask,
// }) {
//   const overdue = isOverdue(task.due_date, mainTaskDone ? "Done" : undefined);

//   return (
//     <div
//       className="card"
//       style={{
//         padding: "12px",
//         borderColor: overdue ? "rgba(248,113,113,0.3)" : undefined,
//       }}
//     >
//       <div
//         style={{
//           display: "flex",
//           justifyContent: "space-between",
//           alignItems: "flex-start",
//           marginBottom: "6px",
//         }}
//       >
//         <Link
//           to={`/projects/${projectId}/tasks/${task.id}`}
//           style={{
//             fontSize: "13px",
//             color: "var(--text)",
//             textDecoration: "none",
//             fontWeight: 500,
//             lineHeight: 1.4,
//             flex: 1,
//           }}
//         >
//           {task.title}
//         </Link>

//         {/* Priority dot — hidden once the task is Done */}
//         {!mainTaskDone && (
//           <div
//             style={{
//               width: "8px",
//               height: "8px",
//               borderRadius: "50%",
//               background: PRIORITY_COLORS[task.priority],
//               marginLeft: "8px",
//               flexShrink: 0,
//               marginTop: "3px",
//             }}
//             title={task.priority}
//           />
//         )}
//       </div>

//       {/* Derived "Done" badge — shown once every sub task is Done */}
//       {mainTaskDone && (
//         <div
//           className="badge badge-done"
//           style={{
//             display: "inline-block",
//             fontSize: "10px",
//             marginBottom: "4px",
//           }}
//         >
//           ✓ Done
//         </div>
//       )}

//       {subtaskCount > 0 && (
//         <div
//           style={{
//             fontSize: "10px",
//             color: "var(--text-3)",
//             marginBottom: "4px",
//           }}
//         >
//           {subtaskCount} sub-task{subtaskCount !== 1 ? "s" : ""}
//         </div>
//       )}

//       {task.cluster_name && (
//         <div
//           style={{
//             fontSize: "10px",
//             color: "var(--accent)",
//             marginBottom: "4px",
//           }}
//         >
//           📦 {task.cluster_name}
//         </div>
//       )}

//       <div
//         style={{
//           display: "flex",
//           justifyContent: "flex-end",
//           alignItems: "center",
//           marginTop: "8px",
//         }}
//       >
//         {task.due_date && !mainTaskDone && (
//           <span
//             style={{
//               fontSize: "10px",
//               color: overdue ? "var(--danger)" : "var(--text-3)",
//             }}
//           >
//             {overdue ? "⚠ " : ""}
//             {formatDate(task.due_date)}
//           </span>
//         )}
//       </div>

//       {isManager && (
//         <div
//           style={{
//             display: "flex",
//             gap: "4px",
//             marginTop: "8px",
//             borderTop: "1px solid var(--border)",
//             paddingTop: "8px",
//           }}
//         >
//                     {!mainTaskDone && (
//             <button
//               className="btn btn-ghost btn-sm"
//               style={{ fontSize: "11px", padding: "2px 8px" }}
//               onClick={() => onEdit(task)}
//             >
//               Edit
//             </button>
//           )}

//           <button
//             className="btn btn-ghost btn-sm"
//             style={{
//               fontSize: "11px",
//               padding: "2px 8px",
//               color: "var(--accent)",
//             }}
//             onClick={() => onAddSubTask(task)}
//           >
//             Sub Task
//           </button>

//           <button
//             className="btn btn-ghost btn-sm"
//             style={{
//               fontSize: "11px",
//               padding: "2px 8px",
//               color: "var(--danger)",
//             }}
//             onClick={() => onDelete(task.id)}
//           >
//             Del
//           </button>
//         </div>
//       )}
//     </div>
//   );
// }

// function ListView({
//   tasks,
//   subtasksByParent,
//   projectId,
//   onEdit,
//   onDelete,
//   isManager,
//   onAddSubTask,
// }) {
//   const [expanded, setExpanded] = useState(new Set());

//   const toggleExpand = (id) => {
//     setExpanded((prev) => {
//       const next = new Set(prev);

//       if (next.has(id)) {
//         next.delete(id);
//       } else {
//         next.add(id);
//       }

//       return next;
//     });
//   };

//   return (
//     <div className="card" style={{ padding: 0, overflow: "hidden" }}>
//       <div className="table-wrap">
//         <table>
//           <thead>
//             <tr>
//               <th style={{ width: "28px" }} />
//               <th>Task</th>
//               <th>Priority</th>
//               <th>Stage</th>
//               <th>Due</th>
//               {isManager && <th>Actions</th>}
//             </tr>
//           </thead>

//           <tbody>
//             {tasks.length === 0 && (
//               <tr>
//                 <td
//                   colSpan={isManager ? 6 : 5}
//                   style={{
//                     textAlign: "center",
//                     color: "var(--text-3)",
//                     padding: "32px",
//                   }}
//                 >
//                   No tasks yet
//                 </td>
//               </tr>
//             )}

//             {tasks.map((t) => {
//               const subtasks = subtasksByParent[t.id] || [];
//               const isExpanded = expanded.has(t.id);
//               const mainDone = allSubtasksDone(subtasks);
//               const overdue = isOverdue(
//                 t.due_date,
//                 mainDone ? "Done" : undefined,
//               );

//               return (
//                 <Fragment key={t.id}>
//                   {/* MAIN TASK */}
//                   <tr className={overdue ? "overdue" : ""}>
//                     <td>
//                       {subtasks.length > 0 && (
//                         <button
//                           onClick={() => toggleExpand(t.id)}
//                           style={{
//                             background: "none",
//                             border: "none",
//                             cursor: "pointer",
//                             color: "var(--text-3)",
//                             fontSize: "11px",
//                             padding: "2px 4px",
//                             transform: isExpanded
//                               ? "rotate(0deg)"
//                               : "rotate(-90deg)",
//                             transition: "transform 0.15s",
//                           }}
//                           title={isExpanded ? "Collapse" : "Expand"}
//                         >
//                           ▼
//                         </button>
//                       )}
//                     </td>

//                     <td>
//                       <Link
//                         to={`/projects/${projectId}/tasks/${t.id}`}
//                         style={{ color: "var(--text)", textDecoration: "none" }}
//                       >
//                         {t.title}
//                       </Link>

//                       {subtasks.length > 0 && (
//                         <span
//                           style={{
//                             fontSize: "10px",
//                             color: "var(--text-3)",
//                             marginLeft: "6px",
//                           }}
//                         >
//                           ({subtasks.length} sub-task
//                           {subtasks.length !== 1 ? "s" : ""})
//                         </span>
//                       )}
//                     </td>

//                     {/* Priority hidden once Done */}
//                     <td>
//                       {!mainDone && (
//                         <span className={`badge badge-${t.priority}`}>
//                           {t.priority}
//                         </span>
//                       )}
//                     </td>

//                     {/* Derived Done badge (same style as sub tasks) */}
//                     <td>{mainDone && <span className="badge badge-done">Done</span>}</td>

//                     <td
//                       style={{
//                         color: overdue ? "var(--danger)" : "var(--text-2)",
//                       }}
//                     >
//                       {!mainDone && formatDate(t.due_date)}
//                     </td>

//                     {isManager && (
//                       <td>
//                         <div style={{ display: "flex", gap: "4px" }}>
//                                                    {!mainDone && (
//                             <button
//                               className="btn btn-ghost btn-sm"
//                               onClick={() => onEdit(t)}
//                             >
//                               Edit
//                             </button>
//                           )}

//                           <button
//                             className="btn btn-ghost btn-sm"
//                             style={{ color: "var(--accent)" }}
//                             onClick={() => onAddSubTask(t)}
//                           >
//                             Sub Task
//                           </button>

//                           <button
//                             className="btn btn-ghost btn-sm"
//                             style={{ color: "var(--danger)" }}
//                             onClick={() => onDelete(t.id)}
//                           >
//                             Del
//                           </button>
//                         </div>
//                       </td>
//                     )}
//                   </tr>

//                   {/* SUB TASKS */}
//                   {isExpanded &&
//                     subtasks.map((st) => {
//                       const stOverdue = isOverdue(st.due_date, st.stage);
//                       const stDone = st.stage === "Done";

//                       return (
//                         <tr
//                           key={st.id}
//                           className={stOverdue ? "overdue" : ""}
//                           style={{ background: "var(--bg-2)" }}
//                         >
//                           <td />

//                           <td style={{ paddingLeft: "28px" }}>
//                             <Link
//                               to={`/projects/${projectId}/tasks/${st.id}`}
//                               style={{
//                                 color: "var(--text-2)",
//                                 textDecoration: "none",
//                                 fontSize: "12px",
//                               }}
//                             >
//                               ↳ {st.title}
//                             </Link>
//                           </td>

//                           {/* Priority hidden once Done */}
//                           <td>
//                             {!stDone && (
//                               <span className={`badge badge-${st.priority}`}>
//                                 {st.priority}
//                               </span>
//                             )}
//                           </td>

//                           <td>
//                             <span
//                               className={`badge badge-${st.stage
//                                 ?.toLowerCase()
//                                 .replace(/\s/g, "")}`}
//                             >
//                               {st.stage}
//                             </span>
//                           </td>

//                           <td
//                             style={{
//                               color: stOverdue
//                                 ? "var(--danger)"
//                                 : "var(--text-2)",
//                             }}
//                           >
//                             {!stDone && formatDate(st.due_date)}
//                           </td>

//                           {isManager && (
//                             <td>
//                               <div style={{ display: "flex", gap: "4px" }}>
//                                                                {!stDone && (
//                                   <button
//                                     className="btn btn-ghost btn-sm"
//                                     onClick={() => onEdit(st)}
//                                   >
//                                     Edit
//                                   </button>
//                                 )}

//                                 <button
//                                   className="btn btn-ghost btn-sm"
//                                   style={{ color: "var(--danger)" }}
//                                   onClick={() => onDelete(st.id)}
//                                 >
//                                   Del
//                                 </button>
//                               </div>
//                             </td>
//                           )}
//                         </tr>
//                       );
//                     })}
//                 </Fragment>
//               );
//             })}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }


import { useState, useEffect, useMemo, Fragment } from "react";
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

// A main task has no stage of its own — its "Done" status is derived
// entirely from its sub tasks: Done only once every sub task is Done,
// and only when it actually has sub tasks.
const allSubtasksDone = (subtasks) =>
  subtasks.length > 0 && subtasks.every((st) => st.stage === "Done");

const STYLES = `
.ts-page { padding: 24px 32px 48px; }

/* toolbar */
.ts-toolbar {
  position: sticky; top: 0; z-index: 30; margin: -24px -32px 20px; padding: 16px 32px;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--bg); border-bottom: 1px solid var(--border);
}
.ts-group { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ts-seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--bg-3); border-radius: 10px; }
.ts-seg button {
  font-size: 12px; font-weight: 500; padding: 5px 14px; border: none; border-radius: 7px; cursor: pointer;
  color: var(--text-3); background: transparent; transition: background-color .2s ease, color .2s ease;
}
.ts-seg button:hover { color: var(--text); }
.ts-seg button[aria-pressed="true"] { color: var(--text); background: var(--bg-2); box-shadow: 0 1px 2px rgba(0,0,0,.12); }

.ts-month { display: inline-flex; align-items: stretch; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-2); overflow: hidden; }
.ts-month > button {
  width: 32px; border: none; cursor: pointer; font-size: 16px; color: var(--text-2); background: transparent;
  transition: background-color .2s ease, color .2s ease;
}
.ts-month > button:hover:not(:disabled) { background: var(--bg-3); color: var(--text); }
.ts-month > button:disabled { opacity: .35; cursor: not-allowed; }

.ts-summary { font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ts-summary b { color: var(--text); font-weight: 600; }
.ts-summary .is-alert { color: var(--danger); font-weight: 600; }

.ts-toolbar button:focus-visible, .ts-page a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.ts-alert {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px;
  padding: 10px 14px; font-size: 13px; color: var(--danger); border-radius: 10px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent);
}
.ts-alert button { background: none; border: none; color: inherit; cursor: pointer; font-size: 18px; line-height: 1; }

/* board */
.ts-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.ts-card {
  position: relative; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px;
  transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
}
.ts-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); box-shadow: 0 10px 24px -14px color-mix(in srgb, var(--accent) 40%, transparent); }
.ts-card.is-overdue { border-color: color-mix(in srgb, var(--danger) 40%, var(--border)); }
.ts-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.ts-title { font-size: 14px; font-weight: 600; line-height: 1.4; letter-spacing: -0.005em; color: var(--text); text-decoration: none; overflow-wrap: anywhere; }
.ts-title::after { content: ''; position: absolute; inset: 0; border-radius: 12px; }
.ts-title.is-done { color: var(--text-3); text-decoration: line-through; text-decoration-color: var(--text-3); }
.ts-dot { flex-shrink: 0; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; }
.ts-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.ts-meta .is-alert { color: var(--danger); font-weight: 600; }
.ts-cluster { color: var(--accent); }
.ts-progress { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.ts-track { flex: 1; height: 4px; border-radius: 999px; background: var(--bg-4); overflow: hidden; }
.ts-fill { height: 100%; width: 100%; border-radius: 999px; background: var(--accent); transform-origin: left center; transition: transform .4s cubic-bezier(.22,1,.36,1); }
.ts-fill.is-complete { background: var(--success, #10b981); }
.ts-actions { position: relative; z-index: 1; display: flex; gap: 4px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--border); }
.ts-actions .btn { transition: background-color .2s ease, color .2s ease, transform .1s ease; }
.ts-actions .btn:active, .ts-row-actions .btn:active { transform: scale(.97); }

/* list */
.ts-table-wrap { overflow-x: auto; background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; }
.ts-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.ts-table th {
  padding: 11px 14px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text-3);
  background: var(--bg-2); border-bottom: 1px solid var(--border); white-space: nowrap;
}
.ts-table td { position: relative; padding: 12px 14px; vertical-align: middle; border-bottom: 1px solid var(--border); color: var(--text-2); font-variant-numeric: tabular-nums; }
.ts-table tbody tr:last-child td { border-bottom: none; }
.ts-table tbody tr { transition: background-color .15s ease; }
.ts-table tbody tr:hover { background: var(--bg-3); }
.ts-table tr.is-overdue > td:first-child { box-shadow: inset 3px 0 0 var(--danger); }
.ts-table tr.is-sub { background: color-mix(in srgb, var(--bg-3) 55%, transparent); }
.ts-table .ts-name { color: var(--text); font-weight: 500; text-decoration: none; overflow-wrap: anywhere; }
.ts-table .ts-name:hover { text-decoration: underline; text-underline-offset: 3px; }
.ts-table .ts-name.is-done { color: var(--text-3); text-decoration: line-through; }
.ts-table .ts-count { margin-left: 8px; font-size: 11px; color: var(--text-3); }
.ts-table .is-alert { color: var(--danger); font-weight: 600; }
.ts-sub-cell { padding-left: 44px !important; }
.ts-sub-cell::before {
  content: ''; position: absolute; left: 24px; top: 0; height: 50%; width: 12px;
  border-left: 1px solid var(--border); border-bottom: 1px solid var(--border); border-bottom-left-radius: 6px;
}
.ts-sub-cell .ts-name { font-size: 12.5px; font-weight: 400; color: var(--text-2); }
.ts-chev { display: inline-flex; padding: 4px; border: none; border-radius: 6px; background: none; color: var(--text-3); cursor: pointer; transition: transform .2s ease, background-color .2s ease, color .2s ease; }
.ts-chev:hover { background: var(--bg-4); color: var(--text); }
.ts-chev:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.ts-chev[aria-expanded="false"] { transform: rotate(-90deg); }
.ts-row-actions { display: flex; gap: 4px; }

/* with / without sub tasks */
.ts-card.has-subs { border-left: 3px solid var(--accent); }
.ts-card.no-subs { border-style: dashed; background: transparent; }
.ts-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: 11px; font-weight: 500;
  color: var(--accent); border-radius: 6px; white-space: nowrap; font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.ts-chip.is-none { color: var(--text-3); background: transparent; border: 1px dashed var(--border); }
.ts-table .ts-chip { margin-left: 8px; }
.ts-leaf { display: inline-block; width: 6px; height: 6px; margin: 0 9px; border-radius: 50%; background: var(--border); vertical-align: middle; }
.ts-toolbar > .ts-filter { margin-right: auto; margin-left: 12px; }

.ts-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 56px 24px; text-align: center; border: 1px dashed var(--border); border-radius: 14px; color: var(--text-3); }
.ts-empty h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--text); }
.ts-empty p { margin: 0; font-size: 13px; }

.ts-skel { animation: ts-pulse 1.4s ease-in-out infinite; }
.ts-skel .bar { border-radius: 6px; background: var(--bg-4); }
@keyframes ts-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

@media (max-width: 720px) {
  .ts-page { padding: 16px 16px 40px; }
  .ts-toolbar { margin: -16px -16px 16px; padding: 12px 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .ts-card, .ts-fill, .ts-chev, .ts-table tbody tr { transition: none; }
  .ts-skel { animation: none; }
}
`;

export default function Tasks({ project: propProject, active = true }) {
  const params = useParams();
  const projectId = propProject?.id || params.id;
  const { isManager } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState("list");
  const [members, setMembers] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [showSubTaskModal, setShowSubTaskModal] = useState(false);
  const [subTaskParent, setSubTaskParent] = useState(null);
  const [savingTask, setSavingTask] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [subFilter, setSubFilter] = useState("all"); // all | with | without

  const [deleteConfirm, setDeleteConfirm] = useState({
    show: false,
    id: null,
    loading: false,
  });

  // Delete rule: a main task can only be deleted once all its sub tasks are gone.
  const [deleteBlocked, setDeleteBlocked] = useState(null); // { title, subtaskCount }

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  // Main tasks do not use stages. Stages are still available for SUB TASKS.
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

  // Fetch on mount and every time this tab becomes active.
  // `load` never sets loading=true, so the refetch is silent (no blink).
  useEffect(() => {
    if (projectId && active) {
      load();
    }
  }, [projectId, active]);

  // Does the task being edited already have sub tasks? (checks all months)
  const editingHasSubtasks =
    !!editing &&
    tasks.some((t) => String(t.parent_task_id) === String(editing.id));

  // MAIN TASK CREATE / EDIT
  const handleSave = async (data) => {
    setSavingTask(true);

    try {
      const mainTaskData = {
        ...data,
        // Main tasks do not use status/stage.
        stage: undefined,
      };

      if (editing) {
        await api.put(`/tasks/${editing.id}`, mainTaskData);
      } else {
        await api.post("/tasks", {
          ...mainTaskData,
          project_id: projectId,
        });
      }

      setShowModal(false);
      setEditing(null);
      load();
    } finally {
      setSavingTask(false);
    }
  };

  // SUB TASK CREATE (sub tasks keep stages)
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

  // `tasks` holds every task of the project (all months), so this also
  // catches sub tasks that are hidden by the month filter.
  const handleDelete = (id) => {
    const subtaskCount = tasks.filter(
      (t) => String(t.parent_task_id) === String(id),
    ).length;

    if (subtaskCount > 0) {
      const task = tasks.find((t) => String(t.id) === String(id));
      setDeleteBlocked({ title: task?.title || "This task", subtaskCount });
      return;
    }

    setErrorMsg("");
    setDeleteConfirm({ show: true, id, loading: false });
  };

  const confirmDelete = async () => {
    setDeleteConfirm((prev) => ({ ...prev, loading: true }));

    try {
      await api.delete(`/tasks/${deleteConfirm.id}`);
      load();
    } catch (error) {
      setErrorMsg(
        "We couldn't delete the task: " +
          (error.response?.data?.error || error.message),
      );
      load();
    } finally {
      setDeleteConfirm({ show: false, id: null, loading: false });
    }
  };

  // MONTH FILTER
  const getMonthKey = (t) => {
    const dateStr = t?.due_date || t?.created_at;
    return dateStr ? dateStr.slice(0, 7) : null;
  };

  const allMonthKeys = useMemo(
    () =>
      [
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

  // MAIN TASKS (no parent_task_id), newest first
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

  // SUB TASKS GROUPED BY PARENT
  const subtasksByParent = useMemo(
    () =>
      filteredTasks.reduce((acc, t) => {
        if (t.parent_task_id) {
          if (!acc[t.parent_task_id]) {
            acc[t.parent_task_id] = [];
          }
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

  const taskCount = mainTasks.length;
  const hasSubs = (t) => (subtasksByParent[t.id] || []).length > 0;
  const withSubCount = mainTasks.filter(hasSubs).length;
  const withoutSubCount = mainTasks.length - withSubCount;
  const visibleTasks = mainTasks.filter((t) =>
    subFilter === "with" ? hasSubs(t) : subFilter === "without" ? !hasSubs(t) : true,
  );
  const currentIdx = allMonthKeys.indexOf(selectedMonth);
  const doneCount = mainTasks.filter((t) =>
    allSubtasksDone(subtasksByParent[t.id] || []),
  ).length;
  const overdueCount = mainTasks.filter((t) =>
    isOverdue(
      t.due_date,
      allSubtasksDone(subtasksByParent[t.id] || []) ? "Done" : undefined,
    ),
  ).length;

  if (loading) {
    return (
      <div className="ts-page" aria-busy="true">
        <style>{STYLES}</style>
        <div className="ts-board">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="ts-card ts-skel" style={{ animationDelay: `${i * 80}ms`, pointerEvents: "none" }}>
              <div className="bar" style={{ height: 14, width: "70%" }} />
              <div className="bar" style={{ height: 10, width: "40%" }} />
              <div className="bar" style={{ height: 4, width: "100%", marginTop: 12 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const openEdit = (t) => {
    setEditing(t);
    setShowModal(true);
  };
  const openSubTask = (t) => {
    setSubTaskParent(t);
    setShowSubTaskModal(true);
  };

  return (
    <div className="ts-page">
      <style>{STYLES}</style>

      {/* TOOLBAR */}
      <div className="ts-toolbar">
        {/* LIST / BOARD */}
        <div className="ts-seg" role="group" aria-label="View">
          <button onClick={() => setView("list")} aria-pressed={view === "list"}>
            List
          </button>
          <button onClick={() => setView("board")} aria-pressed={view === "board"}>
            Board
          </button>
        </div>

        {/* WITH / WITHOUT SUB TASKS */}
        <div className="ts-seg ts-filter" role="group" aria-label="Filter by sub tasks">
          <button onClick={() => setSubFilter("all")} aria-pressed={subFilter === "all"}>
            All {taskCount}
          </button>
          <button onClick={() => setSubFilter("with")} aria-pressed={subFilter === "with"}>
            With sub tasks {withSubCount}
          </button>
          <button onClick={() => setSubFilter("without")} aria-pressed={subFilter === "without"}>
            No sub tasks {withoutSubCount}
          </button>
        </div>

        <div className="ts-group" style={{ justifyContent: "flex-end" }}>
          {/* SUMMARY */}
          <span className="ts-summary">
            <b>{taskCount}</b> task{taskCount !== 1 ? "s" : ""} · <b>{doneCount}</b> done
            {overdueCount > 0 && (
              <>
                {" · "}
                <span className="is-alert">{overdueCount} overdue</span>
              </>
            )}
          </span>

          {/* MONTH */}
          <div className="ts-month">
            <button
              aria-label="Previous month"
              onClick={() => currentIdx > 0 && setSelectedMonth(allMonthKeys[currentIdx - 1])}
              disabled={currentIdx === 0}
            >
              ‹
            </button>

            <Select
              value={selectedMonth}
              onChange={(val) => setSelectedMonth(val)}
              arrowColor="var(--text-3)"
              labelColor="var(--text)"
              style={{
                padding: "6px 12px",
                borderRadius: 0,
                border: "none",
                background: "transparent",
                fontSize: "12px",
                fontWeight: 500,
                minWidth: "140px",
              }}
            >
              {allMonthKeys.map((key) => (
                <option key={key} value={key}>
                  {formatMonthLabel(key)}
                </option>
              ))}
            </Select>

            <button
              aria-label="Next month"
              onClick={() =>
                currentIdx < allMonthKeys.length - 1 &&
                setSelectedMonth(allMonthKeys[currentIdx + 1])
              }
              disabled={currentIdx === allMonthKeys.length - 1}
            >
              ›
            </button>
          </div>

          {/* ADD TASK */}
          {isManager && (
            <button
              className="btn btn-primary btn-sm"
              style={{ whiteSpace: "nowrap" }}
              onClick={() => {
                setEditing(null);
                setShowModal(true);
              }}
            >
              + Add task
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="ts-alert" role="alert">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg("")} aria-label="Dismiss message">×</button>
        </div>
      )}

      {/* BOARD / LIST */}
      {view === "board" ? (
        <BoardView
          tasks={visibleTasks}
          filtered={subFilter !== "all"}
          subtasksByParent={subtasksByParent}
          projectId={projectId}
          onEdit={openEdit}
          onDelete={handleDelete}
          isManager={isManager}
          onAddSubTask={openSubTask}
        />
      ) : (
        <ListView
          tasks={visibleTasks}
          filtered={subFilter !== "all"}
          subtasksByParent={subtasksByParent}
          projectId={projectId}
          onEdit={openEdit}
          onDelete={handleDelete}
          isManager={isManager}
          onAddSubTask={openSubTask}
        />
      )}

      {/* MAIN TASK MODAL */}
      {showModal && (
        <Modal
          title={editing ? "Edit task" : "New task"}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
        >
          <TaskForm
            initial={editing}
            hasExistingSubtasks={editingHasSubtasks}
            members={members}
            allMembers={members}
            clusters={clusters}
            stages={[]}
            onSave={handleSave}
            saving={savingTask}
            onCancel={() => {
              setShowModal(false);
              setEditing(null);
            }}
          />
        </Modal>
      )}

      {/* SUB TASK MODAL */}
      {showSubTaskModal && subTaskParent && (
        <Modal
          title={`Sub task — ${subTaskParent.title}`}
          onClose={() => {
            setShowSubTaskModal(false);
            setSubTaskParent(null);
          }}
        >
          <TaskForm
            members={members}
            clusters={clusters}
            // Sub tasks KEEP stages.
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

      {/* CANNOT DELETE — task still has sub tasks */}
      {deleteBlocked && (
        <Modal title="Cannot delete task" onClose={() => setDeleteBlocked(null)}>
          <p className="mb-2 text-[13px] leading-relaxed text-[var(--text-2)]">
            <strong className="text-[var(--text)]">{deleteBlocked.title}</strong>{" "}
            still has {deleteBlocked.subtaskCount}{" "}
            {deleteBlocked.subtaskCount === 1 ? "sub task" : "sub tasks"}.
          </p>
          <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
            Delete all of its sub tasks first. Once none are left, you can
            delete the task.
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-primary"
              onClick={() => setDeleteBlocked(null)}
            >
              Got it
            </button>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRM */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete task"
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

function EmptyState({ filtered }) {
  return (
    <div className="ts-empty">
      <h3>{filtered ? "No tasks match this filter" : "No tasks this month"}</h3>
      <p>
        {filtered
          ? "Switch the filter back to All to see every task for this month."
          : "Tasks due or created in this month will show up here. Use the arrows to check another month."}
      </p>
    </div>
  );
}

/*
 * ============================================================
 * BOARD VIEW
 * ============================================================
 */

function BoardView({ filtered, tasks, subtasksByParent, projectId, onEdit, onDelete, isManager, onAddSubTask }) {
  if (tasks.length === 0) return <EmptyState filtered={filtered} />;

  return (
    <section className="ts-board" aria-label="Tasks board">
      {tasks.map((t) => {
        const subtasks = subtasksByParent[t.id] || [];

        return (
          <TaskCard
            key={t.id}
            task={t}
            subtasks={subtasks}
            mainTaskDone={allSubtasksDone(subtasks)}
            projectId={projectId}
            onEdit={onEdit}
            onDelete={onDelete}
            isManager={isManager}
            onAddSubTask={onAddSubTask}
          />
        );
      })}
    </section>
  );
}

/*
 * ============================================================
 * MAIN TASK CARD
 * ============================================================
 *
 * Main Task has no stage field of its own, but shows a "Done"
 * badge once every sub task is Done. When Done, the priority dot
 * and due date are hidden (they no longer matter).
 */

function TaskCard({ task, subtasks, mainTaskDone, projectId, onEdit, onDelete, isManager, onAddSubTask }) {
  const overdue = isOverdue(task.due_date, mainTaskDone ? "Done" : undefined);
  const doneSubs = subtasks.filter((s) => s.stage === "Done").length;
  const ratio = subtasks.length ? doneSubs / subtasks.length : 0;

  return (
    <article className={`ts-card${overdue ? " is-overdue" : ""}${subtasks.length ? " has-subs" : " no-subs"}`}>
      <div className="ts-card-top">
        <Link
          to={`/projects/${projectId}/tasks/${task.id}`}
          className={`ts-title${mainTaskDone ? " is-done" : ""}`}
        >
          {task.title}
        </Link>

        {mainTaskDone ? (
          <span className="badge badge-done">Done</span>
        ) : (
          <span
            className="ts-dot"
            style={{ background: PRIORITY_COLORS[task.priority] }}
            title={`${task.priority} priority`}
            role="img"
            aria-label={`${task.priority} priority`}
          />
        )}
      </div>

      <div className="ts-meta">
        {task.cluster_name && <span className="ts-cluster">{task.cluster_name}</span>}
        {task.due_date && !mainTaskDone && (
          <span className={overdue ? "is-alert" : ""}>
            {overdue ? "Overdue · " : "Due "}
            {formatDate(task.due_date)}
          </span>
        )}
      </div>

      {subtasks.length > 0 && (
        <div className="ts-progress">
          <div className="ts-track" role="progressbar" aria-valuemin={0} aria-valuemax={subtasks.length} aria-valuenow={doneSubs} aria-label="Sub task progress">
            <div className={`ts-fill${mainTaskDone ? " is-complete" : ""}`} style={{ transform: `scaleX(${ratio})` }} />
          </div>
          <span>{doneSubs}/{subtasks.length} sub tasks</span>
        </div>
      )}

      {subtasks.length === 0 && <span className="ts-chip is-none" style={{ alignSelf: "flex-start" }}>No sub tasks</span>}

      {isManager && (
        <div className="ts-actions">
          {!mainTaskDone && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: "11px", padding: "2px 8px" }} onClick={() => onEdit(task)}>
              Edit
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ fontSize: "11px", padding: "2px 8px", color: "var(--accent)" }} onClick={() => onAddSubTask(task)}>
            + Sub task
          </button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: "11px", padding: "2px 8px", color: "var(--danger)", marginLeft: "auto" }} onClick={() => onDelete(task.id)}>
            Delete
          </button>
        </div>
      )}
    </article>
  );
}

/*
 * ============================================================
 * LIST VIEW
 * ============================================================
 *
 * Columns: (expand) | Task | Priority | Stage | Due | Actions
 *
 * Main Task: Stage column shows a derived "Done" badge once all
 *            sub tasks are Done (otherwise empty).
 * Sub Task:  Stage column shows its own stage.
 *
 * Once a task (main or sub) is Done, its Priority and Due date
 * are hidden — only the Done badge is shown.
 */

function ListView({ filtered, tasks, subtasksByParent, projectId, onEdit, onDelete, isManager, onAddSubTask }) {
  const [expanded, setExpanded] = useState(new Set());

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  if (tasks.length === 0) return <EmptyState filtered={filtered} />;

  return (
    <div className="ts-table-wrap">
      <table className="ts-table">
        <thead>
          <tr>
            <th style={{ width: "40px" }} />
            <th>Task</th>
            <th>Priority</th>
            <th>Stage</th>
            <th>Due</th>
            {isManager && <th>Actions</th>}
          </tr>
        </thead>

        <tbody>
          {tasks.map((t) => {
            const subtasks = subtasksByParent[t.id] || [];
            const isExpanded = expanded.has(t.id);
            const mainDone = allSubtasksDone(subtasks);
            const overdue = isOverdue(t.due_date, mainDone ? "Done" : undefined);

            return (
              <Fragment key={t.id}>
                {/* MAIN TASK */}
                <tr className={overdue ? "is-overdue" : ""}>
                  <td>
                    {subtasks.length === 0 && (
                      <span className="ts-leaf" title="No sub tasks" role="img" aria-label="No sub tasks" />
                    )}
                    {subtasks.length > 0 && (
                      <button
                        className="ts-chev"
                        onClick={() => toggleExpand(t.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "Collapse sub tasks" : "Expand sub tasks"}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M2.5 4.5L6 8l3.5-3.5" />
                        </svg>
                      </button>
                    )}
                  </td>

                  <td>
                    <Link
                      to={`/projects/${projectId}/tasks/${t.id}`}
                      className={`ts-name${mainDone ? " is-done" : ""}`}
                    >
                      {t.title}
                    </Link>
                    {subtasks.length > 0 ? (
                      <span className="ts-chip">
                        {subtasks.filter((s) => s.stage === "Done").length}/{subtasks.length} sub tasks
                      </span>
                    ) : (
                      <span className="ts-chip is-none">No sub tasks</span>
                    )}
                  </td>

                  {/* Priority hidden once Done */}
                  <td>
                    {!mainDone && (
                      <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                    )}
                  </td>

                  {/* Derived Done badge (same style as sub tasks) */}
                  <td>{mainDone && <span className="badge badge-done">Done</span>}</td>

                  <td className={overdue ? "is-alert" : ""}>
                    {!mainDone && formatDate(t.due_date)}
                  </td>

                  {isManager && (
                    <td>
                      <div className="ts-row-actions">
                        {!mainDone && (
                          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(t)}>
                            Edit
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--accent)" }} onClick={() => onAddSubTask(t)}>
                          + Sub task
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => onDelete(t.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>

                {/* SUB TASKS */}
                {isExpanded &&
                  subtasks.map((st) => {
                    const stOverdue = isOverdue(st.due_date, st.stage);
                    const stDone = st.stage === "Done";

                    return (
                      <tr key={st.id} className={`is-sub${stOverdue ? " is-overdue" : ""}`}>
                        <td />

                        <td className="ts-sub-cell">
                          <Link
                            to={`/projects/${projectId}/tasks/${st.id}`}
                            className={`ts-name${stDone ? " is-done" : ""}`}
                          >
                            {st.title}
                          </Link>
                        </td>

                        {/* Priority hidden once Done */}
                        <td>
                          {!stDone && (
                            <span className={`badge badge-${st.priority}`}>{st.priority}</span>
                          )}
                        </td>

                        <td>
                          <span className={`badge badge-${st.stage?.toLowerCase().replace(/\s/g, "")}`}>
                            {st.stage}
                          </span>
                        </td>

                        <td className={stOverdue ? "is-alert" : ""}>
                          {!stDone && formatDate(st.due_date)}
                        </td>

                        {isManager && (
                          <td>
                            <div className="ts-row-actions">
                              {!stDone && (
                                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(st)}>
                                  Edit
                                </button>
                              )}
                              <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => onDelete(st.id)}>
                                Delete
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
  );
}