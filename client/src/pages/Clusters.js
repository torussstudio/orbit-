import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import Modal from '../components/ui/Modal';

const STATUS_COLORS = { draft: 'var(--text-3)', in_review: 'var(--accent-2)', approved: 'var(--success)', needs_rework: 'var(--danger)', completed: 'var(--success)' };

export default function Clusters({ project: propProject }) {
  const params = useParams();
  const projectId = propProject?.id || params.id;
  const { isManager } = useAuth();
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', target_date: '' });

  const load = () => api.get(`/clusters/project/${projectId}`).then(r => setClusters(r.data)).finally(() => setLoading(false));
  useEffect(() => { if (projectId) load(); }, [projectId]);

  const handleSave = async () => {
    if (editing) await api.put(`/clusters/${editing.id}`, form);
    else await api.post('/clusters', { ...form, project_id: projectId });
    setShowModal(false); setEditing(null); setForm({ name: '', description: '', target_date: '' }); load();
  };

  const handleDelete = async id => {
    if (window.confirm('Delete cluster?')) { await api.delete(`/clusters/${id}`); load(); }
  };

  const handleSubmitReview = async id => {
    await api.post(`/clusters/${id}/submit-review`); load();
  };

  if (loading) return <div style={{ padding: '24px' }}><div className="spinner" /></div>;

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-2)' }}>{clusters.length} cluster{clusters.length !== 1 ? 's' : ''}</div>
        {isManager && <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setForm({ name: '', description: '', target_date: '' }); setShowModal(true); }}>+ New Cluster</button>}
      </div>

      {clusters.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📦</div><h3>No clusters yet</h3></div>
      ) : (
        <div className="card-grid">
          {clusters.map(c => (
            <div className="card" key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <Link to={`/projects/${projectId}/clusters/${c.id}`} style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>{c.name}</Link>
                  {c.description && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>{c.description}</div>}
                </div>
                <span className={`badge badge-${c.status}`}>{c.status?.replace('_', ' ')}</span>
              </div>

              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-3)', marginBottom: '12px' }}>
                <span>📋 {c.task_count} tasks</span>
                {c.target_date && <span>🗓 {formatDate(c.target_date)}</span>}
                {c.rework_count > 0 && <span className="rework-counter"><span className="rework-count">↺ {c.rework_count}</span></span>}
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <Link to={`/projects/${projectId}/clusters/${c.id}`} className="btn btn-ghost btn-sm">View</Link>
                {isManager && <>
                  {c.status === 'draft' || c.status === 'needs_rework' ? (
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-2)' }} onClick={() => handleSubmitReview(c.id)}>Submit for Review</button>
                  ) : null}
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(c); setForm({ name: c.name, description: c.description||'', target_date: c.target_date||'' }); setShowModal(true); }}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(c.id)}>Delete</button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Cluster' : 'New Cluster'} onClose={() => setShowModal(false)}>
          <div className="form-group">
            <label className="form-label">Cluster Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Homepage Redesign" />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this cluster about?" />
          </div>
          <div className="form-group">
            <label className="form-label">Target Date</label>
            <input className="form-input" type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
