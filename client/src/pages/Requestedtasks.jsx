import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { cachedMembers, rememberMembers } from '../api/membersCache';
import ConfirmModal from '../components/ui/ConfirmModal';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import Loader from '../components/ui/Loader';
import TaskForm from '../components/tasks/TaskForm';
import { useLiveRefetch, TASK_REQUEST_EVENTS } from '../hooks/useLiveEvents';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-0';

const thCls =
  'whitespace-nowrap border-b border-[color:var(--border)] px-4 py-3 text-left text-xs font-medium text-[color:var(--text-3)]';
const tdCls = 'px-4 py-4 align-top text-[13px] text-[var(--text)]';

// Long words and URLs wrap instead of widening the table.
const wrapAnywhere = '[overflow-wrap:anywhere]';

const labelCls = 'mb-1.5 block text-[13px] font-medium tracking-[-0.005em] text-[var(--text)]';
const inputCls = [
  'w-full rounded-lg border border-[color:var(--border)] bg-transparent px-3 py-2.5 text-sm',
  'placeholder:text-[color:var(--text-3)]',
  'transition-colors duration-200 motion-reduce:transition-none',
  'hover:border-[color:var(--text-3)] focus:border-[color:var(--accent)]',
  focusRing,
].join(' ');

// Main tasks do not use stages (same as the Tasks page).
const NO_STAGES = [];

/* ---------- icons ---------- */

function Icon({ children, className = 'h-4 w-4' }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const TrashIcon = () => (
  <Icon><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" /></Icon>
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

const AlertIcon = () => (
  <Icon><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></Icon>
);

const ChevronIcon = ({ up }) => (
  <Icon className={`h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none ${up ? 'rotate-180' : ''}`}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

/* ---------- helpers ---------- */

// dd-mm-yyyy. A plain date (due date) is shown as stored; a timestamp is
// shown in the viewer's own calendar day.
function fmtDate(value) {
  if (!value) return '—';
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (plain) return `${plain[3]}-${plain[2]}-${plain[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// Due dates are YYYY-MM-DD; "today" is the viewer's local day (en-CA = YYYY-MM-DD).
function isOverdue(value, today) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
  return !!m && m[1] < today;
}

function requesterName(r) {
  return r.requested_by_name || r.member_name || r.user?.name || '';
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'the member';
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const errorText = (err, fallback) => err?.response?.data?.error || fallback;

// The live project that best matches what the member typed, or '' when
// there is no single clear match (the admin then picks one).
function matchProject(projects, typed) {
  const words = String(typed || '').trim().toLowerCase();
  if (!words) return '';
  const exact = projects.filter(p => p.name?.trim().toLowerCase() === words);
  if (exact.length === 1) return exact[0].id;
  const partial = projects.filter(p => {
    const name = p.name?.trim().toLowerCase() || '';
    const client = p.client_name?.trim().toLowerCase() || '';
    return (name && (name.includes(words) || words.includes(name))) || (client && client === words);
  });
  return partial.length === 1 ? partial[0].id : '';
}

/* ---------- small pieces ---------- */

function Requester({ name }) {
  if (!name) return <span className="text-[color:var(--text-3)]">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--bg-3)] text-[10px] font-semibold text-[color:var(--text-2)]"
      >
        {initials(name)}
      </span>
      <span>{name}</span>
    </span>
  );
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
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// Clamps to 4 lines; shows "Show more" only when the text actually overflows.
function ExpandableText({ text, className = '', lines = 'line-clamp-4' }) {
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
      <p
        ref={ref}
        className={`whitespace-pre-wrap leading-relaxed ${wrapAnywhere} ${expanded ? '' : lines}`}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className={`mt-1.5 inline-flex items-center gap-1 rounded-md text-xs font-medium text-[color:var(--accent)] hover:underline ${focusRing}`}
        >
          {expanded ? 'Show less' : 'Show more'}
          <ChevronIcon up={expanded} />
        </button>
      )}
    </div>
  );
}

function DeleteButton({ request, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(request)}
      aria-label={`Delete request: ${request.title}`}
      title="Delete request"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[color:var(--text-3)] transition-[color,background-color,transform] duration-150 hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[color:var(--danger)] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
    >
      <TrashIcon />
    </button>
  );
}

const btnBase =
  'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition duration-150 active:scale-[0.98] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60';
const btnPrimary = `${btnBase} bg-[var(--accent)] text-white hover:brightness-110 ${focusRing}`;
const btnGhost = `${btnBase} text-[color:var(--text-2)] shadow-[0_0_0_1px_var(--border)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] ${focusRing}`;
const btnDanger = `${btnBase} bg-[var(--danger)] text-white hover:brightness-110 ${focusRing}`;

// Approve / Decline for a pending row; status + outcome for a handled row.
function RowActions({ r, onApprove, onDecline, onDelete, compact = false }) {
  if (r.status === 'pending') {
    return (
      <div className={`flex items-center gap-2 ${compact ? '' : 'justify-end'}`}>
        <button type="button" className={btnGhost} onClick={() => onDecline(r)}>
          Decline
        </button>
        <button type="button" className={btnPrimary} onClick={() => onApprove(r)}>
          Approve
        </button>
        <DeleteButton request={r} onClick={onDelete} />
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 ${compact ? '' : 'justify-end'}`}>
      <div className={`flex min-w-0 flex-col gap-1.5 ${compact ? 'items-start' : 'items-end text-right'}`}>
        <StatusBadge status={r.status} />
        <span className="text-xs text-[color:var(--text-3)]">
          {r.handled_by_name ? `${r.handled_by_name} · ` : ''}
          <span className="tabular-nums">{fmtDate(r.handled_at)}</span>
        </span>
        {r.status === 'approved' && r.task_id && (
          <Link
            to={`/projects/${r.task_project_id}/tasks/${r.task_id}`}
            className={`inline-flex items-center gap-1 rounded-md text-xs font-semibold text-[color:var(--accent)] hover:underline ${focusRing}`}
          >
            Open task <ArrowIcon />
          </Link>
        )}
        {r.admin_note && (
          <ExpandableText
            text={r.admin_note}
            lines="line-clamp-2"
            className={`max-w-[260px] text-xs italic text-[color:var(--text-2)] ${compact ? '' : 'text-right'}`}
          />
        )}
      </div>
      <DeleteButton request={r} onClick={onDelete} />
    </div>
  );
}

/* ---------- loading skeleton (matches the row shape) ---------- */

function SkeletonRows() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading requests" className="divide-y divide-[color:var(--border)]">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none" />
          </div>
          <div className="hidden h-3.5 w-24 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none sm:block" />
          <div className="hidden h-3.5 w-20 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none md:block" />
        </div>
      ))}
      <span className="sr-only">Loading requests</span>
    </div>
  );
}

/* ---------- filter ---------- */

const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'declined', label: 'Declined' },
  { id: 'all', label: 'All' },
];

function FilterTabs({ value, onChange, counts }) {
  return (
    <div role="group" aria-label="Filter by status" className="grid w-full grid-cols-4 gap-1 rounded-[10px] bg-[var(--bg-3)] p-1 sm:inline-flex sm:w-auto">
      {FILTERS.map(f => {
        const active = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(f.id)}
            className={[
              'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[8px] px-2 text-xs font-medium sm:min-h-8 sm:px-3',
              'transition-[background-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:transition-none',
              active
                ? 'bg-[var(--bg-2)] text-[var(--text)] shadow-[0_1px_3px_rgba(15,23,42,0.14)]'
                : 'text-[color:var(--text-3)] hover:text-[var(--text)]',
              focusRing,
            ].join(' ')}
          >
            {f.label}
            <span className={`tabular-nums ${f.id === 'pending' && counts.pending > 0 ? 'rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-white' : 'opacity-70'}`}>
              {counts[f.id] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- approve modal ---------- */

function ApproveModal({ request, projects, projectsError, members, onClose, onDone }) {
  const uid = useId();
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const [projectId, setProjectId] = useState(() => matchProject(projects, request.project_name));
  const [projectError, setProjectError] = useState('');
  const [clusters, setClusters] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmPlain, setConfirmPlain] = useState(false);

  // Projects can arrive after the modal opened: pick the match then.
  useEffect(() => {
    if (!projectId && projects.length) setProjectId(matchProject(projects, request.project_name));
  }, [projects, projectId, request.project_name]);

  useEffect(() => {
    if (!projectId) { setClusters([]); return undefined; }
    let cancelled = false;
    api.get(`/clusters/project/${projectId}`)
      .then(res => { if (!cancelled) setClusters(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (!cancelled) setClusters([]); });
    return () => { cancelled = true; };
  }, [projectId]);

  // The requested due date is only carried over while it is still ahead.
  const dueStillAhead = request.due_date && request.due_date >= today;
  const prefill = useMemo(() => ({
    title: request.title,
    description: request.description || '',
    due_date: dueStillAhead ? request.due_date : '',
    standalone: true,
  }), [request, dueStillAhead]);

  const name = firstName(requesterName(request));

  const submit = async (task) => {
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/task-requests/${request.id}/approve`, {
        task,
        note: note.trim() || undefined,
      });
      onDone(res.data);
    } catch (err) {
      setError(errorText(err, 'Could not approve the request. Try again.'));
      // Someone else already handled it: refresh the list behind the modal.
      if (err?.response?.status === 409 || err?.response?.status === 404) onDone(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (payload) => {
    if (!projectId) {
      setProjectError('Choose the project this task goes into.');
      return;
    }
    const clusterOk = clusters.some(c => String(c.id) === String(payload.cluster_id));
    submit({
      ...payload,
      stage: undefined,
      cluster_id: clusterOk ? payload.cluster_id : null,
      project_id: projectId,
    });
  };

  return (
    <Modal title="Approve request" onClose={saving ? () => {} : onClose}>
      <div className="flex flex-col gap-5">
        <div className="rounded-lg bg-[var(--bg-3)] px-3.5 py-3 text-[13px] leading-relaxed text-[color:var(--text-2)]">
          <p>
            <span className="font-medium text-[var(--text)]">{requesterName(request) || 'A member'}</span> asked for this
            {' '}in <span className="font-medium text-[var(--text)]">"{request.project_name}"</span> on{' '}
            <span className="tabular-nums">{fmtDate(request.created_at)}</span>
            {request.due_date && (
              <>, due <span className="tabular-nums">{fmtDate(request.due_date)}</span>{!dueStillAhead && ' (already passed, pick a new date)'}</>
            )}
            .
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-3)]">
            Check the details below. Saving creates the task and tells {name} it was approved.
          </p>
        </div>

        <div>
          <span className={labelCls}>
            Project
            <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>
          </span>
          <Select
            value={projectId}
            onChange={val => { setProjectId(val); setProjectError(''); }}
            placeholder={projects.length ? 'Choose a project' : 'Loading projects...'}
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          {(projectError || projectsError) && (
            <p role="alert" className="mt-1.5 text-xs text-[color:var(--danger)]">{projectError || projectsError}</p>
          )}
          {!projectId && !projectError && projects.length > 0 && (
            <p className="mt-1.5 text-xs text-[color:var(--text-3)]">
              No project matches "{request.project_name}" exactly. Pick the right one.
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${uid}-note`} className={labelCls}>
            Note to {name}
            <span className="ml-1 font-normal text-[color:var(--text-3)]">(optional)</span>
          </label>
          <textarea
            id={`${uid}-note`}
            className={`${inputCls} min-h-16 resize-y leading-relaxed`}
            value={note}
            maxLength={1000}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Rahul will take this one"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-[13px] text-[color:var(--danger)]"
          >
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        <div className="border-t border-[color:var(--border)] pt-5">
          <TaskForm
            prefill={prefill}
            members={members}
            allMembers={members}
            clusters={clusters}
            stages={NO_STAGES}
            onSave={handleSave}
            onCancel={onClose}
            saving={saving}
            submitLabel="Approve & create task"
          />
        </div>

        <p className="-mt-1 text-center text-xs text-[color:var(--text-3)]">
          Task already exists?{' '}
          <button
            type="button"
            disabled={saving}
            onClick={() => setConfirmPlain(true)}
            className={`rounded font-medium text-[color:var(--accent)] hover:underline disabled:opacity-50 ${focusRing}`}
          >
            Approve without creating a task
          </button>
        </p>
      </div>

      <ConfirmModal
        isOpen={confirmPlain}
        title="Approve without a task"
        message={`Mark "${request.title}" as approved without creating a new task? ${name} will be told it was approved.`}
        confirmText="Approve"
        isDangerous={false}
        onConfirm={() => { setConfirmPlain(false); submit(null); }}
        onCancel={() => setConfirmPlain(false)}
      />
    </Modal>
  );
}

/* ---------- decline modal ---------- */

function DeclineModal({ request, onClose, onDone }) {
  const uid = useId();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const name = firstName(requesterName(request));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/task-requests/${request.id}/decline`, { note: note.trim() || undefined });
      onDone(res.data);
    } catch (err) {
      setError(errorText(err, 'Could not decline the request. Try again.'));
      if (err?.response?.status === 409 || err?.response?.status === 404) onDone(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Decline request" size="md" onClose={saving ? () => {} : onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <p className="text-[13px] leading-relaxed text-[color:var(--text-2)]">
          Decline <span className={`font-medium text-[var(--text)] ${wrapAnywhere}`}>"{request.title}"</span>?{' '}
          {name} will see it as declined, with your reason.
        </p>
        <div>
          <label htmlFor={`${uid}-reason`} className={labelCls}>
            Reason
            <span className="ml-1 font-normal text-[color:var(--text-3)]">(optional, shown to {name})</span>
          </label>
          <textarea
            id={`${uid}-reason`}
            autoFocus
            className={`${inputCls} min-h-24 resize-y leading-relaxed`}
            value={note}
            maxLength={1000}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Already covered by the brochure task"
          />
        </div>
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-[13px] text-[color:var(--danger)]"
          >
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={`${btnDanger} min-w-24`} disabled={saving}>
            {saving ? <Loader label="Declining..." size="sm" variant="button" /> : 'Decline'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- page ---------- */

export default function RequestedTasks() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [flash, setFlash] = useState('');

  // Approve modal data, loaded the first time it opens.
  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState('');
  const [members, setMembers] = useState(() => cachedMembers() || []);
  const modalDataLoaded = useRef(false);

  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/task-requests');
      setRequests(Array.isArray(res.data) ? res.data : res.data?.requests || []);
      setError('');
    } catch {
      if (!silent) setError('Could not load requests.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const silentReload = useCallback(() => load({ silent: true }), [load]);
  useLiveRefetch(TASK_REQUEST_EVENTS, silentReload);

  const loadModalData = useCallback(() => {
    if (modalDataLoaded.current) return;
    modalDataLoaded.current = true;
    api.get('/projects')
      .then(res => {
        const list = (Array.isArray(res.data) ? res.data : [])
          .filter(p => (p.status || 'active') !== 'archived')
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setProjects(list);
        setProjectsError('');
      })
      .catch(() => {
        modalDataLoaded.current = false;
        setProjectsError('Could not load projects. Close and try again.');
      });
    if (!cachedMembers()) {
      api.get('/members')
        .then(res => setMembers(rememberMembers(res.data) || []))
        .catch(() => {});
    }
  }, []);

  const counts = useMemo(() => {
    const c = { all: requests.length, pending: 0, approved: 0, declined: 0 };
    requests.forEach(r => { if (r.status in c) c[r.status] += 1; });
    return c;
  }, [requests]);

  const shown = useMemo(() => {
    if (filter === 'all') return requests;
    const list = requests.filter(r => (r.status || 'pending') === filter);
    // Handled lists: most recently handled first.
    if (filter !== 'pending') {
      list.sort((a, b) => new Date(b.handled_at || 0) - new Date(a.handled_at || 0));
    }
    return list;
  }, [requests, filter]);

  const replaceRow = (updated) => {
    setRequests(list => list.map(r => (r.id === updated.id ? { ...r, ...updated } : r)));
  };

  const openApprove = (r) => { loadModalData(); setApproving(r); };

  const handleApproved = (updated) => {
    if (!updated) { silentReload(); return; }
    replaceRow(updated);
    setApproving(null);
    setFlash(updated.task_id
      ? `Approved. "${updated.task_title}" was added to ${updated.task_project_name}.`
      : `Approved "${updated.title}".`);
  };

  const handleDeclined = (updated) => {
    if (!updated) { silentReload(); return; }
    replaceRow(updated);
    setDeclining(null);
    setFlash(`Declined "${updated.title}".`);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/task-requests/${toDelete.id}`);
      setRequests(list => list.filter(r => r.id !== toDelete.id));
      setToDelete(null);
    } catch {
      setError('Could not delete the request.');
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const emptyText = {
    pending: ['Nothing waiting', 'New requests from members show up here for you to approve or decline.'],
    approved: ['No approved requests', 'Requests you approve are kept here.'],
    declined: ['No declined requests', 'Requests you decline are kept here, with your reason.'],
    all: ['No task requests yet', 'When a member requests a task, it will show up here for you to review.'],
  }[filter];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-[var(--text)] [text-wrap:balance]">
            Requested tasks
          </h1>
          <p className="mt-1.5 max-w-[64ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
            Approve a request to turn it into a task, or decline it with a reason. The member sees what you decided.
          </p>
        </div>
        {!loading && !error && <FilterTabs value={filter} onChange={setFilter} counts={counts} />}
      </header>

      {flash && (
        <div
          role="status"
          className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-[var(--accent-glow)] px-4 py-3 text-[13px] font-medium text-[color:var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
        >
          <span className={wrapAnywhere}>{flash}</span>
          <button
            type="button"
            onClick={() => setFlash('')}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-[13px] text-[color:var(--danger)]"
        >
          <span>{error} Check your connection and try again.</span>
          <button
            type="button"
            onClick={() => load()}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-[background-color,transform] duration-150 hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
          >
            <RefreshIcon />
            Retry
          </button>
        </div>
      )}

      <section
        aria-label="Task requests"
        className="mt-6 overflow-hidden rounded-xl bg-[var(--bg-2)] shadow-[0_0_0_1px_var(--border)]"
      >
        {loading ? (
          <SkeletonRows />
        ) : shown.length === 0 ? (
          !error && (
            <div className="flex flex-col items-center px-6 py-20 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--bg-3)] text-[color:var(--text-3)]">
                <InboxIcon />
              </span>
              <h2 className="mt-4 text-sm font-semibold text-[var(--text)]">{emptyText[0]}</h2>
              <p className="mt-1 max-w-[38ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
                {emptyText[1]}
              </p>
            </div>
          )
        ) : (
          <>
            {/* Desktop / tablet: table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] border-collapse">
                <caption className="sr-only">Tasks requested by members</caption>
                <thead>
                  <tr>
                    <th scope="col" className={`${thCls} pl-5`}>Task</th>
                    <th scope="col" className={thCls}>Project</th>
                    <th scope="col" className={thCls}>Description</th>
                    <th scope="col" className={thCls}>Requested by</th>
                    <th scope="col" className={thCls}>Due</th>
                    <th scope="col" className={thCls}>Requested on</th>
                    <th scope="col" className={`${thCls} pr-5 text-right`}>
                      {filter === 'pending' ? <span className="sr-only">Actions</span> : 'Status'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {shown.map(r => {
                    const overdue = r.status === 'pending' && isOverdue(r.due_date, today);
                    return (
                      <tr key={r.id} className="transition-colors duration-150 hover:bg-[var(--bg-3)] motion-reduce:transition-none">
                        <td className={`${tdCls} min-w-[140px] max-w-[220px] pl-5 font-medium ${wrapAnywhere}`}>{r.title}</td>
                        <td className={`${tdCls} min-w-[100px] max-w-[170px] ${wrapAnywhere}`}>{r.project_name || '—'}</td>
                        <td className={`${tdCls} min-w-[240px] max-w-[420px] text-[color:var(--text-2)]`}>
                          {r.description ? <ExpandableText text={r.description} /> : '—'}
                        </td>
                        <td className={`${tdCls} whitespace-nowrap`}><Requester name={requesterName(r)} /></td>
                        <td className={`${tdCls} whitespace-nowrap tabular-nums ${overdue ? 'font-medium text-[color:var(--danger)]' : ''}`}>
                          {fmtDate(r.due_date)}
                          {overdue && <span className="sr-only"> (overdue)</span>}
                        </td>
                        <td className={`${tdCls} whitespace-nowrap tabular-nums text-[color:var(--text-3)]`}>{fmtDate(r.created_at)}</td>
                        <td className={`${tdCls} pr-5 py-3`}>
                          <RowActions r={r} onApprove={openApprove} onDecline={setDeclining} onDelete={setToDelete} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phone / small tablet: stacked list, no sideways scrolling */}
            <ul className="divide-y divide-[color:var(--border)] lg:hidden">
              {shown.map(r => {
                const overdue = r.status === 'pending' && isOverdue(r.due_date, today);
                return (
                  <li key={r.id} className="flex flex-col gap-3 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium text-[var(--text)] ${wrapAnywhere}`}>{r.title}</p>
                        {r.project_name && (
                          <p className={`mt-0.5 text-xs text-[color:var(--text-3)] ${wrapAnywhere}`}>{r.project_name}</p>
                        )}
                      </div>
                      {filter === 'all' && <StatusBadge status={r.status} />}
                    </div>
                    {r.description && (
                      <ExpandableText text={r.description} className="text-[13px] text-[color:var(--text-2)]" />
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                      <Requester name={requesterName(r)} />
                      <span className={`tabular-nums ${overdue ? 'font-medium text-[color:var(--danger)]' : 'text-[color:var(--text-2)]'}`}>
                        Due {fmtDate(r.due_date)}
                        {overdue && <span className="sr-only"> (overdue)</span>}
                      </span>
                      <span className="tabular-nums text-[color:var(--text-3)]">Requested {fmtDate(r.created_at)}</span>
                    </div>
                    <RowActions r={r} onApprove={openApprove} onDecline={setDeclining} onDelete={setToDelete} compact />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {approving && (
        <ApproveModal
          key={approving.id}
          request={approving}
          projects={projects}
          projectsError={projectsError}
          members={members}
          onClose={() => setApproving(null)}
          onDone={handleApproved}
        />
      )}

      {declining && (
        <DeclineModal
          key={declining.id}
          request={declining}
          onClose={() => setDeclining(null)}
          onDone={handleDeclined}
        />
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        title="Delete request"
        message={toDelete ? `Delete the request "${toDelete.title}"? ${firstName(requesterName(toDelete))} will no longer see it under My requests. This cannot be undone.` : ''}
        confirmText="Delete"
        isDangerous={true}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}
