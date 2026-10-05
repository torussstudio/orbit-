import { useId, useState } from 'react';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';
import Loader from '../ui/Loader';

/* ------------------------------------------------------------------ */
/* Shared class strings (Tailwind only, driven by your existing CSS    */
/* variables so the theme keeps working).                              */
/* ------------------------------------------------------------------ */

const labelCls = 'mb-1.5 block text-[13px] font-medium tracking-[-0.005em]';
const hintCls = 'mt-1.5 text-[11px] text-[color:var(--text-3)]';
const panelCls =
  'flex flex-col gap-4 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] p-4';
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-0';

const inputCls = [
  'w-full rounded-lg border border-[color:var(--border)] bg-transparent px-3 py-2.5 text-sm',
  'placeholder:text-[color:var(--text-3)]',
  'transition-colors duration-200 motion-reduce:transition-none',
  'hover:border-[color:var(--text-3)] focus:border-[color:var(--accent)]',
  focusRing,
  'aria-[invalid=true]:border-[color:var(--danger)]',
].join(' ');

const chipCls = [
  'flex select-none items-center gap-2 rounded-md border border-[color:var(--border)] py-1.5 pl-1.5 pr-3 text-[13px]',
  'transition duration-150 motion-reduce:transition-none',
  'hover:border-[color:var(--text-3)] active:scale-[0.98]',
  'peer-checked:border-[color:var(--accent)] peer-checked:bg-[var(--accent-glow)] peer-checked:font-medium',
  'peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--accent)]',
].join(' ');

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function ClockIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
}

function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[color:var(--danger)]">
      <AlertIcon />
      {children}
    </p>
  );
}

// Renders a real <label> when the control has an id, otherwise a plain
// text label (for custom controls like Select / DatePicker).
function Field({ label, htmlFor, optional = false, required = false, children }) {
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <div>
      <Tag htmlFor={htmlFor} className={labelCls}>
        {label}
        {required && <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>}
        {optional && <span className="ml-1 font-normal text-[color:var(--text-3)]">(optional)</span>}
      </Tag>
      {children}
    </div>
  );
}

// One picker used everywhere assignees are chosen (standalone create,
// edit, and subtask forms). Only one assignee is allowed per task, so
// picking a member replaces the current choice; clicking the selected
// member again clears it.
function AssigneePicker({ label, hint, required, members, selectedIds, onSelect, emptyMessage, error, errorId }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={error ? errorId : undefined}>
      <legend className={`${labelCls} p-0`}>
        {label}
        {required && <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>}
        {hint && <span className="ml-1.5 font-normal text-[color:var(--text-3)]">{hint}</span>}
      </legend>

      {members.length ? (
        <div className="flex flex-wrap gap-2">
          {members.map(m => (
            <label key={m.id} className="relative cursor-pointer">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={selectedIds.includes(m.id)}
                onChange={() => onSelect(m.id)}
              />
              <span className={chipCls}>
                <span className="grid h-5 w-5 place-items-center rounded bg-[var(--bg-3)] text-[10px] font-semibold uppercase" aria-hidden="true">
                  {m.name?.charAt(0)}
                </span>
                {m.name}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="rounded-md bg-[var(--bg-3)] p-2.5 text-xs text-[color:var(--text-3)]">{emptyMessage}</p>
      )}

      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */

export default function TaskForm({ initial, members, allMembers, clusters, stages, onSave, onCancel, hideCluster, saving = false, userRole, isSubtaskForm = false, emptyMembersMessage, hasExistingSubtasks = false }) {
  const uid = useId();
  const ids = {
    title: `${uid}-title`,
    titleError: `${uid}-title-error`,
    description: `${uid}-description`,
    assigneeError: `${uid}-assignee-error`,
     dueDateError: `${uid}-due-date-error`,
    timeTaken: `${uid}-time-taken`,
    timeTakenError: `${uid}-time-taken-error`,
  };

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
  const [titleError, setTitleError] = useState('');
  const [timeTakenError, setTimeTakenError] = useState('');
  const [assigneeError, setAssigneeError] = useState('');
  const [dueDateError, setDueDateError] = useState(''); 
  // Toggle only shown for a brand-new main task (not subtasks, not
  // editing an existing task). On = normal flow (subtasks handle their
  // own assignee/due date). Off = this task is standalone, so it needs
  // its own assignee(s) and due date right here.
  const [hasSubtasks, setHasSubtasks] = useState(true);

  // When editing an existing task, assignees + due date are editable here
  // only if the task is a sub task, or a main task with NO sub tasks
  // (standalone). A main task that has sub tasks derives both from them,
  // so those fields are hidden and excluded from the payload.
  const showEditFields =
    !isSubtaskForm &&
    !!initial &&
    (!!initial.parent_task_id || !hasExistingSubtasks);

  // Which flavour of the assignee + due date block to render, if any.
  const ownerMode = isSubtaskForm
    ? 'subtask'
    : (!initial && !hasSubtasks)
      ? 'standalone'
      : showEditFields
        ? 'edit'
        : null;

  const selectAssignee = (id) => {
    setForm(f => ({
      ...f,
      assignee_ids: f.assignee_ids.includes(id) ? [] : [id],
    }));
    setAssigneeError('');
  };

  // Flipping the subtask toggle changes which fields are "owned" by
  // this form (see the render logic + handleSave below). Any assignee
  // or due date picked under the old mode must not silently survive
  // into the new one, so clear both here rather than only filtering
  // them out at save time.
  const handleToggleSubtasks = () => {
    setHasSubtasks(v => !v);
    setForm(f => ({ ...f, assignee_ids: [], due_date: '' }));
    setAssigneeError('');
    setDueDateError('');
  };

  const isMovingToReview = form.stage === 'In Review' && initial?.stage === 'In Progress';

  const handleSave = () => {
    if (!form.title.trim()) {
      setTitleError('Enter a task title.');
      return;
    }

    // Sub tasks, and simple main tasks (subtasks disabled), must have
    // at least one assignee — there's no one to do the work otherwise.
    if ((isSubtaskForm || !hasSubtasks) && form.assignee_ids.length === 0) {
      setAssigneeError('Select an assignee.');
      return;
    }

    // Only one assignee is allowed per task. This applies only where
    // this form actually owns the assignees (same condition as the
    // payload block below). A main task that has sub tasks shows no
    // assignee field and derives them from its sub tasks, so it must
    // not be blocked by an error the user can't see or fix.
    const ownsAssignees = isSubtaskForm || !hasSubtasks || showEditFields;
    if (ownsAssignees && form.assignee_ids.length > 1) {
      setAssigneeError('Only one member can be assigned to a task. Select one assignee.');
      return;
    }

    if (isMovingToReview && (!form.time_taken || isNaN(form.time_taken) || parseInt(form.time_taken) <= 0)) {
      setTimeTakenError('Enter the time taken before moving to In Review.');
      return;
    }

    if (ownerMode && !form.due_date) {
  setDueDateError('Select a due date.');
  return;
}

    // assignee_ids and due_date are only "owned" by this form for:
    // sub tasks, simple main tasks (subtasks disabled), and existing
    // tasks where the edit fields are shown (sub tasks, or main tasks
    // without sub tasks). A main task that has sub tasks derives both
    // server-side from them, so they must be excluded here. Keep this
    // condition identical to the ones guarding the field blocks below.
    const { due_date, assignee_ids, ...rest } = form;
    const payload = { ...rest, title: form.title.trim(), time_taken: form.time_taken ? parseInt(form.time_taken) : null };
    if (ownsAssignees) {
      payload.assignee_ids = assignee_ids;
      // On edit the due date is sent only when it was picked again: the value
      // the form opened with is the API's UTC string, and sending that back
      // would store it 5 h 30 min (one day on screen) earlier.
      if (due_date && due_date !== (initial?.due_date || '')) payload.due_date = due_date;
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

  // The time taken field must be visible to anyone who can trigger the
  // validation above (previously only members could see it, so other
  // roles were blocked by an error with no field to fix).
  const showTimeTaken =
    form.stage === 'In Review' &&
    (initial?.stage === 'In Progress' ||
      (userRole === 'member' && initial?.stage === 'In Review' && !initial?.time_taken));

  const showTimeLogged = form.time_taken && initial?.stage === 'In Review' && initial?.time_taken;

  return (
    <form
      noValidate
      onSubmit={e => { e.preventDefault(); if (!saving) handleSave(); }}
      className="flex flex-col gap-5"
    >
      <Field label="Task title" htmlFor={ids.title} required>
        <input
          id={ids.title}
          className={inputCls}
          value={form.title}
          onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setTitleError(''); }}
          placeholder="What needs to be done?"
          aria-invalid={!!titleError}
          aria-describedby={titleError ? ids.titleError : undefined}
        />
        <FieldError id={ids.titleError}>{titleError}</FieldError>
      </Field>

      <Field label="Description" htmlFor={ids.description}>
        <textarea
          id={ids.description}
          className={`${inputCls} min-h-24 resize-y leading-relaxed`}
          value={form.description || ''}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Details, acceptance criteria, links"
        />
      </Field>

      {/* Subtask switch — only for creating a brand-new main task */}
      {!isSubtaskForm && !initial && (
        <div className={`${panelCls} flex-row items-center justify-between gap-4`}>
          <div>
            <span id={`${uid}-subtasks-label`} className="block text-[13px] font-medium">Enable subtasks</span>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-3)]">
              Turn off to give this task its own assignee and due date.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hasSubtasks}
            aria-labelledby={`${uid}-subtasks-label`}
            onClick={handleToggleSubtasks}
            className={[
              'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none',
              focusRing,
              hasSubtasks ? 'bg-[var(--accent)]' : 'bg-[var(--border)]',
            ].join(' ')}
          >
            <span
              className={[
                'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none',
                hasSubtasks ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
        </div>
      )}

      {/* Assignee + due date. Shown for: subtask forms, new standalone
          tasks (subtasks off), and existing sub tasks / main tasks
          without sub tasks. A main task that has sub tasks derives both
          from them, so nothing is shown. */}
      {ownerMode && (
        <div className={panelCls}>
          <AssigneePicker
            label="Assignee"
            required={ownerMode !== 'edit'}
            hint={ownerMode === 'subtask' ? "From the main task's team" : undefined}
            members={ownerMode === 'subtask' ? activeMembers : allActiveMembers}
            selectedIds={form.assignee_ids}
            onSelect={selectAssignee}
            emptyMessage={
              ownerMode === 'subtask'
                ? (emptyMembersMessage || 'No members are assigned to the main task yet. Assign members there first.')
                : 'No members available to assign.'
            }
            error={assigneeError}
            errorId={ids.assigneeError}
          />

          <Field label="Due date" required>
  <DatePicker
    value={form.due_date}
    onChange={val => {
      setForm(f => ({ ...f, due_date: val }));
      setDueDateError('');
    }}
    placeholder="dd-mm-yyyy"
  />
  <FieldError id={ids.dueDateError}>{dueDateError}</FieldError>
</Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Priority">
          <Select value={form.priority} onChange={val => setForm(f => ({ ...f, priority: val }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
        <Field label="Stage">
          <Select
            value={form.stage}
            onChange={val => { setForm(f => ({ ...f, stage: val })); setTimeTakenError(''); }}
          >
            {allowedStages.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </div>

      {!hideCluster && (
        <Field label="Cluster" optional>
          <Select value={form.cluster_id} onChange={val => setForm(f => ({ ...f, cluster_id: val }))} placeholder="No cluster">
            <option value="">No cluster</option>
            {clusters?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}

      {showTimeTaken && (
        <div className={panelCls}>
          <Field label="Time taken (minutes)" htmlFor={ids.timeTaken} required>
            <input
              id={ids.timeTaken}
              className={inputCls}
              type="number"
              inputMode="numeric"
              min="1"
              value={form.time_taken}
              onChange={e => { setForm(f => ({ ...f, time_taken: e.target.value })); setTimeTakenError(''); }}
              placeholder="e.g. 45"
              autoFocus
              aria-invalid={!!timeTakenError}
              aria-describedby={timeTakenError ? ids.timeTakenError : `${ids.timeTaken}-hint`}
            />
            <p id={`${ids.timeTaken}-hint`} className={hintCls}>
              How long did this task take to reach In Review?
            </p>
            <FieldError id={ids.timeTakenError}>{timeTakenError}</FieldError>
          </Field>
        </div>
      )}

      {showTimeLogged && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-3)] px-3.5 py-2.5 text-[13px] text-[color:var(--accent)]">
          <ClockIcon />
          <span>Time logged: <strong className="font-semibold tabular-nums">{form.time_taken} min</strong></span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={[
            'rounded-lg px-4 py-2 text-sm font-medium text-[color:var(--text-3)]',
            'transition duration-150 motion-reduce:transition-none',
            'hover:bg-[var(--bg-3)] active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            focusRing,
          ].join(' ')}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className={[
            'inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white',
            'transition duration-150 motion-reduce:transition-none',
            'hover:brightness-110 active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            focusRing,
          ].join(' ')}
        >
          {saving ? <Loader label="Saving..." size="sm" variant="button" /> : 'Save task'}
        </button>
      </div>
    </form>
  );
}