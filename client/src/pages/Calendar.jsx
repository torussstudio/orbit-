import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import MemberFilterBar from '../components/ui/MemberFilterBar';
import Select from '../components/ui/Select';
import Loader from '../components/ui/Loader';

const COLORS = {
  event: '#6366f1',
  task: '#0ea5e9',
  deadline: '#a855f7',
  birthday: '#f59e0b',
};

// Order used when listing a day's items inside the day modal.
const TYPE_ORDER = { event: 0, task: 1, deadline: 2, birthday: 3 };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const EMPTY_CONFIRM = { show: false, title: '', message: '', action: null, loading: false, isDangerous: false };

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Builds a value for <input type="datetime-local"> in the user's local time.
function toInputValue(date, hour = 9) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`;
}

function buildCalendarItems(data, currentYear) {
  const events = data.events.map((event) => ({
    ...event,
    itemType: 'event',
    date: new Date(event.start_date),
    displayTitle: event.title,
    hasTime: true,
  }));

  const tasks = data.tasks.map((task) => ({
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

function formatCellLabel(item) {
  if (item.itemType === 'task' && item.assignee_name) {
    return `${item.displayTitle} - ${item.assignee_name}`;
  }

  return item.displayTitle;
}

function formatDayMeta(item) {
  if (item.itemType === 'event') {
    return item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (item.itemType === 'task' && item.project_name) {
    return item.project_name;
  }

  if (item.itemType === 'deadline' && item.client_name) {
    return item.client_name;
  }

  return '';
}

function sortDayItems(items) {
  return [...items].sort((a, b) => {
    const byType = TYPE_ORDER[a.itemType] - TYPE_ORDER[b.itemType];
    if (byType !== 0) return byType;
    return a.date - b.date;
  });
}

// Shared responsive rules for this page. Kept in one place so every sub-view
// (month/week/day) stays consistent across breakpoints without repeating
// media queries inline (inline styles can't express them).
function CalendarResponsiveStyles() {
  return (
    <style>{`
      .cal-header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .cal-view-toggle { display: flex; background: var(--bg-3); border-radius: 8px; padding: 3px; gap: 2px; }
      .cal-nav-bar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px; border-bottom: 1px solid var(--border); gap: 8px;
      }
      .cal-nav-btn-label { display: inline; }
      .cal-month-label { font-weight: 700; font-size: 15px; color: var(--text); text-align: center; flex: 1; min-width: 0; }

      .cal-month-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        overflow: auto;
      }
      .cal-day-head {
        padding: 10px 2px; text-align: center; font-size: 11px; font-weight: 700;
        color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px;
      }
      .cal-cell {
        min-height: 100px; min-width: 0; padding: 8px;
        border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
        cursor: pointer; transition: background 0.18s ease;
      }
      .cal-cell:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
      .cal-cell-empty { min-height: 100px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--bg-3); }
      .cal-day-num {
        width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center;
        justify-content: center; margin-bottom: 4px; font-size: 13px;
      }
      .cal-pill {
        font-size: 10px; padding: 2px 5px; border-radius: 4px; margin-bottom: 2px;
        font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .cal-dots { display: none; gap: 3px; flex-wrap: wrap; margin-top: 2px; }
      .cal-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .cal-more { font-size: 10px; color: var(--text-3); margin-top: 2px; }

      .cal-week-scroll { display: flex; height: 100%; overflow: auto; border-top: 1px solid var(--border); -webkit-overflow-scrolling: touch; }
      .cal-week-timecol { min-width: 56px; border-right: 1px solid var(--border); background: var(--bg-3); flex-shrink: 0; }
      .cal-week-grid { display: grid; grid-template-columns: repeat(7, minmax(72px, 1fr)); flex: 1; min-width: 560px; }
      .cal-week-hour { height: 52px; display: flex; align-items: flex-start; justify-content: center; padding: 2px 0; font-size: 10px; color: var(--text-3); font-weight: 500; border-bottom: 1px solid var(--border); }
      .cal-week-slot { min-height: 52px; padding: 3px; cursor: default; position: relative; }
      .cal-week-event { font-size: 10px; padding: 3px 5px; border-radius: 4px; margin-bottom: 2px; color: #fff; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }

      .cal-detail-item { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; background: var(--bg-3); flex-wrap: wrap; }
      .cal-detail-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .cal-detail-item-click { cursor: pointer; transition: box-shadow 0.15s ease; }
      .cal-detail-item-click:hover { box-shadow: 0 0 0 1px var(--accent); }
      .cal-detail-item-click:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

      /* Day drill-down modal */
      .cal-modal-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
      .cal-modal-summary { font-size: 12px; color: var(--text-3); text-align: center; flex: 1; }
      .cal-modal-list { max-height: 55vh; overflow-y: auto; padding-right: 2px; }
      .cal-modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
      .cal-empty { text-align: center; padding: 28px 12px; color: var(--text-3); font-size: 13px; }
      .cal-empty-title { font-size: 14px; font-weight: 600; color: var(--text-2); margin-bottom: 4px; }

      @media (max-width: 640px) {
        .cal-nav-btn-label { display: none; }
        .cal-month-label { font-size: 13px; }
        .cal-nav-bar { padding: 10px 8px; }
        .cal-cell, .cal-cell-empty { min-height: 68px; padding: 5px; }
        .cal-day-num { width: 22px; height: 22px; font-size: 12px; }
        .cal-pill { display: none; }
        .cal-dots { display: flex; }
        .cal-week-timecol { min-width: 44px; }
        .cal-week-hour { height: 44px; font-size: 9px; }
        .cal-week-slot { min-height: 44px; padding: 2px; }
        .cal-week-event { font-size: 9px; padding: 2px 4px; }
      }

      @media (max-width: 400px) {
        .cal-cell, .cal-cell-empty { min-height: 56px; }
        .cal-day-head { font-size: 9px; padding: 8px 1px; }
      }
    `}</style>
  );
}

export default function Calendar() {
  const { isManager, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ events: [], tasks: [], projects: [], birthdays: [] });
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  // Calendar (month grid) is the default view.
  const [view, setView] = useState('month');
  const [current, setCurrent] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  // Start value (datetime-local format) used when creating an event from a day / time slot.
  const [prefillStart, setPrefillStart] = useState('');
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedFilterMembers, setSelectedFilterMembers] = useState([]);
  const [confirmModal, setConfirmModal] = useState(EMPTY_CONFIRM);
  const [saving, setSaving] = useState(false);

  const memberParams = useMemo(() => {
    const memberEmails = selectedFilterMembers
      .map((member) => normalizeEmail(member.email))
      .filter(Boolean);
    return memberEmails.length > 0 ? { members: memberEmails.join(',') } : {};
  }, [selectedFilterMembers]);

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const [calendarResponse, membersResponse] = await Promise.all([
          api.get('/calendar', { params: memberParams }),
          api.get('/members'),
        ]);

        setData(calendarResponse.data);
        setMembers(membersResponse.data);
      } catch (error) {
        console.error('Error loading calendar data:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [memberParams]);

  // Silent refresh: keeps the page (and any open day modal) on screen instead of flashing the page loader.
  const refreshCalendar = async () => {
    try {
      const response = await api.get('/calendar', { params: memberParams });
      setData(response.data);
    } catch (error) {
      console.error('Error refreshing calendar:', error);
    }
  };

  const allItems = useMemo(
    () => buildCalendarItems(data, current.getFullYear()),
    [data, current],
  );

  const itemsByDate = useMemo(() => {
    const byDate = new Map();
    allItems.forEach((item) => {
      const key = `${item.date.getFullYear()}-${item.date.getMonth()}-${item.date.getDate()}`;
      const items = byDate.get(key);
      if (items) items.push(item);
      else byDate.set(key, [item]);
    });
    return byDate;
  }, [allItems]);

  const getItemsForDate = (date) => itemsByDate.get(
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
  ) || [];

  const openNewEvent = (date, hour = 9) => {
    setEditing(null);
    setPrefillStart(date ? toInputValue(date, hour) : '');
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setPrefillStart('');
    setShowModal(true);
  };

  const closeForm = () => {
    setShowModal(false);
    setEditing(null);
    setPrefillStart('');
  };

  // Same target as clicking a row in Task View: the task's detail page.
  const openTask = (task) => {
    navigate(`/projects/${task.project_id}/tasks/${task.id}`);
  };

  const shiftSelectedDay = (delta) => {
    setSelectedDay((previous) => {
      const next = new Date(previous);
      next.setDate(next.getDate() + delta);
      return next;
    });
  };

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await api.put(`/calendar/${editing.id}`, formData);
      } else {
        await api.post('/calendar', formData);
      }

      closeForm();
      // selectedDay is intentionally kept, so the day modal reappears with the updated list.
      await refreshCalendar();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    setConfirmModal({
      show: true,
      title: 'Delete Event',
      message: 'Delete this event?',
      isDangerous: true,
      action: async () => {
        try {
          await api.delete(`/calendar/${id}`);
          await refreshCalendar();
        } catch (error) {
          console.error('Error deleting event:', error);
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

  if (loading) {
    return (
      <Loader label="Loading calendar" size="lg" variant="page" />
    );
  }

  return (
    <>
      <CalendarResponsiveStyles />

      <div className="page-header">
        <div>
          <div className="page-title">Calendar</div>
          <div className="page-subtitle">Track deadlines, tasks and events</div>
        </div>
        <div className="cal-header-actions">
          <div className="cal-view-toggle">
            {['month', 'week', 'day'].map((nextView) => (
              <button
                key={nextView}
                onClick={() => setView(nextView)}
                style={{
                  padding: '5px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: view === nextView ? 'var(--bg-2)' : 'transparent',
                  color: view === nextView ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: view === nextView ? 600 : 400,
                  fontSize: '13px',
                  boxShadow: view === nextView ? 'var(--shadow)' : 'none',
                }}
              >
                {nextView.charAt(0).toUpperCase() + nextView.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={() => setCurrent(new Date())}>
            Today
          </button>
          {isManager && (
            <button className="btn btn-primary" onClick={() => openNewEvent(null)}>
              + New Event
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {Object.entries(COLORS).map(([type, color]) => (
            <div
              key={type}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-2)' }}
            >
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </div>
          ))}
        </div>

        <MemberFilterBar
          members={members}
          selectedMembers={selectedFilterMembers}
          onSelectionChange={setSelectedFilterMembers}
          isManager={isManager}
          userEmail={user?.email}
        />

        <div
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            borderRadius: '14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="cal-nav-bar">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const nextDate = new Date(current);
                if (view === 'month') nextDate.setMonth(nextDate.getMonth() - 1);
                else if (view === 'week') nextDate.setDate(nextDate.getDate() - 7);
                else nextDate.setDate(nextDate.getDate() - 1);
                setCurrent(nextDate);
              }}
              aria-label="Previous"
            >
              {'<-'} <span className="cal-nav-btn-label">Prev</span>
            </button>

            <span className="cal-month-label">
              {view === 'month' && `${MONTHS[current.getMonth()]} ${current.getFullYear()}`}
              {view === 'week' && `Week of ${current.toLocaleDateString()}`}
              {view === 'day' &&
                current.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
            </span>

            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const nextDate = new Date(current);
                if (view === 'month') nextDate.setMonth(nextDate.getMonth() + 1);
                else if (view === 'week') nextDate.setDate(nextDate.getDate() + 7);
                else nextDate.setDate(nextDate.getDate() + 1);
                setCurrent(nextDate);
              }}
              aria-label="Next"
            >
              <span className="cal-nav-btn-label">Next</span> {'->'}
            </button>
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
              // Managers edit straight away; everyone else gets the read-only day modal.
              onClickEvent={(item) => (isManager ? openEdit(item) : setSelectedDay(item.date))}
              onClickTimeSlot={(date, hour) => openNewEvent(date, hour)}
            />
          )}
          {view === 'day' && (
            <DayView
              items={sortDayItems(getItemsForDate(current))}
              isManager={isManager}
              onEdit={openEdit}
              onDelete={handleDelete}
              onOpenTask={openTask}
            />
          )}
        </div>
      </div>

      {/* Day drill-down. Hidden while the event form is open, and comes back afterwards. */}
      {selectedDay && !showModal && (
        <DayModal
          date={selectedDay}
          items={sortDayItems(getItemsForDate(selectedDay))}
          isManager={isManager}
          onClose={() => setSelectedDay(null)}
          onShiftDay={shiftSelectedDay}
          onAdd={() => openNewEvent(selectedDay)}
          onOpenTask={openTask}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {showModal && (
        <Modal title={editing?.id ? 'Edit Event' : 'New Event'} onClose={closeForm}>
          <EventForm
            initial={editing}
            prefillStart={prefillStart}
            members={members.filter((member) => member.active !== false)}
            onSave={handleSave}
            saving={saving}
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
    </>
  );
}

function MonthView({ current, getItemsForDate, onDayClick }) {
  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const cells = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  return (
    <div>
      <div className="cal-month-grid" style={{ borderBottom: '1px solid var(--border)' }}>
        {DAYS.map((dayName) => (
          <div key={dayName} className="cal-day-head">
            {dayName}
          </div>
        ))}
      </div>

      <div className="cal-month-grid">
        {cells.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="cal-cell-empty" />;
          }

          const items = getItemsForDate(date);
          const isToday = date.toDateString() === today.toDateString();
          const baseBackground = isToday ? 'rgba(99,102,241,0.04)' : 'var(--bg-2)';

          return (
            <div
              key={date.toISOString()}
              className="cal-cell"
              onClick={() => onDayClick(date)}
              role="button"
              tabIndex={0}
              aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDayClick(date); } }}
              style={{
                background: baseBackground,
                boxShadow: isToday ? 'inset 0 0 0 1px rgba(99,102,241,0.15)' : 'none',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'var(--bg-3)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = baseBackground;
              }}
            >
              <div
                className="cal-day-num"
                style={{
                  fontWeight: isToday ? 700 : 400,
                  background: isToday ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'transparent',
                  color: isToday ? 'white' : 'var(--text)',
                }}
              >
                {date.getDate()}
              </div>

              {/* Full pills — hidden on narrow screens in favour of dots below */}
              {items.slice(0, 3).map((item, itemIndex) => (
                <div
                  key={`${item.itemType}-${item.id || item.name || itemIndex}`}
                  className="cal-pill"
                  style={{ background: `${COLORS[item.itemType]}20`, color: COLORS[item.itemType] }}
                  title={formatCellLabel(item)}
                >
                  {formatCellLabel(item)}
                </div>
              ))}
              {items.length > 3 && (
                <div className="cal-more">+{items.length - 3} more</div>
              )}

              {/* Compact dot indicators — shown only on narrow screens */}
              {items.length > 0 && (
                <div className="cal-dots">
                  {items.slice(0, 4).map((item, itemIndex) => (
                    <div
                      key={`dot-${item.itemType}-${item.id || item.name || itemIndex}`}
                      className="cal-dot"
                      style={{ background: COLORS[item.itemType] }}
                      title={formatCellLabel(item)}
                    />
                  ))}
                  {items.length > 4 && <span className="cal-more">+{items.length - 4}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ current, getItemsForDate, onDayClick, isManager, onClickEvent, onClickTimeSlot }) {
  const startOfWeek = new Date(current);
  startOfWeek.setDate(current.getDate() - current.getDay());
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + index);
    return date;
  });

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getEventsForTimeSlot = (date, hour) => {
    const dateItems = getItemsForDate(date);
    return dateItems.filter((item) => {
      if (item.itemType === 'event' && item.start_date) {
        const eventDate = new Date(item.start_date);
        return eventDate.getHours() === hour;
      }
      return false;
    });
  };

  return (
    <div className="cal-week-scroll">
      {/* Time column on the left */}
      <div className="cal-week-timecol">
        <div style={{ height: '60px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '8px', fontWeight: 600, fontSize: '12px' }}></div>
        {hours.map((hour) => (
          <div key={hour} className="cal-week-hour">
            {String(hour).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="cal-week-grid">
        {/* Day headers */}
        {days.map((date, dayIndex) => {
          const isToday = date.toDateString() === today.toDateString();
          return (
            <div
              key={`header-${date.toISOString()}`}
              onClick={() => onDayClick(date)}
              style={{
                padding: '12px 4px',
                textAlign: 'center',
                borderRight: dayIndex < 6 ? '1px solid var(--border)' : 'none',
                borderBottom: '1px solid var(--border)',
                background: isToday ? 'rgba(99,102,241,0.04)' : 'var(--bg-2)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>
                {DAYS[dayIndex]}
              </div>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  margin: '4px auto 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isToday ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'transparent',
                  color: isToday ? 'white' : 'var(--text)',
                  fontWeight: isToday ? 700 : 400,
                  fontSize: '14px',
                }}
              >
                {date.getDate()}
              </div>
            </div>
          );
        })}

        {/* Time slots grid */}
        {hours.map((hour) =>
          days.map((date, dayIndex) => {
            const isToday = date.toDateString() === today.toDateString();
            const slotEvents = getEventsForTimeSlot(date, hour);

            return (
              <div
                key={`slot-${date.toISOString()}-${hour}`}
                className="cal-week-slot"
                onClick={() => isManager && onClickTimeSlot(date, hour)}
                style={{
                  borderRight: dayIndex < 6 ? '1px solid var(--border)' : 'none',
                  borderBottom: '1px solid var(--border)',
                  background: isToday ? 'rgba(99,102,241,0.02)' : 'var(--bg-2)',
                  cursor: isManager ? 'pointer' : 'default',
                }}
              >
                {slotEvents.map((event, idx) => (
                  <div
                    key={`${event.id}-${idx}`}
                    className="cal-week-event"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClickEvent(event);
                    }}
                    style={{ background: COLORS[event.itemType] }}
                    title={event.displayTitle}
                  >
                    {event.displayTitle}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// One row in a day's list. Shared by the day modal and the Day tab so both behave the same.
function ItemRow({ item, isManager, onEdit, onDelete, onOpenTask, roomy = false }) {
  const color = COLORS[item.itemType];
  const meta = formatDayMeta(item);
  const isEditable = isManager && item.itemType === 'event';
  const isTask = item.itemType === 'task' && item.project_id != null && Boolean(onOpenTask);

  return (
    <div
      className={isTask ? 'cal-detail-item cal-detail-item-click' : 'cal-detail-item'}
      role={isTask ? 'button' : undefined}
      tabIndex={isTask ? 0 : undefined}
      onClick={isTask ? () => onOpenTask(item) : undefined}
      onKeyDown={isTask ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenTask(item); } } : undefined}
      style={{
        borderLeft: `${roomy ? 4 : 3}px solid ${color}`,
        ...(roomy ? { padding: '14px 16px', borderRadius: '10px' } : null),
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 160px' }}>
        <div style={{ fontSize: roomy ? '14px' : '13px', fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>
          {item.displayTitle}
        </div>
        {item.itemType === 'task' && item.assignee_name && (
          <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>
            Assigned to {item.assignee_name}
          </div>
        )}
        {item.description && (
          <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px', wordBreak: 'break-word' }}>
            {item.description}
          </div>
        )}
        {meta && (
          <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>{meta}</div>
        )}
      </div>

      <div className="cal-detail-actions">
        <span
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            background: `${color}20`,
            color,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {item.itemType}
        </span>
        {isTask && (
          <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Open task {'->'}
          </span>
        )}
        {isEditable && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(item)}>
              Edit
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(item.id)}>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DayModal({ date, items, isManager, onClose, onShiftDay, onAdd, onEdit, onDelete, onOpenTask }) {
  const title = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const summary = items.length === 0
    ? 'Nothing scheduled'
    : `${items.length} ${items.length === 1 ? 'item' : 'items'}`;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="cal-modal-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => onShiftDay(-1)} aria-label="Previous day">
          {'<-'} <span className="cal-nav-btn-label">Prev day</span>
        </button>
        <span className="cal-modal-summary">{summary}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => onShiftDay(1)} aria-label="Next day">
          <span className="cal-nav-btn-label">Next day</span> {'->'}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="cal-empty">
          <div className="cal-empty-title">No events, tasks or deadlines</div>
          {isManager ? 'Add an event to get this day started.' : 'This day is free.'}
        </div>
      ) : (
        <div className="cal-modal-list">
          {items.map((item, index) => (
            <ItemRow
              key={`${item.itemType}-${item.id || item.name || index}`}
              item={item}
              isManager={isManager}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenTask={onOpenTask}
            />
          ))}
        </div>
      )}

      <div className="cal-modal-footer">
        {isManager && (
          <button className="btn btn-primary" onClick={onAdd}>
            + Add event on this day
          </button>
        )}
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function DayView({ items, isManager, onEdit, onDelete, onOpenTask }) {
  return (
    <div style={{ padding: '16px', minHeight: '300px' }}>
      {items.length === 0 ? (
        <div className="cal-empty" style={{ padding: '40px 12px' }}>
          <div className="cal-empty-title">Nothing on this day</div>
          No events, tasks or deadlines.
        </div>
      ) : (
        items.map((item, index) => (
          <ItemRow
            key={`${item.itemType}-${item.id || item.name || index}`}
            item={item}
            isManager={isManager}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpenTask={onOpenTask}
            roomy
          />
        ))
      )}
    </div>
  );
}

function EventForm({ initial, prefillStart = '', members, onSave, onCancel, saving = false }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    start_date: initial?.start_date ? new Date(initial.start_date).toISOString().slice(0, 16) : prefillStart,
    end_date: initial?.end_date ? new Date(initial.end_date).toISOString().slice(0, 16) : '',
    type: initial?.type || 'event',
    member_ids: initial?.attendees?.map((attendee) => attendee.id) || [],
    guest_email: '',
  });
  const [invitingGuest, setInvitingGuest] = useState(false);

  const setField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const toggleMember = (id) => {
    setField(
      'member_ids',
      form.member_ids.includes(id)
        ? form.member_ids.filter((memberId) => memberId !== id)
        : [...form.member_ids, id],
    );
  };

  const handleAddGuest = async () => {
    if (!form.guest_email.trim()) return;

    setInvitingGuest(true);
    try {
      await api.post('/calendar/notify-guest', {
        guest_email: form.guest_email,
        event_title: form.title,
        start_date: form.start_date,
        description: form.description,
      });
      setField('guest_email', '');
      alert('Invitation sent to ' + form.guest_email);
    } catch (error) {
      alert('Failed to send invitation: ' + (error.response?.data?.error || error.message));
    } finally {
      setInvitingGuest(false);
    }
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Event Title *</label>
        <input
          className="form-input"
          value={form.title}
          onChange={(event) => setField('title', event.target.value)}
          placeholder="Enter event title"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Type</label>
        <Select value={form.type} onChange={(val) => setField('type', val)}>
          <option value="event">Custom Event</option>
          <option value="birthday">Birthday</option>
        </Select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Start Date &amp; Time *</label>
          <input
            className="form-input"
            type="datetime-local"
            value={form.start_date}
            onChange={(event) => setField('start_date', event.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">End Date &amp; Time</label>
          <input
            className="form-input"
            type="datetime-local"
            value={form.end_date}
            onChange={(event) => setField('end_date', event.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea
          className="form-textarea"
          value={form.description}
          onChange={(event) => setField('description', event.target.value)}
          placeholder="Optional description"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Invite Members</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => toggleMember(member.id)}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                border: `1.5px solid ${form.member_ids.includes(member.id) ? 'var(--accent)' : 'var(--border)'}`,
                background: form.member_ids.includes(member.id) ? 'var(--accent-light)' : 'var(--bg-3)',
                color: form.member_ids.includes(member.id) ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {member.name}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Add Guest by Email</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            type="email"
            value={form.guest_email}
            onChange={(event) => setField('guest_email', event.target.value)}
            placeholder="guest@example.com"
            onKeyPress={(e) => e.key === 'Enter' && handleAddGuest()}
            style={{ flex: '1 1 180px', minWidth: 0 }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddGuest}
            disabled={invitingGuest}
            style={{ whiteSpace: 'nowrap' }}
          >
            {invitingGuest ? <Loader label="Sending..." size="sm" variant="button" /> : 'Send Invite'}
          </button>
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving}>
          {saving ? <Loader label="Saving..." size="sm" variant="button" /> : (initial?.id ? 'Save Changes' : 'Create Event')}
        </button>
      </div>
    </div>
  );
}