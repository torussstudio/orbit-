import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { cachedMembers, rememberMembers } from '../api/membersCache';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import MemberFilterBar from '../components/ui/MemberFilterBar';
import Loader from '../components/ui/Loader';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

// Static class strings per item type (Tailwind needs full literals).
const TYPES = {
  event: {
    label: 'Event',
    dot: 'bg-[#6366f1]',
    tint: 'bg-[#6366f1]/15 text-[#6366f1]',
    bar: 'border-l-[#6366f1]',
    solid: 'bg-[#6366f1] text-white',
  },
  task: {
    label: 'Task',
    dot: 'bg-[#0ea5e9]',
    tint: 'bg-[#0ea5e9]/15 text-[#0ea5e9]',
    bar: 'border-l-[#0ea5e9]',
    solid: 'bg-[#0ea5e9] text-white',
  },
  deadline: {
    label: 'Deadline',
    dot: 'bg-[#a855f7]',
    tint: 'bg-[#a855f7]/15 text-[#a855f7]',
    bar: 'border-l-[#a855f7]',
    solid: 'bg-[#a855f7] text-white',
  },
  birthday: {
    label: 'Birthday',
    dot: 'bg-[#f59e0b]',
    tint: 'bg-[#f59e0b]/15 text-[#f59e0b]',
    bar: 'border-l-[#f59e0b]',
    solid: 'bg-[#f59e0b] text-white',
  },
};

// Order used when listing a day's items inside the day modal.
const TYPE_ORDER = { event: 0, task: 1, deadline: 2, birthday: 3 };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const VIEWS = ['month', 'week', 'day'];

const EMPTY_CONFIRM = { show: false, title: '', message: '', action: null, loading: false, isDangerous: false };

/* ------------------------------------------------------------------ */
/* Shared class strings (Tailwind only, driven by your CSS variables)  */
/* ------------------------------------------------------------------ */

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-0';

const btnBase = [
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium',
  'transition duration-150 motion-reduce:transition-none active:scale-[0.98]',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
  focusRing,
].join(' ');
const btnSize = { md: 'px-3.5 py-2 text-sm', sm: 'px-2.5 py-1.5 text-xs' };
const btnGhost = (size = 'md') =>
  `${btnBase} ${btnSize[size]} border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text-2)] hover:bg-[var(--bg-3)]`;
const btnPrimary = (size = 'md') =>
  `${btnBase} ${btnSize[size]} bg-[var(--accent)] font-semibold text-white hover:brightness-110`;
const btnDanger = (size = 'md') =>
  `${btnBase} ${btnSize[size]} border border-[color:var(--danger)] text-[color:var(--danger)] hover:bg-[var(--danger)] hover:text-white`;
const iconBtn = `${btnBase} h-9 w-9 border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text-2)] hover:bg-[var(--bg-3)]`;

const labelCls = 'mb-1.5 block text-[13px] font-medium tracking-[-0.005em]';
const inputCls = [
  'w-full rounded-lg border border-[color:var(--border)] bg-transparent px-3 py-2.5 text-sm',
  'placeholder:text-[color:var(--text-3)]',
  'transition-colors duration-200 motion-reduce:transition-none',
  'hover:border-[color:var(--text-3)] focus:border-[color:var(--accent)]',
  focusRing,
  'aria-[invalid=true]:border-[color:var(--danger)]',
].join(' ');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Builds a value for <input type="datetime-local"> in the user's local time.
function toInputValue(date, hour = 9) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// A main task that has sub tasks only mirrors them (stage and due date are
// derived), so the calendar shows the sub tasks instead. Prefer an explicit
// flag from the API; fall back to checking the loaded data.
function buildHasSubtasks(tasks) {
  const parentIds = new Set(
    tasks.filter((t) => t.parent_task_id != null).map((t) => String(t.parent_task_id)),
  );
  return (task) => {
    if (typeof task.has_subtasks === 'boolean') return task.has_subtasks;
    if (task.subtask_count != null) return Number(task.subtask_count) > 0;
    return parentIds.has(String(task.id));
  };
}

function buildCalendarItems(data, currentYear) {
  const events = data.events.map((event) => ({
    ...event,
    itemType: 'event',
    date: new Date(event.start_date),
    displayTitle: event.title,
    hasTime: true,
  }));

  const hasSubtasks = buildHasSubtasks(data.tasks);
  const tasks = data.tasks
    .filter((task) => !hasSubtasks(task))
    .map((task) => ({
      ...task,
      itemType: 'task',
      date: new Date(task.due_date),
      displayTitle: task.title,
      hasTime: false,
    }));

  const deadlines = data.projects.map((project) => ({
    ...project,
    itemType: 'deadline',
    date: new Date(project.end_date),
    displayTitle: project.name,
    hasTime: false,
  }));

  const birthdays = data.birthdays.map((birthday) => {
    const date = new Date(birthday.birthday);
    date.setFullYear(currentYear);

    return {
      ...birthday,
      itemType: 'birthday',
      date,
      displayTitle: birthday.name,
      hasTime: false,
    };
  });

  return [...events, ...tasks, ...deadlines, ...birthdays];
}

// Projects that appear on the calendar currently loaded (tasks + project deadlines).
function buildProjectOptions(data) {
  const byId = new Map();

  data.tasks.forEach((task) => {
    if (task.project_id != null && task.project_name) {
      byId.set(String(task.project_id), task.project_name);
    }
  });

  data.projects.forEach((project) => {
    if (project.id != null && project.name) {
      byId.set(String(project.id), project.name);
    }
  });

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatCellLabel(item) {
  if (item.itemType === 'task' && item.assignee_name) {
    return `${item.displayTitle} - ${item.assignee_name}`;
  }
  return item.displayTitle;
}

function formatDayMeta(item) {
  if (item.itemType === 'event') {
    return TIME_FMT.format(item.date);
  }
  if (item.itemType === 'task' && item.project_name) return item.project_name;
  if (item.itemType === 'deadline' && item.client_name) return item.client_name;
  return '';
}

function sortDayItems(items) {
  return [...items].sort((a, b) => {
    const byType = TYPE_ORDER[a.itemType] - TYPE_ORDER[b.itemType];
    if (byType !== 0) return byType;
    return a.date - b.date;
  });
}

const stageKey = (stage) => stage?.toLowerCase().replace(/\s/g, '');

/* ------------------------------------------------------------------ */
/* Shared constants, formatters and hooks                              */
/* ------------------------------------------------------------------ */

const EMPTY_ITEMS = [];
const EMPTY_DATA = { events: [], tasks: [], projects: [], birthdays: [] };

// Intl formatters are expensive to build, so they are created once.
const DAY_LONG_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const CELL_LABEL_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const SHORT_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' });

const isAbort = (error) =>
  error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';

const dateKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const itemKey = (item, index) => `${item.itemType}-${item.id || item.name || index}`;

const pluralItems = (count) => `${count} ${count === 1 ? 'item' : 'items'}`;

// Closes a popup on outside click and on Escape.
// `close` receives `true` when it was triggered by Escape.
function useDismiss(open, rootRef, close, { captureEscape = false } = {}) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) closeRef.current();
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      // Captured so Escape closes only the menu, not the modal behind it.
      if (captureEscape) event.stopPropagation();
      closeRef.current(true);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, captureEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, captureEscape);
    };
  }, [open, rootRef, captureEscape]);
}

// Calendar data + member list. Requests are cancelled when they are superseded
// and only the very first load shows the page loader; later loads (filter
// changes, saves) keep the page on screen and just flag `busy`.
function useCalendarData(isManager, memberParams) {
  const [data, setData] = useState(EMPTY_DATA);
  const [members, setMembers] = useState(EMPTY_ITEMS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const controller = useRef(null);

  const paramsRef = useRef(memberParams);
  paramsRef.current = memberParams;

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);

    try {
      const response = await api.get('/calendar', { params: paramsRef.current, signal: current.signal });
      if (!current.signal.aborted) setData(response.data);
    } catch (error) {
      if (!isAbort(error)) console.error('Error loading calendar data:', error);
    } finally {
      if (controller.current === current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    refresh().finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
      controller.current?.abort();
    };
  }, [refresh, memberParams]);

  // The member list is only needed for the manager's filter bar and the event form.
  useEffect(() => {
    if (!isManager) {
      setMembers(EMPTY_ITEMS);
      return undefined;
    }
    // Show the list an earlier page loaded this session until the fresh one arrives.
    const known = cachedMembers();
    if (known) setMembers(known);
    const current = new AbortController();
    api
      .get('/members', { signal: current.signal })
      .then((response) => setMembers(rememberMembers(response.data)))
      .catch((error) => {
        if (!isAbort(error)) console.error('Error loading members:', error);
      });
    return () => current.abort();
  }, [isManager]);

  return { data, setData, members, loading, busy, refresh };
}


/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Icon({ children, className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const ChevronLeft = () => <Icon><path d="M15 6l-6 6 6 6" /></Icon>;
const ChevronRight = () => <Icon><path d="M9 6l6 6-6 6" /></Icon>;
const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const CloseIcon = () => <Icon className="h-3.5 w-3.5"><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const AlertIcon = () => <Icon className="h-3.5 w-3.5 shrink-0"><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17.5v.01" /></Icon>;

function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[color:var(--danger)]">
      <AlertIcon />
      {children}
    </p>
  );
}

function Notice({ children, onDismiss }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[color:var(--danger)] px-3 py-2 text-sm text-[color:var(--danger)]"
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 ${focusRing}`}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Calendar() {
  const { isManager, user } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState('month'); // month grid is the default
  const [current, setCurrent] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  // Manager-only: filter the calendar by member.
  const [selectedFilterMembers, setSelectedFilterMembers] = useState([]);
  // Members and admins: filter by project. Empty = all projects.
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);

  // Modals: null = closed.
  const [formModal, setFormModal] = useState(null); // { editing, prefillStart }
  const [timeTakenTask, setTimeTakenTask] = useState(null);
  const [confirmModal, setConfirmModal] = useState(EMPTY_CONFIRM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // Inline error message (failed stage change, failed delete).
  const [notice, setNotice] = useState('');

  const memberParams = useMemo(() => {
    // Members never filter by other people.
    if (!isManager) return {};
    const memberEmails = selectedFilterMembers
      .map((member) => normalizeEmail(member.email))
      .filter(Boolean);
    return memberEmails.length > 0 ? { members: memberEmails.join(',') } : {};
  }, [isManager, selectedFilterMembers]);

  const { data, setData, members, loading, busy, refresh } = useCalendarData(isManager, memberParams);

  /* ---------- derived data ---------- */

  const year = current.getFullYear();
  const allItems = useMemo(() => buildCalendarItems(data, year), [data, year]);
  const projectOptions = useMemo(() => buildProjectOptions(data), [data]);
  const activeMembers = useMemo(() => members.filter((member) => member.active !== false), [members]);

  // If the available projects change (e.g. admin changes the member filter),
  // drop any selected project that is no longer an option so nothing is hidden by a stale filter.
  useEffect(() => {
    setSelectedProjectIds((previous) => {
      if (previous.length === 0) return previous;
      const available = new Set(projectOptions.map((project) => project.id));
      const next = previous.filter((id) => available.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [projectOptions]);

  // Project filter: applies to tasks and project deadlines.
  // Events and birthdays are not tied to a project, so they always stay visible.
  const visibleItems = useMemo(() => {
    if (selectedProjectIds.length === 0) return allItems;
    const selected = new Set(selectedProjectIds);
    return allItems.filter((item) => {
      if (item.itemType === 'task') return selected.has(String(item.project_id));
      if (item.itemType === 'deadline') return selected.has(String(item.id));
      return true;
    });
  }, [allItems, selectedProjectIds]);

  const itemsByDate = useMemo(() => {
    const byDate = new Map();
    visibleItems.forEach((item) => {
      const key = dateKey(item.date);
      const items = byDate.get(key);
      if (items) items.push(item);
      else byDate.set(key, [item]);
    });
    return byDate;
  }, [visibleItems]);

  const getItemsForDate = useCallback(
    (date) => itemsByDate.get(dateKey(date)) || EMPTY_ITEMS,
    [itemsByDate],
  );

  const selectedItems = useMemo(
    () => (selectedDay ? sortDayItems(getItemsForDate(selectedDay)) : EMPTY_ITEMS),
    [selectedDay, getItemsForDate],
  );
  const dayViewItems = useMemo(
    () => (view === 'day' ? sortDayItems(getItemsForDate(current)) : EMPTY_ITEMS),
    [view, current, getItemsForDate],
  );

  // Auto-dismiss the error notice.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  /* ---------- event form ---------- */

  const openNewEvent = useCallback((date, hour = 9) => {
    setFormError('');
    setFormModal({ editing: null, prefillStart: date ? toInputValue(date, hour) : '' });
  }, []);

  const openEdit = useCallback((item) => {
    setFormError('');
    setFormModal({ editing: item, prefillStart: '' });
  }, []);

  const closeForm = useCallback(() => {
    setFormModal(null);
    setFormError('');
  }, []);

  const editingId = formModal?.editing?.id;
  const handleSave = useCallback(
    async (formData) => {
      setSaving(true);
      setFormError('');
      try {
        if (editingId) await api.put(`/calendar/${editingId}`, formData);
        else await api.post('/calendar', formData);

        closeForm();
        // selectedDay is intentionally kept, so the day modal reappears with the updated list.
        await refresh();
      } catch (error) {
        // The form stays open so nothing typed is lost.
        setFormError(error.response?.data?.error || "We couldn't save this event. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [editingId, closeForm, refresh],
  );

  /* ---------- delete ---------- */

  const closeConfirm = useCallback(() => setConfirmModal(EMPTY_CONFIRM), []);

  const handleDelete = useCallback(
    (id) =>
      setConfirmModal({
        show: true,
        title: 'Delete event',
        message: 'Delete this event? This can’t be undone.',
        isDangerous: true,
        loading: false,
        action: async () => {
          try {
            await api.delete(`/calendar/${id}`);
            await refresh();
          } catch (error) {
            console.error('Error deleting event:', error);
            setNotice("We couldn't delete that event. Please try again.");
          }
        },
      }),
    [refresh],
  );

  const executeConfirmAction = useCallback(async () => {
    if (!confirmModal.action) return;
    setConfirmModal((previous) => ({ ...previous, loading: true }));
    try {
      await confirmModal.action();
    } finally {
      setConfirmModal(EMPTY_CONFIRM);
    }
  }, [confirmModal]);

  /* ---------- tasks ---------- */

  // Same target as clicking a row in Task View: the task's detail page.
  const openTask = useCallback(
    (task) => navigate(`/projects/${task.project_id}/tasks/${task.id}`),
    [navigate],
  );

  // Optimistic stage change with rollback.
  const changeTaskStage = useCallback(
    async (task, newStage, extra = {}) => {
      const previousStage = task.stage;
      const setStage = (stage) =>
        setData((previous) => ({
          ...previous,
          tasks: previous.tasks.map((t) => (t.id === task.id ? { ...t, stage } : t)),
        }));

      setStage(newStage);
      try {
        await api.put(`/tasks/${task.id}`, { stage: newStage, ...extra });
      } catch (error) {
        console.error('Failed to update stage:', error);
        setStage(previousStage);
        setNotice(error.response?.data?.error || "We couldn't update the stage. Please try again.");
      }
    },
    [setData],
  );

  // Members: "In Review" asks for time taken first (same flow as Task View).
  const handleTaskStageSelect = useCallback(
    (task, newStage) => {
      setNotice('');
      if (newStage === 'In Review') setTimeTakenTask(task);
      else changeTaskStage(task, newStage);
    },
    [changeTaskStage],
  );

  const closeTimeTaken = useCallback(() => setTimeTakenTask(null), []);

  const confirmTimeTaken = useCallback(
    (task, minutes) => {
      setTimeTakenTask(null);
      return changeTaskStage(task, 'In Review', { time_taken: minutes });
    },
    [changeTaskStage],
  );

  /* ---------- navigation ---------- */

  const closeDay = useCallback(() => setSelectedDay(null), []);
  const addOnSelectedDay = useCallback(() => openNewEvent(selectedDay), [openNewEvent, selectedDay]);

  const shiftSelectedDay = useCallback((delta) => {
    setSelectedDay((previous) => {
      const next = new Date(previous);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }, []);

  const shiftCurrent = useCallback(
    (direction) => {
      setCurrent((previous) => {
        const next = new Date(previous);
        if (view === 'month') {
          // Pin to the 1st first, otherwise Jan 31 + 1 month lands in March.
          next.setDate(1);
          next.setMonth(next.getMonth() + direction);
        } else if (view === 'week') {
          next.setDate(next.getDate() + 7 * direction);
        } else {
          next.setDate(next.getDate() + direction);
        }
        return next;
      });
    },
    [view],
  );

  const goPrevious = useCallback(() => shiftCurrent(-1), [shiftCurrent]);
  const goNext = useCallback(() => shiftCurrent(1), [shiftCurrent]);
  const goToday = useCallback(() => setCurrent(new Date()), []);
  const dismissNotice = useCallback(() => setNotice(''), []);

  // Managers edit straight away; everyone else gets the read-only day modal.
  const handleWeekEventClick = useCallback(
    (item) => (isManager ? openEdit(item) : setSelectedDay(item.date)),
    [isManager, openEdit],
  );
  const handleNewEventClick = useCallback(() => openNewEvent(null), [openNewEvent]);

  /* ---------- render ---------- */

  if (loading) {
    return <Loader label="Loading calendar" size="lg" variant="page" />;
  }

  let rangeLabel;
  if (view === 'month') {
    rangeLabel = (
      <>
        {MONTHS[current.getMonth()]}{' '}
        <span className="font-normal text-[color:var(--text-3)]">{year}</span>
      </>
    );
  } else if (view === 'week') {
    const start = startOfWeek(current);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    rangeLabel = (
      <>
        {SHORT_FMT.format(start)} – {SHORT_FMT.format(end)}{' '}
        <span className="font-normal text-[color:var(--text-3)]">{end.getFullYear()}</span>
      </>
    );
  } else {
    rangeLabel = DAY_LONG_FMT.format(current);
  }

  const navNoun = view;
  const onStageSelect = isManager ? undefined : handleTaskStageSelect;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Calendar</div>
          <div className="page-subtitle">Deadlines, tasks and events in one place</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Calendar view" className="inline-flex rounded-lg bg-[var(--bg-3)] p-0.5">
            {VIEWS.map((nextView) => (
              <button
                key={nextView}
                type="button"
                onClick={() => setView(nextView)}
                aria-pressed={view === nextView}
                className={[
                  'rounded-md px-3.5 py-1.5 text-[13px] capitalize transition duration-150 motion-reduce:transition-none max-[640px]:min-h-10',
                  focusRing,
                  view === nextView
                    ? 'bg-[var(--bg-2)] font-semibold text-[color:var(--accent)] shadow-sm'
                    : 'font-medium text-[color:var(--text-2)] hover:text-[color:var(--text)]',
                ].join(' ')}
              >
                {nextView}
              </button>
            ))}
          </div>
          {isManager && (
            <button type="button" className={btnPrimary()} onClick={handleNewEventClick}>
              <PlusIcon />
              New event
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {notice && !selectedDay && <Notice onDismiss={dismissNotice}>{notice}</Notice>}

        {/* Admin (manager): search / filter by any member. Hidden for members. */}
        {isManager && (
          <MemberFilterBar
            members={members}
            selectedMembers={selectedFilterMembers}
            onSelectionChange={setSelectedFilterMembers}
            isManager={isManager}
            userEmail={user?.email}
          />
        )}

        {/* Members and admins: filter by project. */}
        {projectOptions.length > 0 && (
          <ProjectFilterBar
            projects={projectOptions}
            selectedIds={selectedProjectIds}
            onChange={setSelectedProjectIds}
          />
        )}

        <ul className="m-0 mb-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-[color:var(--text-2)]" aria-label="Legend">
          {Object.entries(TYPES).map(([type, config]) => (
            <li key={type} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`} aria-hidden="true" />
              {config.label}
            </li>
          ))}
        </ul>

        <div
          aria-busy={busy}
          className={`overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[var(--bg-2)] shadow-sm transition-opacity duration-150 motion-reduce:transition-none ${busy ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
            <h2 className="m-0 text-base font-semibold tracking-[-0.015em] sm:text-lg" aria-live="polite">
              {rangeLabel}
            </h2>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" className={iconBtn} onClick={goPrevious} aria-label={`Previous ${navNoun}`}>
                <ChevronLeft />
              </button>
              <button type="button" className={btnGhost()} onClick={goToday}>
                Today
              </button>
              <button type="button" className={iconBtn} onClick={goNext} aria-label={`Next ${navNoun}`}>
                <ChevronRight />
              </button>
            </div>
          </div>

          {view === 'month' && (
            <MonthView current={current} getItemsForDate={getItemsForDate} onDayClick={setSelectedDay} />
          )}
          {view === 'week' && (
            <WeekView
              current={current}
              getItemsForDate={getItemsForDate}
              onDayClick={setSelectedDay}
              isManager={isManager}
              onClickEvent={handleWeekEventClick}
              onClickTimeSlot={openNewEvent}
            />
          )}
          {view === 'day' && (
            <DayView
              items={dayViewItems}
              isManager={isManager}
              onEdit={openEdit}
              onDelete={handleDelete}
              onOpenTask={openTask}
              onStageSelect={onStageSelect}
            />
          )}
        </div>
      </div>

      {/* Day drill-down. Hidden while another modal is open, and comes back afterwards. */}
      {selectedDay && !formModal && !timeTakenTask && (
        <DayModal
          date={selectedDay}
          items={selectedItems}
          isManager={isManager}
          onClose={closeDay}
          onShiftDay={shiftSelectedDay}
          onAdd={addOnSelectedDay}
          onOpenTask={openTask}
          onStageSelect={onStageSelect}
          notice={notice}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {timeTakenTask && (
        <TimeTakenModal task={timeTakenTask} onClose={closeTimeTaken} onConfirm={confirmTimeTaken} />
      )}

      {formModal && (
        <Modal title={formModal.editing?.id ? 'Edit event' : 'New event'} onClose={closeForm}>
          <EventForm
            initial={formModal.editing}
            prefillStart={formModal.prefillStart}
            members={activeMembers}
            onSave={handleSave}
            saving={saving}
            error={formError}
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
        onCancel={closeConfirm}
        loading={confirmModal.loading}
      />
    </>
  );
}


/* ------------------------------------------------------------------ */
/* Project filter                                                      */
/* ------------------------------------------------------------------ */

// Multi-select dropdown for filtering by project (members and admins).
// Nothing selected = every project. Selected projects also show as removable chips.
const ProjectFilterBar = memo(function ProjectFilterBar({ projects, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, rootRef, close);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = (id) => {
    onChange(selectedSet.has(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]);
  };
  const clear = () => onChange([]);

  const selectedProjects = useMemo(
    () => projects.filter((project) => selectedSet.has(project.id)),
    [projects, selectedSet],
  );
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? projects.filter((project) => project.name.toLowerCase().includes(normalized)) : projects;
  }, [projects, query]);

  return (
    <div ref={rootRef} className="relative mb-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--bg-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span>Filter by project</span>
        {selectedIds.length > 0 && (
          <span className="rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold leading-5 text-white">
            {selectedIds.length}
          </span>
        )}
        <svg
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {selectedProjects.map((project) => (
        <span
          key={project.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--accent-light)] py-1 pl-3 pr-1.5 text-xs font-medium text-[var(--accent)]"
        >
          <span className="truncate" title={project.name}>{project.name}</span>
          <button
            type="button"
            onClick={() => toggle(project.id)}
            aria-label={`Remove ${project.name} filter`}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-sm leading-none hover:bg-[var(--accent)] hover:text-white"
          >
            &times;
          </button>
        </span>
      ))}

      {selectedIds.length > 0 && (
        <button
          type="button"
          onClick={clear}
          className="text-xs font-semibold text-[var(--text-3)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
        >
          Clear all
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-2)] shadow-lg">
          <div className="border-b border-[var(--border)] p-2">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              autoFocus
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto p-1">
            {filteredProjects.length === 0 ? (
              <li className="px-3 py-6 text-center text-[13px] text-[var(--text-3)]">No projects found</li>
            ) : (
              filteredProjects.map((project) => {
                const checked = selectedSet.has(project.id);
                return (
                  <li key={project.id} role="option" aria-selected={checked}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13px] text-[var(--text)] hover:bg-[var(--bg-3)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(project.id)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                      />
                      <span className="truncate" title={project.name}>{project.name}</span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
            <button
              type="button"
              onClick={clear}
              disabled={selectedIds.length === 0}
              className="text-xs font-semibold text-[var(--text-2)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--text-2)]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Month view                                                          */
/* ------------------------------------------------------------------ */

// One day in the grid. Memoized: `items` is a stable array from the date map,
// so only cells whose data actually changed re-render.
const DayCell = memo(function DayCell({ date, items, isToday, onDayClick }) {
  const visible = items.slice(0, 3);
  const dots = items.slice(0, 4);

  return (
    <button
      type="button"
      onClick={() => onDayClick(date)}
      aria-label={`${CELL_LABEL_FMT.format(date)}, ${pluralItems(items.length)}`}
      className={[
        'flex min-h-16 min-w-0 flex-col items-stretch gap-1 bg-[var(--bg-2)] p-1.5 text-left sm:min-h-28 sm:p-2',
        'transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--bg-3)]',
        'focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)]',
      ].join(' ')}
    >
      <span
        className={[
          'grid h-6 w-6 place-items-center rounded-full text-xs tabular-nums',
          isToday ? 'bg-[var(--accent)] font-semibold text-white' : 'text-[color:var(--text)]',
        ].join(' ')}
      >
        {date.getDate()}
      </span>

      {/* Full pills on larger screens */}
      {visible.map((item, index) => (
        <span
          key={itemKey(item, index)}
          title={formatCellLabel(item)}
          className={`hidden truncate rounded px-1.5 py-0.5 text-[10px] font-semibold sm:block ${TYPES[item.itemType].tint}`}
        >
          {formatCellLabel(item)}
        </span>
      ))}
      {items.length > 3 && (
        <span className="hidden px-1 text-[10px] text-[color:var(--text-3)] sm:block">
          +{items.length - 3} more
        </span>
      )}

      {/* Compact dots on narrow screens */}
      {items.length > 0 && (
        <span className="flex flex-wrap items-center gap-1 sm:hidden">
          {dots.map((item, index) => (
            <span
              key={`dot-${itemKey(item, index)}`}
              className={`h-1.5 w-1.5 rounded-full ${TYPES[item.itemType].dot}`}
            />
          ))}
          {items.length > 4 && (
            <span className="text-[10px] text-[color:var(--text-3)]">+{items.length - 4}</span>
          )}
        </span>
      )}
    </button>
  );
});

const MonthView = memo(function MonthView({ current, getItemsForDate, onDayClick }) {
  const year = current.getFullYear();
  const month = current.getMonth();

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list = [];
    for (let index = 0; index < firstDay; index += 1) list.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) list.push(new Date(year, month, day));
    // Fill the last row so the grid always ends on a full week.
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [year, month]);

  const todayKey = dateKey(new Date());

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-[color:var(--border)]">
        {DAYS.map((dayName) => (
          <div key={dayName} className="py-2 text-center text-[11px] font-medium text-[color:var(--text-3)]">
            {dayName}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-[var(--border)]">
        {cells.map((date, index) =>
          date ? (
            <DayCell
              key={date.getTime()}
              date={date}
              items={getItemsForDate(date)}
              isToday={dateKey(date) === todayKey}
              onDayClick={onDayClick}
            />
          ) : (
            <div key={`empty-${index}`} className="min-h-16 bg-[var(--bg-3)] sm:min-h-28" />
          ),
        )}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Week view                                                           */
/* ------------------------------------------------------------------ */

const WeekView = memo(function WeekView({ current, getItemsForDate, onDayClick, isManager, onClickEvent, onClickTimeSlot }) {
  const scrollRef = useRef(null);

  // Start the scroll at 08:00 (rows are h-[52px]) instead of midnight.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * 52;
  }, []);

  const weekStart = startOfWeek(current).getTime();

  // Everything the grid needs, computed once per week / data change.
  const { days, allDayByDay, eventsBySlot, hasAllDay } = useMemo(() => {
    const start = new Date(weekStart);
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });

    const allDay = [];
    const slots = new Map();
    weekDays.forEach((date, dayIndex) => {
      const list = [];
      getItemsForDate(date).forEach((item) => {
        if (item.itemType !== 'event') {
          list.push(item);
          return;
        }
        const key = `${dayIndex}-${item.date.getHours()}`;
        const bucket = slots.get(key);
        if (bucket) bucket.push(item);
        else slots.set(key, [item]);
      });
      allDay.push(list);
    });

    return {
      days: weekDays,
      allDayByDay: allDay,
      eventsBySlot: slots,
      hasAllDay: allDay.some((list) => list.length > 0),
    };
  }, [weekStart, getItemsForDate]);

  const todayKey = dateKey(new Date());
  const cellBorder = 'border-b border-r border-[color:var(--border)]';

  return (
    <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
      <div className="grid min-w-[44rem] grid-cols-[3.5rem_repeat(7,minmax(5.5rem,1fr))]">
        <div className={`sticky left-0 top-0 z-30 bg-[var(--bg-2)] ${cellBorder}`} />
        {days.map((date, dayIndex) => {
          const isToday = dateKey(date) === todayKey;
          return (
            <button
              key={`header-${date.getTime()}`}
              type="button"
              onClick={() => onDayClick(date)}
              className={`sticky top-0 z-20 flex flex-col items-center gap-1 bg-[var(--bg-2)] py-2.5 transition-colors duration-150 hover:bg-[var(--bg-3)] motion-reduce:transition-none ${cellBorder} ${focusRing}`}
            >
              <span className="text-[11px] font-medium text-[color:var(--text-3)]">{DAYS[dayIndex]}</span>
              <span
                className={[
                  'grid h-8 w-8 place-items-center rounded-full text-sm tabular-nums',
                  isToday ? 'bg-[var(--accent)] font-semibold text-white' : 'text-[color:var(--text)]',
                ].join(' ')}
              >
                {date.getDate()}
              </span>
            </button>
          );
        })}

        {/* Tasks, deadlines and birthdays have no time, so they sit in an all-day row. */}
        {hasAllDay && (
          <>
            <div className={`sticky left-0 z-10 flex items-center justify-end bg-[var(--bg-3)] px-2 text-[10px] text-[color:var(--text-3)] ${cellBorder}`}>
              All day
            </div>
            {days.map((date, dayIndex) => {
              const list = allDayByDay[dayIndex];
              return (
                <button
                  key={`allday-${date.getTime()}`}
                  type="button"
                  onClick={() => onDayClick(date)}
                  className={`flex min-h-9 min-w-0 flex-col gap-1 bg-[var(--bg-2)] p-1 text-left transition-colors duration-150 hover:bg-[var(--bg-3)] motion-reduce:transition-none ${cellBorder} ${focusRing}`}
                >
                  {list.slice(0, 2).map((item, index) => (
                    <span
                      key={itemKey(item, index)}
                      title={formatCellLabel(item)}
                      className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPES[item.itemType].tint}`}
                    >
                      {item.displayTitle}
                    </span>
                  ))}
                  {list.length > 2 && (
                    <span className="px-1 text-[10px] text-[color:var(--text-3)]">+{list.length - 2} more</span>
                  )}
                </button>
              );
            })}
          </>
        )}

        {HOURS.map((hour) => (
          <Fragment key={hour}>
            <div className={`sticky left-0 z-10 h-[52px] bg-[var(--bg-3)] px-2 pt-1 text-right text-[10px] tabular-nums text-[color:var(--text-3)] ${cellBorder}`}>
              {String(hour).padStart(2, '0')}:00
            </div>
            {days.map((date, dayIndex) => {
              const slotEvents = eventsBySlot.get(`${dayIndex}-${hour}`);
              return (
                <div
                  key={`slot-${date.getTime()}-${hour}`}
                  onClick={isManager ? () => onClickTimeSlot(date, hour) : undefined}
                  className={[
                    'relative h-[52px] min-w-0 bg-[var(--bg-2)] p-0.5',
                    cellBorder,
                    isManager ? 'cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-3)] motion-reduce:transition-none' : '',
                  ].join(' ')}
                >
                  {slotEvents?.map((event, index) => (
                    <button
                      key={`${event.id}-${index}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClickEvent(event);
                      }}
                      title={event.displayTitle}
                      className={`mb-0.5 block w-full truncate rounded px-1.5 py-1 text-left text-[10px] font-semibold ${TYPES.event.solid} ${focusRing}`}
                    >
                      {event.displayTitle}
                    </button>
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Stage dropdown (members)                                            */
/* ------------------------------------------------------------------ */

// Stage switcher for a member's task (same options as Task View).
// "Done" is intentionally missing: members can't mark tasks Done.
const QUICK_STAGES = ['Todo', 'In Progress', 'In Review'];
const STAGE_DOT = { todo: 'bg-[#a78bfa]', inprogress: 'bg-[#f59e0b]', inreview: 'bg-[#3b82f6]' };

const StageDropdown = memo(function StageDropdown({ task, onChange }) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);

  const close = useCallback((viaEscape) => {
    setOpen(false);
    if (viaEscape === true) buttonRef.current?.focus();
  }, []);
  useDismiss(open, ref, close, { captureEscape: true });

  const toggle = () => {
    if (!open && buttonRef.current) {
      // The menu is ~110px tall: open upwards when there isn't room below.
      const { bottom } = buttonRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - bottom < 150);
    }
    setOpen((previous) => !previous);
  };

  // Keep clicks / key presses here from also opening the task (the whole row is clickable).
  const stop = (event) => event.stopPropagation();

  return (
    <div ref={ref} className="relative shrink-0" onClick={stop} onKeyDown={stop}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Stage: ${task.stage}. Change stage`}
        onClick={toggle}
        className={`badge badge-${stageKey(task.stage)} inline-flex min-h-[28px] cursor-pointer items-center border-0 ${focusRing}`}
      >
        {task.stage} &#9662;
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-50 min-w-[170px] rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-1 shadow-lg ${dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
        >
          {QUICK_STAGES.filter((stage) => stage !== task.stage).map((stage) => (
            <button
              key={stage}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChange(task, stage);
              }}
              className="flex min-h-[36px] w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--bg-3)] focus-visible:bg-[var(--bg-3)] focus-visible:outline-none"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[stageKey(stage)]}`} />
              <span className={`badge badge-${stageKey(stage)}`}>{stage}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Item row, day modal, day view                                       */
/* ------------------------------------------------------------------ */

// One row in a day's list. Shared by the day modal and the Day tab so both behave the same.
const ItemRow = memo(function ItemRow({ item, isManager, onEdit, onDelete, onOpenTask, onStageSelect, roomy = false }) {
  const type = TYPES[item.itemType];
  const meta = formatDayMeta(item);
  const isEditable = isManager && item.itemType === 'event';
  const isTask = item.itemType === 'task' && item.project_id != null && Boolean(onOpenTask);

  // Members get the same stage dropdown as Task View instead of a plain badge.
  const isMemberTask = !isManager && item.itemType === 'task';
  const showStageDropdown = isMemberTask && Boolean(onStageSelect);
  // For a sub task, show the main task's name above it.
  const parentTitle = item.parent_task_id && item.parent_task_title ? item.parent_task_title : null;

  const titleCls = `break-words text-left font-semibold text-[color:var(--text)] ${roomy ? 'text-[15px]' : 'text-sm'}`;

  return (
    <div
      onClick={isTask ? () => onOpenTask(item) : undefined}
      className={[
        'flex flex-wrap items-start justify-between gap-3 rounded-lg border-l-[3px] bg-[var(--bg-3)]',
        roomy ? 'p-4' : 'p-3',
        type.bar,
        isTask ? 'cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-4)] motion-reduce:transition-none' : '',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1 basis-40">
        {parentTitle && (
          <div className="break-words text-xs text-[color:var(--text-3)]">{parentTitle}</div>
        )}
        {isTask ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenTask(item); }}
            className={`${titleCls} underline-offset-2 hover:underline ${focusRing} rounded`}
          >
            {item.displayTitle}
          </button>
        ) : (
          <div className={titleCls}>{item.displayTitle}</div>
        )}
        {!isMemberTask && item.itemType === 'task' && item.assignee_name && (
          <div className="mt-0.5 text-xs text-[color:var(--text-2)]">Assigned to {item.assignee_name}</div>
        )}
        {item.description && (
          <div className="mt-0.5 break-words text-xs text-[color:var(--text-2)]">{item.description}</div>
        )}
        {meta && <div className="mt-0.5 text-[11px] tabular-nums text-[color:var(--text-3)]">{meta}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showStageDropdown ? (
          <StageDropdown task={item} onChange={onStageSelect} />
        ) : item.itemType === 'task' && item.stage ? (
          <span className={`badge badge-${stageKey(item.stage)}`}>{item.stage}</span>
        ) : (
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${type.tint}`}>
            {type.label}
          </span>
        )}
        {isTask && (
          <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-semibold text-[color:var(--accent)]">
            Open task
            <ChevronRight />
          </span>
        )}
        {isEditable && (
          <>
            <button type="button" className={btnGhost('sm')} onClick={() => onEdit(item)}>
              Edit
            </button>
            <button type="button" className={btnDanger('sm')} onClick={() => onDelete(item.id)}>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
});

const DayModal = memo(function DayModal({ date, items, isManager, onClose, onShiftDay, onAdd, onEdit, onDelete, onOpenTask, onStageSelect, notice }) {
  const title = DAY_LONG_FMT.format(date);
  const summary = items.length === 0 ? 'Nothing scheduled' : pluralItems(items.length);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" className={iconBtn} onClick={() => onShiftDay(-1)} aria-label="Previous day">
          <ChevronLeft />
        </button>
        <span className="flex-1 text-center text-xs text-[color:var(--text-3)]">{summary}</span>
        <button type="button" className={iconBtn} onClick={() => onShiftDay(1)} aria-label="Next day">
          <ChevronRight />
        </button>
      </div>

      {notice && <Notice>{notice}</Notice>}

      {items.length === 0 ? (
        <div className="px-3 py-8 text-center text-[13px] text-[color:var(--text-3)]">
          <div className="mb-1 text-sm font-semibold text-[color:var(--text-2)]">Nothing on this day</div>
          {isManager ? 'Add an event to get this day started.' : 'No tasks, events or deadlines.'}
        </div>
      ) : (
        <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-0.5">
          {items.map((item, index) => (
            <ItemRow
              key={itemKey(item, index)}
              item={item}
              isManager={isManager}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenTask={onOpenTask}
              onStageSelect={onStageSelect}
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {isManager && (
          <button type="button" className={btnPrimary()} onClick={onAdd}>
            <PlusIcon />
            Add event on this day
          </button>
        )}
        <button type="button" className={btnGhost()} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
});

const DayView = memo(function DayView({ items, isManager, onEdit, onDelete, onOpenTask, onStageSelect }) {
  return (
    <div className="min-h-72 p-4 sm:p-6">
      {items.length === 0 ? (
        <div className="px-3 py-12 text-center text-[13px] text-[color:var(--text-3)]">
          <div className="mb-1 text-sm font-semibold text-[color:var(--text-2)]">Nothing on this day</div>
          No tasks, events or deadlines.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <ItemRow
              key={itemKey(item, index)}
              item={item}
              isManager={isManager}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenTask={onOpenTask}
              onStageSelect={onStageSelect}
              roomy
            />
          ))}
        </div>
      )}
    </div>
  );
});


/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

// Owns its input state, so typing never re-renders the calendar behind it.
function TimeTakenModal({ task, onClose, onConfirm }) {
  const uid = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const minutes = parseInt(value, 10);
    if (!minutes || minutes <= 0) {
      setError('Enter the time taken in minutes.');
      return;
    }
    onConfirm(task, minutes);
  };

  return (
    <Modal title="Time taken" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="m-0 text-[13px] leading-relaxed text-[color:var(--text-2)]">
          Moving <strong className="text-[color:var(--text)]">{task?.displayTitle}</strong> to{' '}
          <strong className="text-[color:var(--text)]">In Review</strong>. How long did this task take?
        </p>
        <div>
          <label htmlFor={`${uid}-minutes`} className={labelCls}>
            Time taken (minutes)
            <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>
          </label>
          <input
            id={`${uid}-minutes`}
            className={inputCls}
            type="number"
            inputMode="numeric"
            min="1"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError('');
            }}
            placeholder="e.g. 45"
            autoFocus
            aria-invalid={!!error}
            aria-describedby={error ? `${uid}-error` : undefined}
          />
          <FieldError id={`${uid}-error`}>{error}</FieldError>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost()} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary()}>Confirm and move</button>
        </div>
      </form>
    </Modal>
  );
}


const pad2 = (n) => String(n).padStart(2, '0');

// Local time for <input type="datetime-local">.
// (toISOString() is UTC, so it showed the wrong time when editing an event.)
function toLocalInput(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function addMinutes(localValue, minutes) {
  const date = new Date(localValue);
  date.setMinutes(date.getMinutes() + minutes);
  return toLocalInput(date);
}

const DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
];

// Static class strings (Tailwind needs full literals).
const AVATAR_TINTS = [
  'bg-[#6366f1]/15 text-[#6366f1]',
  'bg-[#0ea5e9]/15 text-[#0ea5e9]',
  'bg-[#a855f7]/15 text-[#a855f7]',
  'bg-[#f59e0b]/15 text-[#f59e0b]',
  'bg-[#10b981]/15 text-[#10b981]',
];

function avatarTint(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

const CheckIcon = () => <Icon className="h-3 w-3"><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
const SearchIcon = () => <Icon className="h-4 w-4"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></Icon>;

function SectionTitle({ children, hint }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="m-0 text-sm font-semibold tracking-[-0.01em] text-[color:var(--text)]">{children}</h3>
      {hint && <span className="text-xs text-[color:var(--text-3)]">{hint}</span>}
    </div>
  );
}

// Checkbox-style row used for "All members" and for each member.
const PersonRow = memo(function PersonRow({ value, checked, indeterminate = false, onToggle, inputRef, avatar, tint, children, strong = false }) {
  return (
    <label className="relative block cursor-pointer">
      <input
        ref={inputRef}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={() => onToggle(value)}
      />
      <span
        className={[
          'flex min-h-11 items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-[13px]',
          'transition duration-150 motion-reduce:transition-none',
          'hover:bg-[var(--bg-3)]',
          'peer-checked:border-[color:var(--accent)] peer-checked:bg-[var(--accent-light)]',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--accent)]',
          strong ? 'font-semibold' : 'font-medium',
        ].join(' ')}
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold uppercase ${tint}`}
          aria-hidden="true"
        >
          {avatar}
        </span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
        <span
          className={[
            'grid h-5 w-5 shrink-0 place-items-center rounded-md border text-white transition duration-150 motion-reduce:transition-none',
            checked || indeterminate
              ? 'border-[color:var(--accent)] bg-[var(--accent)]'
              : 'border-[color:var(--border)] bg-transparent',
          ].join(' ')}
          aria-hidden="true"
        >
          {checked ? <CheckIcon /> : indeterminate ? <span className="h-0.5 w-2.5 rounded bg-white" /> : null}
        </span>
      </span>
    </label>
  );
});


function EventForm({ initial, prefillStart = '', members, onSave, onCancel, saving = false, error = '' }) {
  const uid = useId();
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    start_date: initial?.start_date ? toLocalInput(new Date(initial.start_date)) : prefillStart,
    end_date: initial?.end_date ? toLocalInput(new Date(initial.end_date)) : '',
    type: initial?.type || 'event',
    member_ids: initial?.attendees?.map((attendee) => attendee.id) || [],
  });
  // What the form opened with, to tell which times the user changed.
  const [opened] = useState(form);
  const [errors, setErrors] = useState({});
  const [memberQuery, setMemberQuery] = useState('');

  const id = (name) => `${uid}-${name}`;
  const isBirthday = form.type === 'birthday';

  const setField = useCallback((key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: '' } : previous));
  }, []);

  /* ---------- members ---------- */

  const selectedIds = useMemo(() => new Set(form.member_ids), [form.member_ids]);
  const selectedCount = useMemo(
    () => members.reduce((count, member) => count + (selectedIds.has(member.id) ? 1 : 0), 0),
    [members, selectedIds],
  );
  const allSelected = members.length > 0 && selectedCount === members.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const allRef = useRef(null);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleAll = useCallback(() => {
    setForm((previous) => {
      const chosen = new Set(previous.member_ids);
      const everyone = members.length > 0 && members.every((member) => chosen.has(member.id));
      return { ...previous, member_ids: everyone ? [] : members.map((member) => member.id) };
    });
  }, [members]);

  const toggleMember = useCallback((memberId) => {
    setForm((previous) => ({
      ...previous,
      member_ids: previous.member_ids.includes(memberId)
        ? previous.member_ids.filter((current) => current !== memberId)
        : [...previous.member_ids, memberId],
    }));
  }, []);

  const showSearch = members.length > 6;
  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    return query ? members.filter((member) => member.name?.toLowerCase().includes(query)) : members;
  }, [members, memberQuery]);

  /* ---------- time ---------- */

  const setStart = (value) => {
    // Keep the same length of event when the start moves.
    if (value && form.start_date && form.end_date) {
      const length = new Date(form.end_date) - new Date(form.start_date);
      if (length >= 0) {
        setForm((previous) => ({
          ...previous,
          start_date: value,
          end_date: toLocalInput(new Date(new Date(value).getTime() + length)),
        }));
        setErrors((previous) => ({ ...previous, start_date: '', end_date: '' }));
        return;
      }
    }
    setField('start_date', value);
  };

  const applyDuration = (minutes) => {
    if (!form.start_date) {
      setErrors((previous) => ({ ...previous, start_date: 'Choose a start time first.' }));
      document.getElementById(id('start'))?.focus();
      return;
    }
    setField('end_date', addMinutes(form.start_date, minutes));
  };

  const activeDuration = useMemo(() => {
    if (!form.start_date || !form.end_date) return null;
    const diff = Math.round((new Date(form.end_date) - new Date(form.start_date)) / 60000);
    return DURATIONS.find((duration) => duration.minutes === diff)?.minutes ?? null;
  }, [form.start_date, form.end_date]);

  /* ---------- submit ---------- */

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = 'Enter an event title.';
    if (!form.start_date) next.start_date = 'Choose a start date and time.';
    if (!isBirthday && form.start_date && form.end_date && form.end_date < form.start_date) {
      next.end_date = 'The end must be after the start.';
    }
    setErrors(next);
    return next;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (saving) return;
    const next = validate();
    const firstInvalid = ['title', 'start_date', 'end_date'].find((key) => next[key]);
    if (firstInvalid) {
      const target = { title: 'title', start_date: 'start', end_date: 'end' }[firstInvalid];
      document.getElementById(id(target))?.focus();
      return;
    }
    const payload = {
      ...form,
      title: form.title.trim(),
      // A birthday has no end time.
      end_date: isBirthday ? '' : form.end_date,
    };
    // Editing: times the user did not change are left out, so the server
    // keeps the stored values exactly (the inputs show only minutes, in the
    // browser's time zone).
    if (initial && form.start_date === opened.start_date && form.type === opened.type) {
      delete payload.start_date;
      if (form.end_date === opened.end_date) delete payload.end_date;
    }
    onSave(payload);
  };

  const memberHint = members.length
    ? selectedCount === 0
      ? 'Nobody invited yet'
      : `${selectedCount} of ${members.length} invited`
    : undefined;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <Notice>{error}</Notice>}

      {/* ---------------- Details ---------------- */}
      <section aria-labelledby={id('details')} className="flex flex-col gap-4">
        <div id={id('details')} className="sr-only">Event details</div>

        <div>
          <label htmlFor={id('title')} className={labelCls}>
            Event title
            <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>
          </label>
          <input
            id={id('title')}
            className={`${inputCls} text-[15px] font-medium`}
            value={form.title}
            onChange={(event) => setField('title', event.target.value)}
            placeholder={isBirthday ? 'Priya’s birthday' : 'Weekly client sync'}
            autoFocus
            maxLength={120}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? id('title-error') : undefined}
          />
          <FieldError id={id('title-error')}>{errors.title}</FieldError>
        </div>

        <div role="radiogroup" aria-labelledby={id('type-label')}>
          <span id={id('type-label')} className={labelCls}>Type</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] p-1">
            {[
              { value: 'event', label: 'Custom event', dot: TYPES.event.dot },
              { value: 'birthday', label: 'Birthday', dot: TYPES.birthday.dot },
            ].map((option) => (
              <label key={option.value} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={id('type')}
                  value={option.value}
                  className="peer sr-only"
                  checked={form.type === option.value}
                  onChange={() => setField('type', option.value)}
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
                  <span className={`h-2 w-2 shrink-0 rounded-full ${option.dot}`} aria-hidden="true" />
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- When ---------------- */}
      <section aria-labelledby={id('when')}>
        <SectionTitle>
          <span id={id('when')}>When</span>
        </SectionTitle>

        <div className={`grid grid-cols-1 gap-4 ${isBirthday ? '' : 'sm:grid-cols-2'}`}>
          <div>
            <label htmlFor={id('start')} className={labelCls}>
              {isBirthday ? 'Date' : 'Starts'}
              <span className="ml-0.5 text-[color:var(--danger)]" aria-hidden="true">*</span>
            </label>
            <input
              id={id('start')}
              className={inputCls}
              type="datetime-local"
              value={form.start_date}
              onChange={(event) => setStart(event.target.value)}
              aria-invalid={!!errors.start_date}
              aria-describedby={errors.start_date ? id('start-error') : undefined}
            />
            <FieldError id={id('start-error')}>{errors.start_date}</FieldError>
          </div>

          {!isBirthday && (
            <div>
              <label htmlFor={id('end')} className={labelCls}>
                Ends
                <span className="ml-1 font-normal text-[color:var(--text-3)]">(optional)</span>
              </label>
              <input
                id={id('end')}
                className={inputCls}
                type="datetime-local"
                value={form.end_date}
                min={form.start_date || undefined}
                onChange={(event) => setField('end_date', event.target.value)}
                aria-invalid={!!errors.end_date}
                aria-describedby={errors.end_date ? id('end-error') : undefined}
              />
              <FieldError id={id('end-error')}>{errors.end_date}</FieldError>
            </div>
          )}
        </div>

        {!isBirthday && (
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Quick duration">
            <span className="text-xs text-[color:var(--text-3)]">Length</span>
            {DURATIONS.map((duration) => {
              const active = activeDuration === duration.minutes;
              return (
                <button
                  key={duration.minutes}
                  type="button"
                  onClick={() => applyDuration(duration.minutes)}
                  aria-pressed={active}
                  className={[
                    'rounded-full border px-3 py-1 text-xs font-medium transition duration-150 motion-reduce:transition-none',
                    focusRing,
                    active
                      ? 'border-[color:var(--accent)] bg-[var(--accent-light)] text-[color:var(--accent)]'
                      : 'border-[color:var(--border)] text-[color:var(--text-2)] hover:bg-[var(--bg-3)]',
                  ].join(' ')}
                >
                  {duration.label}
                </button>
              );
            })}
            {form.end_date && (
              <button
                type="button"
                onClick={() => setField('end_date', '')}
                className={`rounded px-1 text-xs font-medium text-[color:var(--text-3)] underline-offset-2 hover:text-[color:var(--accent)] hover:underline ${focusRing}`}
              >
                Clear end
              </button>
            )}
          </div>
        )}
      </section>

      {/* ---------------- Notes ---------------- */}
      <section>
        <label htmlFor={id('description')} className={labelCls}>
          Description
          <span className="ml-1 font-normal text-[color:var(--text-3)]">(optional)</span>
        </label>
        <textarea
          id={id('description')}
          rows={3}
          className={`${inputCls} min-h-20 resize-y leading-relaxed`}
          value={form.description}
          onChange={(event) => setField('description', event.target.value)}
          placeholder="Agenda, meeting link, notes"
        />
      </section>

      {/* ---------------- Who ---------------- */}
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="contents">
          <SectionTitle hint={memberHint}>Invite members</SectionTitle>
        </legend>

        {members.length ? (
          <div className="overflow-hidden rounded-xl border border-[color:var(--border)]">
            <div className="border-b border-[color:var(--border)] bg-[var(--bg-3)] p-1">
              <PersonRow
                inputRef={allRef}
                checked={allSelected}
                indeterminate={someSelected}
                onToggle={toggleAll}
                avatar="All"
                tint="bg-[var(--accent)] text-white"
                strong
              >
                All members
              </PersonRow>
            </div>

            {showSearch && (
              <div className="relative border-b border-[color:var(--border)] p-2">
                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                  placeholder="Search members"
                  aria-label="Search members"
                  className="w-full rounded-md border border-[color:var(--border)] bg-transparent py-2 pl-9 pr-3 text-[13px] placeholder:text-[color:var(--text-3)] focus:border-[color:var(--accent)] focus:outline-none"
                />
              </div>
            )}

            <div className="grid max-h-60 grid-cols-1 gap-0.5 overflow-y-auto p-1 sm:grid-cols-2">
              {filteredMembers.length === 0 ? (
                <p className="col-span-full m-0 px-3 py-6 text-center text-[13px] text-[color:var(--text-3)]">
                  No members match “{memberQuery.trim()}”.
                </p>
              ) : (
                filteredMembers.map((member) => (
                  <PersonRow
                    key={member.id}
                    value={member.id}
                    checked={selectedIds.has(member.id)}
                    onToggle={toggleMember}
                    avatar={member.name?.charAt(0)}
                    tint={avatarTint(member.name)}
                  >
                    {member.name}
                  </PersonRow>
                ))
              )}
            </div>
          </div>
        ) : (
          <p className="m-0 rounded-md bg-[var(--bg-3)] p-3 text-xs text-[color:var(--text-3)]">
            No active members to invite.
          </p>
        )}
      </fieldset>

      {/* ---------------- Actions ---------------- */}
      <div className="flex items-center justify-end gap-2 border-t border-[color:var(--border)] pt-4">
        <button type="button" className={btnGhost()} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={`${btnPrimary()} min-w-32`} disabled={saving}>
          {saving ? <Loader label="Saving..." size="sm" variant="button" /> : (initial?.id ? 'Save changes' : 'Create event')}
        </button>
      </div>
    </form>
  );
}