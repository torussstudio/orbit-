import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useLiveRefetch, TASK_AND_PROJECT_EVENTS } from '../hooks/useLiveEvents';
import Select from '../components/ui/Select';
import DatePicker from '../components/ui/DatePicker';
import Loader from '../components/ui/Loader';
import Modal from '../components/ui/Modal';

/*
 * Member Time Log: log time spent on a task.
 *
 * Project, cluster (optional) and task lists only hold what is assigned to
 * this member, and tasks the manager has marked Done or the member has sent
 * for review are left out (the server builds these lists).
 *
 * "Miscellaneous" is for work that isn't a task in Orbit: pick one of your
 * projects and type the task name. It is saved only in the time log and
 * never becomes a task in the project.
 *
 * The second tab shows this member's entries and allows edits or deletion
 * during the first hour after each entry was created.
 *
 * Coming from the Task view's "Log time" button, the URL carries `return_to`
 * (the Task view path). After a successful save the member goes back there.
 * Opening this page any other way has no `return_to`, so it behaves as before.
 */

/* Same class strings as TaskForm / Task Request so the theme matches. */
const labelCls = 'mb-1.5 block text-[13px] font-medium tracking-[-0.005em] text-[var(--text)]';
const hintCls = 'mt-1.5 text-[11px] leading-relaxed text-[color:var(--text-3)]';
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

/* Number inputs: tabular figures, native spinners hidden (unit suffix shown instead). */
const numberCls = [
  inputCls,
  'pr-9 tabular-nums',
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
].join(' ');

/* Cards: hairline ring plus a soft shadow tinted with the accent hue. */
const cardCls =
  'rounded-2xl bg-[var(--bg-2)] shadow-[0_0_0_1px_var(--border),0_18px_40px_-24px_color-mix(in_srgb,var(--accent)_30%,transparent)]';

/* Small section label inside the form. */
const groupCls = 'text-[11px] font-medium tracking-[0.06em] text-[color:var(--text-3)]';

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

const ClockIcon = () => (
  <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></Icon>
);

function Required() {
  return <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>;
}

function Optional() {
  return <span className="ml-1 font-normal text-[color:var(--text-3)]">(optional)</span>;
}

function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-[color:var(--danger)]">
      {children}
    </p>
  );
}

function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--bg-3)] motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  );
}

// 90 -> "1h 30m", 45 -> "45m", 120 -> "2h"
function formatMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Today as YYYY-MM-DD in IST (the server checks the date with the same rule).
const istToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const sameId = (a, b) => a !== null && a !== undefined && a !== '' && String(a) === String(b);

// Only an in-app path is allowed as a return target (never another site).
const safeReturnPath = (value) =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '';

const EMPTY_WORK = { cluster_id: '', task_id: '', task_name: '', hours: '', mins: '' };

function MyEntriesPanel({ onLogTime }) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await api.get('/time-log/my/entries');
      setEntries(res.data?.entries || []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || "We couldn't load your time entries.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const isEditable = (entry) => entry.can_edit && new Date(entry.created_at).getTime() + 60 * 60 * 1000 > now;
  const minutesLeft = (entry) =>
    Math.max(1, Math.ceil((new Date(entry.created_at).getTime() + 60 * 60 * 1000 - now) / 60000));

  const save = async (event) => {
    event.preventDefault();
    if (!editing || busyId) return;
    const hours = editing.hours === '' ? 0 : Number(editing.hours);
    const mins = editing.mins === '' ? 0 : Number(editing.mins);
    const minutes = hours * 60 + mins;
    if (!Number.isInteger(hours) || !Number.isInteger(mins) || hours < 0 || mins < 0 || mins > 59 || minutes < 1 || minutes > 1440 || !editing.work_date) {
      setError('Enter a valid date and time (minutes 0–59, total 1 minute to 24 hours).');
      return;
    }
    setBusyId(editing.id);
    try {
      await api.put(`/time-log/my/entries/${editing.id}`, {
        work_date: editing.work_date,
        minutes,
        ...(editing.is_misc ? { task_name: editing.task_name } : {}),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || "We couldn't update this entry.");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (entry) => {
    if (busyId || !entry) return;
    setBusyId(entry.id);
    try {
      await api.delete(`/time-log/my/entries/${entry.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || "We couldn't delete this entry.");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
    <section className={`mt-6 p-5 sm:p-6 ${cardCls}`} aria-label="My time entries">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.015em] text-[var(--text)]">Your time entries</h2>
          <p className="mt-1 text-xs text-[color:var(--text-3)]">Edit or delete an entry within one hour after logging it.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className={`rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[var(--text)] transition duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] text-[color:var(--danger)]">
          <AlertIcon />
          <span>{error}</span>
        </p>
      )}
      {!loaded ? (
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">Loading your time entries</span>
          <Skeleton className="h-[62px] w-full" />
          <Skeleton className="h-[62px] w-full" />
          <Skeleton className="h-[62px] w-full" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl bg-[var(--bg-3)] px-4 py-10 text-center">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-2)] text-[color:var(--text-3)] shadow-[0_0_0_1px_var(--border)]">
            <ClockIcon />
          </span>
          <p className="text-sm font-medium text-[var(--text)]">No time entries yet</p>
          <p className="mt-1 max-w-[36ch] text-xs leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
            Entries you log will show up here, and stay editable for an hour.
          </p>
          <button
            type="button"
            onClick={onLogTime}
            className={`mt-4 rounded-md px-2 py-1 text-xs font-medium text-[color:var(--accent)] underline-offset-4 transition-colors hover:underline ${focusRing}`}
          >
            Log your first entry
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {entries.map((entry) => {
            const editable = isEditable(entry);
            const editingThis = editing?.id === entry.id;
            return (
              <li key={entry.id} className="rounded-xl bg-[var(--bg-3)] p-4 transition-colors duration-200 motion-reduce:transition-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium tracking-[-0.005em] text-[var(--text)]">{entry.task_title}</p>
                    <p className="mt-1 text-xs tabular-nums text-[color:var(--text-3)]">{entry.project_name} · {entry.work_date}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-[var(--bg-2)] px-2 py-1 text-xs font-semibold tabular-nums text-[var(--text)] shadow-[0_0_0_1px_var(--border)]">
                    {formatMinutes(entry.minutes)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {editable ? (
                    <>
                      <span className="text-[11px] tabular-nums text-[color:var(--text-3)]">Editable for {minutesLeft(entry)}m more</span>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => setEditing({ id: entry.id, work_date: entry.work_date, hours: String(Math.floor(entry.minutes / 60)), mins: String(entry.minutes % 60), task_name: entry.task_title, is_misc: entry.is_misc })} className={`rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition duration-150 hover:bg-[var(--bg-2)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}>Edit</button>
                        <button type="button" disabled={busyId === entry.id} onClick={() => setDeleteTarget(entry)} className={`rounded-md px-3 py-1.5 text-xs font-medium text-[color:var(--danger)] transition duration-150 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}>Delete</button>
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-[color:var(--text-3)]">Edit window ended</span>
                  )}
                </div>
                {editingThis && editable && (
                  <form onSubmit={save} className="mt-4 grid gap-4 rounded-lg bg-[var(--bg-2)] p-4 shadow-[0_0_0_1px_var(--border)] sm:grid-cols-2">
                    {entry.is_misc && <label className="text-xs text-[var(--text-2)] sm:col-span-2">Task name<input className={`${inputCls} mt-1`} maxLength={500} value={editing.task_name} onChange={(e) => setEditing((v) => ({ ...v, task_name: e.target.value }))} required /></label>}
                    <label className="text-xs text-[var(--text-2)]">Work date<input className={`${inputCls} mt-1`} type="date" max={istToday()} value={editing.work_date} onChange={(e) => setEditing((v) => ({ ...v, work_date: e.target.value }))} required /></label>
                    <fieldset className="min-w-0 border-0 p-0">
                      <legend className="mb-1.5 text-xs text-[var(--text-2)]">Time taken</legend>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-[11px] text-[color:var(--text-3)]">Hours<input className={`${numberCls} mt-1`} type="number" min="0" max="24" step="1" inputMode="numeric" value={editing.hours} onChange={(e) => setEditing((v) => ({ ...v, hours: e.target.value }))} /></label>
                        <label className="text-[11px] text-[color:var(--text-3)]">Minutes<input className={`${numberCls} mt-1`} type="number" min="0" max="59" step="1" inputMode="numeric" value={editing.mins} onChange={(e) => setEditing((v) => ({ ...v, mins: e.target.value }))} /></label>
                      </div>
                    </fieldset>
                    <div className="flex items-end gap-2 sm:col-span-2 sm:justify-end"><button type="submit" disabled={busyId === entry.id} className={`rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}>{busyId === entry.id ? 'Saving…' : 'Save'}</button><button type="button" onClick={() => setEditing(null)} className={`rounded-lg border border-[color:var(--border)] px-4 py-2 text-xs text-[var(--text)] transition duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}>Cancel</button></div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
    {deleteTarget && (
      <Modal title="Delete time entry?" onClose={() => busyId !== deleteTarget.id && setDeleteTarget(null)} size="sm">
        <p className="text-sm leading-relaxed text-[color:var(--text-2)]">
          Delete the time log for <span className="font-semibold text-[var(--text)]">{deleteTarget.task_title}</span>? This removes it from the shared time log.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-[color:var(--danger)]">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" disabled={busyId === deleteTarget.id} onClick={() => setDeleteTarget(null)} className={`rounded-lg border border-[color:var(--border)] px-4 py-2 text-sm transition duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}>Cancel</button>
          <button type="button" disabled={busyId === deleteTarget.id} onClick={() => remove(deleteTarget)} className={`rounded-lg bg-[color:var(--danger)] px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}>{busyId === deleteTarget.id ? 'Deleting…' : 'Delete entry'}</button>
        </div>
      </Modal>
    )}
    </>
  );
}

export default function MyTimeLog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedProjectId = searchParams.get('project_id') || '';
  const requestedTaskId = searchParams.get('task_id') || '';
  const returnTo = safeReturnPath(searchParams.get('return_to') || '');
  const uid = useId();
  const ids = {
    misc: `${uid}-misc`,
    project: `${uid}-project`,
    projectError: `${uid}-project-error`,
    cluster: `${uid}-cluster`,
    task: `${uid}-task`,
    taskError: `${uid}-task-error`,
    taskName: `${uid}-task-name`,
    date: `${uid}-date`,
    dateError: `${uid}-date-error`,
    hours: `${uid}-hours`,
    mins: `${uid}-mins`,
    timeError: `${uid}-time-error`,
  };

  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const [isMisc, setIsMisc] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [work, setWork] = useState(EMPTY_WORK);
  const [workDate, setWorkDate] = useState(istToday);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [saved, setSaved] = useState(null); // { text }
  const [activeTab, setActiveTab] = useState('new');

  const taskNameRef = useRef(null);
  const hoursRef = useRef(null);
  const preselectionHandled = useRef(false);

  const hasOptions = useRef(false);
  const load = useCallback(async () => {
    try {
      const res = await api.get('/time-log/my/options');
      hasOptions.current = true;
      setLoadError(false);
      setOptions(res.data);
    } catch {
      // A failed live refresh keeps the form as it is.
      if (!hasOptions.current) setLoadError(true);
    }
  }, []);

  // Live: assignments, task stage changes, and projects added or removed.
  useLiveRefetch(TASK_AND_PROJECT_EVENTS, load);

  useEffect(() => {
    load();
  }, [load]);

  const projects = options?.projects || [];
  const today = options?.today || istToday();

  // Task-view shortcuts pass the project and task in the URL. Apply them only
  // after the member's eligible options have loaded, then put focus on time.
  useEffect(() => {
    if (!options || preselectionHandled.current) return;
    preselectionHandled.current = true;

    const selectedTask = requestedTaskId
      ? (options.tasks || []).find((task) => sameId(task.id, requestedTaskId))
      : null;

    if (selectedTask) {
      setIsMisc(false);
      setProjectId(String(selectedTask.project_id));
      setWork({
        ...EMPTY_WORK,
        cluster_id: selectedTask.cluster_id == null ? '' : String(selectedTask.cluster_id),
        task_id: String(selectedTask.id),
      });
      window.requestAnimationFrame(() => hoursRef.current?.focus());
      return;
    }

    if (requestedProjectId && projects.some((project) => sameId(project.id, requestedProjectId))) {
      setProjectId(String(requestedProjectId));
    }
  }, [options, projects, requestedProjectId, requestedTaskId]);

  // Lists for the selected project only.
  const projectTasks = useMemo(
    () => (options?.tasks || []).filter((t) => sameId(t.project_id, projectId)),
    [options, projectId],
  );
  const projectClusters = useMemo(
    () => (options?.clusters || []).filter((c) => sameId(c.project_id, projectId)),
    [options, projectId],
  );
  const visibleTasks = useMemo(
    () => (work.cluster_id ? projectTasks.filter((t) => sameId(t.cluster_id, work.cluster_id)) : projectTasks),
    [projectTasks, work.cluster_id],
  );

  // Selected project/task disappeared after a refresh (e.g. task marked Done).
  useEffect(() => {
    if (!options) return;
    if (projectId && !projects.some((p) => sameId(p.id, projectId))) setProjectId('');
  }, [options, projects, projectId]);
  useEffect(() => {
    if (work.task_id && !visibleTasks.some((t) => sameId(t.id, work.task_id))) {
      setWork((w) => ({ ...w, task_id: '' }));
    }
  }, [visibleTasks, work.task_id]);

  // Live total shown beside the time fields; 0 while the input is not valid yet.
  const previewMinutes = useMemo(() => {
    const h = work.hours === '' ? 0 : Number(work.hours);
    const m = work.mins === '' ? 0 : Number(work.mins);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return 0;
    const total = h * 60 + m;
    return total > 0 && total <= 24 * 60 ? total : 0;
  }, [work.hours, work.mins]);

  const clearMessages = () => {
    setSubmitError('');
    if (saved) setSaved(null);
  };

  const setField = (key, value) => {
    setWork((w) => ({ ...w, [key]: value }));
    setErrors((e) => ({ ...e, [key === 'hours' || key === 'mins' ? 'time' : key]: '' }));
    clearMessages();
  };

  const pickProject = (value) => {
    setProjectId(value);
    setWork((w) => ({ ...w, cluster_id: '', task_id: '' }));
    setErrors((e) => ({ ...e, project: '', task_id: '' }));
    clearMessages();
  };

  const pickCluster = (value) => {
    setWork((w) => ({ ...w, cluster_id: value, task_id: '' }));
    clearMessages();
  };

  const toggleMisc = () => {
    setIsMisc((v) => !v);
    setWork((w) => ({ ...w, cluster_id: '', task_id: '', task_name: '' }));
    setErrors({});
    clearMessages();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const next = {};
    if (!projectId) next.project = 'Select a project.';
    if (isMisc) {
      if (!work.task_name.trim()) next.task_name = 'Enter the task name.';
    } else if (!work.task_id) {
      next.task_id = 'Select a task.';
    }
    if (!workDate) next.date = 'Select the date you worked on this.';
    else if (workDate > today) next.date = "The date can't be in the future.";

    const h = work.hours === '' ? 0 : Number(work.hours);
    const m = work.mins === '' ? 0 : Number(work.mins);
    let minutes = 0;
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0) {
      next.time = 'Enter whole numbers for hours and minutes.';
    } else if (m > 59) {
      next.time = 'Minutes must be between 0 and 59.';
    } else {
      minutes = h * 60 + m;
      if (minutes <= 0) next.time = 'Enter the time taken (at least 1 minute).';
      else if (minutes > 24 * 60) next.time = "One entry can't be more than 24 hours.";
    }

    if (Object.keys(next).length) {
      setErrors(next);
      if (next.task_name) taskNameRef.current?.focus();
      else if (next.time && !next.project && !next.task_id && !next.date) hoursRef.current?.focus();
      return;
    }

    setSaving(true);
    setSubmitError('');
    try {
      const payload = { project_id: projectId, work_date: workDate, minutes, is_misc: isMisc };
      if (isMisc) payload.task_name = work.task_name.trim();
      else payload.task_id = work.task_id;

      const res = await api.post('/time-log/entries', payload);

      // Opened from the Task view: go back there once the time is saved.
      // Only a successful save gets here; errors land in the catch below.
      if (returnTo) {
        navigate(returnTo);
        return;
      }

      const name = res.data?.task_title || (isMisc ? work.task_name.trim() : 'the task');
      setSaved({ text: `Saved ${formatMinutes(minutes)} on “${name}”.` });
      // Keep project, cluster and date for the next entry; clear the rest.
      setWork((w) => ({ ...EMPTY_WORK, cluster_id: isMisc ? '' : w.cluster_id }));
      setErrors({});
    } catch (err) {
      setSubmitError(err?.response?.data?.error || "We couldn't save this. Please try again.");
      // The task may have been marked Done meanwhile: refresh the lists.
      if (err?.response?.status === 403) load();
    } finally {
      setSaving(false);
    }
  };

  const projectOptions = projects.map((p) => ({
    value: String(p.id),
    label: p.client_name ? `${p.name} · ${p.client_name}` : p.name,
  }));
  const clusterOptions = [
    { value: '', label: 'All clusters' },
    ...projectClusters.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const taskOptions = visibleTasks.map((t) => ({
    value: String(t.id),
    label: t.parent_task_id ? `${t.title}  (sub task of ${t.parent_title || 'main task'})` : t.title,
  }));

  const tabCls = (name) =>
    [
      'rounded-md px-3.5 py-1.5 text-[13px] font-medium transition duration-200 motion-reduce:transition-none',
      activeTab === name
        ? 'bg-[var(--bg-3)] text-[var(--text)] shadow-[0_0_0_1px_var(--border)]'
        : 'text-[color:var(--text-3)] hover:text-[var(--text)]',
      focusRing,
    ].join(' ');

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6 md:py-12">
      <header>
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.035em] text-[var(--text)] [text-wrap:balance]">
          Time log
        </h1>
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
          Log the time you spent on your work. You can log the same task more than once.
        </p>
      </header>

      {saved && (
        <div
          role="status"
          className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-[var(--accent-glow)] px-4 py-3 text-[13px] text-[color:var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
        >
          <span className="inline-flex min-w-0 items-center gap-2 font-medium">
            <CheckIcon />
            <span className="[overflow-wrap:anywhere]">{saved.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setSaved(null)}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
          >
            Dismiss
          </button>
        </div>
      )}

      {!options && !loadError && (
        <div role="status" className={`mt-6 p-5 sm:p-6 ${cardCls}`}>
          <span className="sr-only">Loading your projects</span>
          <div className="flex flex-col gap-6">
            <Skeleton className="h-[68px] w-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-12" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className={`mt-6 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[13px] text-[color:var(--text-2)] ${cardCls}`}
        >
          <span className="inline-flex items-center gap-2 text-[color:var(--danger)]">
            <AlertIcon />
            We couldn't load your projects.
          </span>
          <button
            type="button"
            onClick={() => {
              setLoadError(false);
              load();
            }}
            className={`rounded-lg border border-[color:var(--border)] px-3.5 py-2 text-xs font-medium text-[var(--text)] transition duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
          >
            Try again
          </button>
        </div>
      )}

      {options && (
        <>
        <div role="tablist" aria-label="Time log sections" className="mt-6 inline-flex gap-1 rounded-lg bg-[var(--bg-2)] p-1 shadow-[0_0_0_1px_var(--border)]">
          <button type="button" role="tab" aria-selected={activeTab === 'new'} onClick={() => setActiveTab('new')} className={tabCls('new')}>Log time</button>
          <button type="button" role="tab" aria-selected={activeTab === 'entries'} onClick={() => setActiveTab('entries')} className={tabCls('entries')}>My entries</button>
        </div>
        {activeTab === 'entries' ? <MyEntriesPanel onLogTime={() => setActiveTab('new')} /> : projects.length === 0 ? (
          <div className={`mt-6 flex flex-col items-center px-5 py-12 text-center ${cardCls}`}>
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-3)] text-[color:var(--text-3)] shadow-[0_0_0_1px_var(--border)]">
              <ClockIcon />
            </span>
            <p className="text-sm font-medium text-[var(--text)]">No projects yet</p>
            <p className="mt-1 max-w-[40ch] text-[13px] leading-relaxed text-[color:var(--text-2)] [text-wrap:pretty]">
              You aren't on any project yet. Once a manager adds you to a project, you can log time here.
            </p>
          </div>
        ) : <form
          noValidate
          onSubmit={handleSubmit}
          className={`mt-6 p-5 sm:p-7 ${cardCls}`}
        >
          <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
            <legend className="sr-only">New time entry</legend>

            {/* Miscellaneous toggle */}
            <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--bg-3)] p-4">
              <div>
                <span id={ids.misc} className="block text-[13px] font-medium text-[var(--text)]">
                  Miscellaneous task
                </span>
                <p className="mt-0.5 max-w-[44ch] text-[11px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
                  For work that isn't a task in Orbit. Saved only in the time log, not added to the project.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isMisc}
                aria-labelledby={ids.misc}
                onClick={toggleMisc}
                className={[
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none',
                  focusRing,
                  isMisc ? 'bg-[var(--accent)]' : 'bg-[var(--border)]',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none',
                    isMisc ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>

            <p className={`${groupCls} -mb-2`}>What you worked on</p>

            {/* Project */}
            <div>
              <label htmlFor={ids.project} className={labelCls}>
                Project
                <Required />
              </label>
              <Select
                id={ids.project}
                value={projectId}
                onChange={pickProject}
                options={projectOptions}
                placeholder="Select a project"
                aria-label="Project"
              />
              <FieldError id={ids.projectError}>{errors.project}</FieldError>
            </div>

            {!isMisc && (
              <>
                {/* Cluster (optional) */}
                <div>
                  <label htmlFor={ids.cluster} className={labelCls}>
                    Cluster
                    <Optional />
                  </label>
                  <Select
                    id={ids.cluster}
                    value={work.cluster_id}
                    onChange={pickCluster}
                    options={clusterOptions}
                    placeholder="All clusters"
                    disabled={!projectId || projectClusters.length === 0}
                    aria-label="Cluster"
                  />
                  {projectId && projectClusters.length === 0 && (
                    <p className={hintCls}>Your tasks in this project aren't in any cluster.</p>
                  )}
                </div>

                {/* Task */}
                <div>
                  <label htmlFor={ids.task} className={labelCls}>
                    Task
                    <Required />
                  </label>
                  <Select
                    id={ids.task}
                    value={work.task_id}
                    onChange={(v) => setField('task_id', v)}
                    options={taskOptions}
                    placeholder={
                      !projectId
                        ? 'Select a project first'
                        : visibleTasks.length === 0
                          ? 'No open tasks assigned to you here'
                          : 'Select a task'
                    }
                    disabled={!projectId || visibleTasks.length === 0}
                    aria-label="Task"
                  />
                  <FieldError id={ids.taskError}>{errors.task_id}</FieldError>
                  {!errors.task_id && projectId && visibleTasks.length === 0 && (
                    <p className={hintCls}>
                      Only your assigned tasks that aren't Done or In Review show here. For other work, turn on Miscellaneous task.
                    </p>
                  )}
                </div>
              </>
            )}

            {isMisc && (
              <div>
                <label htmlFor={ids.taskName} className={labelCls}>
                  Task name
                  <Required />
                </label>
                <input
                  ref={taskNameRef}
                  id={ids.taskName}
                  className={inputCls}
                  value={work.task_name}
                  maxLength={500}
                  onChange={(e) => setField('task_name', e.target.value)}
                  placeholder="What did you work on?"
                  aria-required="true"
                  aria-invalid={!!errors.task_name}
                  aria-describedby={errors.task_name ? `${ids.taskName}-error` : undefined}
                />
                <FieldError id={`${ids.taskName}-error`}>{errors.task_name}</FieldError>
              </div>
            )}

            <div className="border-t border-[color:var(--border)]" aria-hidden="true" />
            <p className={`${groupCls} -mb-2`}>When and how long</p>

            {/* Date */}
            <div>
              <span className={labelCls}>
                Date
                <Required />
              </span>
              <DatePicker
                id={ids.date}
                value={workDate}
                onChange={(v) => {
                  setWorkDate(v);
                  setErrors((er) => ({ ...er, date: '' }));
                  clearMessages();
                }}
                maxDate={today}
                placeholder="dd-mm-yyyy"
              />
              <FieldError id={ids.dateError}>{errors.date}</FieldError>
            </div>

            {/* Time taken */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="block text-[13px] font-medium tracking-[-0.005em] text-[var(--text)]">
                  Time taken
                  <Required />
                </span>
                {previewMinutes > 0 && (
                  <span className="text-xs font-medium tabular-nums text-[color:var(--accent)]" aria-live="polite">
                    {formatMinutes(previewMinutes)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={ids.hours} className="mb-1 block text-[11px] text-[color:var(--text-3)]">
                    Hours
                  </label>
                  <div className="relative">
                    <input
                      ref={hoursRef}
                      id={ids.hours}
                      className={numberCls}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="24"
                      step="1"
                      value={work.hours}
                      onChange={(e) => setField('hours', e.target.value)}
                      placeholder="0"
                      aria-invalid={!!errors.time}
                      aria-describedby={errors.time ? ids.timeError : undefined}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--text-3)]" aria-hidden="true">h</span>
                  </div>
                </div>
                <div>
                  <label htmlFor={ids.mins} className="mb-1 block text-[11px] text-[color:var(--text-3)]">
                    Minutes
                  </label>
                  <div className="relative">
                    <input
                      id={ids.mins}
                      className={numberCls}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="59"
                      step="1"
                      value={work.mins}
                      onChange={(e) => setField('mins', e.target.value)}
                      placeholder="0"
                      aria-invalid={!!errors.time}
                      aria-describedby={errors.time ? ids.timeError : undefined}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--text-3)]" aria-hidden="true">m</span>
                  </div>
                </div>
              </div>
              <FieldError id={ids.timeError}>{errors.time}</FieldError>
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
              {saving ? <Loader label="Saving..." size="sm" variant="button" /> : 'Save time'}
            </button>
          </div>
        </form>}
        </>
      )}
    </div>
  );
}