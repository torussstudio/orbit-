import { useState } from 'react';
import Select from '../ui/Select';

const DEFAULT_STAGES = ["Todo","In Progress","In Review","Done"];

export default function ProjectForm({ initial, onSave, onCancel, saving = false }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    client_name: initial?.client_name || '',
    description: initial?.description || '',
    status: initial?.status || 'active',
    start_date: initial?.start_date || '',
    custom_stages: initial?.custom_stages || [...DEFAULT_STAGES],
  });
  const [newStage, setNewStage] = useState('');

  const addStage = () => {
    if (newStage.trim() && !form.custom_stages.includes(newStage.trim())) {
      setForm(f => ({ ...f, custom_stages: [...f.custom_stages, newStage.trim()] }));
      setNewStage('');
    }
  };

  const removeStage = s => setForm(f => ({ ...f, custom_stages: f.custom_stages.filter(x => x !== s) }));

  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Project Name *</label>
          <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Project" required />
        </div>
        <div className="form-group">
          <label className="form-label">Client Name</label>
          <input className="form-input" value={form.client_name || ''} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Acme Corp" />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Project overview..." />
      </div>
      <div className="form-group">
        <label className="form-label">Status</label>
        <Select value={form.status} onChange={val => setForm(f => ({ ...f, status: val }))}>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
        </Select>
      </div>

      <div className="form-group">
        <label className="form-label">Task Stages</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {form.custom_stages.map(s => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '12px', background: 'var(--bg-4)', fontSize: '12px' }}>
              {s}
              {!DEFAULT_STAGES.includes(s) && <button onClick={() => removeStage(s)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>×</button>}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input className="form-input" value={newStage} onChange={e => setNewStage(e.target.value)} placeholder="Add custom stage..." onKeyDown={e => e.key === 'Enter' && addStage()} style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={addStage}>Add</button>
        </div>  
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving}>
          {saving ? 'Saving...' : 'Save Project'}
        </button>
      </div>
    </>
  );
}