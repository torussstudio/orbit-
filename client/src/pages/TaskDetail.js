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

  const stages = project?.custom_stages || ["Todo","In Progress","In Review","Done","Deployed"];
  const allowedStages = isManager ? stages : stages.filter(s => !['Done','Deployed'].includes(s));


  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <Link to="/projects">Projects</Link>
            <span className="breadcrumb-sep">/</span>
            <Link to={`/projects/${projectId}`}>{project?.name}</Link>
            <span className="breadcrumb-sep">/</span>
            <span>Task</span>
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
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>Sub Tasks ({task.subtasks?.length || 0})</h3>
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
                      <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-3)' }}>
                        <span className={`badge badge-${st.stage?.toLowerCase().replace(/\s/g,'')}`}>{st.stage}</span>
                        <span>{st.assignee_name || 'Unassigned'}</span>
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

          {/* Stage changer */}
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
            {!isManager && <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '8px' }}>Manager approval required to mark Done or Deployed.</p>}
          </div>

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
    </>
  );
}
