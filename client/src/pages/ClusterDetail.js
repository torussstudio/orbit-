import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import Modal from '../components/ui/Modal';

export default function ClusterDetail() {
  const { id: projectId, clusterId } = useParams();
  const { isManager } = useAuth();
  const [cluster, setCluster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [reworkTaskIds, setReworkTaskIds] = useState([]);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => api.get(`/clusters/${clusterId}`).then(r => setCluster(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, [clusterId]);

  const handleReview = async (decision) => {
    setSubmitting(true);
    try {
      await api.post(`/clusters/${clusterId}/review`, { decision, notes: reviewNotes, rework_task_ids: reworkTaskIds });
      setShowReview(false); setReworkTaskIds([]); setReviewNotes(''); load();
    } finally { setSubmitting(false); }
  };

  const handleComplete = async () => {
    await api.patch(`/clusters/${clusterId}/complete`); load();
  };

  const toggleRework = id => setReworkTaskIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!cluster) return <div className="page-body">Cluster not found.</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <Link to="/projects">Projects</Link>
            <span className="breadcrumb-sep">/</span>
            <Link to={`/projects/${projectId}`}>Project</Link>
            <span className="breadcrumb-sep">/</span>
            <span>Cluster</span>
          </div>
          <div className="page-title" style={{ fontSize: '18px' }}>{cluster.name}</div>
          {cluster.description && <div className="page-subtitle">{cluster.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className={`badge badge-${cluster.status}`}>{cluster.status?.replace('_', ' ')}</span>
          {cluster.rework_count > 0 && <span className="rework-counter"><span className="rework-count">↺ {cluster.rework_count} rework{cluster.rework_count !== 1 ? 's' : ''}</span></span>}
          {isManager && cluster.status === 'in_review' && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowReview(true)}>Review Cluster</button>
          )}
          {isManager && cluster.status === 'approved' && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success)' }} onClick={handleComplete}>Mark Completed</button>
          )}
        </div>
      </div>

      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' }}>
        {/* Tasks */}
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '14px' }}>Tasks in this Cluster ({cluster.tasks?.length})</h3>
            {cluster.tasks?.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>No tasks assigned to this cluster yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Task</th><th>Assignee</th><th>Stage</th><th>Priority</th></tr></thead>
                  <tbody>
                    {cluster.tasks?.map(t => (
                      <tr key={t.id}>
                        <td><Link to={`/projects/${projectId}/tasks/${t.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{t.title}</Link></td>
                        <td style={{ color: 'var(--text-2)', fontSize: '12px' }}>{t.assignee_name || '—'}</td>
                        <td><span className={`badge badge-${t.stage?.toLowerCase().replace(/\s/g,'')}`}>{t.stage}</span></td>
                        <td><span className={`badge badge-${t.priority}`}>{t.priority}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Review history */}
          {cluster.reviews?.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '14px' }}>Review History</h3>
              {cluster.reviews?.map((r, i) => (
                <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: r.decision === 'approved' ? 'var(--success)' : 'var(--danger)' }}>
                      {r.decision === 'approved' ? '✅ Approved' : '↺ Needs Rework'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>by {r.reviewer_name}</div>
                  {r.notes && <div style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '6px' }}>{r.notes}</div>}
                  {r.rework_task_ids?.length > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '6px' }}>
                      {r.rework_task_ids.length} task{r.rework_task_ids.length !== 1 ? 's' : ''} sent back for rework
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info sidebar */}
        <div className="card">
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '12px' }}>Cluster Info</h3>
          {[
            ['Status', cluster.status?.replace('_', ' ')],
            ['Rework Count', cluster.rework_count],
            ['Target Date', formatDate(cluster.target_date)],
            ['Tasks', cluster.tasks?.length],
            ['Reviews', cluster.reviews?.length],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-3)' }}>{l}</span>
              <span style={{ color: l === 'Rework Count' && v > 0 ? 'var(--danger)' : 'var(--text)' }}>{v ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Review Modal */}
      {showReview && (
        <Modal title="Review Cluster" onClose={() => setShowReview(false)}>
          <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '16px' }}>
            Select which tasks need rework. Leave all unchecked to approve everything.
          </p>
          <div style={{ marginBottom: '16px' }}>
            {cluster.tasks?.map(t => (
              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px', background: reworkTaskIds.includes(t.id) ? 'rgba(248,113,113,0.08)' : 'transparent', border: '1px solid', borderColor: reworkTaskIds.includes(t.id) ? 'rgba(248,113,113,0.3)' : 'transparent' }}>
                <input type="checkbox" checked={reworkTaskIds.includes(t.id)} onChange={() => toggleRework(t.id)} />
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text)' }}>{t.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>{t.stage} · {t.assignee_name || 'Unassigned'}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="form-group">
            <label className="form-label">Review Notes</label>
            <textarea className="form-textarea" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Optional feedback for the team..." rows={3} />
          </div>
          <div style={{ padding: '12px', background: 'var(--bg-3)', borderRadius: '6px', marginBottom: '16px', fontSize: '12px', color: 'var(--text-2)' }}>
            {reworkTaskIds.length === 0
              ? '✅ All tasks will be approved.'
              : `↺ ${reworkTaskIds.length} task${reworkTaskIds.length > 1 ? 's' : ''} will be sent back to Todo.`}
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowReview(false)}>Cancel</button>
            {reworkTaskIds.length > 0
              ? <button className="btn btn-danger" onClick={() => handleReview('needs_rework')} disabled={submitting}>Send for Rework</button>
              : <button className="btn btn-primary" style={{ background: 'var(--success)', borderColor: 'var(--success)' }} onClick={() => handleReview('approved')} disabled={submitting}>Approve All</button>
            }
          </div>
        </Modal>
      )}
    </>
  );
}
