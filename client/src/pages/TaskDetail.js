import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';

export default function TaskDetail() {
  const { id: projectId, taskId } = useParams();
  const { user, isManager } = useAuth();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState([]);
  const [project, setProject] = useState(null);

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
    await api.put(`/tasks/${taskId}`, { ...task, stage });
    load();
  };

  const handleComment = async e => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    await api.post(`/tasks/${taskId}/comments`, { content: comment });
    setComment(''); load(); setSubmitting(false);
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
              {task.description || <span style={{ color: 'var(--text-3)' }}>No description provided.</span>}
            </p>
          </div>

          {/* Stage changer */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '12px' }}>Move Stage</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {allowedStages.map(s => (
                <button key={s} onClick={() => handleStageChange(s)}
                  className={`btn ${task.stage === s ? 'btn-primary' : 'btn-ghost'} btn-sm`}>
                  {s}
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
              <button className="btn btn-primary btn-sm" type="submit" disabled={submitting}>Post Comment</button>
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
    </>
  );
}
