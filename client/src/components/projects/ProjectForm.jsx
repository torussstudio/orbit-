import { useId, useState } from 'react';
import Loader from '../ui/Loader';

const DEFAULT_STAGES = ["Todo", "In Progress", "In Review", "Done"];

const STATUSES = [
  { value: 'active', label: 'Active', dot: 'bg-[#10b981]' },
  { value: 'on_hold', label: 'On hold', dot: 'bg-[#f59e0b]' },
  { value: 'completed', label: 'Completed', dot: 'bg-[#3b82f6]' },
];

/* ------------------------------------------------------------------ */
/* Shared class strings (Tailwind only, driven by your CSS variables). */
/* Kept identical to TaskForm so both forms look the same.             */
/* ------------------------------------------------------------------ */

const labelCls = 'mb-1.5 block text-[13px] font-medium tracking-[-0.005em]';
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

// Dot colours for the built-in stages (same palette as the task page).
// Custom stages use the accent colour.
const STAGE_DOT = {
  Todo: 'bg-[#a78bfa]',
  'In Progress': 'bg-[#f59e0b]',
  'In Review': 'bg-[#3b82f6]',
  Done: 'bg-[#10b981]',
};

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function AlertIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
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

function Field({ label, htmlFor, optional = false, required = false, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
        {required && <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>}
        {optional && <span className="ml-1 font-normal text-[color:var(--text-3)]">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ProjectForm({ initial, onSave, onCancel, saving = false }) {
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    nameError: `${uid}-name-error`,
    client: `${uid}-client`,
    description: `${uid}-description`,
    statusLabel: `${uid}-status-label`,
    stagesLabel: `${uid}-stages-label`,
    newStage: `${uid}-new-stage`,
    stageError: `${uid}-stage-error`,
    stageHint: `${uid}-stage-hint`,
  };

  const [form, setForm] = useState({
    name: initial?.name || '',
    client_name: initial?.client_name || '',
    description: initial?.description || '',
    status: initial?.status || 'active',
    start_date: initial?.start_date || '',
    // An empty array is truthy, so check the length: a project saved with
    // no stages should fall back to the defaults, not render an empty board.
    custom_stages: initial?.custom_stages?.length ? initial.custom_stages : [...DEFAULT_STAGES],
  });
  const [newStage, setNewStage] = useState('');
  const [nameError, setNameError] = useState('');
  const [stageError, setStageError] = useState('');

  const addStage = () => {
    const value = newStage.trim();
    if (!value) return;
    // Case-insensitive, so "review" and "Review" can't both exist.
    if (form.custom_stages.some(s => s.toLowerCase() === value.toLowerCase())) {
      setStageError(`"${value}" is already a stage.`);
      return;
    }
    setForm(f => ({ ...f, custom_stages: [...f.custom_stages, value] }));
    setNewStage('');
    setStageError('');
  };

  const removeStage = (s) =>
    setForm(f => ({ ...f, custom_stages: f.custom_stages.filter(x => x !== s) }));

  const handleSave = () => {
    if (!form.name.trim()) {
      setNameError('Enter a project name.');
      return;
    }
    onSave({
      ...form,
      name: form.name.trim(),
      client_name: form.client_name?.trim() || '',
    });
  };

  const stageCount = form.custom_stages.length;

  return (
    <form
      noValidate
      onSubmit={e => { e.preventDefault(); if (!saving) handleSave(); }}
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Project name" htmlFor={ids.name} required>
          <input
            id={ids.name}
            className={inputCls}
            value={form.name}
            onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameError(''); }}
            placeholder="Website redesign"
            autoFocus
            aria-invalid={!!nameError}
            aria-describedby={nameError ? ids.nameError : undefined}
          />
          <FieldError id={ids.nameError}>{nameError}</FieldError>
        </Field>

        <Field label="Client name" htmlFor={ids.client} optional>
          <input
            id={ids.client}
            className={inputCls}
            value={form.client_name || ''}
            onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
            placeholder="Kerala Tourism Board"
          />
        </Field>
      </div>

      <Field label="Description" htmlFor={ids.description}>
        <textarea
          id={ids.description}
          rows={3}
          className={`${inputCls} min-h-24 resize-y leading-relaxed`}
          value={form.description || ''}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="What is this project about?"
        />
      </Field>

      {/* Status — three fixed options, so a segmented control is quicker
          than a dropdown. Native radios keep arrow-key navigation. */}
      <div role="radiogroup" aria-labelledby={ids.statusLabel}>
        <span id={ids.statusLabel} className={labelCls}>Status</span>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] p-1">
          {STATUSES.map(s => (
            <label key={s.value} className="relative cursor-pointer">
              <input
                type="radio"
                name={`${uid}-status`}
                value={s.value}
                className="peer sr-only"
                checked={form.status === s.value}
                onChange={() => setForm(f => ({ ...f, status: s.value }))}
              />
              <span
                className={[
                  'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium',
                  'text-[color:var(--text-3)] transition duration-150 motion-reduce:transition-none',
                  'hover:text-[color:var(--text-2)] active:scale-[0.98]',
                  'peer-checked:bg-[var(--bg-2)] peer-checked:text-[color:var(--text)] peer-checked:shadow-sm',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--accent)]',
                ].join(' ')}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
                {s.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Task stages */}
      <div
        role="group"
        aria-labelledby={ids.stagesLabel}
        className="flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] p-4"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 id={ids.stagesLabel} className="m-0 text-[13px] font-medium tracking-[-0.005em]">
              Task stages
            </h3>
            <p id={ids.stageHint} className="mt-0.5 text-[11px] text-[color:var(--text-3)]">
              The columns tasks move through. Default stages can't be removed.
            </p>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--text-3)]">
            {stageCount} {stageCount === 1 ? 'stage' : 'stages'}
          </span>
        </div>

        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Task stages">
          {form.custom_stages.map(s => {
            const isDefault = DEFAULT_STAGES.includes(s);
            return (
              <li
                key={s}
                className={[
                  'inline-flex items-center gap-2 rounded-md bg-[var(--bg-2)] py-1 text-xs font-medium',
                  'border border-[color:var(--border)]',
                  isDefault ? 'px-2.5' : 'pl-2.5 pr-1',
                ].join(' ')}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[s] || 'bg-[var(--accent)]'}`}
                  aria-hidden="true"
                />
                {s}
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => removeStage(s)}
                    aria-label={`Remove stage ${s}`}
                    className={[
                      'grid h-5 w-5 place-items-center rounded text-[color:var(--text-3)]',
                      'transition-colors duration-150 motion-reduce:transition-none',
                      'hover:bg-[var(--bg-3)] hover:text-[color:var(--danger)]',
                      focusRing,
                    ].join(' ')}
                  >
                    <CloseIcon />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div>
          <div className="flex gap-2">
            <label htmlFor={ids.newStage} className="sr-only">New stage name</label>
            <input
              id={ids.newStage}
              className={`${inputCls} min-w-0 flex-1 bg-[var(--bg-2)]`}
              value={newStage}
              onChange={e => { setNewStage(e.target.value); setStageError(''); }}
              onKeyDown={e => {
                // Enter adds the stage; it must not submit the whole form.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addStage();
                }
              }}
              placeholder="Add a stage, e.g. Client review"
              aria-invalid={!!stageError}
              aria-describedby={stageError ? ids.stageError : ids.stageHint}
            />
            <button
              type="button"
              onClick={addStage}
              disabled={!newStage.trim()}
              className={[
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--bg-2)] px-4 text-sm font-medium',
                'transition duration-150 motion-reduce:transition-none',
                'hover:border-[color:var(--text-3)] active:scale-[0.98]',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[color:var(--border)] disabled:active:scale-100',
                focusRing,
              ].join(' ')}
            >
              <PlusIcon />
              Add
            </button>
          </div>
          <FieldError id={ids.stageError}>{stageError}</FieldError>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={[
            'rounded-lg px-4 py-2.5 text-sm font-medium text-[color:var(--text-2)]',
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
            'inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white',
            'transition duration-150 motion-reduce:transition-none',
            'hover:brightness-110 active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            focusRing,
          ].join(' ')}
        >
          {saving ? <Loader label="Saving..." size="sm" variant="button" /> : 'Save project'}
        </button>
      </div>
    </form>
  );
}