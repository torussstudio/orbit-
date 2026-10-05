import { useState, useEffect, useId } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { takePrefetched } from '../api/prefetch';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import DatePicker from '../components/ui/DatePicker';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import Loader from '../components/ui/Loader';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const EMPTY_FORM = { name: '', description: '', target_date: '' };
const EMPTY_CONFIRM = { show: false, title: '', message: '', action: null, loading: false, isDangerous: false };

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
const btnPrimary = `${btnBase} ${btnMd} bg-[var(--accent)] font-semibold text-white hover:brightness-110`;
const btnGhost = `${btnBase} ${btnMd} border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text-2)] hover:bg-[var(--bg-3)]`;
const btnReview = `${btnBase} ${btnSm} border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-light)]`;
const btnQuiet = `${btnBase} ${btnSm} text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)]`;
const btnQuietDanger = `${btnBase} ${btnSm} text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]`;

const labelCls = 'mb-1.5 block text-[13px] font-medium tracking-[-0.005em]';
const inputCls = [
  'w-full rounded-lg border border-[color:var(--border)] bg-transparent px-3 py-2.5 text-sm text-[var(--text)]',
  'placeholder:text-[color:var(--text-3)]',
  'transition-colors duration-200 motion-reduce:transition-none',
  'hover:border-[color:var(--text-3)] focus:border-[color:var(--accent)]',
  focusRing,
  'aria-[invalid=true]:border-[color:var(--danger)]',
].join(' ');

const Icon = ({ d, className = 'h-3.5 w-3.5 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6L6 18M6 6l12 12',
  cluster: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3.3 7.7L12 12.5l8.7-4.8M12 22V12.5',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  rework: 'M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16M3 21v-5h5',
  alert: 'M12 4L2.5 20h19L12 4zM12 10v4M12 17.5v.01',
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "needs_rework" -> "Needs rework"
const statusLabel = (status) =>
  status ? status.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase()) : '';

const isOverdue = (cluster) => {
  if (!cluster.target_date || ['approved', 'completed'].includes(cluster.status)) return false;
  const due = new Date(cluster.target_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
};

function Notice({ children, onDismiss }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 ${focusRing}`}
        >
          <Icon d={ICONS.close} />
        </button>
      )}
    </div>
  );
}

function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--danger)]">
      <Icon d={ICONS.alert} />
      {children}
    </p>
  );
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4" aria-hidden="true">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-5 motion-reduce:animate-none">
          <div className="mb-3 h-4 w-2/3 rounded bg-[var(--bg-4)]" />
          <div className="mb-5 h-3 w-full rounded bg-[var(--bg-3)]" />
          <div className="h-3 w-1/2 rounded bg-[var(--bg-3)]" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cluster card                                                        */
/* ------------------------------------------------------------------ */

function ClusterCard({ cluster: c, projectId, isManager, submitting, onSubmitReview, onEdit, onDelete }) {
  const canSubmit = c.status === 'draft' || c.status === 'needs_rework';
  const overdue = isOverdue(c);

  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-5 transition-colors duration-150 hover:border-[var(--text-3)] motion-reduce:transition-none">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Stretched link: the whole card opens the cluster. Actions sit above it (z-10). */}
          <Link
            to={`/projects/${projectId}/clusters/${c.id}`}
            className="break-words rounded-xl text-[15px] font-semibold tracking-[-0.01em] text-[var(--text)] no-underline after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[color:var(--accent)]"
          >
            {c.name}
          </Link>
          {c.description && (
            <p className="m-0 mt-1 line-clamp-2 break-words text-xs leading-relaxed text-[var(--text-2)]">{c.description}</p>
          )}
        </div>
        <span className={`badge badge-${c.status} shrink-0`}>{statusLabel(c.status)}</span>
      </div>

      <dl className="m-0 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-3)]">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Tasks</dt>
          <Icon d={ICONS.tasks} />
          <dd className="m-0 tabular-nums">{plural(c.task_count ?? 0, 'task')}</dd>
        </div>
        {c.target_date && (
          <div className={`flex items-center gap-1.5 ${overdue ? 'font-medium text-[var(--danger)]' : ''}`}>
            <dt className="sr-only">Target date</dt>
            <Icon d={ICONS.calendar} />
            <dd className="m-0 tabular-nums">
              {formatDate(c.target_date)}
              {overdue && <span className="ml-1">(overdue)</span>}
            </dd>
          </div>
        )}
        {c.rework_count > 0 && (
          <div className="flex items-center gap-1.5 font-medium text-[var(--danger)]">
            <dt className="sr-only">Reworks</dt>
            <Icon d={ICONS.rework} />
            <dd className="m-0 tabular-nums">{plural(c.rework_count, 'rework')}</dd>
          </div>
        )}
      </dl>

      {isManager && (
        <div className="relative z-10 mt-auto flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
          {canSubmit && (
            <button type="button" className={btnReview} onClick={() => onSubmitReview(c.id)} disabled={submitting}>
              {submitting ? <Loader label="Submitting..." size="sm" variant="button" /> : 'Submit for review'}
            </button>
          )}
          <span className="ml-auto flex items-center gap-1">
            <button type="button" className={btnQuiet} onClick={() => onEdit(c)}>Edit</button>
            <button type="button" className={btnQuietDanger} onClick={() => onDelete(c)}>Delete</button>
          </span>
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Cluster form (modal body)                                           */
/* ------------------------------------------------------------------ */

function ClusterForm({ initial, saving, error, onSave, onCancel }) {
  const uid = useId();
  const [form, setForm] = useState(initial);
  const [nameError, setNameError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.name.trim()) {
      setNameError('Enter a cluster name.');
      document.getElementById(`${uid}-name`)?.focus();
      return;
    }
    const payload = { ...form, name: form.name.trim() };
    // On edit the target date is sent only when it was picked again: the
    // value the form opened with is the API's UTC string, and sent back it
    // would be stored as the day before.
    if (initial.id && form.target_date === initial.target_date) delete payload.target_date;
    onSave(payload);
  };

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Notice>{error}</Notice>}

      <div>
        <label htmlFor={`${uid}-name`} className={labelCls}>
          Cluster name
          <span className="ml-0.5 text-[var(--danger)]" aria-hidden="true">*</span>
        </label>
        <input
          id={`${uid}-name`}
          className={inputCls}
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(''); }}
          placeholder="Homepage redesign"
          autoFocus
          aria-invalid={!!nameError}
          aria-describedby={nameError ? `${uid}-name-error` : undefined}
        />
        <FieldError id={`${uid}-name-error`}>{nameError}</FieldError>
      </div>

      <div>
        <label htmlFor={`${uid}-description`} className={labelCls}>
          Description
          <span className="ml-1 font-normal text-[var(--text-3)]">(optional)</span>
        </label>
        <textarea
          id={`${uid}-description`}
          rows={3}
          className={`${inputCls} min-h-20 resize-y leading-relaxed`}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="What this cluster covers"
        />
      </div>

      <div>
        <div className={labelCls}>
          Target date
          <span className="ml-1 font-normal text-[var(--text-3)]">(optional)</span>
        </div>
        <DatePicker value={form.target_date} onChange={(val) => setForm((f) => ({ ...f, target_date: val }))} placeholder="dd-mm-yyyy" />
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
        <button type="button" className={btnGhost} onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className={`${btnPrimary} min-w-32`} disabled={saving}>
          {saving ? <Loader label="Saving..." size="sm" variant="button" /> : initial.id ? 'Save changes' : 'Create cluster'}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Clusters({ project: propProject, active = true }) {
  const params = useParams();
  const projectId = propProject?.id || params.id;
  const { isManager } = useAuth();
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState('');
  const [showModal, setShowModal] = useState(false);
  // The cluster being edited, or null when creating one.
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [submittingReview, setSubmittingReview] = useState(null);
  const [confirmModal, setConfirmModal] = useState(EMPTY_CONFIRM);

  const load = async () => {
    try {
      // The first load picks up the request Project Detail already started
      // from the URL id (api/prefetch.js); every later load sends its own.
      const url = `/clusters/project/${projectId}`;
      const response = await (takePrefetched(url) || api.get(url));
      setClusters(response.data);
      setLoadError(false);
    } catch (error) {
      console.error('Error loading clusters:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId && active) load();
  }, [projectId, active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const openNew = () => {
    setEditing(null);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (cluster) => {
    setEditing(cluster);
    setFormError('');
    setShowModal(true);
  };

  const closeForm = () => {
    setShowModal(false);
    setEditing(null);
    setFormError('');
  };

  const handleSave = async (form) => {
    setSaving(true);
    setFormError('');
    try {
      if (editing) await api.put(`/clusters/${editing.id}`, form);
      else await api.post('/clusters', { ...form, project_id: projectId });
      closeForm();
      await load();
    } catch (error) {
      // The form stays open so nothing typed is lost.
      setFormError(error.response?.data?.error || "We couldn't save this cluster. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (cluster) => {
    setConfirmModal({
      show: true,
      title: 'Delete cluster',
      message: `Delete “${cluster.name}”? This can’t be undone.`,
      isDangerous: true,
      action: async () => {
        try {
          await api.delete(`/clusters/${cluster.id}`);
          await load();
        } catch (error) {
          console.error('Error deleting cluster:', error);
          setNotice(error.response?.data?.error || "We couldn't delete that cluster. Please try again.");
        }
      },
      loading: false,
    });
  };

  const executeConfirmAction = async () => {
    if (!confirmModal.action) return;
    setConfirmModal((prev) => ({ ...prev, loading: true }));
    try {
      await confirmModal.action();
    } finally {
      setConfirmModal(EMPTY_CONFIRM);
    }
  };

  const handleSubmitReview = async (id) => {
    setSubmittingReview(id);
    setNotice('');
    try {
      await api.post(`/clusters/${id}/submit-review`);
      await load();
    } catch (error) {
      console.error('Error submitting cluster for review:', error);
      setNotice(error.response?.data?.error || "We couldn't submit this cluster for review. Please try again.");
    } finally {
      setSubmittingReview(null);
    }
  };

  const newButton = isManager && (
    <button type="button" className={btnPrimary} onClick={openNew}>
      <Icon d={ICONS.plus} className="h-4 w-4" />
      New cluster
    </button>
  );

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="text-sm tabular-nums text-[var(--text-2)]" aria-live="polite">
          {loading ? 'Loading clusters' : plural(clusters.length, 'cluster')}
        </div>
        {!loading && clusters.length > 0 && newButton}
      </div>

      {notice && <Notice onDismiss={() => setNotice('')}>{notice}</Notice>}

      {loading ? (
        <>
          <span className="sr-only" role="status">Loading clusters</span>
          <SkeletonCards />
        </>
      ) : loadError && clusters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-14 text-center">
          <div className="mb-1 text-[15px] font-semibold text-[var(--text)]">We couldn't load the clusters</div>
          <p className="m-0 mb-5 text-[13px] text-[var(--text-3)]">Check your connection and try again.</p>
          <button type="button" className={btnGhost} onClick={() => { setLoading(true); load(); }}>Try again</button>
        </div>
      ) : clusters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-14 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--bg-3)] text-[var(--text-3)]">
            <Icon d={ICONS.cluster} className="h-5 w-5" />
          </div>
          <div className="mb-1 text-[15px] font-semibold text-[var(--text)]">No clusters yet</div>
          <p className="m-0 mx-auto max-w-sm text-[13px] leading-relaxed text-[var(--text-3)]">
            {isManager
              ? 'A cluster groups related tasks so you can send them for review together.'
              : 'Clusters created for this project will show up here.'}
          </p>
          {isManager && <div className="mt-5">{newButton}</div>}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4">
          {clusters.map((c) => (
            <ClusterCard
              key={c.id}
              cluster={c}
              projectId={projectId}
              isManager={isManager}
              submitting={submittingReview === c.id}
              onSubmitReview={handleSubmitReview}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit cluster' : 'New cluster'} onClose={closeForm}>
          <ClusterForm
            initial={
              editing
                ? { id: editing.id, name: editing.name, description: editing.description || '', target_date: editing.target_date || '' }
                : EMPTY_FORM
            }
            saving={saving}
            error={formError}
            onSave={handleSave}
            onCancel={closeForm}
          />
        </Modal>
      )}

      <ConfirmModal
        isOpen={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.isDangerous ? 'Delete' : 'Confirm'}
        isDangerous={confirmModal.isDangerous}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmModal(EMPTY_CONFIRM)}
        loading={confirmModal.loading}
      />
    </div>
  );
}