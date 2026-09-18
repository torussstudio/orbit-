import { useState } from 'react';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';
import Loader from '../ui/Loader';

export default function TaskForm({ initial, members, allMembers, clusters, stages, onSave, onCancel, hideCluster, saving = false, userRole, isSubtaskForm = false, emptyMembersMessage }) {
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
    due_date: initial?.due_date || '',
  });
  const [timeTakenError, setTimeTakenError] = useState('');
  const [assigneeError, setAssigneeError] = useState('');
  // Toggle only shown for a brand-new main task (not subtasks, not
  // editing an existing task). On = normal flow (subtasks handle their
  // own assignee/due date). Off = this task is standalone, so it needs
  // its own assignee(s) and due date right here.
  const [hasSubtasks, setHasSubtasks] = useState(true);

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
    // Sub tasks, and simple main tasks (subtasks disabled), must have
    // at least one assignee — there's no one to do the work otherwise.
    if ((isSubtaskForm || !hasSubtasks) && form.assignee_ids.length === 0) {
      setAssigneeError('Please select at least one assignee.');
      return;
    }
    const isMovingToReview = form.stage === 'In Review' && initial?.stage === 'In Progress';
    if (isMovingToReview && (!form.time_taken || isNaN(form.time_taken) || parseInt(form.time_taken) <= 0)) {
      setTimeTakenError('Please enter time taken before moving to In Review.');
      return;
    }
    // Due date is sent for sub tasks, for simple main tasks with
    // subtasks disabled, and when editing an existing main task
    // (its due date field is shown then too) — a *new* main task
    // with subtasks enabled still derives its due date server-side
    // from its sub tasks, so it's excluded here.
    const { due_date, ...rest } = form;
    const payload = { ...rest, time_taken: form.time_taken ? parseInt(form.time_taken) : null };
    if ((isSubtaskForm || !hasSubtasks || initial) && due_date) {
      payload.due_date = due_date;
    }
    onSave(payload);
  };

  const allowedStages = userRole === 'member'
    ? (initial ? stages.filter(s => s !== 'Done') : stages.filter(s => s !== 'Done' && s !== 'In Review'))
    : stages;

  const activeMembers = members?.filter(m => m.active).sort((a, b) => a.name.localeCompare(b.name)) || [];
  // Standalone tasks (subtasks disabled) aren't tied to project
  // membership, so they can be assigned to any active member in Orbit.
  const allActiveMembers = (allMembers || members)?.filter(m => m.active).sort((a, b) => a.name.localeCompare(b.name)) || [];

  // Shared chip styling for both assignee lists, kept in one place so
  // both blocks stay visually identical.
  const chipStyle = (selected) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    borderRadius: '7px',
    cursor: 'pointer',
    border: '1px solid',
    borderColor: selected ? 'var(--accent)' : 'var(--border)',
    background: selected ? 'var(--accent-glow)' : 'transparent',
    fontSize: '13px',
    transition: 'border-color 0.15s ease, background 0.15s ease',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Task Title *</label>
        <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" required />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Description</label>
        <textarea className="form-textarea" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Details, acceptance criteria, links..." />
      </div>

      {/* Subtask toggle — only for creating a brand-new main task */}
      {!isSubtaskForm && !initial && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '12px 14px',
            background: 'var(--bg-3)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <div>
            <label className="form-label" style={{ margin: 0 }}>Enable Subtask</label>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
              Off means this task needs its own assignee and due date below
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHasSubtasks(v => !v)}
            className={`btn btn-sm ${hasSubtasks ? 'btn-primary' : 'btn-ghost'}`}
          >
            {hasSubtasks ? 'On' : 'Off'}
          </button>
        </div>
      )}

      {/* Standalone task fields — shown only when subtasks are disabled */}
      {!isSubtaskForm && !hasSubtasks && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '14px',
            background: 'var(--bg-3)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0 }}>
              Assignees <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            {allActiveMembers.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {allActiveMembers.map(m => (
                  <label key={m.id} style={chipStyle(form.assignee_ids.includes(m.id))}>
                    <input type="checkbox" checked={form.assignee_ids.includes(m.id)} onChange={() => toggleAssignee(m.id)} style={{ display: 'none' }} />
                    {m.name}
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-3)', padding: '10px', background: 'var(--bg-2, var(--bg-3))', borderRadius: '6px' }}>
                No members available to assign.
              </div>
            )}
            {assigneeError && (
              <div style={{ color: 'var(--danger)', fontSize: '12px' }}>⚠ {assigneeError}</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0 }}>Due Date</label>
            <DatePicker
              value={form.due_date}
              onChange={val => setForm(f => ({ ...f, due_date: val }))}
              placeholder="dd-mm-yyyy"
            />
          </div>
        </div>
      )}

      {/* Editing an existing main task that has subtasks enabled:
          assignees and due date are editable here too. */}
      {!isSubtaskForm && initial && hasSubtasks && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '14px',
            background: 'var(--bg-3)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0 }}>Assignees</label>
            {allActiveMembers.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {allActiveMembers.map(m => (
                  <label key={m.id} style={chipStyle(form.assignee_ids.includes(m.id))}>
                    <input type="checkbox" checked={form.assignee_ids.includes(m.id)} onChange={() => toggleAssignee(m.id)} style={{ display: 'none' }} />
                    {m.name}
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-3)', padding: '10px', background: 'var(--bg-2, var(--bg-3))', borderRadius: '6px' }}>
                No members available to assign.
              </div>
            )}
            {assigneeError && (
              <div style={{ color: 'var(--danger)', fontSize: '12px' }}>⚠ {assigneeError}</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0 }}>Due Date</label>
            <DatePicker
              value={form.due_date}
              onChange={val => setForm(f => ({ ...f, due_date: val }))}
              placeholder="dd-mm-yyyy"
            />
          </div>
        </div>
      )}

      {isSubtaskForm && (
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">
            Assignees <span style={{ color: 'var(--danger)' }}>*</span>
            <span style={{ fontWeight: 400, color: 'var(--text-3)' }}> (from the main task's team)</span>
          </label>
          {activeMembers.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {activeMembers.map(m => (
                <label key={m.id} style={chipStyle(form.assignee_ids.includes(m.id))}>
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
          <div className="form-group" style={{ marginTop: '14px', marginBottom: 0 }}>
            <label className="form-label">Due Date</label>
            <DatePicker
              value={form.due_date}
              onChange={val => setForm(f => ({ ...f, due_date: val }))}
              placeholder="dd-mm-yyyy"
            />
          </div>
        </div>
      )}

      <div className="form-row" style={{ marginBottom: 0 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Priority</label>
          <Select value={form.priority} onChange={val => setForm(f => ({ ...f, priority: val }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Stage</label>
          <Select value={form.stage} onChange={val => setForm(f => ({ ...f, stage: val }))}>
            {allowedStages.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
      </div>

      {!hideCluster && (
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cluster (optional)</label>
            <Select value={form.cluster_id} onChange={val => setForm(f => ({ ...f, cluster_id: val }))} placeholder="No cluster">
              <option value="">No cluster</option>
              {clusters?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
      )}

      {userRole === 'member' && (form.stage === 'In Review' && (initial?.stage === 'In Progress' || (initial?.stage === 'In Review' && !initial?.time_taken))) && (
        <div style={{ background: 'var(--bg-3)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
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
            style={{ marginTop: '8px' }}
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
          {saving ? <Loader label="Saving..." size="sm" variant="button" /> : 'Save Task'}
        </button>
      </div>
    </div>
  );
}