import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate, isOverdue } from "../utils/helpers";
import DatePicker from "../components/ui/DatePicker";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import TaskForm from "../components/tasks/TaskForm";
import Loader from "../components/ui/Loader";

const PRIORITY_COLORS = {
  low: "var(--accent)",
  medium: "var(--warning)",
  high: "var(--danger)",
  critical: "var(--critical)",
};

const STAGE_DOT_COLORS = {
  Todo: "#a78bfa",
  "In Progress": "#f59e0b",
  "In Review": "#3b82f6",
  Done: "#10b981",
};

const stageColor = (s) => STAGE_DOT_COLORS[s] || "var(--accent)";
const initials = (name) => (name || "?").trim().charAt(0).toUpperCase();

const CLOSED_CONFIRM = {
  show: false,
  title: "",
  message: "",
  action: null,
  loading: false,
  isDangerous: false,
};

const STYLES = `
.td-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.td-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
@media (max-width: 900px) { .td-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .page-header { padding-left: 16px !important; padding-right: 16px !important; }
  .page-body { padding-left: 16px !important; padding-right: 16px !important; }
}

.td-head-main { min-width: 0; }
.td-breadcrumb { flex-wrap: wrap; }
.td-title { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.3; overflow-wrap: anywhere; text-wrap: balance; }
.td-header-badges { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

/* inline error banner */
.td-notice {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  margin-bottom: 16px; padding: 10px 14px; font-size: 13px; line-height: 1.45; border-radius: 8px;
  color: var(--danger); background: color-mix(in srgb, var(--danger) 9%, var(--bg-2));
  animation: td-rise .22s ease-out both;
}
.td-notice-close { padding: 0 2px; font: inherit; line-height: 1; color: inherit; background: none; border: 0; cursor: pointer; opacity: .7; transition: opacity .15s ease; }
.td-notice-close:hover { opacity: 1; }

.td-panel { padding: 18px 20px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px; animation: td-rise .35s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--n, 0) * 45ms); }
.td-col > :nth-child(2) { --n: 1; }
.td-col > :nth-child(3) { --n: 2; }
.td-col > :nth-child(4) { --n: 3; }
.td-col > :nth-child(5) { --n: 4; }
/* keep an open stage menu above the panels below it */
.td-panel:has(.td-menu) { position: relative; z-index: 5; }
.td-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.td-panel-head + .td-hint { margin-top: -4px; }
.td-h { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text); }
.td-count { padding: 1px 7px; font-size: 11px; font-weight: 600; border-radius: 6px; color: var(--text-3); background: var(--bg-4); font-variant-numeric: tabular-nums; }
.td-hint { margin: 0 0 16px; font-size: 12px; line-height: 1.5; color: var(--text-3); max-width: 60ch; }
.td-desc { margin: 0; max-width: 68ch; font-size: 14px; line-height: 1.7; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; }
.td-muted { color: var(--text-3); }
.td-note { margin: 0; font-size: 13px; color: var(--text-3); }
.td-composer + .td-note { margin-top: 12px; }
.td-danger { color: var(--danger); }
.btn.is-danger { background: var(--danger); border-color: var(--danger); }

.td-panel button:focus-visible, .td-panel a:focus-visible, .td-menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* status stepper */
.td-steps { display: flex; margin: 0; padding: 0; list-style: none; }
.td-step { position: relative; flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--text-3); }
.td-step::before { content: ''; position: absolute; top: 6px; left: 14px; right: -2px; height: 2px; background: var(--bg-4); }
.td-step:last-child::before { display: none; }
.td-step.is-past::before { background: var(--c); }
.td-step-dot { position: relative; z-index: 1; width: 14px; height: 14px; border-radius: 50%; background: var(--bg-2); border: 2px solid var(--bg-4); }
.td-step.is-past .td-step-dot, .td-step.is-current .td-step-dot { background: var(--c); border-color: var(--c); }
.td-step.is-current .td-step-dot { box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 22%, transparent); }
.td-step.is-current { color: var(--text); font-weight: 600; }

.td-progress { display: flex; align-items: center; gap: 10px; margin-top: 18px; font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.td-track { flex: 1; height: 5px; border-radius: 999px; background: var(--bg-4); overflow: hidden; }
.td-fill { height: 100%; width: 100%; border-radius: 999px; background: var(--accent); transform-origin: left center; transition: transform .5s cubic-bezier(.22,1,.36,1); }
.td-fill.is-complete { background: var(--success, #10b981); }

/* sub tasks */
.td-sublist { display: flex; flex-direction: column; gap: 8px; }
.td-sub {
  position: relative; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  padding: 12px 14px 12px 18px; background: var(--bg-3); border-radius: 10px; transition: background-color .15s ease;
}
.td-sub::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 3px; background: var(--p); }
.td-sub:hover { background: color-mix(in srgb, var(--bg-3) 70%, var(--bg-4)); }
.td-sub-main { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.td-sub-title { font-size: 13px; font-weight: 600; color: var(--text); text-decoration: none; overflow-wrap: anywhere; }
.td-sub-title:hover { text-decoration: underline; text-underline-offset: 3px; }
.td-sub-actions { display: flex; gap: 4px; flex-shrink: 0; }
.td-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 12px; color: var(--text-3); }
.td-who { display: inline-flex; align-items: center; gap: 6px; }
.td-avatar {
  flex-shrink: 0; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600; border-radius: 6px; color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.td-avatar.lg { width: 30px; height: 30px; font-size: 12px; border-radius: 9px; }
.td-chip { padding: 1px 7px; font-size: 11px; font-weight: 500; border-radius: 6px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); font-variant-numeric: tabular-nums; }
.td-chip.is-danger { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }

.td-stage-wrap { position: relative; display: inline-block; }
.td-stage-btn { font: inherit; border: none; cursor: pointer; transition: opacity .15s ease, transform .12s ease; }
.td-stage-btn:active:not(:disabled):not(.is-static) { transform: scale(.96); }
.td-stage-btn:disabled { opacity: .7; }
.td-stage-btn.is-static { cursor: default; }
.td-menu {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 40; min-width: 160px; padding: 4px;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 32px -12px rgba(15,23,42,.35);
  transform-origin: top left; animation: td-pop .16s ease-out both;
}
.td-menu button {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: none; border-radius: 6px;
  background: transparent; color: var(--text); font-size: 12px; text-align: left; cursor: pointer; transition: background-color .15s ease;
}
.td-menu button:hover:not([aria-current="true"]) { background: var(--bg-3); }
.td-menu button[aria-current="true"] { font-weight: 700; color: var(--accent); background: var(--bg-3); cursor: default; }
.td-dot { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: var(--c); }

.td-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 28px 16px; text-align: center; border: 1px dashed var(--border); border-radius: 12px; font-size: 13px; color: var(--text-3); }
.td-empty strong { font-size: 14px; color: var(--text); font-weight: 600; }
.td-empty .btn { margin-top: 10px; }
.td-empty-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
.td-empty-actions .btn { margin-top: 0; }

/* move stage */
.td-stagebar { display: flex; flex-wrap: wrap; gap: 8px; }
.td-stagebar + .td-hint { margin: 10px 0 0; }
.td-stagebar button {
  display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; font-size: 12px; font-weight: 500; cursor: pointer;
  color: var(--text-2); background: var(--bg-2); border: 1px solid var(--border); border-radius: 9px;
  transition: background-color .2s ease, border-color .2s ease, transform .1s ease;
}
.td-stagebar button:hover:not(:disabled) { background: var(--bg-3); }
.td-stagebar button:active:not(:disabled) { transform: scale(.97); }
.td-stagebar button:disabled { opacity: .5; cursor: not-allowed; }
.td-stagebar button[aria-pressed="true"] { color: var(--text); border-color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }

/* comments */
.td-composer { margin-bottom: 8px; }
.td-composer-row { display: flex; justify-content: flex-end; margin-top: 8px; }
.td-comment { display: flex; gap: 12px; padding: 14px 0; border-top: 1px solid var(--border); }
.td-comment-body { min-width: 0; flex: 1; }
.td-comment-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.td-comment-head b { font-size: 13px; font-weight: 600; color: var(--text); }
.td-comment-head time { font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.td-comment-text { font-size: 13px; line-height: 1.6; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }

/* sidebar */
.td-dl { margin: 0; }
.td-dl > div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.td-dl > div:last-child { border-bottom: none; padding-bottom: 0; }
.td-dl dt { color: var(--text-3); flex-shrink: 0; }
.td-dl dd { margin: 0; text-align: right; color: var(--text); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.td-dl dd.is-cap { text-transform: capitalize; }
.td-dl dd.is-overdue { color: var(--danger); font-weight: 600; }
.td-tl { margin: 0; padding: 0; list-style: none; }
.td-tl li { position: relative; padding: 0 0 14px 18px; font-size: 12px; overflow-wrap: anywhere; }
.td-tl li:last-child { padding-bottom: 0; }
.td-tl li::before { content: ''; position: absolute; left: 0; top: 5px; width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); }
.td-tl li::after { content: ''; position: absolute; left: 3px; top: 15px; bottom: -3px; width: 1px; background: var(--border); }
.td-tl li:last-child::after { display: none; }
.td-tl .who { color: var(--accent); font-weight: 500; }
.td-tl .what { color: var(--text-2); }
.td-tl time { display: block; margin-top: 2px; font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums; }

/* modals */
.td-modal-text { margin: 0 0 16px; font-size: 13px; line-height: 1.55; color: var(--text-2); }
.td-modal-text strong { color: var(--text); }
.td-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
@media (max-width: 480px) { .td-choices { grid-template-columns: 1fr; } }
.td-choice {
  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px 12px; cursor: pointer;
  color: var(--text); background: var(--bg-2); border: 1.5px solid var(--border); border-radius: 12px;
  transition: border-color .2s ease, background-color .2s ease, transform .1s ease;
}
.td-choice:hover { border-color: var(--text-3); }
.td-choice:active { transform: scale(.98); }
.td-choice:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.td-choice b { margin-top: 6px; font-size: 13px; font-weight: 600; }
.td-choice span { font-size: 11px; color: var(--text-3); }
.td-choice.is-done[aria-pressed="true"] { border-color: var(--success, #10b981); background: color-mix(in srgb, var(--success, #10b981) 10%, transparent); color: var(--success, #10b981); }
.td-choice.is-rework[aria-pressed="true"] { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); }
.td-rework-box { margin-bottom: 16px; padding: 14px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 10px; }
.td-rework-box .td-hint { margin: 6px 0 0; }
.td-field-error { margin-top: 6px; font-size: 12px; color: var(--danger); }
.td-modal-error { margin: -8px 0 14px; font-size: 12px; color: var(--danger); }

/* loading skeleton */
.td-skel { animation: td-pulse 1.4s ease-in-out infinite; }
.td-skel-head { width: min(420px, 80%); }
.td-skel .bar { border-radius: 6px; background: var(--bg-4); }
.td-bar-sm { height: 10px; width: 40%; margin-bottom: 12px; }
.td-bar-lg { height: 20px; width: 100%; }
.td-skel-p1 { height: 120px; }
.td-skel-p2 { height: 160px; animation-delay: 90ms; }
.td-skel-p3 { height: 220px; animation-delay: 180ms; }
.td-skel-side { height: 220px; }

@keyframes td-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
@keyframes td-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes td-pop { from { opacity: 0; transform: scale(.96) translateY(-4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .td-fill, .td-sub, .td-choice, .td-stagebar button, .td-stage-btn { transition: none; }
  .td-skel, .td-panel, .td-notice, .td-menu { animation: none; }
}
`;

export default function TaskDetail() {
  const { id: projectId, taskId } = useParams();
  const { user, isManager } = useAuth();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // null | "notfound" | "failed"
  const [notice, setNotice] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [changingStage, setChangingStage] = useState(null);
  const [members, setMembers] = useState([]);
  const [project, setProject] = useState(null);
  const hasLoaded = useRef(false);

  const [showSubTaskModal, setShowSubTaskModal] = useState(false);
  const [editingSubTask, setEditingSubTask] = useState(null);
  const [savingSubTask, setSavingSubTask] = useState(false);
  const [confirmModal, setConfirmModal] = useState(CLOSED_CONFIRM);

  const [timeTakenModal, setTimeTakenModal] = useState({
    show: false,
    subtask: null,
    nextStage: null,
  });
  const [timeTakenInput, setTimeTakenInput] = useState("");
  const [timeTakenError, setTimeTakenError] = useState("");
  const [timeTakenSaving, setTimeTakenSaving] = useState(false);

  const [managerReviewModal, setManagerReviewModal] = useState({
    show: false,
    subtask: null,
  });
  const [reworkDeadline, setReworkDeadline] = useState("");
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const [stageLoading, setStageLoading] = useState(null);
  const [stageDropdown, setStageDropdown] = useState(null);

  // The task is the only request that MUST succeed. Project and members are
  // best-effort: a member who was assigned a task but is not on the project
  // gets 403 from /projects/:id, and that must not block the task page.
  const load = () =>
    Promise.all([
      api.get(`/tasks/${taskId}`),
           isManager
        ? api.get(`/projects/${projectId}`).catch(() => ({ data: null }))
        : Promise.resolve({ data: null }),
      api.get("/members").catch(() => ({ data: [] })),
    ])
      .then(([t, p, m]) => {
        hasLoaded.current = true;
        setLoadError(null);
        setTask(t.data);
        setProject(p.data);
        setMembers(m.data);
      })
      .catch((err) => {
        const status = err?.response?.status;
        const missing = status === 404 || status === 403;
        if (!hasLoaded.current || missing) {
          setTask(null);
          setLoadError(missing ? "notfound" : "failed");
        } else {
          // A refresh failed after a successful first load — keep the page.
          setNotice("We couldn't refresh this task. Reload the page to see the latest.");
        }
      })
      .finally(() => setLoading(false));

  const loadTaskOnly = () =>
    api
      .get(`/tasks/${taskId}`)
      .then((r) => setTask(r.data))
      .catch(() =>
        setNotice("We couldn't refresh this task. Reload the page to see the latest."),
      );

  // After changing a sub task (or the task itself), refresh only what changed.
  const refreshFor = (subtask) =>
    String(subtask.id) === String(taskId) ? load() : loadTaskOnly();

  useEffect(() => {
    hasLoaded.current = false;
    setLoading(true);
    load();
  }, [taskId]);

  // Auto-dismiss the inline notice.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Close the sub task stage menu on outside click or Escape.
  useEffect(() => {
    if (stageDropdown === null) return;
    const onDown = (e) => {
      if (!e.target.closest?.(".td-stage-wrap")) setStageDropdown(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setStageDropdown(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [stageDropdown]);

  const handleStageChange = async (stage) => {
    if (stage === task.stage) return;
    // Members can't move a task out of Done — only a manager can reopen it.
    if (!isManager && task.stage === "Done") return;
    // Only ever called for subtasks now — main task stage is read-only
    // and derived automatically from its subtasks.
    // For subtasks: members moving from In Progress → In Review must enter time taken
    if (
      (task.parent_task_id || !task.subtasks?.length) &&
      !isManager &&
      stage === "In Review" &&
      task.stage !== "In Review"
    ) {
      setTimeTakenInput("");
      setTimeTakenError("");
      setTimeTakenModal({ show: true, subtask: task, nextStage: stage });
      return;
    }
    // For subtasks: manager moving from In Review → Done triggers review modal
    if (
      (task.parent_task_id || !task.subtasks?.length) &&
      isManager &&
      stage === "Done" &&
      task.stage !== "Done"
    ) {
      setManagerReviewModal({ show: true, subtask: task });
      setReviewAction(null);
      setReworkDeadline("");
      setReviewError("");
      return;
    }
    setChangingStage(stage);
    try {
      await api.put(`/tasks/${taskId}`, { ...task, stage });
      await load();
    } catch {
      setNotice(`We couldn't move this task to ${stage}. Please try again.`);
    } finally {
      setChangingStage(null);
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/tasks/${taskId}/comments`, { content: comment });
      setComment("");
      await load();
    } catch {
      setNotice("We couldn't post your comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSubTask = async (data) => {
    // If manager is moving from In Review to Done via edit popup, show review modal instead
    if (
      isManager &&
      editingSubTask?.stage === "In Review" &&
      data.stage === "Done"
    ) {
      setShowSubTaskModal(false);
      setManagerReviewModal({ show: true, subtask: editingSubTask });
      setReviewAction(null);
      setReworkDeadline("");
      setReviewError("");
      setEditingSubTask(null);
      return;
    }
    setSavingSubTask(true);
    try {
      if (editingSubTask) await api.put(`/tasks/${editingSubTask.id}`, data);
      else
        await api.post("/tasks", {
          ...data,
          project_id: projectId,
          parent_task_id: taskId,
          cluster_id: task.cluster_id,
        });
      setShowSubTaskModal(false);
      setEditingSubTask(null);
      load();
    } catch {
      // Modal stays open so nothing typed is lost.
      setNotice("We couldn't save the sub task. Please try again.");
    } finally {
      setSavingSubTask(false);
    }
  };

  const handleDeleteSubTask = (id) => {
    setConfirmModal({
      show: true,
      title: "Delete sub task",
      message: "Are you sure you want to delete this sub task?",
      isDangerous: true,
      action: async () => {
        await api.delete(`/tasks/${id}`);
        load();
      },
      loading: false,
    });
  };

  const handleSubTaskStageSelect = async (st, chosenStage) => {
    setStageDropdown(null);
    if (!chosenStage || chosenStage === st.stage) return;
    // Members can't reopen a Done sub task.
    if (!isManager && st.stage === "Done") return;
    if (!isManager) {
            if (chosenStage === "Done") return;
      if (chosenStage === "In Review") {
        setTimeTakenInput("");
        setTimeTakenError("");
        setTimeTakenModal({ show: true, subtask: st, nextStage: chosenStage });
        return;
      }
      setStageLoading(st.id);
      try {
        await api.put(`/tasks/${st.id}`, {
          ...st,
          stage: chosenStage,
          time_taken: null,
        });
        await loadTaskOnly();
      } catch {
        setNotice(`We couldn't move "${st.title}" to ${chosenStage}. Please try again.`);
      } finally {
        setStageLoading(null);
      }
      return;
    }
    if (chosenStage === "Done") {
      setManagerReviewModal({ show: true, subtask: st });
      setReviewAction(null);
      setReworkDeadline("");
      setReviewError("");
      return;
    }
    setStageLoading(st.id);
    try {
      await api.put(`/tasks/${st.id}`, { ...st, stage: chosenStage });
      await refreshFor(st);
    } catch {
      setNotice(`We couldn't move "${st.title}" to ${chosenStage}. Please try again.`);
    } finally {
      setStageLoading(null);
    }
  };

  const closeReview = () => {
    setManagerReviewModal({ show: false, subtask: null });
    setReviewAction(null);
    setReworkDeadline("");
    setReviewError("");
  };

  const closeTimeTaken = () => {
    setTimeTakenModal({ show: false, subtask: null, nextStage: null });
    setTimeTakenInput("");
    setTimeTakenError("");
  };

  const handleManagerReviewSubmit = async () => {
    const { subtask } = managerReviewModal;
    if (!reviewAction || reviewSaving) return;
    setReviewSaving(true);
    setReviewError("");
    try {
      await api.put(`/tasks/${subtask.id}`, {
        ...subtask,
        stage: reviewAction === "done" ? "Done" : "Rework",
        time_taken: null,
        new_due_date:
          reviewAction === "rework" && reworkDeadline ? reworkDeadline : null,
      });
      closeReview();
      await refreshFor(subtask);
    } catch (error) {
      setReviewError(
        error?.response?.data?.message ||
          "We couldn't save this decision. Please try again.",
      );
    } finally {
      setReviewSaving(false);
    }
  };

  const handleTimeTakenSubmit = async (e) => {
    e?.preventDefault();
    if (timeTakenSaving) return;
    const minutes = Number(timeTakenInput);

    if (!timeTakenInput || !Number.isInteger(minutes) || minutes <= 0 || minutes > 100000) {
      setTimeTakenError(
        "Please enter a valid time between 1 and 100,000 minutes.",
      );
      return;
    }

    const { subtask, nextStage } = timeTakenModal;
    setTimeTakenSaving(true);

    try {
      await api.put(`/tasks/${subtask.id}`, {
        stage: nextStage,
        time_taken: minutes,
      });
      closeTimeTaken();
      await refreshFor(subtask);
    } catch (error) {
      console.error("Failed to save time taken:", error);
      setTimeTakenError(
        error?.response?.data?.message ||
          "We couldn't save the time taken. Please try again.",
      );
    } finally {
      setTimeTakenSaving(false);
    }
  };

  const executeConfirmAction = async () => {
    if (!confirmModal.action) return;
    setConfirmModal((prev) => ({ ...prev, loading: true }));
    try {
      await confirmModal.action();
    } catch {
      setNotice("We couldn't complete that action. Please try again.");
    } finally {
      setConfirmModal(CLOSED_CONFIRM);
    }
  };

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="page-header">
          <div className="td-skel td-skel-head">
            <div className="bar td-bar-sm" />
            <div className="bar td-bar-lg" />
          </div>
        </div>
        <div className="page-body td-grid" aria-busy="true">
          <div className="td-col">
            <div className="td-panel td-skel td-skel-p1" />
            <div className="td-panel td-skel td-skel-p2" />
            <div className="td-panel td-skel td-skel-p3" />
          </div>
          <div className="td-col">
            <div className="td-panel td-skel td-skel-side" />
          </div>
        </div>
      </>
    );
  }

  if (!task) {
    const failed = loadError === "failed";
    return (
      <>
        <style>{STYLES}</style>
        <div className="page-body">
          <div className="td-empty" role="alert">
            <strong>{failed ? "We couldn't load this task" : "Task not found"}</strong>
            <span>
              {failed
                ? "Check your connection and try again."
                : "It may have been deleted, or you may not have access to it."}
            </span>
            <div className="td-empty-actions">
              {failed && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setLoadError(null);
                    setLoading(true);
                    load();
                  }}
                >
                  Try again
                </button>
              )}
              <Link to={`/projects/${projectId}`} className="btn btn-ghost btn-sm">
                Back to project
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

   const stages = project?.custom_stages || task.project_stages || [
    "Todo",
    "In Progress",
    "In Review",
    "Done",
  ];
  const allowedStages = isManager
    ? stages
    : stages.filter((s) => !["Done"].includes(s));

  const subtasks = task.subtasks || [];
  const isLeaf = !!task.parent_task_id || subtasks.length === 0;
  const doneSubs = subtasks.filter((s) => s.stage === "Done").length;
  const totalTime = subtasks.reduce((sum, s) => sum + (s.time_taken || 0), 0);
  const stageIdx = stages.indexOf(task.stage);
    const menuStages = allowedStages;
  const dueOverdue = task.stage !== "Done" && !!task.due_date && isOverdue?.(task.due_date);

  const details = [
    { l: "Assignee", v: task.assignee_name || "—" },
    { l: "Priority", v: task.priority, cls: "is-cap" },
    {
      l: "Due date",
      v: task.due_date
        ? `${formatDate(task.due_date)}${dueOverdue ? " · Overdue" : ""}`
        : "—",
      cls: dueOverdue ? "is-overdue" : "",
    },
    { l: "Cluster", v: task.cluster_name || "No cluster" },
    { l: "Created", v: task.created_at ? formatDate(task.created_at) : "—" },
    ...(totalTime > 0 ? [{ l: "Total time", v: `${totalTime} min` }] : []),
  ];

  return (
    <>
      <style>{STYLES}</style>

      <div className="page-header">
        <div className="td-head-main">
          <nav className="breadcrumb td-breadcrumb" aria-label="Breadcrumb">
            {/* Managers get clickable links to the projects list / project.
                Members see the same trail as plain text (no navigation). */}
            {isManager ? (
              <>
                <Link to="/projects">Projects</Link>
                <span className="breadcrumb-sep">/</span>
                <Link to={`/projects/${projectId}`}>{project?.name || "Project"}</Link>
              </>
            ) : (
              <>
                <span>Projects</span>
                {project?.name && (
                  <>
                    <span className="breadcrumb-sep">/</span>
                    <span>{project.name}</span>
                  </>
                )}
              </>
            )}
            <span className="breadcrumb-sep">/</span>
            {task.parent_task_id ? (
              isManager ? (
                <>
                  <Link to={`/projects/${projectId}/tasks/${task.parent_task_id}`}>
                    Task
                  </Link>
                  <span className="breadcrumb-sep">/</span>
                  <span aria-current="page">Sub task</span>
                </>
              ) : (
                <span aria-current="page">Sub task</span>
              )
            ) : (
              <span aria-current="page">Task</span>
            )}
          </nav>
          <h1 className="page-title td-title">{task.title}</h1>
        </div>
        <div className="td-header-badges">
          <span className={`badge badge-${task.priority}`}>{task.priority}</span>
          <span className={`badge badge-${task.stage?.toLowerCase().replace(/\s/g, "")}`}>
            {task.stage}
          </span>
        </div>
      </div>

      <main className="page-body">
        {notice && (
          <div className="td-notice" role="alert">
            <span>{notice}</span>
            <button
              type="button"
              className="td-notice-close"
              aria-label="Dismiss"
              onClick={() => setNotice("")}
            >
              ✕
            </button>
          </div>
        )}

        <div className="td-grid">
          <div className="td-col">
            {/* Status — read-only, main tasks only. Derived automatically
                from sub task stages. */}
            {!task.parent_task_id && (
              <section className="td-panel">
                <div className="td-panel-head">
                  <h2 className="td-h">Status</h2>
                </div>
                <p className="td-hint">
                  Set automatically from the sub tasks' progress. Change the stage on a sub task below to update this.
                </p>
                <ol className="td-steps" aria-label="Task status">
                  {stages.map((s, i) => (
                    <li
                      key={s}
                      className={`td-step${i < stageIdx ? " is-past" : ""}${i === stageIdx ? " is-current" : ""}`}
                      style={{ "--c": stageColor(s) }}
                      aria-current={i === stageIdx ? "step" : undefined}
                    >
                      <span className="td-step-dot" />
                      {s}
                    </li>
                  ))}
                </ol>
                {subtasks.length > 0 && (
                  <div className="td-progress">
                    <div
                      className="td-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={subtasks.length}
                      aria-valuenow={doneSubs}
                      aria-label="Sub task progress"
                    >
                      <div
                        className={`td-fill${doneSubs === subtasks.length ? " is-complete" : ""}`}
                        style={{ transform: `scaleX(${doneSubs / subtasks.length})` }}
                      />
                    </div>
                    <span>{doneSubs} of {subtasks.length} sub tasks done</span>
                  </div>
                )}
              </section>
            )}

            {/* Description */}
            <section className="td-panel">
              <div className="td-panel-head">
                <h2 className="td-h">Description</h2>
              </div>
              <p className="td-desc">
                {task.description || task.details || task.desc || (
                  <span className="td-muted">No description provided.</span>
                )}
              </p>
            </section>

            {/* Sub tasks */}
            {!task.parent_task_id && (
              <section className="td-panel">
                <div className="td-panel-head">
                  <h2 className="td-h">
                    Sub tasks
                    <span className="td-count">{subtasks.length}</span>
                    {totalTime > 0 && <span className="td-chip">{totalTime} min total</span>}
                  </h2>
                  {isManager && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditingSubTask(null);
                        setShowSubTaskModal(true);
                      }}
                    >
                      + Add sub task
                    </button>
                  )}
                </div>

                {subtasks.length === 0 ? (
                  <div className="td-empty">
                    <strong>No sub tasks yet</strong>
                    <span>This task counts as done once every sub task is done.</span>
                  </div>
                ) : (
                  <div className="td-sublist">
                    {subtasks.map((st) => {
                      const locked = !isManager && st.stage === "Done";
                      const busy = stageLoading === st.id;

                      return (
                        <div key={st.id} className="td-sub" style={{ "--p": PRIORITY_COLORS[st.priority] }}>
                          <div className="td-sub-main">
                            <Link to={`/projects/${projectId}/tasks/${st.id}`} className="td-sub-title">
                              {st.title}
                            </Link>
                            <div className="td-meta">
                              <span className="td-stage-wrap">
                                <button
                                  type="button"
                                  className={`badge badge-${st.stage?.toLowerCase().replace(/\s/g, "")} td-stage-btn${locked ? " is-static" : ""}`}
                                  aria-haspopup={locked ? undefined : "menu"}
                                  aria-expanded={locked ? undefined : stageDropdown === st.id}
                                  disabled={busy}
                                  onClick={() => {
                                    if (busy || locked) return;
                                    setStageDropdown((prev) => (prev === st.id ? null : st.id));
                                  }}
                                >
                                  {busy ? "Moving…" : locked ? st.stage : `${st.stage} ▾`}
                                </button>
                                {stageDropdown === st.id && (
                                  <div className="td-menu" role="menu">
                                    {menuStages.map((s) => (
                                      <button
                                        key={s}
                                        type="button"
                                        role="menuitem"
                                        aria-current={s === st.stage}
                                        style={{ "--c": stageColor(s) }}
                                        onClick={() => handleSubTaskStageSelect(st, s)}
                                      >
                                        <span className="td-dot" />
                                        {s}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </span>

                              <span className="td-who">
                                <span className="td-avatar" aria-hidden="true">{initials(st.assignee_name)}</span>
                                {st.assignee_name || "Unassigned"}
                              </span>
                              {st.time_taken && <span className="td-chip">{st.time_taken} min</span>}
                              {st.rework_count > 0 && (
                                <span className="td-chip is-danger">
                                  {st.rework_count} rework{st.rework_count > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="td-sub-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setEditingSubTask(st);
                                setShowSubTaskModal(true);
                              }}
                            >
                              Edit
                            </button>
                            {isManager && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm td-danger"
                                onClick={() => handleDeleteSubTask(st.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Stage changer — only place where a stage is edited directly */}
            {isLeaf && (
              <section className="td-panel">
                <div className="td-panel-head">
                  <h2 className="td-h">Move stage</h2>
                </div>
                <div className="td-stagebar" role="group" aria-label="Stage">
                  {allowedStages.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleStageChange(s)}
                      disabled={changingStage !== null || (!isManager && task.stage === "Done")}
                      aria-pressed={task.stage === s}
                      style={{ "--c": stageColor(s) }}
                    >
                      <span className="td-dot" />
                      {changingStage === s ? "Moving…" : s}
                    </button>
                  ))}
                </div>
                {!isManager && (
                  <p className="td-hint">
                    {task.stage === "Done"
                      ? "Approved as Done. Only a manager can move it back."
                      : "A manager has to approve before this can be marked Done."}
                  </p>
                )}
              </section>
            )}

            {/* Comments */}
            <section className="td-panel">
              <div className="td-panel-head">
                <h2 className="td-h">
                  Comments <span className="td-count">{task.comments?.length || 0}</span>
                </h2>
              </div>
              <form onSubmit={handleComment} className="td-composer">
                <textarea
                  className="form-textarea"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleComment(e);
                  }}
                  placeholder="Write a comment… (Ctrl+Enter to post)"
                  aria-label="Write a comment"
                  rows={3}
                />
                <div className="td-composer-row">
                  <button className="btn btn-primary btn-sm" type="submit" disabled={submitting || !comment.trim()}>
                    {submitting ? <Loader label="Posting" size="sm" variant="button" /> : "Post comment"}
                  </button>
                </div>
              </form>
              {task.comments?.length === 0 && (
                <p className="td-note">No comments yet. Start the conversation above.</p>
              )}
              {task.comments?.map((c) => (
                <article key={c.id} className="td-comment">
                  <span className="td-avatar lg" aria-hidden="true">{initials(c.author_name)}</span>
                  <div className="td-comment-body">
                    <div className="td-comment-head">
                      <b>{c.author_name}</b>
                      <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString()}</time>
                    </div>
                    <div className="td-comment-text">{c.content}</div>
                  </div>
                </article>
              ))}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="td-col" aria-label="Task details">
            <section className="td-panel">
              <div className="td-panel-head">
                <h2 className="td-h">Details</h2>
              </div>
              <dl className="td-dl">
                {details.map(({ l, v, cls }) => (
                  <div key={l}>
                    <dt>{l}</dt>
                    <dd className={cls || undefined}>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="td-panel">
              <div className="td-panel-head">
                <h2 className="td-h">Activity</h2>
              </div>
              {task.activity?.length === 0 && <p className="td-note">No activity yet.</p>}
              <ol className="td-tl">
                {task.activity?.map((a) => (
                  <li key={a.id}>
                    <span className="who">{a.actor_name}</span>
                    <span className="what"> {a.action}</span>
                    {a.meta?.from && (
                      <span className="td-muted"> ({a.meta.from} → {a.meta.to})</span>
                    )}
                    <time dateTime={a.created_at}>{new Date(a.created_at).toLocaleString()}</time>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </main>

      {showSubTaskModal && (
        <Modal
          title={editingSubTask ? "Edit sub task" : "New sub task"}
          onClose={() => setShowSubTaskModal(false)}
        >
          <TaskForm
            initial={editingSubTask}
            members={members}
            stages={stages}
            hideCluster={true}
            onSave={handleSaveSubTask}
            onCancel={() => setShowSubTaskModal(false)}
            saving={savingSubTask}
            userRole={user?.role}
            isSubtaskForm
          />
        </Modal>
      )}

      <ConfirmModal
        isOpen={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.isDangerous ? "Delete" : "Confirm"}
        isDangerous={confirmModal.isDangerous}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmModal(CLOSED_CONFIRM)}
        loading={confirmModal.loading}
      />

      {timeTakenModal.show && (
        <Modal title="Time taken" onClose={closeTimeTaken}>
          <form onSubmit={handleTimeTakenSubmit} noValidate>
            <p className="td-modal-text">
              Moving <strong>{timeTakenModal.subtask?.title}</strong> to{" "}
              <strong>In Review</strong>. How long did this sub task take?
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="td-time-taken">Time taken (minutes) *</label>
              <input
                id="td-time-taken"
                className="form-input"
                type="number"
                inputMode="numeric"
                min="1"
                max="100000"
                step="1"
                value={timeTakenInput}
                onChange={(e) => {
                  setTimeTakenInput(e.target.value);
                  setTimeTakenError("");
                }}
                placeholder="e.g. 45"
                aria-invalid={!!timeTakenError}
                aria-describedby={timeTakenError ? "td-time-taken-error" : undefined}
                autoFocus
              />
              {timeTakenError && (
                <div id="td-time-taken-error" className="td-field-error" role="alert">
                  {timeTakenError}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={closeTimeTaken} disabled={timeTakenSaving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={timeTakenSaving}>
                {timeTakenSaving ? "Saving…" : "Confirm and move"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {managerReviewModal.show && (
        <Modal title="Review sub task" onClose={closeReview}>
          <p className="td-modal-text">
            What would you like to do with{" "}
            <strong>"{managerReviewModal.subtask?.title}"</strong>?
          </p>
          <div className="td-choices" role="group" aria-label="Review decision">
            <button
              type="button"
              className="td-choice is-done"
              aria-pressed={reviewAction === "done"}
              onClick={() => setReviewAction("done")}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <b>Mark as done</b>
              <span>Sub task is completed</span>
            </button>
            <button
              type="button"
              className="td-choice is-rework"
              aria-pressed={reviewAction === "rework"}
              onClick={() => setReviewAction("rework")}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 1 1 2.5 5.8" /><path d="M4 19v-5h5" />
              </svg>
              <b>Send for rework</b>
              <span>Needs more work</span>
            </button>
          </div>
          {reviewAction === "rework" && (
            <div className="form-group td-rework-box">
              <label className="form-label">New deadline (optional)</label>
              <DatePicker
                value={reworkDeadline}
                onChange={(val) => setReworkDeadline(val)}
                placeholder="dd-mm-yyyy"
              />
              <div className="td-hint">Set a new due date for the rework cycle.</div>
            </div>
          )}
          {reviewError && (
            <div className="td-modal-error" role="alert">{reviewError}</div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={closeReview} disabled={reviewSaving}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-primary${reviewAction === "rework" ? " is-danger" : ""}`}
              onClick={handleManagerReviewSubmit}
              disabled={!reviewAction || reviewSaving}
            >
              {reviewSaving
                ? "Saving…"
                : reviewAction === "done"
                  ? "Mark done"
                  : reviewAction === "rework"
                    ? "Send for rework"
                    : "Select an action"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}