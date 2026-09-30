import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import ProjectForm from '../components/projects/ProjectForm';
import Loader from '../components/ui/Loader';

// In this app, tasks/subtasks use the `stage` field and "Done" means completed.
const isDone = (t) => String(t.stage ?? t.status ?? '').toLowerCase().trim() === 'done';

// Counting rule:
//  - a task with NO subtasks counts as 1
//  - a task WITH subtasks is not counted itself; only its subtasks are counted
const computeStats = (tasks) => {
  const flat = [];
  const walk = (list) => list.forEach((t) => {
    flat.push(t);
    if (Array.isArray(t.subtasks)) walk(t.subtasks);
  });
  walk(tasks);

  const parentIds = new Set(flat.map((t) => t.parent_task_id).filter((id) => id !== null && id !== undefined));
  const leaves = flat.filter((t) => !parentIds.has(t.id) && !(Array.isArray(t.subtasks) && t.subtasks.length > 0));

  return { total: leaves.length, done: leaves.filter(isDone).length };
};

const STYLES = `
.pj-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.pj-search { position: relative; flex: 1 1 260px; max-width: 360px; }
.pj-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
.pj-search input {
  width: 100%; height: 38px; padding: 0 12px 0 36px; font-size: 13px;
  color: var(--text); background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px;
  transition: border-color .2s ease, box-shadow .2s ease;
}
.pj-search input::placeholder { color: var(--text-3); }
.pj-search input:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }

.pj-alert {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; margin-bottom: 16px; font-size: 13px; border-radius: 10px;
  color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent);
}
.pj-alert button { background: none; border: none; color: inherit; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px; }

.pj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }

.pj-card {
  position: relative; display: flex; flex-direction: column; padding: 18px 18px 14px;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px;
  transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
}
.pj-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  box-shadow: 0 10px 28px -14px color-mix(in srgb, var(--accent) 40%, transparent);
}
.pj-card:focus-within { border-color: var(--accent); }
.pj-card.is-archived { opacity: .8; }
.pj-card.is-archived:hover { transform: none; box-shadow: none; }

.pj-top { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.pj-avatar {
  flex-shrink: 0; width: 38px; height: 38px; border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 600; text-transform: uppercase;
  color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.pj-heading { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.pj-title {
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3;
  color: var(--text); text-decoration: none; overflow-wrap: anywhere;
}
.pj-title::after { content: ''; position: absolute; inset: 0; border-radius: 14px; } /* whole card is clickable */
.pj-title:focus-visible { outline: none; }
.pj-title:focus-visible::after { outline: 2px solid var(--accent); outline-offset: 2px; }
.pj-client { font-size: 12px; color: var(--text-3); }

.pj-desc {
  font-size: 13px; line-height: 1.55; color: var(--text-2); margin: 0 0 16px; min-height: 40px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-wrap: pretty;
}
.pj-desc.is-empty { color: var(--text-3); }

.pj-progress { margin-top: auto; }
.pj-progress-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; margin-bottom: 8px; font-variant-numeric: tabular-nums; }
.pj-progress-row span:first-child { color: var(--text-2); }
.pj-progress-row span:last-child { color: var(--text); font-weight: 600; }
.pj-track { height: 6px; border-radius: 999px; background: var(--bg-4); overflow: hidden; }
.pj-fill {
  height: 100%; width: 100%; border-radius: 999px; background: var(--accent);
  transform-origin: left center; transition: transform .5s cubic-bezier(.22, 1, .36, 1);
}
.pj-fill.is-complete { background: var(--success, #10b981); }

.pj-footer {
  position: relative; z-index: 1; display: flex; justify-content: flex-end; gap: 4px;
  margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--border);
}
.pj-footer .btn { transition: background-color .2s ease, color .2s ease, transform .1s ease; }
.pj-footer .btn:active { transform: scale(.97); }

.pj-section-head {
  display: flex; align-items: center; gap: 10px; margin: 40px 0 16px; padding-bottom: 12px;
  border-bottom: 1px solid var(--border); font-size: 14px; font-weight: 600; color: var(--text-2);
}
.pj-count { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; color: var(--text-3); background: var(--bg-4); font-variant-numeric: tabular-nums; }

.pj-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px;
  padding: 64px 24px; border: 1px dashed var(--border); border-radius: 16px; color: var(--text-3);
}
.pj-empty h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--text); }
.pj-empty p { margin: 0; font-size: 13px; max-width: 36ch; }

.pj-skel { pointer-events: none; }
.pj-skel .bar { border-radius: 6px; background: var(--bg-4); }
.pj-skel, .pj-skel-inline { animation: pj-pulse 1.4s ease-in-out infinite; }
@keyframes pj-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

@media (prefers-reduced-motion: reduce) {
  .pj-card, .pj-fill, .pj-search input { transition: none; }
  .pj-skel, .pj-skel-inline { animation: none; }
}
`;

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
  // Delete rule: a project can only be deleted once all its tasks and subtasks are gone.
  const [deleteCheckId, setDeleteCheckId] = useState(null);
  const [deleteBlocked, setDeleteBlocked] = useState(null); // { name, taskCount }
  const [taskStats, setTaskStats] = useState({}); // { [projectId]: { total, done } | null }
  const [query, setQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadStats = async (list) => {
    const entries = await Promise.all(
      list.map(async (p) => {
        try {
          const { data } = await api.get(`/tasks/project/${p.id}`);
          return [p.id, computeStats(Array.isArray(data) ? data : [])];
        } catch {
          return [p.id, null];
        }
      })
    );
    setTaskStats(Object.fromEntries(entries));
  };

  const load = () =>
    api
      .get('/projects')
      .then((r) => {
        setProjects(r.data);
        loadStats(r.data); // background; cards show a skeleton until counts arrive
      })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

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
      title: 'Archive project',
      message: 'Archive this project? You can restore it later from the archived list.',
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
      title: 'Restore project',
      message: 'Restore this project to your active projects?',
      isDangerous: false,
      action: async () => {
        await api.patch(`/projects/${id}/unarchive`);
        load();
      },
      loading: false
    });
  };

  // A project can only be deleted when it has no tasks or subtasks left.
  const handleDelete = async (id) => {
    const project = projects.find((p) => p.id === id);

    setErrorMsg('');
    setDeleteCheckId(id);
    let taskCount = 0;
    try {
      const { data } = await api.get(`/tasks/project/${id}`);
      taskCount = Array.isArray(data) ? data.length : 0;
    } catch (error) {
      setErrorMsg("We couldn't check this project's tasks: " + (error.response?.data?.error || error.message));
      return;
    } finally {
      setDeleteCheckId(null);
    }

    if (taskCount > 0) {
      setDeleteBlocked({ name: project?.name || 'This project', taskCount });
      return;
    }

    setConfirmModal({
      show: true,
      title: 'Delete project',
      message: 'Are you sure you want to permanently delete this project? This action cannot be undone.',
      isDangerous: true,
      action: async () => {
        try {
          await api.delete(`/projects/${id}`);
          load();
        } catch (error) {
          setErrorMsg("We couldn't delete the project: " + (error.response?.data?.error || error.message));
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

  const q = query.trim().toLowerCase();
  const matches = (p) => !q || p.name?.toLowerCase().includes(q) || (p.client_name || '').toLowerCase().includes(q);
  const visibleActive = activeProjects.filter(matches);
  const visibleArchived = archivedProjects.filter(matches);

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="page-header">
          <div>
            <div className="page-title">Projects</div>
            <div className="page-subtitle">Loading projects…</div>
          </div>
        </div>
        <div className="page-body" aria-busy="true">
          <div className="pj-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="pj-card pj-skel" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="pj-top">
                  <div className="pj-avatar" style={{ background: 'var(--bg-4)' }} />
                  <div className="pj-heading" style={{ gap: 8 }}>
                    <div className="bar" style={{ height: 14, width: '60%' }} />
                    <div className="bar" style={{ height: 10, width: '35%' }} />
                  </div>
                </div>
                <div className="bar" style={{ height: 10, width: '90%', marginBottom: 8 }} />
                <div className="bar" style={{ height: 10, width: '70%', marginBottom: 24 }} />
                <div className="bar" style={{ height: 6, width: '100%' }} />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>

      <div className="page-header">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-subtitle">
            {activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}
            {archivedProjects.length > 0 ? ` · ${archivedProjects.length} archived` : ''}
          </div>
        </div>
        {isManager && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            + New project
          </button>
        )}
      </div>

      <main className="page-body">
        {errorMsg && (
          <div className="pj-alert" role="alert">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} aria-label="Dismiss message">×</button>
          </div>
        )}

        {projects.length > 0 && (
          <div className="pj-toolbar">
            <label className="pj-search">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="9" cy="9" r="6" /><path d="M14 14l3.5 3.5" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by project or client"
                aria-label="Search projects"
              />
            </label>
            {archivedProjects.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
                {showArchived ? 'Hide archived' : `Show archived (${archivedProjects.length})`}
              </button>
            )}
          </div>
        )}

        {/* Active projects */}
        {activeProjects.length === 0 ? (
          <div className="pj-empty">
            <h3>No active projects</h3>
            <p>{isManager ? 'Create your first project to start tracking tasks and progress.' : 'Projects you are added to will show up here.'}</p>
            {isManager && (
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setEditing(null); setShowModal(true); }}>
                + New project
              </button>
            )}
          </div>
        ) : visibleActive.length === 0 ? (
          <div className="pj-empty">
            <h3>No matches</h3>
            <p>Nothing matches “{query}”. Try a different project or client name.</p>
          </div>
        ) : (
          <section className="pj-grid" aria-label="Active projects">
            {visibleActive.map((p, i) => (
              <ProjectCard
                key={p.id}
                project={p}
                stats={taskStats[p.id]}
                isManager={isManager}
                onEdit={() => handleEdit(p)}
                editLoading={editLoadingId === p.id}
                onArchive={() => handleArchive(p.id)}
              />
            ))}
          </section>
        )}

        {/* Archived projects */}
        {showArchived && visibleArchived.length > 0 && (
          <section aria-label="Archived projects">
            <div className="pj-section-head">
              <span>Archived</span>
              <span className="pj-count">{visibleArchived.length}</span>
            </div>
            <div className="pj-grid">
              {visibleArchived.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  stats={taskStats[p.id]}
                  isManager={isManager}
                  archived
                  onUnarchive={() => handleUnarchive(p.id)}
                  onDelete={() => handleDelete(p.id)}
                  deleteLoading={deleteCheckId === p.id}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {showModal && (
        <Modal
          title={editing ? 'Edit project' : 'New project'}
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

      {/* Shown instead of the delete confirmation while the project still has tasks. */}
      {deleteBlocked && (
        <Modal title="Cannot delete project" onClose={() => setDeleteBlocked(null)}>
          <p className="mb-2 text-[13px] leading-relaxed text-[var(--text-2)]">
            <strong className="text-[var(--text)]">{deleteBlocked.name}</strong> still has{' '}
            {deleteBlocked.taskCount} {deleteBlocked.taskCount === 1 ? 'task' : 'tasks'} (including subtasks).
          </p>
          <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
            Delete all of its tasks and subtasks first. Once the project has none left, you can delete it.
          </p>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => setDeleteBlocked(null)}>
              Got it
            </button>
          </div>
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

function ProjectCard({ project: p, stats, isManager, onEdit, editLoading, onArchive, onUnarchive, onDelete, deleteLoading, archived }) {
  const percent = stats && stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const complete = stats && stats.total > 0 && stats.done === stats.total;

  return (
    <article className={`pj-card${archived ? ' is-archived' : ''}`}>
      <div className="pj-top">
        <span className="pj-avatar" aria-hidden="true">{(p.name || '?').trim().charAt(0)}</span>
        <div className="pj-heading">
          <Link to={`/projects/${p.id}`} className="pj-title">{p.name}</Link>
          <span className="pj-client">{p.client_name || 'No client'}</span>
        </div>
        <span className={`badge badge-${p.status}`}>{p.status?.replace('_', ' ')}</span>
      </div>

      <p className={`pj-desc${p.description ? '' : ' is-empty'}`}>
        {p.description || 'No description added.'}
      </p>

      {/* Progress: leaf tasks only (tasks without subtasks + all subtasks) */}
      {stats === undefined && (
        <div className="pj-progress pj-skel-inline" aria-hidden="true">
          <div className="pj-progress-row"><span style={{ opacity: 0 }}>.</span></div>
          <div className="pj-track" />
        </div>
      )}
      {stats && (
        <div className="pj-progress">
          <div className="pj-progress-row">
            <span>
              {stats.total === 0
                ? 'No tasks yet'
                : `${stats.done} of ${stats.total} ${stats.total === 1 ? 'task' : 'tasks'} done`}
            </span>
            {stats.total > 0 && <span>{percent}%</span>}
          </div>
          <div
            className="pj-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={`${p.name} progress`}
          >
            <div
              className={`pj-fill${complete ? ' is-complete' : ''}`}
              style={{ transform: `scaleX(${percent / 100})` }}
            />
          </div>
        </div>
      )}

      {isManager && (
        <div className="pj-footer">
          {!archived ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={onEdit} disabled={editLoading}>
                {editLoading ? <Loader label="Loading" size="sm" variant="button" /> : 'Edit'}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-3)' }} onClick={onArchive}>
                Archive
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={onUnarchive}>
                Restore
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete} disabled={deleteLoading}>
                {deleteLoading ? <Loader label="Checking" size="sm" variant="button" /> : 'Delete'}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}