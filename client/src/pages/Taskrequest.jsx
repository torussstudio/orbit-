import { useId, useRef, useState } from 'react';
import api from '../api/client';
import DatePicker from '../components/ui/DatePicker';
import Loader from '../components/ui/Loader';

/* Same class strings as TaskForm so the theme matches. */
const labelCls = 'mb-1.5 block text-[13px] font-medium tracking-[-0.005em] text-[var(--text)]';
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-0';
const inputCls = [
  'w-full rounded-lg border border-[color:var(--border)] bg-transparent px-3 py-2.5 text-sm',
  'placeholder:text-[color:var(--text-3)]',
  'transition-colors duration-200 motion-reduce:transition-none',
  'hover:border-[color:var(--text-3)] focus:border-[color:var(--accent)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
  focusRing,
  'aria-[invalid=true]:border-[color:var(--danger)]',
].join(' ');

function Icon({ children }) {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const CheckIcon = () => (
  <Icon><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></Icon>
);

const AlertIcon = () => (
  <Icon><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></Icon>
);

function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-[color:var(--danger)]">
      {children}
    </p>
  );
}

const EMPTY = { title: '', project_name: '', description: '', due_date: '' };

export default function TaskRequest() {
  const uid = useId();
  const ids = {
    title: `${uid}-title`,
    titleError: `${uid}-title-error`,
    project: `${uid}-project`,
    projectError: `${uid}-project-error`,
    description: `${uid}-description`,
  };

  const titleRef = useRef(null);
  const projectRef = useRef(null);

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [sent, setSent] = useState(false);

  const dirty = Object.values(form).some(v => String(v).trim() !== '');

  const setField = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: '' }));
    setSubmitError('');
    if (sent) setSent(false);
  };

  const handleClear = () => {
    setForm(EMPTY);
    setErrors({});
    setSubmitError('');
    titleRef.current?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const next = {};
    if (!form.title.trim()) next.title = 'Enter a task name.';
    if (!form.project_name.trim()) next.project_name = 'Enter a project name.';
    if (Object.keys(next).length) {
      setErrors(next);
      // Send keyboard and screen-reader users straight to the first problem.
      (next.title ? titleRef : projectRef).current?.focus();
      return;
    }

    setSaving(true);
    setSubmitError('');
    try {
      const payload = {
        title: form.title.trim(),
        project_name: form.project_name.trim(),
        description: form.description.trim(),
      };
      if (form.due_date) payload.due_date = form.due_date;

      // NOTE: adjust this endpoint to match your backend.
      await api.post('/task-requests', payload);
      setSent(true);
      setForm(EMPTY);
    } catch (err) {
      setSubmitError(err?.response?.data?.error || 'Could not send the request. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6 md:py-10">
      <header>
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-[var(--text)] [text-wrap:balance]">
          Task request
        </h1>
        <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
          Request a task and your manager will review it.
        </p>
      </header>

      {sent && (
        <div
          role="status"
          className="mt-6 flex items-center justify-between gap-3 rounded-lg bg-[var(--accent-glow)] px-4 py-3 text-[13px] text-[color:var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckIcon />
            Request sent. Your manager will see it in their list.
          </span>
          <button
            type="button"
            onClick={() => setSent(false)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
          >
            Dismiss
          </button>
        </div>
      )}

      <form
        noValidate
        onSubmit={handleSubmit}
        className="mt-6 rounded-xl bg-[var(--bg-2)] p-5 shadow-[0_0_0_1px_var(--border)] sm:p-6"
      >
        <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
          <legend className="sr-only">New task request</legend>

          <div>
            <label htmlFor={ids.title} className={labelCls}>
              Task name
              <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>
            </label>
            <input
              ref={titleRef}
              id={ids.title}
              className={inputCls}
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="What needs to be done?"
              aria-required="true"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? ids.titleError : undefined}
            />
            <FieldError id={ids.titleError}>{errors.title}</FieldError>
          </div>

          <div>
            <label htmlFor={ids.project} className={labelCls}>
              Project name
              <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>
            </label>
            <input
              ref={projectRef}
              id={ids.project}
              className={inputCls}
              value={form.project_name}
              onChange={e => setField('project_name', e.target.value)}
              placeholder="Which project is this for?"
              aria-required="true"
              aria-invalid={!!errors.project_name}
              aria-describedby={errors.project_name ? ids.projectError : undefined}
            />
            <FieldError id={ids.projectError}>{errors.project_name}</FieldError>
          </div>

          <div>
            <label htmlFor={ids.description} className={labelCls}>
              Description
              <span className="ml-1 font-normal text-[color:var(--text-3)]">(optional)</span>
            </label>
            <textarea
              id={ids.description}
              className={`${inputCls} min-h-32 resize-y leading-relaxed`}
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Details, links, anything the manager should know"
            />
          </div>

          <div>
            <span className={labelCls}>
              Due date
              <span className="ml-1 font-normal text-[color:var(--text-3)]">(optional)</span>
            </span>
            <DatePicker
              value={form.due_date}
              onChange={val => setField('due_date', val)}
              placeholder="dd-mm-yyyy"
            />
          </div>
        </fieldset>

        {submitError && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-[13px] text-[color:var(--danger)]"
          >
            <AlertIcon />
            <span>{submitError}</span>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-[color:var(--border)] pt-5">
          {dirty && !saving && (
            <button
              type="button"
              onClick={handleClear}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium text-[color:var(--text-2)] transition-[color,background-color,transform] duration-150 hover:bg-[var(--bg-3)] hover:text-[var(--text)] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className={[
              'inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white',
              'transition duration-150 motion-reduce:transition-none',
              'hover:brightness-110 active:scale-[0.98] motion-reduce:active:scale-100',
              'disabled:cursor-not-allowed disabled:opacity-60',
              focusRing,
            ].join(' ')}
          >
            {saving ? <Loader label="Sending..." size="sm" variant="button" /> : 'Send request'}
          </button>
        </div>
      </form>
    </main>
  );
}