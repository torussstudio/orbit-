import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, isOverdue } from '../utils/helpers';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import TaskForm from '../components/tasks/TaskForm';

const PRIORITY_COLORS = { low: 'var(--accent)', medium: 'var(--warning)', high: 'var(--danger)', critical: 'var(--critical)' };

export default function Tasks({ project: propProject }) {
  const params = useParams();
  const projectId = propProject?.id || params.id;
  const { isManager } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState('board');
  const [members, setMembers] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [showSubTaskModal, setShowSubTaskModal] = useState(false);
  const [subTaskParent, setSubTaskParent] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null, loading: false });

  const stages = propProject?.custom_stages || ["Todo","In Progress","In Review","Done"];

  const load = () => {
    Promise.all([
      api.get(`/tasks/project/${projectId}`),
      api.get('/members'),
      api.get(`/clusters/project/${projectId}`)
    ]).then(([t, m, c]) => {
      setTasks(t.data); setMembers(m.data); setClusters(c.data);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { if (projectId) load(); }, [projectId]);

  const handleSave = async (data) => {
    if (editing) await api.put(`/tasks/${editing.id}`, data);
    else await api.post('/tasks', { ...data, project_id: projectId });
    setShowModal(false); setEditing(null); load();
  };

  const handleSubTaskSave = async (data) => {
    await api.post('/tasks', { ...data, project_id: projectId, parent_task_id: subTaskParent.id });
    setShowSubTaskModal(false); setSubTaskParent(null); load();
  };

  const handleDelete = (id) => {
    setDeleteConfirm({ show: true, id, loading: false });
  };

  const confirmDelete = async () => {
    setDeleteConfirm(prev => ({ ...prev, loading: true }));
    try {
      await api.delete(`/tasks/${deleteConfirm.id}`);
      load();
    } finally {
      setDeleteConfirm({ show: false, id: null, loading: false });
    }
  };

  if (loading) return <div style={{ padding: '24px' }}><div className="spinner" /></div>;

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn btn-ghost btn-sm ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')} style={view === 'board' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}>Board</button>
          <button className={`btn btn-ghost btn-sm ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} style={view === 'list' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}>List</button>
        </div>
        {isManager && <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowModal(true); }}>+ Add Task</button>}
      </div>

      {view === 'board'
        ? <BoardView tasks={tasks} stages={stages} projectId={projectId} onEdit={t => { setEditing(t); setShowModal(true); }} onDelete={handleDelete} onUpdate={load} isManager={isManager} onAddSubTask={t => { setSubTaskParent(t); setShowSubTaskModal(true); }} />
        : <ListView tasks={tasks} projectId={projectId} onEdit={t => { setEditing(t); setShowModal(true); }} onDelete={handleDelete} isManager={isManager} onAddSubTask={t => { setSubTaskParent(t); setShowSubTaskModal(true); }} />
      }

      {showModal && (
        <Modal title={editing ? 'Edit Task' : 'New Task'} onClose={() => { setShowModal(false); setEditing(null); }}>
          <TaskForm initial={editing} members={members} clusters={clusters} stages={stages} onSave={handleSave} onCancel={() => { setShowModal(false); setEditing(null); }} />
        </Modal>
      )}

      {showSubTaskModal && subTaskParent && (
        <Modal title={`Sub Task — ${subTaskParent.title}`} onClose={() => { setShowSubTaskModal(false); setSubTaskParent(null); }}>
          <TaskForm members={members} clusters={clusters} stages={stages} onSave={handleSubTaskSave} onCancel={() => { setShowSubTaskModal(false); setSubTaskParent(null); }} hideCluster />
        </Modal>
      )}

      <ConfirmModal 
        isOpen={deleteConfirm.show}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ show: false, id: null, loading: false })}
        loading={deleteConfirm.loading}
      />
    </div>
  );
}

function BoardView({ tasks, stages, projectId, onEdit, onDelete, onUpdate, isManager, onAddSubTask }) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(null);

   const handleDrop = async (taskId, newStage) => {
    const id = parseInt(taskId) || taskId;
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    if (task.stage === newStage) return;
    const managerOnly = ['Done'];
    if (user.role === 'member' && managerOnly.includes(newStage)) return;
    try {
      await api.put(`/tasks/${task.id}`, { ...task, stage: newStage });
      onUpdate();
    } catch (e) {
      console.error('Drop failed:', e);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '12px' }}>
      {stages.map(stage => {
        const stageTasks = tasks.filter(t => t.stage === stage);
        return (
          // AFTER
          <div key={stage} style={{ minWidth: '290px', width: '290px', borderRadius: '10px', padding: '8px', transition: 'background 0.2s', background: dragOver === stage ? 'var(--bg-3)' : 'transparent' }}
            onDragOver={e => { e.preventDefault(); setDragOver(stage); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => { e.preventDefault(); setDragOver(null); handleDrop(e.dataTransfer.getData('taskId'), stage); }}>
            <div
style={{ display: 'flex', justifyContent: 'start', alignItems: 'center', marginBottom: '8px', flexDirection: 'row-reverse', gap: '15px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-2)' }}>{stage}</span>
              <span style={{ fontSize: '11px', background: 'var(--bg-4)', borderRadius: '10px', padding: '1px 7px', color: 'var(--text-3)' }}>{stageTasks.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '80px' }}>
              {stageTasks.map(t => (
                <TaskCard key={t.id} task={t} projectId={projectId} onEdit={onEdit} onDelete={onDelete} isManager={isManager} onAddSubTask={onAddSubTask} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ task, projectId, onEdit, onDelete, isManager, onAddSubTask }) {
  const overdue = isOverdue(task.due_date, task.stage);
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('taskId', String(task.id)); e.dataTransfer.effectAllowed = 'move'; }}
      className="card" style={{ padding: '12px', cursor: 'grab', borderColor: overdue ? 'rgba(248,113,113,0.3)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <Link to={`/projects/${projectId}/tasks/${task.id}`} style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none', fontWeight: 500, lineHeight: 1.4, flex: 1 }}>{task.title}</Link>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: PRIORITY_COLORS[task.priority], marginLeft: '8px', flexShrink: 0, marginTop: '3px' }} title={task.priority} />
      </div>
      {task.cluster_name && <div style={{ fontSize: '10px', color: 'var(--accent)', marginBottom: '4px' }}>📦 {task.cluster_name}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        {task.assignee_name ? <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>👤 {task.assignee_name}</span> : <span />}
        {task.due_date && <span style={{ fontSize: '10px', color: overdue ? 'var(--danger)' : 'var(--text-3)' }}>{overdue ? '⚠ ' : ''}{formatDate(task.due_date)}</span>}
      </div>
      {isManager && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={() => onEdit(task)}>Edit</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--accent)' }} onClick={() => onAddSubTask(task)}>Sub Task</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--danger)' }} onClick={() => onDelete(task.id)}>Del</button>
        </div>
      )}
    </div>
  );
}

function ListView({ tasks, projectId, onEdit, onDelete, isManager, onAddSubTask }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Stage</th><th>Due</th>{isManager && <th>Actions</th>}</tr></thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '32px' }}>No tasks yet</td></tr>}
            {tasks.map(t => {
              const overdue = isOverdue(t.due_date, t.stage);
              return (
                <tr key={t.id} className={overdue ? 'overdue' : ''}>
                  <td><Link to={`/projects/${projectId}/tasks/${t.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{t.title}</Link></td>
                  <td style={{ color: 'var(--text-2)' }}>{t.assignee_name || '—'}</td>
                  <td><span className={`badge badge-${t.priority}`}>{t.priority}</span></td>
                  <td><span className={`badge badge-${t.stage?.toLowerCase().replace(/\s/g,'')}`}>{t.stage}</span></td>
                  <td style={{ color: overdue ? 'var(--danger)' : 'var(--text-2)' }}>{formatDate(t.due_date)}</td>
                  {isManager && <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => onEdit(t)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => onAddSubTask(t)}>Sub Task</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => onDelete(t.id)}>Del</button>
                    </div>
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
