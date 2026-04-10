import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import Modal from '../components/ui/Modal';
import ProjectForm from '../components/projects/ProjectForm';

export default function Projects() {
  const { isManager } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => api.get('/projects').then(r => setProjects(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) await api.put(`/projects/${editing.id}`, data);
    else await api.post('/projects', data);
    setShowModal(false); setEditing(null); load();
  };

  const handleArchive = async (id) => {
    if (window.confirm('Archive this project?')) { await api.patch(`/projects/${id}/archive`); load(); }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-subtitle">{projects.length} active project{projects.length !== 1 ? 's' : ''}</div>
        </div>
        {isManager && <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ New Project</button>}
      </div>
      <div className="page-body">
        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📁</div>
            <h3>No projects yet</h3>
            {isManager && <p>Create your first project to get started.</p>}
          </div>
        ) : (
          <div className="card-grid">
            {projects.map(p => (
              <div className="card" key={p.id} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <Link to={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{p.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{p.client_name || 'No client'}</div>
                  </Link>
                  <StatusBadge status={p.status} />
                </div>
                {p.description && <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '12px', lineHeight: 1.5 }}>{p.description.slice(0, 100)}{p.description.length > 100 ? '…' : ''}</p>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    {p.end_date ? `Due ${formatDate(p.end_date)}` : 'No deadline'}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Link to={`/projects/${p.id}`} className="btn btn-ghost btn-sm">Open</Link>
                    {isManager && <>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(p); setShowModal(true); }}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-3)' }} onClick={() => handleArchive(p.id)}>Archive</button>
                    </>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Project' : 'New Project'} onClose={() => { setShowModal(false); setEditing(null); }}>
          <ProjectForm initial={editing} onSave={handleSave} onCancel={() => { setShowModal(false); setEditing(null); }} />
        </Modal>
      )}
    </>
  );
}

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status?.replace('_', ' ')}</span>;
}
