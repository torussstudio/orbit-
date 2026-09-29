// import { useState, useEffect } from "react";
// import api from "../api/client";
// import { useAuth } from "../context/AuthContext";
// import { formatDate } from "../utils/helpers";
// import Modal from "../components/ui/Modal";
// import ConfirmModal from "../components/ui/ConfirmModal";
// import Select from "../components/ui/Select";
// import Loader from "../components/ui/Loader";

// export default function Members() {
//   const { isManager } = useAuth();
//   const [members, setMembers] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [showModal, setShowModal] = useState(false);
//   const [editing, setEditing] = useState(null);
//   const [form, setForm] = useState({
//     name: "",
//     email: "",
//     password: "",
//     role: "member",
//   });
//   const [showPassword, setShowPassword] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState("");
//   const [confirmModal, setConfirmModal] = useState({
//     show: false,
//     title: "",
//     message: "",
//     action: null,
//     loading: false,
//     isDangerous: false,
//   });

//   const load = () =>
//     api
//       .get("/members")
//       .then((r) => setMembers(r.data))
//       .finally(() => setLoading(false));
//   useEffect(() => {
//     load();
//   }, []);

//   const openCreate = () => {
//     setEditing(null);
//     setForm({ name: "", email: "", password: "", role: "member" });
//     setShowPassword(false);
//     setError("");
//     setShowModal(true);
//   };
//   const openEdit = (m) => {
//     setEditing(m);
//     setForm({
//       name: m.name,
//       email: m.email,
//       password: "",
//       role: m.role,
//     });
//     setShowPassword(false);
//     setError("");
//     setShowModal(true);
//   };

//   const handleSave = async () => {
//     setSaving(true);
//     setError("");
//     try {
//       if (editing) await api.put(`/members/${editing.id}`, form);
//       else await api.post("/members", form);
//       setShowModal(false);
//       load();
//     } catch (e) {
//       setError(e.response?.data?.error || "Failed to save");
//     } finally {
//       setSaving(false);
//     }
//   };

//   const handleDeactivate = (id) => {
//     setConfirmModal({
//       show: true,
//       title: "Deactivate Member",
//       message: "Deactivate this member? They will no longer be able to log in.",
//       isDangerous: true,
//       action: async () => {
//         await api.patch(`/members/${id}/deactivate`);
//         load();
//       },
//       loading: false,
//     });
//   };

//   const handleActivate = (id) => {
//     setConfirmModal({
//       show: true,
//       title: "Activate Member",
//       message: "Activate this member? They will be able to log in again.",
//       isDangerous: false,
//       action: async () => {
//         await api.patch(`/members/${id}/activate`);
//         load();
//       },
//       loading: false,
//     });
//   };

//   const handleDelete = (id) => {
//     setConfirmModal({
//       show: true,
//       title: "Delete Member",
//       message:
//         "Are you sure you want to permanently delete this member? All their data will be removed.",
//       isDangerous: true,
//       action: async () => {
//         try {
//           await api.delete(`/members/${id}`);
//           load();
//         } catch (error) {
//           alert(
//             error.response?.data?.error ||
//               "Failed to delete member: " + error.message,
//           );
//         }
//       },
//       loading: false,
//     });
//   };

//   const executeConfirmAction = async () => {
//     if (!confirmModal.action) return;
//     setConfirmModal((prev) => ({ ...prev, loading: true }));
//     try {
//       await confirmModal.action();
//     } finally {
//       setConfirmModal({
//         show: false,
//         title: "",
//         message: "",
//         action: null,
//         loading: false,
//         isDangerous: false,
//       });
//     }
//   };

//   if (loading)
//     return (
//       <Loader label="Loading members" size="lg" variant="page" />
//     );

//   return (
//     <>
//       <div className="page-header">
//         <div>
//           <div className="page-title">Team Members</div>
//           <div className="page-subtitle">
//             {members.filter((m) => m.active).length} active member
//             {members.filter((m) => m.active).length !== 1 ? "s" : ""}
//           </div>
//         </div>
//         {isManager && (
//           <button className="btn btn-primary" onClick={openCreate}>
//             + Add Member
//           </button>
//         )}
//       </div>

//       <div className="page-body">
//         <div className="card" style={{ padding: 0, overflow: "hidden" }}>
//           <div className="table-wrap">
//             <table>
//               <thead>
//                 <tr>
//                   <th>Member</th>
//                   <th>Email</th>
//                   <th>Role</th>
//                   <th>Skills</th>
//                   <th>Joined</th>
//                   <th>Status</th>
//                   {isManager && <th>Actions</th>}
//                 </tr>
//               </thead>
//               <tbody>
//                 {members.length === 0 && (
//                   <tr>
//                     <td
//                       colSpan={7}
//                       style={{
//                         textAlign: "center",
//                         color: "var(--text-3)",
//                         padding: "40px",
//                       }}
//                     >
//                       No members yet
//                     </td>
//                   </tr>
//                 )}
//                 {members.map((m) => (
//                   <tr key={m.id} style={{ opacity: m.active ? 1 : 0.5 }}>
//                     <td>
//                       <div
//                         style={{
//                           display: "flex",
//                           alignItems: "center",
//                           gap: "10px",
//                           whiteSpace: "nowrap",
//                         }}
//                       >
//                         <div
//                           className="user-avatar"
//                           style={{ overflow: "hidden", padding: 0, flexShrink: 0 }}
//                         >
//                           {m.avatar_url ? (
//                             <img
//                               src={m.avatar_url}
//                               alt={m.name}
//                               style={{
//                                 width: "100%",
//                                 height: "100%",
//                                 objectFit: "cover",
//                                 borderRadius: "50%",
//                                 display: "block",
//                               }}
//                             />
//                           ) : (
//                             m.name[0]
//                           )}
//                         </div>
//                         <span style={{ fontWeight: 500 }}>{m.name}</span>
//                       </div>
//                     </td>
//                     <td style={{ color: "var(--text-2)", whiteSpace: "nowrap" }}>
//                       {m.email}
//                     </td>
//                     <td>
//                       <span
//                         className={`badge ${m.role === "manager" ? "badge-deployed" : "badge-inprogress"}`}
//                       >
//                         {m.role}
//                       </span>
//                     </td>
//                     <td style={{ color: "var(--text-3)", fontSize: "12px" }}>
//                       {m.skills?.length
//                         ? m.skills.map((s) => (
//                             <span
//                               key={s}
//                               style={{
//                                 display: "inline-block",
//                                 background: "var(--bg-4)",
//                                 borderRadius: "4px",
//                                 padding: "1px 6px",
//                                 marginRight: "4px",
//                                 marginBottom: "2px",
//                                 fontSize: "11px",
//                                 whiteSpace: "nowrap",
//                               }}
//                             >
//                               {s}
//                             </span>
//                           ))
//                         : "—"}
//                     </td>
//                     <td style={{ color: "var(--text-3)", fontSize: "12px", whiteSpace: "nowrap" }}>
//                       {formatDate(m.created_at)}
//                     </td>
//                     <td>
//                       <span
//                         style={{
//                           fontSize: "11px",
//                           color: m.active ? "var(--success)" : "var(--text-3)",
//                           whiteSpace: "nowrap",
//                         }}
//                       >
//                         {m.active ? "● Active" : "○ Inactive"}
//                       </span>
//                     </td>
//                     {isManager && (
//                       <td>
//                         <div
//                           style={{
//                             display: "flex",
//                             gap: "4px",
//                             flexWrap: "wrap",
//                           }}
//                         >
//                           <button
//                             className="btn btn-ghost btn-sm"
//                             onClick={() => openEdit(m)}
//                           >
//                             Edit
//                           </button>
//                           {m.active ? (
//                             <button
//                               className="btn btn-ghost btn-sm"
//                               style={{ color: "var(--danger)" }}
//                               onClick={() => handleDeactivate(m.id)}
//                             >
//                               Deactivate
//                             </button>
//                           ) : (
//                             <button
//                               className="btn btn-ghost btn-sm"
//                               style={{ color: "var(--success)" }}
//                               onClick={() => handleActivate(m.id)}
//                             >
//                               Activate
//                             </button>
//                           )}
//                           <button
//                             className="btn btn-ghost btn-sm"
//                             style={{ color: "var(--danger)" }}
//                             onClick={() => handleDelete(m.id)}
//                           >
//                             Delete
//                           </button>
//                         </div>
//                       </td>
//                     )}
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       </div>

//       {showModal && (
//         <Modal
//           title={editing ? "Edit Member" : "Add Member"}
//           onClose={() => setShowModal(false)}
//         >
//           <div className="form-row">
//             <div className="form-group">
//               <label className="form-label">Full Name</label>
//               <input
//                 className="form-input"
//                 value={form.name}
//                 onChange={(e) =>
//                   setForm((f) => ({ ...f, name: e.target.value }))
//                 }
//                 placeholder="Jane Smith"
//               />
//             </div>
//             <div className="form-group">
//               <label className="form-label">Role</label>
//               <Select
//                 value={form.role}
//                 onChange={(val) =>
//                   setForm((f) => ({ ...f, role: val }))
//                 }
//               >
//                 <option value="member">Member</option>
//                 <option value="manager">Manager</option>
//               </Select>
//             </div>
//           </div>
//           <div className="form-group">
//             <label className="form-label">Email</label>
//             <input
//               className="form-input"
//               type="email"
//               value={form.email}
//               onChange={(e) =>
//                 setForm((f) => ({ ...f, email: e.target.value }))
//               }
//               placeholder="jane@agency.com"
//             />
//           </div>
//           <div className="form-group">
//             <label className="form-label">
//               {editing
//                 ? "New Password (leave blank to keep current)"
//                 : "Password"}
//             </label>
//             <div style={{ position: "relative" }}>
//               <input
//                 className="form-input"
//                 type={showPassword ? "text" : "password"}
//                 value={form.password}
//                 onChange={(e) =>
//                   setForm((f) => ({ ...f, password: e.target.value }))
//                 }
//                 placeholder="••••••••"
//                 style={{ paddingRight: "36px" }}
//               />
//               <button
//                 type="button"
//                 onClick={() => setShowPassword((v) => !v)}
//                 tabIndex={-1}
//                 style={{
//                   position: "absolute",
//                   right: "8px",
//                   top: "50%",
//                   transform: "translateY(-50%)",
//                   background: "none",
//                   border: "none",
//                   cursor: "pointer",
//                   color: "var(--text-3)",
//                   padding: "4px",
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "center",
//                 }}
//                 aria-label={showPassword ? "Hide password" : "Show password"}
//                 title={showPassword ? "Hide password" : "Show password"}
//               >
//                 {showPassword ? (
//                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//                     <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
//                     <line x1="1" y1="1" x2="23" y2="23" />
//                   </svg>
//                 ) : (
//                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//                     <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
//                     <circle cx="12" cy="12" r="3" />
//                   </svg>
//                 )}
//               </button>
//             </div>
//           </div>
//           {error && (
//             <div
//               style={{
//                 color: "var(--danger)",
//                 fontSize: "13px",
//                 marginBottom: "12px",
//                 padding: "8px 12px",
//                 background: "rgba(248,113,113,0.1)",
//                 borderRadius: "6px",
//               }}
//             >
//               {error}
//             </div>
//           )}
//           <div className="modal-actions">
//             <button
//               className="btn btn-ghost"
//               onClick={() => setShowModal(false)}
//             >
//               Cancel
//             </button>
//             <button
//               className="btn btn-primary"
//               onClick={handleSave}
//               disabled={saving}
//             >
//               {saving ? <Loader label="Saving..." size="sm" variant="button" /> : "Save Member"}
//             </button>
//           </div>
//         </Modal>
//       )}

//       <ConfirmModal
//         isOpen={confirmModal.show}
//         title={confirmModal.title}
//         message={confirmModal.message}
//         confirmText={confirmModal.isDangerous ? "Confirm" : "Confirm"}
//         isDangerous={confirmModal.isDangerous}
//         onConfirm={executeConfirmAction}
//         onCancel={() =>
//           setConfirmModal({
//             show: false,
//             title: "",
//             message: "",
//             action: null,
//             loading: false,
//             isDangerous: false,
//           })
//         }
//         loading={confirmModal.loading}
//       />
//     </>
//   );
// }



import { useState, useEffect, useRef } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/helpers";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import Select from "../components/ui/Select";

const EMPTY_FORM = { name: "", email: "", password: "", role: "member" };

const CLOSED_CONFIRM = {
  show: false,
  title: "",
  message: "",
  confirmText: "Confirm",
  action: null,
  loading: false,
  isDangerous: false,
};

const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();

const STYLES = `
.mb-notice {
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
}
.mb-notice-close {
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
.mb-notice-close:hover { opacity: 1; }

.mb-card { padding: 0; overflow: hidden; }
.mb-table { min-width: 760px; }
.mb-table tbody tr { transition: background 0.15s ease; }
.mb-table tbody tr:hover { background: var(--bg-3); }
.mb-table .mb-actions-col { text-align: right; }

.mb-person { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
.mb-avatar { flex-shrink: 0; overflow: hidden; padding: 0; }
.mb-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.mb-name { font-weight: 500; }
.mb-email { color: var(--text-2); white-space: nowrap; }
.mb-date { color: var(--text-3); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mb-muted { color: var(--text-3); }

.mb-row.is-inactive td:not(.mb-actions) { opacity: 0.55; }

.mb-role {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  border-radius: 6px;
  color: var(--text-2);
  background: var(--bg-3);
}
.mb-role.is-manager {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.mb-skills { display: flex; flex-wrap: wrap; gap: 4px; }
.mb-skill {
  padding: 1px 6px;
  font-size: 11px;
  white-space: nowrap;
  color: var(--text-2);
  background: var(--bg-4, var(--bg-3));
  border-radius: 4px;
}

.mb-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; color: var(--text-3); }
.mb-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); }
.mb-status.is-active { color: var(--success); }
.mb-status.is-active .mb-status-dot { background: var(--success); }

.mb-actions { }
.mb-actions-inner { display: flex; gap: 2px; justify-content: flex-end; flex-wrap: wrap; }
.mb-danger { color: var(--danger); }

.mb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 56px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}
.mb-empty strong { font-size: 15px; font-weight: 600; color: var(--text-2); }
.mb-empty .btn { margin-top: 8px; }

.mb-skel-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.mb-skel-row + .mb-skel-row { border-top: 1px solid var(--border); }
.mb-skel-bar { height: 12px; border-radius: 6px; background: var(--bg-3); animation: mb-pulse 1.4s ease-in-out infinite; }
.mb-skel-avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; }
@keyframes mb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

/* form */
.mb-pass { position: relative; }
.mb-pass .form-input { padding-right: 40px; }
.mb-eye {
  position: absolute;
  top: 50%;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  color: var(--text-3);
  background: none;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  transform: translateY(-50%);
  transition: color 0.15s ease;
}
.mb-eye:hover { color: var(--text); }
.mb-field-error { margin-top: 6px; font-size: 12px; color: var(--danger); }
.mb-form-error {
  margin-bottom: 12px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border-radius: 6px;
}

.mb-eye:focus-visible,
.mb-notice-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .mb-skel-bar { animation: none; }
  .mb-table tbody tr, .mb-eye { transition: none; }
}
`;

export default function Members() {
  const { isManager } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmModal, setConfirmModal] = useState(CLOSED_CONFIRM);
  const hasLoaded = useRef(false);

  const load = () =>
    api
      .get("/members")
      .then((r) => {
        hasLoaded.current = true;
        setLoadError(false);
        setMembers(r.data);
      })
      .catch(() => {
        if (!hasLoaded.current) setLoadError(true);
        else setNotice("We couldn't refresh the member list. Reload the page to see the latest.");
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  // Auto-dismiss the inline notice.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const retry = () => {
    setLoadError(false);
    setLoading(true);
    load();
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setShowPassword(false);
    setError("");
    setShowModal(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setForm({
      name: m.name,
      email: m.email,
      password: "",
      role: m.role,
    });
    setFieldErrors({});
    setShowPassword(false);
    setError("");
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const setField = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Enter a name.";
    if (!form.email.trim()) errs.email = "Enter an email address.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim()))
      errs.email = "Enter a valid email address.";
    if (!editing && !form.password) errs.password = "Enter a password.";
    return errs;
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (saving) return;
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const payload = { ...form, name: form.name.trim(), email: form.email.trim() };
    setSaving(true);
    setError("");
    try {
      if (editing) await api.put(`/members/${editing.id}`, payload);
      else await api.post("/members", payload);
      setShowModal(false);
      await load();
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "We couldn't save this member. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = (id) => {
    setConfirmModal({
      show: true,
      title: "Deactivate member",
      message: "Deactivate this member? They will no longer be able to log in.",
      confirmText: "Deactivate",
      isDangerous: true,
      action: async () => {
        await api.patch(`/members/${id}/deactivate`);
        await load();
      },
      loading: false,
    });
  };

  const handleActivate = (id) => {
    setConfirmModal({
      show: true,
      title: "Activate member",
      message: "Activate this member? They will be able to log in again.",
      confirmText: "Activate",
      isDangerous: false,
      action: async () => {
        await api.patch(`/members/${id}/activate`);
        await load();
      },
      loading: false,
    });
  };

  const handleDelete = (id) => {
    setConfirmModal({
      show: true,
      title: "Delete member",
      message:
        "Are you sure you want to permanently delete this member? All their data will be removed.",
      confirmText: "Delete",
      isDangerous: true,
      action: async () => {
        await api.delete(`/members/${id}`);
        await load();
      },
      loading: false,
    });
  };

  const executeConfirmAction = async () => {
    if (!confirmModal.action) return;
    setConfirmModal((prev) => ({ ...prev, loading: true }));
    try {
      await confirmModal.action();
    } catch (err) {
      setNotice(
        err?.response?.data?.error ||
          "We couldn't complete that action. Please try again.",
      );
    } finally {
      setConfirmModal(CLOSED_CONFIRM);
    }
  };

  const activeCount = members.filter((m) => m.active).length;

  return (
    <>
      <style>{STYLES}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Team members</h1>
          {!loading && !loadError && (
            <div className="page-subtitle">
              {activeCount} active member{activeCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        {isManager && !loading && !loadError && (
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Add member
          </button>
        )}
      </div>

      <div className="page-body" aria-busy={loading}>
        {notice && (
          <div className="mb-notice" role="alert">
            <span>{notice}</span>
            <button
              type="button"
              className="mb-notice-close"
              aria-label="Dismiss"
              onClick={() => setNotice("")}
            >
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="card mb-card" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="mb-skel-row">
                <div className="mb-skel-bar mb-skel-avatar" />
                <div className="mb-skel-bar" style={{ width: "22%" }} />
                <div className="mb-skel-bar" style={{ width: "30%" }} />
                <div className="mb-skel-bar" style={{ width: "10%" }} />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="card mb-card">
            <div className="mb-empty" role="alert">
              <strong>We couldn't load members</strong>
              <span>Check your connection and try again.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
                Try again
              </button>
            </div>
          </div>
        ) : members.length === 0 ? (
          <div className="card mb-card">
            <div className="mb-empty">
              <strong>No members yet</strong>
              {isManager ? (
                <>
                  <span>Add your first team member to start assigning tasks.</span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                    + Add member
                  </button>
                </>
              ) : (
                <span>Members will appear here once they are added.</span>
              )}
            </div>
          </div>
        ) : (
          <div className="card mb-card">
            <div className="table-wrap">
              <table className="mb-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Skills</th>
                    <th>Joined</th>
                    <th>Status</th>
                    {isManager && <th className="mb-actions-col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className={`mb-row${m.active ? "" : " is-inactive"}`}>
                      <td>
                        <div className="mb-person">
                          <div className="user-avatar mb-avatar" aria-hidden="true">
                            {m.avatar_url ? <img src={m.avatar_url} alt="" /> : initial(m.name)}
                          </div>
                          <span className="mb-name">{m.name}</span>
                        </div>
                      </td>
                      <td className="mb-email">{m.email}</td>
                      <td>
                        <span className={`mb-role${m.role === "manager" ? " is-manager" : ""}`}>
                          {m.role}
                        </span>
                      </td>
                      <td>
                        {m.skills?.length ? (
                          <div className="mb-skills">
                            {m.skills.map((s) => (
                              <span key={s} className="mb-skill">{s}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="mb-muted">—</span>
                        )}
                      </td>
                      <td className="mb-date">{formatDate(m.created_at)}</td>
                      <td>
                        <span className={`mb-status${m.active ? " is-active" : ""}`}>
                          <span className="mb-status-dot" aria-hidden="true" />
                          {m.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {isManager && (
                        <td className="mb-actions">
                          <div className="mb-actions-inner">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openEdit(m)}
                              aria-label={`Edit ${m.name}`}
                            >
                              Edit
                            </button>
                            {m.active ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleDeactivate(m.id)}
                                aria-label={`Deactivate ${m.name}`}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleActivate(m.id)}
                                aria-label={`Activate ${m.name}`}
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm mb-danger"
                              onClick={() => handleDelete(m.id)}
                              aria-label={`Delete ${m.name}`}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? "Edit member" : "Add member"} onClose={closeModal}>
          <form onSubmit={handleSave} noValidate>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="mb-name">Full name</label>
                <input
                  id="mb-name"
                  className="form-input"
                  value={form.name}
                  onChange={setField("name")}
                  placeholder="e.g. Anjali Menon"
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? "mb-name-error" : undefined}
                  autoFocus
                />
                {fieldErrors.name && (
                  <div id="mb-name-error" className="mb-field-error" role="alert">
                    {fieldErrors.name}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <Select
                  value={form.role}
                  onChange={(val) => setForm((f) => ({ ...f, role: val }))}
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                </Select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="mb-email">Email</label>
              <input
                id="mb-email"
                className="form-input"
                type="email"
                value={form.email}
                onChange={setField("email")}
                placeholder="name@company.com"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "mb-email-error" : undefined}
              />
              {fieldErrors.email && (
                <div id="mb-email-error" className="mb-field-error" role="alert">
                  {fieldErrors.email}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="mb-password">
                {editing ? "New password (leave blank to keep current)" : "Password"}
              </label>
              <div className="mb-pass">
                <input
                  id="mb-password"
                  className="form-input"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={setField("password")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? "mb-password-error" : undefined}
                />
                <button
                  type="button"
                  className="mb-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <div id="mb-password-error" className="mb-field-error" role="alert">
                  {fieldErrors.password}
                </div>
              )}
            </div>

            {error && (
              <div className="mb-form-error" role="alert">
                {error}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save member"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmModal
        isOpen={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        isDangerous={confirmModal.isDangerous}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmModal(CLOSED_CONFIRM)}
        loading={confirmModal.loading}
      />
    </>
  );
}