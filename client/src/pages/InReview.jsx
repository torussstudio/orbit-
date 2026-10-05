import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import DatePicker from '../components/ui/DatePicker';
import Loader from '../components/ui/Loader';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]';

const btnBase = [
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap',
  'transition duration-150 motion-reduce:transition-none active:scale-[0.98]',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
  focusRing,
].join(' ');
const btnSm = 'px-2.5 py-1.5 text-xs';
const btnMd = 'px-3.5 py-2 text-sm';
const btnApprove = `${btnBase} ${btnSm} bg-[var(--success)] font-semibold text-white hover:brightness-110`;
const btnRework = `${btnBase} ${btnSm} border border-[var(--border)] bg-transparent text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]`;
const btnLink = `${btnBase} ${btnSm} text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)]`;
const btnGhost = `${btnBase} ${btnMd} border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text-2)] hover:bg-[var(--bg-3)]`;
const btnDanger = `${btnBase} ${btnMd} bg-[var(--danger)] font-semibold text-white hover:brightness-110`;

const selectCls = [
  'h-9 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 text-[13px] text-[var(--text)]',
  'transition-colors duration-150 motion-reduce:transition-none hover:border-[var(--text-3)]',
  'focus:border-[var(--accent)]',
  focusRing,
].join(' ');

// Replaces the global .page-header / .page-title / .page-subtitle / .page-body
const pageHeaderCls = [
  'flex flex-wrap items-center justify-between gap-3 px-8 pt-7',
  'max-md:items-start max-md:px-4 max-md:pt-5',
  'max-sm:gap-4',
  'max-[480px]:px-3',
  '[&>*]:min-w-0',
].join(' ');
const pageTitleCls =
  'text-[22px] font-bold tracking-[-0.4px] text-[var(--text)] max-md:text-xl';
const pageSubtitleCls = 'mt-0.5 text-[13px] text-[var(--text-2)]';
const pageBodyCls = [
  'flex-1 px-8 pb-10 pt-6',
  'max-md:px-4 max-md:pb-8 max-md:pt-[18px]',
  'max-[480px]:px-3',
  '[&>*]:min-w-0',
].join(' ');

const Icon = ({ d, className = 'h-3.5 w-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  rework: 'M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16M3 21v-5h5',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  queue: 'M4 6h16M4 12h16M4 18h10',
  alert: 'M12 4L2.5 20h19L12 4zM12 10v4M12 17.5v.01',
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatMinutes(total) {
  const minutes = Number(total);
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const toISODate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/* ------------------------------------------------------------------ */
/* Row pieces (shared by the table and the mobile cards)               */
/* ------------------------------------------------------------------ */

function TaskCell({ item }) {
  return (
    <div className="min-w-0">
      {item.parent_task_id && item.parent_task_title && (
        <div className="mb-0.5 break-words text-xs text-[var(--text-3)]">
          Subtask of {item.parent_task_title}
        </div>
      )}
      <Link
        to={`/projects/${item.project_id}/tasks/${item.id}`}
        className={`break-words rounded text-sm font-semibold text-[var(--text)] no-underline underline-offset-2 hover:underline ${focusRing}`}
      >
        {item.title}
      </Link>
      <div className="mt-0.5">
        <Link
          to={`/projects/${item.project_id}`}
          className={`rounded text-xs text-[var(--text-2)] no-underline underline-offset-2 hover:text-[var(--accent)] hover:underline ${focusRing}`}
        >
          {item.project_name}
        </Link>
      </div>
    </div>
  );
}

function AssigneeCell({ item }) {
  if (!item.assignee_name) return <span className="text-xs text-[var(--text-3)]">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[13px] text-[var(--text-2)]">
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--bg-4)] text-[10px] font-semibold uppercase text-[var(--text-2)]"
        aria-hidden="true"
      >
        {item.assignee_name[0]}
      </span>
      <span className="truncate">{item.assignee_name}</span>
    </span>
  );
}

function TimeCell({ item }) {
  if (!item.time_taken) return <span className="text-xs text-[var(--text-3)]">Not logged</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium tabular-nums text-[var(--text)]">
      <Icon d={ICONS.clock} className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
      {formatMinutes(item.time_taken)}
    </span>
  );
}

function ReworkCell({ item }) {
  if (!(item.rework_count > 0)) return <span className="text-xs text-[var(--text-3)]">None</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--danger)]">
      <Icon d={ICONS.rework} className="h-3 w-3 shrink-0" />
      {plural(item.rework_count, 'rework')}
    </span>
  );
}

function UpdatedCell({ item }) {
  return (
    <time
      dateTime={item.updated_at}
      title={new Date(item.updated_at).toLocaleString()}
      className="whitespace-nowrap text-xs tabular-nums text-[var(--text-3)]"
    >
      {timeAgo(item.updated_at)}
    </time>
  );
}

function RowActions({ item, busy, onDone, onRework }) {
  const doneLoading = busy?.id === item.id && busy.type === 'done';
  const rowBusy = busy?.id === item.id;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={btnApprove} disabled={rowBusy} onClick={() => onDone(item)}>
        {doneLoading ? (
          <Loader label="Updating..." size="sm" variant="button" />
        ) : (
          <>
            <Icon d={ICONS.check} />
            Approve
          </>
        )}
      </button>
      <button type="button" className={btnRework} disabled={rowBusy} onClick={() => onRework(item)}>
        <Icon d={ICONS.rework} />
        Rework
      </button>
      <Link to={`/projects/${item.project_id}/tasks/${item.id}`} className={`${btnLink} no-underline`}>
        View
      </Link>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-2)]" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 border-b border-[var(--border)] px-4 py-4 last:border-b-0 motion-reduce:animate-none">
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 rounded bg-[var(--bg-4)]" />
            <div className="h-3 w-1/5 rounded bg-[var(--bg-3)]" />
          </div>
          <div className="hidden h-3 w-24 rounded bg-[var(--bg-3)] md:block" />
          <div className="hidden h-3 w-16 rounded bg-[var(--bg-3)] md:block" />
          <div className="h-8 w-40 rounded-lg bg-[var(--bg-3)]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-14 text-center">
      <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--bg-3)] text-[var(--text-3)]">
        <Icon d={ICONS.queue} className="h-5 w-5" />
      </div>
      <div className="mb-1 text-[15px] font-semibold text-[var(--text)]">{title}</div>
      <p className="m-0 mx-auto max-w-sm text-[13px] leading-relaxed text-[var(--text-3)]">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function InReview() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [reworkModal, setReworkModal] = useState({ show: false, subtask: null });
  const [reworkDeadline, setReworkDeadline] = useState('');
  // { id, type: 'done' | 'rework' } while a request is in flight.
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const response = await api.get('/tasks/in-review/all');
      setSubtasks(response.data);
      setLoadError(false);
    } catch (error) {
      console.error('Error loading review queue:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isManager) { navigate('/'); return; }
    load();
  }, [isManager, navigate]);

  // Drop a project filter whose items have all left the queue.
  const projects = [...new Set(subtasks.map((s) => s.project_name))];
  useEffect(() => {
    if (filter !== 'all' && !projects.includes(filter)) setFilter('all');
  }, [filter, projects.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleMarkDone = async (subtask) => {
    setBusy({ id: subtask.id, type: 'done' });
    setNotice('');
    try {
      await api.put(`/tasks/${subtask.id}`, { stage: 'Done', time_taken: null });
      await load();
    } catch (error) {
      console.error('Failed to approve task:', error);
      setNotice(error.response?.data?.error || "We couldn't approve this task. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const closeRework = () => {
    setReworkModal({ show: false, subtask: null });
    setReworkDeadline('');
  };

  const handleRework = async () => {
    const { subtask } = reworkModal;
    if (reworkDeadline && reworkDeadline < toISODate()) {
      setNotice('New deadline cannot be in the past.');
      closeRework();
      return;
    }
    setBusy({ id: subtask.id, type: 'rework' });
    setNotice('');
    try {
      await api.put(`/tasks/${subtask.id}`, {
        stage: 'Rework',
        time_taken: null,
        new_due_date: reworkDeadline || null,
      });
      closeRework();
      await load();
    } catch (error) {
      console.error('Failed to move task to rework:', error);
      closeRework();
      setNotice(error.response?.data?.error || "We couldn't move this task to rework. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const filtered = subtasks
    .filter((s) => filter === 'all' || s.project_name === filter)
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.updated_at) - new Date(a.updated_at);
      if (sort === 'oldest') return new Date(a.updated_at) - new Date(b.updated_at);
      if (sort === 'rework') return (b.rework_count || 0) - (a.rework_count || 0);
      if (sort === 'time') return (b.time_taken || 0) - (a.time_taken || 0);
      return 0;
    });

  if (!isManager) return null;

  const totalTasks = subtasks.filter((s) => !s.parent_task_id).length;
  const totalSubtasks = subtasks.length - totalTasks;
  const subtitle = subtasks.length === 0
    ? 'Nothing waiting for review'
    : `${[
        totalTasks > 0 && plural(totalTasks, 'task'),
        totalSubtasks > 0 && plural(totalSubtasks, 'subtask'),
      ].filter(Boolean).join(' and ')} waiting for review`;

  const rework = reworkModal.subtask;

  return (
    <>
      <div className={pageHeaderCls}>
        <div>
          <div className={pageTitleCls}>In review</div>
          <div className={pageSubtitleCls}>{loading ? 'Loading the review queue' : subtitle}</div>
        </div>
      </div>

      <div className={pageBodyCls}>
        {notice && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice('')}
              aria-label="Dismiss"
              className={`rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 ${focusRing}`}
            >
              <Icon d="M18 6L6 18M6 6l12 12" />
            </button>
          </div>
        )}

        {loading ? (
          <>
            <span className="sr-only" role="status">Loading review queue</span>
            <SkeletonRows />
          </>
        ) : loadError && subtasks.length === 0 ? (
          <EmptyState
            title="We couldn't load the review queue"
            action={<button type="button" className={btnGhost} onClick={() => { setLoading(true); load(); }}>Try again</button>}
          >
            Check your connection and try again.
          </EmptyState>
        ) : (
          <>
            {/* Filters */}
            {subtasks.length > 0 && (
              <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <div className="flex items-center gap-2 max-sm:w-full">
                  <label htmlFor="ir-project" className="text-xs font-medium text-[var(--text-2)]">Project</label>
                  <select id="ir-project" className={`${selectCls} max-sm:flex-1`} value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">All projects</option>
                    {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 max-sm:w-full">
                  <label htmlFor="ir-sort" className="text-xs font-medium text-[var(--text-2)]">Sort by</label>
                  <select id="ir-sort" className={`${selectCls} max-sm:flex-1`} value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="rework">Most reworks</option>
                    <option value="time">Most time</option>
                  </select>
                </div>
                <p className="m-0 text-xs tabular-nums text-[var(--text-3)] sm:ml-auto max-sm:w-full max-sm:text-right" aria-live="polite">
                  Showing {filtered.length} of {subtasks.length}
                </p>
              </div>
            )}

            {subtasks.length === 0 ? (
              <EmptyState title="The review queue is empty">
                Tasks show up here when a member moves them to In Review.
              </EmptyState>
            ) : filtered.length === 0 ? (
              <EmptyState
                title={`Nothing in review for ${filter}`}
                action={<button type="button" className={btnGhost} onClick={() => setFilter('all')}>Show all projects</button>}
              >
                Every item from this project has been reviewed.
              </EmptyState>
            ) : (
              <>
                {/* Table: md and up */}
                <div className="hidden overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-2)] shadow-sm md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--bg-3)]">
                          {['Task', 'Assignee', 'Time', 'Reworks', 'Updated'].map((label) => (
                            <th key={label} scope="col" className="px-4 py-2.5 text-left text-xs font-medium normal-case tracking-normal text-[var(--text-3)]">
                              {label}
                            </th>
                          ))}
                          <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium normal-case tracking-normal text-[var(--text-3)]">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((s) => (
                          <tr key={s.id} className="border-b border-[var(--border)] transition-colors duration-150 last:border-b-0 hover:bg-[var(--bg-3)] motion-reduce:transition-none">
                            <td className="max-w-[22rem] px-4 py-3.5 align-top"><TaskCell item={s} /></td>
                            <td className="px-4 py-3.5 align-top"><AssigneeCell item={s} /></td>
                            <td className="px-4 py-3.5 align-top"><TimeCell item={s} /></td>
                            <td className="px-4 py-3.5 align-top"><ReworkCell item={s} /></td>
                            <td className="px-4 py-3.5 align-top"><UpdatedCell item={s} /></td>
                            <td className="px-4 py-3.5 align-top">
                              <RowActions item={s} busy={busy} onDone={handleMarkDone} onRework={(item) => setReworkModal({ show: true, subtask: item })} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cards: below md */}
                <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
                  {filtered.map((s) => (
                    <li key={s.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-4">
                      <TaskCell item={s} />
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <AssigneeCell item={s} />
                        <TimeCell item={s} />
                        <ReworkCell item={s} />
                        <span className="ml-auto"><UpdatedCell item={s} /></span>
                      </div>
                      <div className="mt-3.5 border-t border-[var(--border)] pt-3.5">
                        <RowActions item={s} busy={busy} onDone={handleMarkDone} onRework={(item) => setReworkModal({ show: true, subtask: item })} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {reworkModal.show && (
        <Modal title="Move to rework" onClose={closeRework}>
          <p className="m-0 mb-1 break-words text-sm font-semibold text-[var(--text)]">
            Move “{rework?.title}” to rework?
          </p>
          <p className="m-0 mb-4 text-[13px] leading-relaxed text-[var(--text-3)]">
            This marks the {rework?.parent_task_id ? 'subtask' : 'task'} as needing rework and adds one to its rework count.
          </p>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-3)] p-3.5">
            <div className="mb-1.5 text-[13px] font-medium text-[var(--text)]">
              New deadline
              <span className="ml-1 font-normal text-[var(--text-3)]">(optional)</span>
            </div>
            <DatePicker
              value={reworkDeadline}
              onChange={(val) => setReworkDeadline(val)}
              placeholder="dd-mm-yyyy"
              minDate={toISODate()}
            />
            <p className="m-0 mt-1.5 text-xs text-[var(--text-3)]">Set a new due date for this round of rework.</p>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={closeRework} disabled={!!busy}>
              Cancel
            </button>
            <button type="button" className={`${btnDanger} min-w-40`} onClick={handleRework} disabled={!!busy}>
              {busy?.type === 'rework' ? (
                <Loader label="Moving..." size="sm" variant="button" />
              ) : (
                <>
                  <Icon d={ICONS.rework} />
                  Move to rework
                </>
              )}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}