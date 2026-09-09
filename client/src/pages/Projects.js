import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import ProjectForm from '../components/projects/ProjectForm';

export default function Projects() {
  const { isManager } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editLoadingId, setEditLoadingId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', action: null, loading: false, isDangerous: false });
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const load = () => api.get('/projects').then(r => setProjects(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // Drag-and-drop reordering (managers only, active projects only).
  // Optimistic: the grid reorders instantly, then we persist the new
  // order in the background. If saving fails, we just reload from the
  // server so the view never gets stuck out of sync.
  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id)); // Firefox needs this to allow the drag
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  };

  const handleDragLeave = (id) => {
    setDragOverId((prev) => (prev === id ? null : prev));
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = draggedId;
    setDraggedId(null);
    if (sourceId === null || sourceId === targetId) return;

    const current = projects.filter((p) => p.status !== 'archived');
    const fromIndex = current.findIndex((p) => p.id === sourceId);
    const toIndex = current.findIndex((p) => p.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setProjects((prev) => [
      ...reordered,
      ...prev.filter((p) => p.status === 'archived'),
    ]);

    try {
      await api.put('/projects/reorder', {
        project_ids: reordered.map((p) => p.id),
      });
    } catch (err) {
      console.error('Failed to save project order:', err.message);
      load(); // out of sync with the server — just reload the true order
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  // The projects LIST endpoint doesn't include assigned members (only
  // GET /projects/:id does) — fetch the full project before opening the
  // edit modal so "Assign Members" starts pre-highlighted correctly.
  const handleEdit = async (p) => {
    setEditLoadingId(p.id);
    try {
      const { data } = await api.get(`/projects/${p.id}`);
      setEditing(data);
      setShowModal(true);
    } finally {
      setEditLoadingId(null);
    }
  };

  const handleSave = async (data) => {
    setSaving(true);
    try {
      if (editing) await api.put(`/projects/${editing.id}`, data);
      else await api.post('/projects', data);
      setShowModal(false); setEditing(null); load();
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = (id) => {
    setConfirmModal({
      show: true,
      title: 'Archive Project',
      message: 'Archive this project?',
      isDangerous: false,
      action: async () => {
        await api.patch(`/projects/${id}/archive`);
        load();
      },
      loading: false
    });
  };

  const handleUnarchive = (id) => {
    setConfirmModal({
      show: true,
      title: 'Restore Project',
      message: 'Restore this project?',
      isDangerous: false,
      action: async () => {
        await api.patch(`/projects/${id}/unarchive`);
        load();
      },
      loading: false
    });
  };

  const handleDelete = (id) => {
    setConfirmModal({
      show: true,
      title: 'Delete Project',
      message: 'Are you sure you want to permanently delete this project? This action cannot be undone.',
      isDangerous: true,
      action: async () => {
        try {
          await api.delete(`/projects/${id}`);
          load();
        } catch (error) {
          alert('Failed to delete project: ' + (error.response?.data?.error || error.message));
        }
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
                onEdit={() => handleEdit(p)}
                editLoading={editLoadingId === p.id}
                onArchive={() => handleArchive(p.id)}
                draggable={isManager}
                isDragging={draggedId === p.id}
                isDragOver={dragOverId === p.id && draggedId !== p.id}
                onDragStart={(e) => handleDragStart(e, p.id)}
                onDragOver={(e) => handleDragOver(e, p.id)}
                onDragLeave={() => handleDragLeave(p.id)}
                onDrop={(e) => handleDrop(e, p.id)}
                onDragEnd={handleDragEnd}
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
                  onDelete={() => handleDelete(p.id)}
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
            saving={saving}
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

function ProjectCard({ project: p, isManager, onEdit, editLoading, onArchive, onUnarchive, onDelete, archived, draggable, isDragging, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) {
  return (
    <div
      className="card"
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDragLeave={draggable ? onDragLeave : undefined}
      onDrop={draggable ? onDrop : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      style={{
        opacity: archived ? 0.75 : isDragging ? 0.4 : 1,
        cursor: draggable ? 'grab' : 'default',
        outline: isDragOver ? '2px dashed var(--accent)' : 'none',
        outlineOffset: '2px',
        transition: 'opacity 0.15s ease, outline 0.1s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <Link to={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{p.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>{p.client_name || 'No client'}</div>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {draggable && (
            <span
              title="Drag to reorder"
              style={{ color: 'var(--text-3)', fontSize: '14px', letterSpacing: '-2px', cursor: 'grab', userSelect: 'none' }}
            >
              ⠿
            </span>
          )}
          <span className={`badge badge-${p.status}`}>{p.status?.replace('_', ' ')}</span>
        </div>
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
                  <button className="btn btn-ghost btn-sm" onClick={onEdit} disabled={editLoading}>
                    {editLoading ? 'Loading…' : 'Edit'}
                  </button>
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
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--accent)' }}
                    onClick={onUnarchive}
                  >
                    ↩ Restore
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)' }}
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
