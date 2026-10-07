import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import ProjectForm from '../components/projects/ProjectForm';
import Loader from '../components/ui/Loader';
   import ProjectLinks from '../components/projects/ProjectLinks';
import { useLiveRefetch, TASK_AND_PROJECT_EVENTS } from '../hooks/useLiveEvents';

/* -------------------------------------------------------------------------- */
/* Task statistics                                                            */
/* -------------------------------------------------------------------------- */

// In this app, tasks/subtasks use the `stage` field and "Done" means completed.
const isDone = (t) => String(t.stage ?? t.status ?? '').toLowerCase().trim() === 'done';

// Counting rule:
//  - a task with NO subtasks counts as 1
//  - a task WITH subtasks is not counted itself; only its subtasks are counted
const computeStats = (tasks) => {
  const flat = [];
  const walk = (list) =>
    list.forEach((t) => {
      flat.push(t);
      if (Array.isArray(t.subtasks)) walk(t.subtasks);
    });
  walk(tasks);

  const parentIds = new Set(
    flat.map((t) => t.parent_task_id).filter((id) => id !== null && id !== undefined),
  );
  const leaves = flat.filter(
    (t) => !parentIds.has(t.id) && !(Array.isArray(t.subtasks) && t.subtasks.length > 0),
  );

  return { total: leaves.length, done: leaves.filter(isDone).length };
};

/* -------------------------------------------------------------------------- */
/* Constants & class strings (full literals so Tailwind can see them)         */
/* -------------------------------------------------------------------------- */

const CLOSED_CONFIRM = { show: false, title: '', message: '', action: null, loading: false, isDangerous: false };
const SKELETON_CARDS = [0, 1, 2, 3, 4, 5];
const STATS_CONCURRENCY = 6;

const isAbort = (e) =>
  e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4';
const CARD =
  'relative flex flex-col rounded-[14px] border border-[color:var(--border)] bg-[color:var(--bg-2)] px-[18px] pb-3.5 pt-[18px] transition-[transform,border-color,box-shadow] duration-200 motion-reduce:transition-none focus-within:border-[color:var(--accent)]';
const CARD_HOVER =
  'hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border))] hover:shadow-[0_10px_28px_-14px_color-mix(in_srgb,var(--accent)_40%,transparent)]';
const PULSE = 'animate-pulse [animation-duration:1.4s] [animation-timing-function:ease-in-out] motion-reduce:animate-none';
const BAR = 'rounded-md bg-[color:var(--bg-4)]';
const TRACK = 'h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-4)]';
const FOOTER_BTN =
  'btn btn-ghost btn-sm transition-[background-color,color,transform] duration-200 active:scale-[0.97] motion-reduce:transition-none';

/* -------------------------------------------------------------------------- */
/* Data hook                                                                  */
/* -------------------------------------------------------------------------- */

// Runs `fn` over `items` with at most `limit` in flight.
async function mapPool(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Progress counts sent by GET /projects (task_done_count / task_total_count),
// computed on the server with the same rule as computeStats. Returns null when
// any project is missing them (older server), so the page falls back to the
// per-project fetch.
const serverStats = (list) => {
  const ok = list.every(
    (p) => Number.isFinite(p.task_total_count) && Number.isFinite(p.task_done_count),
  );
  return ok
    ? Object.fromEntries(list.map((p) => [p.id, { total: p.task_total_count, done: p.task_done_count }]))
    : null;
};

// Projects + per-project progress. Progress normally comes with GET /projects.
// Fallback (older server): fetched in the background with limited concurrency,
// cards fill in as each count arrives, counts are cached (archive / restore /
// edit don't refetch them), and superseded loads are cancelled.
function useProjects(onError) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskStats, setTaskStats] = useState({}); // { [projectId]: { total, done } | null }
  const statsCache = useRef(new Map());
  const controller = useRef(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const { signal } = c;

    try {
      const { data: list } = await api.get('/projects', { signal });
      if (signal.aborted) return;

      const fromServer = serverStats(list);
      if (fromServer) {
        setTaskStats(fromServer);
        setProjects(list);
        setLoading(false);
        return;
      }

      const cache = statsCache.current;
      setProjects(list);
      setLoading(false);
      // Keep cached counts for projects that still exist; fetch only the missing ones.
      setTaskStats(
        Object.fromEntries(list.filter((p) => cache.has(p.id)).map((p) => [p.id, cache.get(p.id)])),
      );

      await mapPool(
        list.filter((p) => !cache.has(p.id)),
        STATS_CONCURRENCY,
        async (p) => {
          let stats = null;
          try {
            const { data } = await api.get(`/tasks/project/${p.id}`, { signal });
            stats = computeStats(Array.isArray(data) ? data : []);
            cache.set(p.id, stats);
          } catch (e) {
            if (isAbort(e)) return;
          }
          if (!signal.aborted) setTaskStats((prev) => ({ ...prev, [p.id]: stats }));
        },
      );
    } catch (e) {
      if (!isAbort(e)) onError("We couldn't load your projects. Please refresh the page.");
    } finally {
      if (controller.current === c) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);

  return { projects, loading, taskStats, load };
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-[color:var(--border)] px-6 py-16 text-center text-[color:var(--text-3)]">
      <h3 className="m-0 text-[15px] font-semibold text-[color:var(--text)]">{title}</h3>
      <p className="m-0 max-w-[36ch] text-[13px]">{children}</p>
      {action}
    </div>
  );
}

const ProjectsSkeleton = memo(function ProjectsSkeleton() {
  return (
    <div className={GRID}>
      {SKELETON_CARDS.map((i) => (
        <div
          key={i}
          className={`${CARD} pointer-events-none ${PULSE}`}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="mb-3 flex items-start gap-3">
            <div className="size-[38px] shrink-0 rounded-[11px] bg-[color:var(--bg-4)]" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className={`${BAR} h-3.5 w-3/5`} />
              <div className={`${BAR} h-2.5 w-[35%]`} />
            </div>
          </div>
          <div className={`${BAR} mb-2 h-2.5 w-[90%]`} />
          <div className={`${BAR} mb-6 h-2.5 w-[70%]`} />
          <div className={`${BAR} h-1.5 w-full`} />
        </div>
      ))}
    </div>
  );
});

const ProjectCard = memo(function ProjectCard({
  project: p,
  stats,
  isManager,
  archived = false,
  editLoading = false,
  deleteLoading = false,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
}) {
  const percent = stats && stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const complete = !!stats && stats.total > 0 && stats.done === stats.total;

  return (
    <article className={`${CARD} ${archived ? 'opacity-80' : CARD_HOVER}`}>
      <div className="mb-3 flex items-start gap-3">
        <span
          className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] text-[15px] font-semibold uppercase text-[color:var(--accent)]"
          aria-hidden="true"
        >
          {(p.name || '?').trim().charAt(0)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The link's ::after covers the whole card, so the card is clickable. */}
          <Link
            to={`/projects/${p.id}`}
            className="text-[15px] font-semibold leading-[1.3] tracking-[-0.01em] text-[color:var(--text)] no-underline [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-[14px] after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[color:var(--accent)]"
          >
            {p.name}
          </Link>
          <span className="text-xs text-[color:var(--text-3)]">{p.client_name || 'No client'}</span>
        </div>
        <span className={`badge badge-${p.status}`}>{p.status?.replace('_', ' ')}</span>
      </div>

      <p
        className={`mb-4 mt-0 min-h-10 overflow-hidden text-[13px] leading-[1.55] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] [text-wrap:pretty] ${
          p.description ? 'text-[color:var(--text-2)]' : 'text-[color:var(--text-3)]'
        }`}
      >
        {p.description || 'No description added.'}
      </p>

      {/* Milanote / Docs / Sheets buttons (only the ones this project has).
          They sit above the card-wide link, so clicking one opens that link. */}
      <ProjectLinks project={p} className="mb-4" />

      {/* Progress: leaf tasks only (tasks without subtasks + all subtasks) */}
      {stats === undefined && (
        <div className={`mt-auto ${PULSE}`} aria-hidden="true">
          <div className="mb-2 h-4" />
          <div className={TRACK} />
        </div>
      )}
      {stats && (
        <div className="mt-auto">
          <div className="mb-2 flex items-baseline justify-between text-xs tabular-nums">
            <span className="text-[color:var(--text-2)]">
              {stats.total === 0
                ? 'No tasks yet'
                : `${stats.done} of ${stats.total} ${stats.total === 1 ? 'task' : 'tasks'} done`}
            </span>
            {stats.total > 0 && <span className="font-semibold text-[color:var(--text)]">{percent}%</span>}
          </div>
          <div
            className={TRACK}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={`${p.name} progress`}
          >
            <div
              className={`h-full w-full origin-left rounded-full transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${
                complete ? 'bg-[color:var(--success,#10b981)]' : 'bg-[color:var(--accent)]'
              }`}
              style={{ transform: `scaleX(${percent / 100})` }}
            />
          </div>
        </div>
      )}

      {isManager && (
        <div className="relative z-[1] mt-3.5 flex justify-end gap-1 border-t border-[color:var(--border)] pt-2.5">
          {archived ? (
            <>
              <button type="button" className={`${FOOTER_BTN} !text-[color:var(--accent)]`} onClick={() => onUnarchive(p)}>
                Restore
              </button>
              <button
                type="button"
                className={`${FOOTER_BTN} !text-[color:var(--danger)]`}
                onClick={() => onDelete(p)}
                disabled={deleteLoading}
              >
                {deleteLoading ? <Loader label="Checking" size="sm" variant="button" /> : 'Delete'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={FOOTER_BTN} onClick={() => onEdit(p)} disabled={editLoading}>
                {editLoading ? <Loader label="Loading" size="sm" variant="button" /> : 'Edit'}
              </button>
              <button type="button" className={`${FOOTER_BTN} !text-[color:var(--text-3)]`} onClick={() => onArchive(p)}>
                Archive
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
});

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Projects() {
  const { isManager } = useAuth();
  const [errorMsg, setErrorMsg] = useState('');
  const { projects, loading, taskStats, load } = useProjects(setErrorMsg);

  // Live updates: projects and their progress counts. `load` only shows the
  // skeleton on the first load, so this refresh is silent.
  useLiveRefetch(TASK_AND_PROJECT_EVENTS, load);

  const [modal, setModal] = useState(null); // null | { editing: project | null }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editLoadingId, setEditLoadingId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmModal, setConfirmModal] = useState(CLOSED_CONFIRM);
  // Delete rule: a project can only be deleted once all its tasks and subtasks are gone.
  const [deleteCheckId, setDeleteCheckId] = useState(null);
  const [deleteBlocked, setDeleteBlocked] = useState(null); // { name, taskCount }
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  /* ---------- derived ---------- */

  const { active, archived } = useMemo(() => {
    const activeList = [];
    const archivedList = [];
    for (const p of projects) (p.status === 'archived' ? archivedList : activeList).push(p);
    return { active: activeList, archived: archivedList };
  }, [projects]);

   const { visibleActive, visibleArchived } = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const matches = (p) =>
      p.name?.toLowerCase().includes(q) || (p.client_name || '').toLowerCase().includes(q);

    // Most tasks first, fewest last; ties fall back to name.
    const byTaskCount = (a, b) =>
      (taskStats[b.id]?.total ?? 0) - (taskStats[a.id]?.total ?? 0) ||
      (a.name || '').localeCompare(b.name || '');

    const activeList = q ? active.filter(matches) : active;
    const archivedList = q ? archived.filter(matches) : archived;

    return {
      visibleActive: [...activeList].sort(byTaskCount),
      visibleArchived: [...archivedList].sort(byTaskCount),
    };
  }, [active, archived, deferredQuery, taskStats]);

  /* ---------- modals ---------- */

  const openCreate = useCallback(() => {
    setSaveError('');
    setModal({ editing: null });
  }, []);
  const closeModal = useCallback(() => {
    setSaveError('');
    setModal(null);
  }, []);
  const closeBlocked = useCallback(() => setDeleteBlocked(null), []);
  const closeConfirm = useCallback(() => setConfirmModal(CLOSED_CONFIRM), []);
  const dismissError = useCallback(() => setErrorMsg(''), []);
  const toggleArchived = useCallback(() => setShowArchived((v) => !v), []);

  const askConfirm = useCallback(
    (config) => setConfirmModal({ ...CLOSED_CONFIRM, show: true, ...config }),
    [],
  );

  const executeConfirmAction = useCallback(async () => {
    if (!confirmModal.action) return;
    setConfirmModal((prev) => ({ ...prev, loading: true }));
    try {
      await confirmModal.action();
    } finally {
      setConfirmModal(CLOSED_CONFIRM);
    }
  }, [confirmModal]);

  /* ---------- actions ---------- */

  // The projects LIST endpoint doesn't include assigned members (only
  // GET /projects/:id does), so fetch the full project before opening the edit
  // modal so "Assign Members" starts pre-highlighted correctly.
  const handleEdit = useCallback(async (p) => {
    setEditLoadingId(p.id);
    try {
      const { data } = await api.get(`/projects/${p.id}`);
      setSaveError('');
      setModal({ editing: data });
    } catch {
      setErrorMsg("We couldn't open this project for editing. Please try again.");
    } finally {
      setEditLoadingId(null);
    }
  }, []);

  const editingId = modal?.editing?.id;
  const handleSave = useCallback(
    async (data) => {
      setSaving(true);
      setSaveError('');
      try {
        if (editingId) await api.put(`/projects/${editingId}`, data);
        else await api.post('/projects', data);
        setModal(null);
        load();
      } catch (error) {
        // Keep the modal open so nothing the user typed is lost.
        setSaveError(error.response?.data?.error || "We couldn't save the project. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [editingId, load],
  );

  const handleArchive = useCallback(
    (p) =>
      askConfirm({
        title: 'Archive project',
        message: 'Archive this project? You can restore it later from the archived list.',
        action: async () => {
          await api.patch(`/projects/${p.id}/archive`);
          load();
        },
      }),
    [askConfirm, load],
  );

  const handleUnarchive = useCallback(
    (p) =>
      askConfirm({
        title: 'Restore project',
        message: 'Restore this project to your active projects?',
        action: async () => {
          await api.patch(`/projects/${p.id}/unarchive`);
          load();
        },
      }),
    [askConfirm, load],
  );

  // A project can only be deleted when it has no tasks or subtasks left.
  const handleDelete = useCallback(
    async (p) => {
      setErrorMsg('');
      setDeleteCheckId(p.id);
      let taskCount = 0;
      try {
        const { data } = await api.get(`/tasks/project/${p.id}`);
        taskCount = Array.isArray(data) ? data.length : 0;
      } catch (error) {
        setErrorMsg("We couldn't check this project's tasks: " + (error.response?.data?.error || error.message));
        return;
      } finally {
        setDeleteCheckId(null);
      }

      if (taskCount > 0) {
        setDeleteBlocked({ name: p.name || 'This project', taskCount });
        return;
      }

      askConfirm({
        title: 'Delete project',
        message: 'Are you sure you want to permanently delete this project? This action cannot be undone.',
        isDangerous: true,
        action: async () => {
          try {
            await api.delete(`/projects/${p.id}`);
            load();
          } catch (error) {
            setErrorMsg("We couldn't delete the project: " + (error.response?.data?.error || error.message));
          }
        },
      });
    },
    [askConfirm, load],
  );

  /* ---------- render ---------- */

  if (loading) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="page-title">Projects</div>
            <div className="page-subtitle">Loading projects…</div>
          </div>
        </div>
        <div className="page-body" aria-busy="true">
          <ProjectsSkeleton />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-subtitle">
            {active.length} active project{active.length !== 1 ? 's' : ''}
            {archived.length > 0 ? ` · ${archived.length} archived` : ''}
          </div>
        </div>
        {isManager && (
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + New project
          </button>
        )}
      </div>

      <div className="page-body">
        {errorMsg && (
          <div
            className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-[color:color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-[13px] text-[color:var(--danger)]"
            role="alert"
          >
            <span>{errorMsg}</span>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent px-1 text-lg leading-none text-inherit"
              onClick={dismissError}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        {projects.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <label className="relative max-w-[360px] flex-[1_1_260px]">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]"
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="M14 14l3.5 3.5" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by project or client"
                aria-label="Search projects"
                className="h-[38px] w-full rounded-[10px] border border-[color:var(--border)] bg-[color:var(--bg-2)] pl-9 pr-3 text-[13px] text-[color:var(--text)] transition-[border-color,box-shadow] duration-200 placeholder:text-[color:var(--text-3)] motion-reduce:transition-none focus-visible:border-[color:var(--accent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)] focus-visible:outline-none"
              />
            </label>
            {archived.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={toggleArchived}
                aria-expanded={showArchived}
              >
                {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
              </button>
            )}
          </div>
        )}

        {/* Active projects */}
        {active.length === 0 ? (
          <EmptyState
            title="No active projects"
            action={
              isManager && (
                <button type="button" className="btn btn-primary mt-3" onClick={openCreate}>
                  + New project
                </button>
              )
            }
          >
            {isManager
              ? 'Create your first project to start tracking tasks and progress.'
              : 'Projects you are added to will show up here.'}
          </EmptyState>
        ) : visibleActive.length === 0 ? (
          <EmptyState title="No matches">
            Nothing matches “{query}”. Try a different project or client name.
          </EmptyState>
        ) : (
          <section className={GRID} aria-label="Active projects">
            {visibleActive.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                stats={taskStats[p.id]}
                isManager={isManager}
                editLoading={editLoadingId === p.id}
                onEdit={handleEdit}
                onArchive={handleArchive}
              />
            ))}
          </section>
        )}

        {/* Archived projects */}
        {showArchived && visibleArchived.length > 0 && (
          <section aria-label="Archived projects">
            <div className="mb-4 mt-10 flex items-center gap-2.5 border-b border-[color:var(--border)] pb-3 text-sm font-semibold text-[color:var(--text-2)]">
              <span>Archived</span>
              <span className="rounded-md bg-[color:var(--bg-4)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[color:var(--text-3)]">
                {visibleArchived.length}
              </span>
            </div>
            <div className={GRID}>
              {visibleArchived.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  stats={taskStats[p.id]}
                  isManager={isManager}
                  archived
                  deleteLoading={deleteCheckId === p.id}
                  onUnarchive={handleUnarchive}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {modal && (
        <Modal title={modal.editing ? 'Edit project' : 'New project'} onClose={closeModal}>
          <ProjectForm
            initial={modal.editing}
            onSave={handleSave}
            onCancel={closeModal}
            saving={saving}
            error={saveError}
          />
        </Modal>
      )}

      {/* Shown instead of the delete confirmation while the project still has tasks. */}
      {deleteBlocked && (
        <Modal title="Cannot delete project" onClose={closeBlocked}>
          <p className="mb-2 text-[13px] leading-relaxed text-[var(--text-2)]">
            <strong className="text-[var(--text)]">{deleteBlocked.name}</strong> still has{' '}
            {deleteBlocked.taskCount} {deleteBlocked.taskCount === 1 ? 'task' : 'tasks'} (including subtasks).
          </p>
          <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
            Delete all of its tasks and subtasks first. Once the project has none left, you can delete it.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={closeBlocked}>
              Got it
            </button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.isDangerous ? 'Delete' : 'Confirm'}
        isDangerous={confirmModal.isDangerous}
        onConfirm={executeConfirmAction}
        onCancel={closeConfirm}
        loading={confirmModal.loading}
      />
    </>
  );
}