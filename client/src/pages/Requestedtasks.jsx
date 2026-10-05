import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import ConfirmModal from '../components/ui/ConfirmModal';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-0';

const thCls =
  'whitespace-nowrap border-b border-[color:var(--border)] px-4 py-3 text-left text-xs font-medium text-[color:var(--text-3)]';
const tdCls = 'px-4 py-4 align-top text-[13px] text-[var(--text)]';

/* ---------- icons (one stroke weight: 1.75) ---------- */

function Icon({ children, className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

/* ---------- helpers ---------- */

// Shows dd-mm-yyyy whether the API sends yyyy-mm-dd or a full ISO string.
function fmtDate(value) {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value);
}

// Compares calendar dates only, so a task due today is not overdue.
function isOverdue(value, today) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
  return !!m && m[1] < today;
}

function requesterName(r) {
  return r.requested_by_name || r.member_name || r.user?.name || '';
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

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

function DeleteButton({ request, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(request)}
      aria-label={`Delete request: ${request.title}`}
      title="Delete request"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--text-3)] transition-[color,background-color,transform] duration-150 hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[color:var(--danger)] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
    >
      <TrashIcon />
    </button>
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

/* ---------- page ---------- */

export default function RequestedTasks() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // NOTE: adjust endpoint to match your backend.
      const res = await api.get('/task-requests');
      setRequests(Array.isArray(res.data) ? res.data : res.data?.requests || []);
    } catch {
      setError('Could not load requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const hasRows = !loading && requests.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 md:py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-[var(--text)] [text-wrap:balance]">
            Requested tasks
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
            Tasks requested by members. Delete a row once you have handled it.
          </p>
        </div>
        {!loading && !error && (
          <span className="shrink-0 rounded-md bg-[var(--bg-3)] px-2.5 py-1 text-xs font-medium tabular-nums text-[color:var(--text-2)]">
            {requests.length} {requests.length === 1 ? 'request' : 'requests'}
          </span>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-[13px] text-[color:var(--danger)]"
        >
          <span>{error} Check your connection and try again.</span>
          <button
            type="button"
            onClick={load}
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
        ) : requests.length === 0 ? (
          !error && (
            <div className="flex flex-col items-center px-6 py-20 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--bg-3)] text-[color:var(--text-3)]">
                <InboxIcon />
              </span>
              <h2 className="mt-4 text-sm font-semibold text-[var(--text)]">No task requests yet</h2>
              <p className="mt-1 max-w-[38ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
                When a member requests a task, it will show up here for you to review.
              </p>
            </div>
          )
        ) : (
          <>
            {/* Desktop / tablet: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse">
                <caption className="sr-only">Tasks requested by members</caption>
                <thead>
                  <tr>
                    <th scope="col" className={`${thCls} pl-5`}>Task</th>
                    <th scope="col" className={thCls}>Project</th>
                    <th scope="col" className={thCls}>Description</th>
                    <th scope="col" className={thCls}>Requested by</th>
                    <th scope="col" className={thCls}>Due</th>
                    <th scope="col" className={thCls}>Requested on</th>
                    <th scope="col" className={`${thCls} w-14 pr-5 text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {requests.map(r => {
                    const overdue = isOverdue(r.due_date, today);
                    return (
                      <tr key={r.id} className="transition-colors duration-150 hover:bg-[var(--bg-3)] motion-reduce:transition-none">
                        <td className={`${tdCls} pl-5 font-medium`}>{r.title}</td>
                        <td className={`${tdCls} whitespace-nowrap`}>{r.project_name || '—'}</td>
                        <td className={`${tdCls} max-w-[300px] text-[color:var(--text-2)]`}>
                          <p className="line-clamp-3 whitespace-pre-wrap break-words leading-relaxed" title={r.description || undefined}>
                            {r.description || '—'}
                          </p>
                        </td>
                        <td className={`${tdCls} whitespace-nowrap`}><Requester name={requesterName(r)} /></td>
                        <td className={`${tdCls} whitespace-nowrap tabular-nums ${overdue ? 'font-medium text-[color:var(--danger)]' : ''}`}>
                          {fmtDate(r.due_date)}
                          {overdue && <span className="sr-only"> (overdue)</span>}
                        </td>
                        <td className={`${tdCls} whitespace-nowrap tabular-nums text-[color:var(--text-3)]`}>{fmtDate(r.created_at)}</td>
                        <td className={`${tdCls} pr-5 py-3 text-right`}>
                          <DeleteButton request={r} onClick={setToDelete} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked list, no sideways scrolling */}
            <ul className="divide-y divide-[color:var(--border)] md:hidden">
              {requests.map(r => {
                const overdue = isOverdue(r.due_date, today);
                return (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text)]">{r.title}</p>
                      {r.project_name && (
                        <p className="mt-0.5 text-xs text-[color:var(--text-3)]">{r.project_name}</p>
                      )}
                      {r.description && (
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[color:var(--text-2)]">
                          {r.description}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        <Requester name={requesterName(r)} />
                        <span className={`tabular-nums ${overdue ? 'font-medium text-[color:var(--danger)]' : 'text-[color:var(--text-2)]'}`}>
                          Due {fmtDate(r.due_date)}
                          {overdue && <span className="sr-only"> (overdue)</span>}
                        </span>
                        <span className="tabular-nums text-[color:var(--text-3)]">Requested {fmtDate(r.created_at)}</span>
                      </div>
                    </div>
                    <DeleteButton request={r} onClick={setToDelete} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <ConfirmModal
        isOpen={!!toDelete}
        title="Delete request"
        message={toDelete ? `Delete the request "${toDelete.title}"? This cannot be undone.` : ''}
        confirmText="Delete"
        isDangerous={true}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}