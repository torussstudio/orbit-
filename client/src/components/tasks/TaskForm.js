import { useState } from 'react';

export default function TaskForm({ initial, members, clusters, stages, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    assignee_id: initial?.assignee_id || '',
    priority: initial?.priority || 'medium',
    stage: initial?.stage || stages[0] || 'Todo',
    due_date: initial?.due_date || '',
    cluster_id: initial?.cluster_id || '',
  });

  return (
    <>
      <div className="form-group">
        <label className="form-label">Task Title *</label>
        <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" required />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Details, acceptance criteria, links..." />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Assignee</label>
          <select className="form-select" value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}>
            <option value="">Unassigned</option>
            {members?.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Priority</label>
          <select className="form-select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Stage</label>
          <select className="form-select" value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Due Date</label>
          <input className="form-input" type="date" value={form.due_date || ''} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Cluster (optional)</label>
        <select className="form-select" value={form.cluster_id} onChange={e => setForm(f => ({ ...f, cluster_id: e.target.value }))}>
          <option value="">No cluster</option>
          {clusters?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(form)}>Save Task</button>
      </div>
    </>
  );
}
