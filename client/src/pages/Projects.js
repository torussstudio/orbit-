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
  const [showArchived, setShowArchived] = useState(false);

  const load = () => api.get('/projects').then(r => setProjects(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing) await api.put(`/projects/${editing.id}`, data);
    else await api.post('/projects', data);
    setShowModal(false); setEditing(null); load();
  };

  const handleArchive = async (id) => {
    if (window.confirm('Archive this project?')) {
      await api.patch(`/projects/${id}/archive`);
      load();
    }
  };

  const handleUnarchive = async (id) => {
    if (window.confirm('Restore this project?')) {
      await api.patch(`/projects/${id}/unarchive`);
      load();
    }
  };

  const activeProjects = projects.filter(p => p.status !== 'archived');
  const archivedProjects = projects.filter(p => p.status === 'archived');

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-subtitle">{activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}{archivedProjects.length > 0 ? ` · ${archivedProjects.length} archived` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {archivedProjects.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? '📁 Hide Archived' : `🗄️ Archived (${archivedProjects.length})`}
            </button>
          )}
          {isManager && (
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
              + New Project
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Active Projects */}
        {activeProjects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📁</div>
            <h3>No active projects</h3>
            {isManager && <p>Create your first project to get started.</p>}
          </div>
        ) : (
          <div className="card-grid">
            {activeProjects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                isManager={isManager}
                onEdit={() => { setEditing(p); setShowModal(true); }}
                onArchive={() => handleArchive(p.id)}
              />
            ))}
          </div>
        )}

        {/* Archived Projects */}
        {showArchived && archivedProjects.length > 0 && (
          <div style={{ marginTop: '40px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              marginBottom: '16px', paddingBottom: '12px',
              borderBottom: '1.5px solid var(--border)'
            }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-2)' }}>
                🗄️ Archived Projects
              </span>
              <span style={{
                background: 'var(--bg-4)', color: 'var(--text-3)',
                fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {archivedProjects.length}
              </span>
            </div>
            <div className="card-grid">
              {archivedProjects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  isManager={isManager}
                  archived
                  onUnarchive={() => handleUnarchive(p.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          title={editing ? 'Edit Project' : 'New Project'}
          onClose={() => { setShowModal(false); setEditing(null); }}
        >
          <ProjectForm
            initial={editing}
            onSave={handleSave}
            onCancel={() => { setShowModal(false); setEditing(null); }}
          />
        </Modal>
      )}
    </>
  );
}

function ProjectCard({ project: p, isManager, onEdit, onArchive, onUnarchive, archived }) {
  return (
    <div className="card" style={{ opacity: archived ? 0.75 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <Link to={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{p.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{p.client_name || 'No client'}</div>
        </Link>
        <span className={`badge badge-${p.status}`}>{p.status?.replace('_', ' ')}</span>
      </div>

      {p.description && (
        <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '12px', lineHeight: 1.5 }}>
          {p.description.slice(0, 100)}{p.description.length > 100 ? '…' : ''}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
          {p.end_date ? `Due ${formatDate(p.end_date)}` : 'No deadline'}
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {!archived ? (
            <>
              <Link to={`/projects/${p.id}`} className="btn btn-ghost btn-sm">Open</Link>
              {isManager && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--text-3)' }}
                    onClick={onArchive}
                  >
                    Archive
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <Link to={`/projects/${p.id}`} className="btn btn-ghost btn-sm">View</Link>
              {isManager && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--accent)' }}
                  onClick={onUnarchive}
                >
                  ↩ Restore
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
