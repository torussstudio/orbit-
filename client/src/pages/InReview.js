import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import DatePicker from '../components/ui/DatePicker';

export default function InReview() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [reworkModal, setReworkModal] = useState({ show: false, subtask: null });
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    if (!isManager) { navigate('/'); return; }
    load();
  }, []);

  const load = () => {
    api.get('/tasks/in-review/all')
      .then(r => setSubtasks(r.data))
      .finally(() => setLoading(false));
  };

  const handleMarkDone = async (subtask) => {
    setActionLoading(subtask.id + '_done');
    try {
      await api.put(`/tasks/${subtask.id}`, { ...subtask, stage: 'Done', time_taken: null });
      load();
    } finally { setActionLoading(null); }
  };

  const [reworkDeadline, setReworkDeadline] = useState('');

  const handleRework = async () => {
    const { subtask } = reworkModal;
    setActionLoading(subtask.id + '_rework');
    try {
      await api.put(`/tasks/${subtask.id}`, { ...subtask, stage: 'Rework', time_taken: null, new_due_date: reworkDeadline || null });
      setReworkModal({ show: false, subtask: null });
      setReworkDeadline('');
      load();
    } finally { setActionLoading(null); }
  };

  const projects = [...new Set(subtasks.map(s => s.project_name))];

  const filtered = subtasks
    .filter(s => filter === 'all' || s.project_name === filter)
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.updated_at) - new Date(a.updated_at);
      if (sort === 'oldest') return new Date(a.updated_at) - new Date(b.updated_at);
      if (sort === 'rework') return (b.rework_count || 0) - (a.rework_count || 0);
      if (sort === 'time') return (b.time_taken || 0) - (a.time_taken || 0);
      return 0;
    });

  const mainTasks = filtered.filter(s => !s.parent_task_id);
  const subTasks = filtered.filter(s => s.parent_task_id);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">In Review</div>
          <div className="page-subtitle">
            {mainTasks.length} task{mainTasks.length !== 1 ? 's' : ''} · {subTasks.length} subtask{subTasks.length !== 1 ? 's' : ''} awaiting review
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 600 }}>PROJECT</span>
            <select className="form-select" style={{ fontSize: '12px', padding: '4px 10px', height: '32px' }}
              value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All Projects</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 600 }}>SORT</span>
            <select className="form-select" style={{ fontSize: '12px', padding: '4px 10px', height: '32px' }}
              value={sort} onChange={e => setSort(e.target.value)}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="rework">Most Reworks</option>
              <option value="time">Most Time</option>
            </select>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-3)' }}>
            {filtered.length} of {subtasks.length} items
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>All clear!</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>No tasks are currently in review.</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Type</th>
                  <th>Project</th>
                  <th>Parent Task</th>
                  <th>Assignee</th>
                  <th>Time</th>
                  <th>Reworks</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td>
                      <Link
                        to={`/projects/${s.project_id}/tasks/${s.id}`}
                        style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500, fontSize: '13px' }}>
                        {s.title}
                      </Link>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
                        background: s.parent_task_id ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)',
                        color: s.parent_task_id ? 'var(--accent)' : 'var(--success)'
                      }}>
                        {s.parent_task_id ? 'Sub Task' : 'Task'}
                      </span>
                    </td>
                    <td>
                      <Link to={`/projects/${s.project_id}`}
                        style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}>
                        {s.project_name}
                      </Link>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-2)' }}>{s.parent_task_title || '—'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-2)' }}>{s.assignee_name || 'Unassigned'}</td>
                    <td>
                      {s.time_taken
                        ? <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>⏱ {s.time_taken} min</span>
                        : <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td>
                      {s.rework_count > 0
                        ? <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}>↺ {s.rework_count}</span>
                        : <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                      {new Date(s.updated_at).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '11px', color: 'var(--success)', borderColor: 'var(--success)' }}
                          disabled={actionLoading === s.id + '_done'}
                          onClick={() => handleMarkDone(s)}>
                          {actionLoading === s.id + '_done' ? '...' : '✓ Done'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '11px', color: 'var(--danger)' }}
                          disabled={actionLoading === s.id + '_rework'}
                          onClick={() => setReworkModal({ show: true, subtask: s })}>
                          ↺ Rework
                        </button>
                        <Link
                          to={`/projects/${s.project_id}/tasks/${s.id}`}
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '11px' }}>
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reworkModal.show && (
        <Modal title="Move to Rework?" onClose={() => setReworkModal({ show: false, subtask: null })}>
          <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>↺</div>
            <p style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, marginBottom: '8px' }}>
              Move "{reworkModal.subtask?.title}" to Rework?
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
              This will mark the {reworkModal.subtask?.parent_task_id ? 'subtask' : 'task'} as needing rework and increment its rework counter.
            </p>
          </div>
          <div className="form-group" style={{ background: 'var(--bg-3)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '4px' }}>
            <label className="form-label">New Deadline (optional)</label>
            <DatePicker value={reworkDeadline} onChange={val => setReworkDeadline(val)} placeholder="dd-mm-yyyy" />
            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px' }}>Set a new due date for the rework cycle</div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => { setReworkModal({ show: false, subtask: null }); setReworkDeadline(''); }}>Cancel</button>
            <button className="btn btn-primary"
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={handleRework}
              disabled={!!actionLoading}>
              ↺ Move to Rework
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}