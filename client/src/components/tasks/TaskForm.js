
import { useState } from 'react';
import Select from '../ui/Select';

export default function TaskForm({ initial, members, clusters, stages, onSave, onCancel, hideCluster, saving = false, userRole, isSubtaskForm = false, emptyMembersMessage }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || initial?.details || initial?.desc || '',
    // Multi-assignee: seed from the new `assignees` array when present,
    // falling back to the old single `assignee_id` for any task that
    // hasn't been touched since the upgrade.
    assignee_ids: initial?.assignees?.length
      ? initial.assignees.map(a => a.id)
      : (initial?.assignee_id ? [initial.assignee_id] : []),
    priority: initial?.priority || 'medium',
    stage: initial?.stage || stages[0] || 'Todo',
    cluster_id: initial?.cluster_id || '',
    time_taken: initial?.time_taken || '',
  });
  const [timeTakenError, setTimeTakenError] = useState('');
  const [assigneeError, setAssigneeError] = useState('');

  const toggleAssignee = (id) => {
    setForm(f => ({
      ...f,
      assignee_ids: f.assignee_ids.includes(id)
        ? f.assignee_ids.filter(x => x !== id)
        : [...f.assignee_ids, id],
    }));
    setAssigneeError('');
  };

  const handleSave = () => {
    // Sub tasks must have at least one assignee — there's no one to do
    // the work otherwise.
    if (isSubtaskForm && form.assignee_ids.length === 0) {
      setAssigneeError('Please select at least one assignee.');
      return;
    }
    const isMovingToReview = form.stage === 'In Review' && initial?.stage === 'In Progress';
    if (isMovingToReview && (!form.time_taken || isNaN(form.time_taken) || parseInt(form.time_taken) <= 0)) {
      setTimeTakenError('Please enter time taken before moving to In Review.');
      return;
    }
    // Due date is no longer set from this form — it's either derived
    // server-side from subtasks, or left untouched for tasks without
    // subtasks. Don't send a due_date key at all.
    const payload = { ...form, time_taken: form.time_taken ? parseInt(form.time_taken) : null };
    onSave(payload);
  };

  // AFTER
  const allowedStages = userRole === 'member'
    ? (initial ? stages.filter(s => s !== 'Done') : stages.filter(s => s !== 'Done' && s !== 'In Review'))
    : stages;

  const activeMembers = members?.filter(m => m.active).sort((a, b) => a.name.localeCompare(b.name)) || [];

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

      {isSubtaskForm && (
        <div className="form-group">
          <label className="form-label">
            Assignees <span style={{ color: 'var(--danger)' }}>*</span>
            <span style={{ fontWeight: 400, color: 'var(--text-3)' }}> (from the main task's team)</span>
          </label>
          {activeMembers.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {activeMembers.map(m => (
                <label
                  key={m.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '6px',
                    cursor: 'pointer', border: '1px solid',
                    borderColor: form.assignee_ids.includes(m.id) ? 'var(--accent)' : 'var(--border)',
                    background: form.assignee_ids.includes(m.id) ? 'var(--accent-glow)' : 'transparent',
                    fontSize: '13px',
                  }}
                >
                  <input type="checkbox" checked={form.assignee_ids.includes(m.id)} onChange={() => toggleAssignee(m.id)} style={{ display: 'none' }} />
                  {m.name}
                </label>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-3)', padding: '10px', background: 'var(--bg-3)', borderRadius: '6px' }}>
              {emptyMembersMessage
                ? emptyMembersMessage
                : 'No members are assigned to the main task yet — assign members there first.'}
            </div>
          )}
          {assigneeError && (
            <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '6px' }}>⚠ {assigneeError}</div>
          )}
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Priority</label>
          <Select value={form.priority} onChange={val => setForm(f => ({ ...f, priority: val }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Stage</label>
          <Select value={form.stage} onChange={val => setForm(f => ({ ...f, stage: val }))}>
           {allowedStages.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
      </div>
      {!hideCluster && (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Cluster (optional)</label>
            <Select value={form.cluster_id} onChange={val => setForm(f => ({ ...f, cluster_id: val }))} placeholder="No cluster">
              <option value="">No cluster</option>
              {clusters?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
      )}
      {userRole === 'member' && (form.stage === 'In Review' && (initial?.stage === 'In Progress' || (initial?.stage === 'In Review' && !initial?.time_taken))) && (
        <div className="form-group" style={{ background: 'var(--bg-3)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⏱</span>
            <span>Time Taken (minutes) <span style={{ color: 'var(--danger)' }}>*</span></span>
          </label>
          <input
            className="form-input"
            type="number"
            min="1"
            value={form.time_taken}
            onChange={e => { setForm(f => ({ ...f, time_taken: e.target.value })); setTimeTakenError(''); }}
            placeholder="e.g. 45"
            autoFocus
          />
          <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px' }}>
            How long did this subtask take to reach In Review?
          </div>
          {timeTakenError && (
            <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '6px', padding: '6px 10px', background: 'rgba(248,113,113,0.1)', borderRadius: '4px' }}>
              ⚠ {timeTakenError}
            </div>
          )}
        </div>
      )}

      {form.time_taken && initial?.stage === 'In Review' && initial?.time_taken && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--bg-3)', borderRadius: '8px', fontSize: '13px', color: 'var(--accent)' }}>
          <span>⏱</span>
          <span>Time logged: <strong>{form.time_taken} min</strong></span>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving && <span className="btn-spinner" />}
          {saving ? 'Saving...' : 'Save Task'}
        </button>
      </div>
    </>
  );
}