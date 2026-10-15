import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useLiveRefetch, TASK_AND_PROJECT_EVENTS } from '../hooks/useLiveEvents';
import Select from '../components/ui/Select';
import DatePicker from '../components/ui/DatePicker';
import Loader from '../components/ui/Loader';

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
 * Old entries are not shown here; managers see them on their Time Log page.
 */

/* Same class strings as TaskForm / Task Request so the theme matches. */
const labelCls = 'mb-1.5 block text-[13px] font-medium tracking-[-0.005em] text-[var(--text)]';
const hintCls = 'mt-1.5 text-[11px] text-[color:var(--text-3)]';
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

const EMPTY_WORK = { cluster_id: '', task_id: '', task_name: '', hours: '', mins: '' };

export default function MyTimeLog() {
  const [searchParams] = useSearchParams();
  const requestedProjectId = searchParams.get('project_id') || '';
  const requestedTaskId = searchParams.get('task_id') || '';
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

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6 md:py-10">
      <header>
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-[var(--text)] [text-wrap:balance]">
          Time log
        </h1>
        <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
          Log the time you spent on your work. You can log the same task more than once.
        </p>
      </header>

      {saved && (
        <div
          role="status"
          className="mt-6 flex items-center justify-between gap-3 rounded-lg bg-[var(--accent-glow)] px-4 py-3 text-[13px] text-[color:var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
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
        <div className="mt-6 flex justify-center rounded-xl bg-[var(--bg-2)] p-10 shadow-[0_0_0_1px_var(--border)]">
          <Loader label="Loading your projects" size="md" />
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--bg-2)] px-5 py-4 text-[13px] text-[color:var(--text-2)] shadow-[0_0_0_1px_var(--border)]"
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
            className={`rounded-lg border border-[color:var(--border)] px-3.5 py-2 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-3)] ${focusRing}`}
          >
            Try again
          </button>
        </div>
      )}

      {options && projects.length === 0 && (
        <div className="mt-6 rounded-xl bg-[var(--bg-2)] px-5 py-8 text-center text-[13px] leading-relaxed text-[color:var(--text-2)] shadow-[0_0_0_1px_var(--border)]">
          You aren't on any project yet. Once a manager adds you to a project, you can log time here.
        </div>
      )}

      {options && projects.length > 0 && (
        <form
          noValidate
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl bg-[var(--bg-2)] p-5 shadow-[0_0_0_1px_var(--border)] sm:p-6"
        >
          <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
            <legend className="sr-only">New time entry</legend>

            {/* Miscellaneous toggle */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] p-4">
              <div>
                <span id={ids.misc} className="block text-[13px] font-medium text-[var(--text)]">
                  Miscellaneous task
                </span>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[color:var(--text-3)]">
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
              <span className={labelCls}>
                Time taken
                <Required />
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={ids.hours} className="mb-1 block text-[11px] text-[color:var(--text-3)]">
                    Hours
                  </label>
                  <input
                    ref={hoursRef}
                    id={ids.hours}
                    className={inputCls}
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
                </div>
                <div>
                  <label htmlFor={ids.mins} className="mb-1 block text-[11px] text-[color:var(--text-3)]">
                    Minutes
                  </label>
                  <input
                    id={ids.mins}
                    className={inputCls}
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

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-[color:var(--border)] pt-5">
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
        </form>
      )}
    </div>
  );
}
