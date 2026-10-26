import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import DatePicker from '../components/ui/DatePicker';
import Loader from '../components/ui/Loader';
import ConfirmModal from '../components/ui/ConfirmModal';
import { useLiveRefetch, TASK_REQUEST_EVENTS } from '../hooks/useLiveEvents';

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

/* Cards: hairline ring plus a soft shadow tinted with the accent hue. */
const cardCls =
  'rounded-2xl bg-[var(--bg-2)] shadow-[0_0_0_1px_var(--border),0_18px_40px_-24px_color-mix(in_srgb,var(--accent)_30%,transparent)]';

/* Small section label inside the form. */
const groupCls = 'text-[11px] font-medium tracking-[0.06em] text-[color:var(--text-3)]';

// Long words and URLs wrap instead of widening the page.
const wrapAnywhere = '[overflow-wrap:anywhere]';

function Icon({ children, className = 'h-4 w-4' }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

const InboxIcon = () => (
  <Icon className="h-6 w-6"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></Icon>
);

const RefreshIcon = () => (
  <Icon><path d="M21 12a9 9 0 11-3-6.7L21 8" /><path d="M21 3v5h-5" /></Icon>
);

const ArrowIcon = () => (
  <Icon className="h-3.5 w-3.5"><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
);

const ChevronIcon = ({ up }) => (
  <Icon className={`h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none ${up ? 'rotate-180' : ''}`}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-[color:var(--danger)]">
      {children}
    </p>
  );
}

/* ---------- helpers ---------- */

// dd-mm-yyyy. A plain date (due date) is shown as stored; a timestamp is
// shown in the viewer's own calendar day.
function fmtDay(value) {
  if (!value) return '—';
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (plain) return `${plain[3]}-${plain[2]}-${plain[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

const STATUS_META = {
  pending: {
    label: 'Pending',
    cls: 'text-[color:var(--warning)] bg-[color:color-mix(in_srgb,var(--warning)_14%,transparent)]',
    dot: 'bg-[color:var(--warning)]',
  },
  approved: {
    label: 'Approved',
    cls: 'text-[color:var(--success,#10b981)] bg-[color:color-mix(in_srgb,var(--success,#10b981)_14%,transparent)]',
    dot: 'bg-[color:var(--success,#10b981)]',
  },
  declined: {
    label: 'Declined',
    cls: 'text-[color:var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)]',
    dot: 'bg-[color:var(--danger)]',
  },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// Clamps to 3 lines; shows "Show more" only when the text actually overflows.
function ExpandableText({ text, className = '' }) {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return undefined;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  return (
    <div className={className}>
      <p ref={ref} className={`max-w-[65ch] whitespace-pre-wrap leading-relaxed ${wrapAnywhere} ${expanded ? '' : 'line-clamp-3'}`}>
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className={`mt-1 inline-flex items-center gap-1 rounded-md text-xs font-medium text-[color:var(--accent)] hover:underline ${focusRing}`}
        >
          {expanded ? 'Show less' : 'Show more'}
          <ChevronIcon up={expanded} />
        </button>
      )}
    </div>
  );
}

/* ---------- tabs ---------- */

const TABS = [
  { id: 'new', label: 'New request' },
  { id: 'mine', label: 'My requests' },
];

function Tabs({ tab, onChange, pendingCount, baseId }) {
  const refs = useRef({});
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex(t => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Task request"
      onKeyDown={onKeyDown}
      className="mt-6 inline-flex gap-1 rounded-lg bg-[var(--bg-2)] p-1 shadow-[0_0_0_1px_var(--border)]"
    >
      {TABS.map(t => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            ref={el => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={active}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={[
              'inline-flex min-h-9 items-center gap-2 rounded-md px-3.5 text-[13px] font-medium',
              'transition-[background-color,color,transform] duration-200 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
              active
                ? 'bg-[var(--bg-3)] text-[var(--text)] shadow-[0_0_0_1px_var(--border)]'
                : 'text-[color:var(--text-3)] hover:text-[var(--text)]',
              focusRing,
            ].join(' ')}
          >
            {t.label}
            {t.id === 'mine' && pendingCount > 0 && (
              <span className="rounded-md bg-[var(--accent)] px-1.5 py-px text-[10px] font-semibold tabular-nums text-white">
                {pendingCount}
                <span className="sr-only"> pending</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- new request form ---------- */

const EMPTY = { title: '', project_name: '', description: '', due_date: '' };

function NewRequestForm({ onSent }) {
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

  const dirty = Object.values(form).some(v => String(v).trim() !== '');

  const setField = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: '' }));
    setSubmitError('');
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

      await api.post('/task-requests', payload);
      setForm(EMPTY);
      onSent();
    } catch (err) {
      setSubmitError(err?.response?.data?.error || 'Could not send the request. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={`p-5 sm:p-7 ${cardCls}`}
    >
      <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
        <legend className="sr-only">New task request</legend>

        <p className={`${groupCls} -mb-2`}>The task</p>

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

        <div className="border-t border-[color:var(--border)]" aria-hidden="true" />
        <p className={`${groupCls} -mb-2`}>Timeline</p>

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

      <div className="mt-7 flex items-center justify-end gap-2 border-t border-[color:var(--border)] pt-5">
        {dirty && !saving && (
          <button
            type="button"
            onClick={handleClear}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium text-[color:var(--text-2)] transition-[color,background-color,transform] duration-150 hover:bg-[var(--bg-3)] hover:text-[var(--text)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
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
  );
}

/* ---------- my requests ---------- */

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'declined', label: 'Declined' },
];

function FilterChips({ value, onChange, counts }) {
  return (
    <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
      {FILTERS.map(f => {
        const active = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(f.id)}
            className={[
              'inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium',
              'transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
              active
                ? 'border-[color:var(--accent)] bg-[var(--accent-glow)] text-[color:var(--accent)]'
                : 'border-[color:var(--border)] text-[color:var(--text-2)] hover:border-[color:var(--text-3)] hover:text-[var(--text)]',
              focusRing,
            ].join(' ')}
          >
            {f.label}
            <span className="tabular-nums opacity-70">{counts[f.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

function RequestOutcome({ r }) {
  if (r.status === 'pending') {
    return (
      <p className="text-xs text-[color:var(--text-3)]">Waiting for an admin to review it.</p>
    );
  }

  const approved = r.status === 'approved';
  const by = r.handled_by_name ? ` by ${r.handled_by_name}` : '';
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[color:var(--text-2)]">
        {approved ? 'Approved' : 'Declined'}{by} on <span className="tabular-nums">{fmtDay(r.handled_at)}</span>
      </p>

      {approved && r.task_title && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-[var(--bg-3)] px-3.5 py-2.5 text-[13px]">
          <span className={`min-w-0 flex-1 ${wrapAnywhere}`}>
            <span className="text-[color:var(--text-3)]">Task: </span>
            <span className="font-medium text-[var(--text)]">{r.task_title}</span>
            {r.task_project_name && <span className="text-[color:var(--text-3)]"> · {r.task_project_name}</span>}
            {r.task_stage && <span className="text-[color:var(--text-3)]"> · {r.task_stage}</span>}
          </span>
          {r.task_open && (
            <Link
              to={`/projects/${r.task_project_id}/tasks/${r.task_id}`}
              className={`group inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-semibold text-[color:var(--accent)] hover:underline ${focusRing}`}
            >
              Open task
              <span className="transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0">
                <ArrowIcon />
              </span>
            </Link>
          )}
        </div>
      )}

      {r.admin_note && (
        <p className={`max-w-[65ch] border-l-2 border-[color:var(--accent)] pl-3 text-[13px] italic leading-relaxed text-[color:var(--text-2)] ${wrapAnywhere}`}>
          {r.admin_note}
        </p>
      )}
    </div>
  );
}

function SkeletonList() {
  const bar = 'animate-pulse rounded-md bg-[var(--bg-3)] motion-reduce:animate-none';
  return (
    <div role="status" aria-label="Loading your requests" className="divide-y divide-[color:var(--border)]">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 px-4 py-5 sm:px-5">
          <div className="flex justify-between gap-4">
            <div className={`h-4 w-2/5 ${bar}`} />
            <div className={`h-5 w-20 ${bar}`} />
          </div>
          <div className={`h-3 w-3/5 ${bar}`} />
          <div className={`h-3 w-1/3 ${bar}`} />
        </div>
      ))}
      <span className="sr-only">Loading your requests</span>
    </div>
  );
}

function MyRequests({ requests, loading, error, onRetry, onNew, onCancelled }) {
  const [filter, setFilter] = useState('all');
  const [toCancel, setToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const counts = useMemo(() => {
    const c = { all: requests.length, pending: 0, approved: 0, declined: 0 };
    requests.forEach(r => { if (r.status in c) c[r.status] += 1; });
    return c;
  }, [requests]);

  const shown = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const confirmCancel = async () => {
    if (!toCancel) return;
    setCancelling(true);
    setCancelError('');
    try {
      await api.post(`/task-requests/${toCancel.id}/cancel`);
      onCancelled(toCancel.id);
    } catch (err) {
      setCancelError(err?.response?.data?.error || 'Could not cancel the request.');
      onRetry();
    } finally {
      setCancelling(false);
      setToCancel(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!loading && requests.length > 0 && (
        <FilterChips value={filter} onChange={setFilter} counts={counts} />
      )}

      {(error || cancelError) && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-[13px] text-[color:var(--danger)]"
        >
          <span className="inline-flex items-start gap-2">
            <AlertIcon />
            <span>{cancelError || `${error} Check your connection and try again.`}</span>
          </span>
          {error && (
            <button
              type="button"
              onClick={onRetry}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-[background-color,transform] duration-150 hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
            >
              <RefreshIcon />
              Retry
            </button>
          )}
        </div>
      )}

      <section
        aria-label="My task requests"
        className={`overflow-hidden ${cardCls}`}
      >
        {loading ? (
          <SkeletonList />
        ) : shown.length === 0 ? (
          !error && (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--bg-3)] text-[color:var(--text-3)] shadow-[0_0_0_1px_var(--border)]">
                <InboxIcon />
              </span>
              <h2 className="mt-4 text-sm font-semibold tracking-[-0.01em] text-[var(--text)]">
                {requests.length === 0 ? 'No requests yet' : `No ${filter} requests`}
              </h2>
              <p className="mt-1 max-w-[38ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
                {requests.length === 0
                  ? 'Tasks you request show up here, with what the admins decided.'
                  : 'Pick another filter to see the rest.'}
              </p>
              {requests.length === 0 ? (
                <button
                  type="button"
                  onClick={onNew}
                  className={`mt-5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:brightness-110 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
                >
                  Request a task
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`mt-4 rounded-md px-2 py-1 text-xs font-medium text-[color:var(--accent)] underline-offset-4 transition-colors hover:underline ${focusRing}`}
                >
                  Show all requests
                </button>
              )}
            </div>
          )
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {shown.map(r => (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-5 transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--bg-3)_40%,transparent)] motion-reduce:transition-none sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold tracking-[-0.01em] text-[var(--text)] ${wrapAnywhere}`}>{r.title}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--text-3)]">
                      <span className={wrapAnywhere}>{r.project_name}</span>
                      {r.due_date && <span className="tabular-nums">Due {fmtDay(r.due_date)}</span>}
                      <span className="tabular-nums">Requested {fmtDay(r.created_at)}</span>
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>

                {r.description && (
                  <ExpandableText text={r.description} className="text-[13px] text-[color:var(--text-2)]" />
                )}

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <RequestOutcome r={r} />
                  </div>
                  {r.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => setToCancel(r)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium text-[color:var(--text-2)] transition-[color,background-color,transform] duration-150 hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[color:var(--danger)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
                    >
                      Cancel request
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        isOpen={!!toCancel}
        title="Cancel request"
        message={toCancel ? `Cancel your request "${toCancel.title}"? The admins will no longer see it.` : ''}
        confirmText="Cancel request"
        cancelText="Keep it"
        isDangerous={true}
        onConfirm={confirmCancel}
        onCancel={() => setToCancel(null)}
        loading={cancelling}
      />
    </div>
  );
}

/* ---------- page ---------- */

export default function TaskRequest() {
  const baseId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'mine' ? 'mine' : 'new';

  const [sent, setSent] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const setTab = useCallback((next) => {
    setSearchParams(next === 'mine' ? { tab: 'mine' } : {}, { replace: true });
  }, [setSearchParams]);

  // Loaded on both tabs: the "My requests" tab shows the pending count.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/task-requests/mine');
      setRequests(Array.isArray(res.data) ? res.data : []);
      setError('');
    } catch {
      if (!silent) setError('Could not load your requests.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const silentReload = useCallback(() => load({ silent: true }), [load]);
  useLiveRefetch(TASK_REQUEST_EVENTS, silentReload);

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const handleSent = () => {
    setSent(true);
    silentReload();
  };

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6 md:py-12">
      <header>
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.035em] text-[var(--text)] [text-wrap:balance]">
          Task request
        </h1>
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
          Request a task and your manager will review it. Follow what was decided under My requests.
        </p>
      </header>

      <Tabs tab={tab} onChange={setTab} pendingCount={pendingCount} baseId={baseId} />

      <div
        role="tabpanel"
        id={`${baseId}-panel-${tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        className="mt-5"
      >
        {tab === 'new' ? (
          <div className="flex flex-col gap-5">
            {sent && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--accent-glow)] px-4 py-3 text-[13px] text-[color:var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
              >
                <span className="inline-flex items-center gap-2 font-medium">
                  <CheckIcon />
                  Request sent. You'll be notified when it's reviewed.
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setSent(false); setTab('mine'); }}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-[background-color,transform] duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
                  >
                    View my requests
                  </button>
                  <button
                    type="button"
                    onClick={() => setSent(false)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
                  >
                    Dismiss
                  </button>
                </span>
              </div>
            )}
            <NewRequestForm onSent={handleSent} />
          </div>
        ) : (
          <MyRequests
            requests={requests}
            loading={loading}
            error={error}
            onRetry={() => load()}
            onNew={() => setTab('new')}
            onCancelled={(id) => setRequests(list => list.filter(r => r.id !== id))}
          />
        )}
      </div>
    </div>
  );
}