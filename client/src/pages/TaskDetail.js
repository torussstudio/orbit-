import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import TaskForm from '../components/tasks/TaskForm';

const PRIORITY_COLORS = { low: 'var(--accent)', medium: 'var(--warning)', high: 'var(--danger)', critical: 'var(--critical)' };

export default function TaskDetail() {
  const { id: projectId, taskId } = useParams();
  const { user, isManager } = useAuth();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [changingStage, setChangingStage] = useState(null);
  const [members, setMembers] = useState([]);
  const [project, setProject] = useState(null);

  const [showSubTaskModal, setShowSubTaskModal] = useState(false);
  const [editingSubTask, setEditingSubTask] = useState(null);
  const [savingSubTask, setSavingSubTask] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', action: null, loading: false, isDangerous: false });

  const [timeTakenModal, setTimeTakenModal] = useState({ show: false, subtask: null, nextStage: null });
  const [timeTakenInput, setTimeTakenInput] = useState('');
  const [timeTakenError, setTimeTakenError] = useState('');

  const [managerReviewModal, setManagerReviewModal] = useState({ show: false, subtask: null });
  const [reworkDeadline, setReworkDeadline] = useState('');
  const [reviewAction, setReviewAction] = useState(null);

  const load = () => {
    Promise.all([
      api.get(`/tasks/${taskId}`),
      api.get(`/projects/${projectId}`),
      api.get('/members')
    ]).then(([t, p, m]) => {
      setTask(t.data); setProject(p.data); setMembers(m.data);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [taskId]);

  const handleStageChange = async (stage) => {
    setChangingStage(stage);
    try {
      await api.put(`/tasks/${taskId}`, { ...task, stage });
      load();
    } finally {
      setChangingStage(null);
    }
  };

  const handleComment = async e => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/tasks/${taskId}/comments`, { content: comment });
      setComment(''); 
      load(); 
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSubTask = async (data) => {
    setSavingSubTask(true);
    try {
      if (editingSubTask) await api.put(`/tasks/${editingSubTask.id}`, data);
      else await api.post('/tasks', { ...data, project_id: projectId, parent_task_id: taskId, cluster_id: task.cluster_id });
      setShowSubTaskModal(false); setEditingSubTask(null); load();
    } finally {
      setSavingSubTask(false);
    }
  };

  const handleDeleteSubTask = (id) => {
    setConfirmModal({
      show: true,
      title: 'Delete Sub Task',
      message: 'Are you sure you want to delete this sub task?',
      isDangerous: true,
      action: async () => {
        await api.delete(`/tasks/${id}`);
        load();
      },
      loading: false
    });
  };

    const handleSubTaskStageClick = async (st) => {
    const memberStages = ['Todo', 'In Progress', 'In Review'];
    const managerStages = ['Todo', 'In Progress', 'In Review', 'Done'];

    // MEMBER flow: stop at In Review, no rework
    if (!isManager) {
      if (st.stage === 'In Review') return; // stop here for members
      const currentIndex = memberStages.indexOf(st.stage);
      const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1;
      const nextStage = memberStages[nextIndex];
      // Show time taken modal for members only
      if (st.stage === 'In Progress' && nextStage === 'In Review') {
        setTimeTakenInput('');
        setTimeTakenError('');
        setTimeTakenModal({ show: true, subtask: st, nextStage });
        return;
      }
      await api.put(`/tasks/${st.id}`, { ...st, stage: nextStage, time_taken: null });
      load();
      return;
    }

    // MANAGER flow
    if (st.stage === 'In Review') {
      // Show Done/Rework choice modal
      setManagerReviewModal({ show: true, subtask: st });
      setReviewAction(null);
      setReworkDeadline('');
      return;
    }

    if (st.stage === 'Done') {
      // Loop back to Todo for managers
      await api.put(`/tasks/${st.id}`, { ...st, stage: 'Todo', time_taken: null });
      load();
      return;
    }

    const currentIndex = managerStages.indexOf(st.stage);
    const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1;
    const nextStage = managerStages[nextIndex];
    await api.put(`/tasks/${st.id}`, { ...st, stage: nextStage, time_taken: null });
    load();
  };

  const handleManagerReviewSubmit = async () => {
    const { subtask } = managerReviewModal;
    if (!reviewAction) return;
    await api.put(`/tasks/${subtask.id}`, {
      ...subtask,
      stage: reviewAction === 'done' ? 'Done' : 'Rework',
      time_taken: null,
      new_due_date: reviewAction === 'rework' && reworkDeadline ? reworkDeadline : null
    });
    setManagerReviewModal({ show: false, subtask: null });
    setReviewAction(null);
    setReworkDeadline('');
    load();
  };

  const handleTimeTakenSubmit = async () => {
    if (!timeTakenInput || isNaN(timeTakenInput) || parseInt(timeTakenInput) <= 0) {
      setTimeTakenError('Please enter a valid time in minutes.');
      return;
    }
    const { subtask, nextStage } = timeTakenModal;
    await api.put(`/tasks/${subtask.id}`, { ...subtask, stage: nextStage, time_taken: parseInt(timeTakenInput) });
    setTimeTakenModal({ show: false, subtask: null, nextStage: null });
    setTimeTakenInput('');
    load();
  };

  const [reworkConfirm, setReworkConfirm] = useState({ show: false, subtask: null });

  const executeConfirmAction = async () => {
    if (!confirmModal.action) return;
    setConfirmModal(prev => ({ ...prev, loading: true }));
    try {
      await confirmModal.action();
    } finally {
      setConfirmModal({ show: false, title: '', message: '', action: null, loading: false, isDangerous: false });
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!task) return <div className="page-body">Task not found.</div>;

  const stages = project?.custom_stages || ["Todo","In Progress","In Review","Done"];
  const allowedStages = isManager ? stages : stages.filter(s => !['Done'].includes(s));


  return (
    <>
      <div className="page-header">
        <div>
           <div className="breadcrumb">
            <Link to="/projects">Projects</Link>
            <span className="breadcrumb-sep">/</span>
            <Link to={`/projects/${projectId}`}>{project?.name}</Link>
            <span className="breadcrumb-sep">/</span>
            {task.parent_task_id ? (
              <>
                <Link to={`/projects/${projectId}/tasks/${task.parent_task_id}`}>Task</Link>
                <span className="breadcrumb-sep">/</span>
                <span>Sub Task</span>
              </>
            ) : (
              <span>Task</span>
            )}
          </div>
          <div className="page-title" style={{ fontSize: '18px' }}>{task.title}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className={`badge badge-${task.priority}`}>{task.priority}</span>
          <span className={`badge badge-${task.stage?.toLowerCase().replace(/\s/g,'')}`}>{task.stage}</span>
        </div>
      </div>

      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
        <div>
          {/* Description */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '10px' }}>Description</h3>
            <p style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {task.description || task.details || task.desc || <span style={{ color: 'var(--text-3)' }}>No description provided.</span>}
            </p>
          </div>

          {/* Sub Tasks */}
          {!task.parent_task_id && (
            <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>
                Sub Tasks ({task.subtasks?.length || 0})
                {task.subtasks?.some(s => s.time_taken) && (
                  <span style={{ marginLeft: '12px', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>
                    ⏱ Total: {task.subtasks.reduce((sum, s) => sum + (s.time_taken || 0), 0)} min
                  </span>
                )}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditingSubTask(null); setShowSubTaskModal(true); }}>+ Add Sub Task</button>
            </div>
            
            {task.subtasks?.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>No sub tasks.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {task.subtasks?.map(st => (
                  <div key={st.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-3)', borderRadius: '6px', borderLeft: `3px solid ${PRIORITY_COLORS[st.priority]}` }}>
                    <div>
                      <Link to={`/projects/${projectId}/tasks/${st.id}`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', textDecoration: 'none', display: 'block', marginBottom: '4px' }}>{st.title}</Link>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-3)', flexWrap: 'wrap' }}>
                         <span
                          className={`badge badge-${st.stage?.toLowerCase().replace(/\s/g,'')}`}
                          onClick={() => handleSubTaskStageClick(st)}
                          style={{ cursor: !isManager && st.stage === 'In Review' ? 'default' : 'pointer' }}
                          title={!isManager && st.stage === 'In Review' ? 'Awaiting manager review' : 'Click to advance stage'}
                        >{st.stage}{!isManager && st.stage === 'In Review' ? '' : ' →'}</span>
                        <span>{st.assignee_name || 'Unassigned'}</span>
                        {st.time_taken && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>⏱ {st.time_taken} min</span>}
                        {st.rework_count > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>↺ {st.rework_count} rework{st.rework_count > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditingSubTask(st); setShowSubTaskModal(true); }}>Edit</button>
                      {isManager && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteSubTask(st.id)}>Delete</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          )}

          {/* Stage changer - Manager only, not shown for subtasks */}
          {isManager && !task.parent_task_id && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '12px' }}>Move Stage</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '10px' }}>
                This task moves to Done automatically when all subtasks are completed. You can also move it manually.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {stages.map(s => (
                  <button key={s} onClick={() => handleStageChange(s)}
                    disabled={changingStage !== null}
                    className={`btn ${task.stage === s ? 'btn-primary' : 'btn-ghost'} btn-sm`}>
                    {changingStage === s ? 'Moving...' : s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stage changer - shown inside subtasks for everyone */}
          {task.parent_task_id && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '12px' }}>Move Stage</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {allowedStages.map(s => (
                  <button key={s} onClick={() => handleStageChange(s)}
                    disabled={changingStage !== null}
                    className={`btn ${task.stage === s ? 'btn-primary' : 'btn-ghost'} btn-sm`}>
                    {changingStage === s ? 'Moving...' : s}
                  </button>
                ))}
              </div>
              {!isManager && <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '8px' }}>Manager approval required to mark Done</p>}
            </div>
          )}

          {/* Comments */}
          <div className="card">
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '12px' }}>Comments ({task.comments?.length || 0})</h3>
            <form onSubmit={handleComment} style={{ marginBottom: '16px' }}>
              <textarea className="form-textarea" value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment..." rows={3} style={{ marginBottom: '8px' }} />
              <button className="btn btn-primary btn-sm" type="submit" disabled={submitting}>
                {submitting ? 'Posting...' : 'Post Comment'}
              </button>
            </form>
            {task.comments?.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>No comments yet.</p>}
            {task.comments?.map(c => (
              <div key={c.id} className="comment">
                <div className="comment-meta">
                  <span className="comment-author">{c.author_name}</span>
                  <span className="comment-time">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <div className="comment-body">{c.content}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card">
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '12px' }}>Details</h3>
            {[
              ['Assignee', task.assignee_name || '—'],
              ['Priority', task.priority],
              ['Due Date', formatDate(task.due_date)],
              ['Cluster', task.cluster_name || '—'],
              ['Created', formatDate(task.created_at)],
              ...(task.subtasks?.some(s => s.time_taken)
                ? [['Total Time', `⏱ ${task.subtasks.reduce((sum, s) => sum + (s.time_taken || 0), 0)} min`]]
                : []),
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-3)' }}>{l}</span>
                <span style={{ color: 'var(--text)' }}>{v}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '12px' }}>Activity</h3>
            {task.activity?.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>No activity yet.</p>}
            {task.activity?.map(a => (
              <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                <span style={{ color: 'var(--accent)' }}>{a.actor_name}</span>
                <span style={{ color: 'var(--text-2)' }}> {a.action}</span>
                {a.meta?.from && <span style={{ color: 'var(--text-3)' }}> ({a.meta.from} → {a.meta.to})</span>}
                <div style={{ color: 'var(--text-3)', fontSize: '10px', marginTop: '2px' }}>{new Date(a.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showSubTaskModal && (
        <Modal title={editingSubTask ? 'Edit Sub Task' : 'New Sub Task'} onClose={() => setShowSubTaskModal(false)}>
          <TaskForm
            initial={editingSubTask}
            members={members}
            stages={stages}
            hideCluster={true}
            onSave={handleSaveSubTask}
            onCancel={() => setShowSubTaskModal(false)}
            saving={savingSubTask}
            userRole={user?.role}
          />
        </Modal>
      )}

      <ConfirmModal 
        isOpen={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.isDangerous ? 'Delete' : 'Confirm'}
        isDangerous={confirmModal.isDangerous}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmModal({ show: false, title: '', message: '', action: null, loading: false, isDangerous: false })}
        loading={confirmModal.loading}
      />

      {timeTakenModal.show && (
        <Modal title="Time Taken" onClose={() => setTimeTakenModal({ show: false, subtask: null, nextStage: null })}>
          <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '16px' }}>
            Moving <strong>{timeTakenModal.subtask?.title}</strong> to <strong>In Review</strong>.
            How long did this subtask take?
          </p>
          <div className="form-group">
            <label className="form-label">Time Taken (minutes) *</label>
            <input
              className="form-input"
              type="number"
              min="1"
              value={timeTakenInput}
              onChange={e => { setTimeTakenInput(e.target.value); setTimeTakenError(''); }}
              placeholder="e.g. 45"
              autoFocus
            />
            {timeTakenError && <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '6px' }}>{timeTakenError}</div>}
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setTimeTakenModal({ show: false, subtask: null, nextStage: null })}>Cancel</button>
            <button className="btn btn-primary" onClick={handleTimeTakenSubmit}>Confirm & Move</button>
          </div>
        </Modal>
        
      )}

       {managerReviewModal.show && (
        <Modal title="Review Subtask" onClose={() => { setManagerReviewModal({ show: false, subtask: null }); setReviewAction(null); setReworkDeadline(''); }}>
          <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '20px' }}>
            What would you like to do with <strong>"{managerReviewModal.subtask?.title}"</strong>?
          </p>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <div
              onClick={() => setReviewAction('done')}
              style={{ flex: 1, padding: '16px', borderRadius: '8px', border: `2px solid ${reviewAction === 'done' ? 'var(--success)' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'center', background: reviewAction === 'done' ? 'rgba(16,185,129,0.08)' : 'var(--bg-2)', transition: 'all 0.15s' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: reviewAction === 'done' ? 'var(--success)' : 'var(--text)' }}>Mark as Done</div>
              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>Subtask is completed</div>
            </div>
            <div
              onClick={() => setReviewAction('rework')}
              style={{ flex: 1, padding: '16px', borderRadius: '8px', border: `2px solid ${reviewAction === 'rework' ? 'var(--danger)' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'center', background: reviewAction === 'rework' ? 'rgba(248,113,113,0.08)' : 'var(--bg-2)', transition: 'all 0.15s' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>↺</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: reviewAction === 'rework' ? 'var(--danger)' : 'var(--text)' }}>Send for Rework</div>
              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>Needs more work</div>
            </div>
          </div>
          {reviewAction === 'rework' && (
            <div className="form-group" style={{ background: 'var(--bg-3)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px' }}>
              <label className="form-label">New Deadline (optional)</label>
              <input
                className="form-input"
                type="date"
                value={reworkDeadline}
                onChange={e => setReworkDeadline(e.target.value)}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px' }}>Set a new due date for the rework cycle</div>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => { setManagerReviewModal({ show: false, subtask: null }); setReviewAction(null); setReworkDeadline(''); }}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleManagerReviewSubmit}
              disabled={!reviewAction}
              style={reviewAction === 'rework' ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : {}}>
              {reviewAction === 'done' ? '✅ Mark Done' : reviewAction === 'rework' ? '↺ Send for Rework' : 'Select an action'}
            </button>
          </div>
        </Modal>
      )}
      
    </>
  );
}
