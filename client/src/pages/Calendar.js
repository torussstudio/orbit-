import { useEffect, useState, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import MemberFilterBar from '../components/ui/MemberFilterBar';

const COLORS = {
  event: '#6366f1',
  task: '#3b82f6',
  deadline: '#8b5cf6',
  birthday: '#f59e0b',
};

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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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

export default function Calendar() {
  const { isManager, user } = useAuth();
  const [data, setData] = useState({ events: [], tasks: [], projects: [], birthdays: [] });
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('month');
  const [current, setCurrent] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedFilterMembers, setSelectedFilterMembers] = useState([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const params = {};
        const memberEmails = selectedFilterMembers
          .map((member) => normalizeEmail(member.email))
          .filter(Boolean);

        if (memberEmails.length > 0) {
          params.members = memberEmails.join(',');
        }

        const [calendarResponse, membersResponse] = await Promise.all([
          api.get('/calendar', { params }),
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
  }, [selectedFilterMembers]);

  const allItems = buildCalendarItems(data, current.getFullYear());

  const getItemsForDate = (date) =>
    allItems.filter((item) => {
      const itemDate = item.date;
      return (
        itemDate.getDate() === date.getDate() &&
        itemDate.getMonth() === date.getMonth() &&
        itemDate.getFullYear() === date.getFullYear()
      );
    });

  const handleSave = async (formData) => {
    if (editing) {
      await api.put(`/calendar/${editing.id}`, formData);
    } else {
      await api.post('/calendar', formData);
    }

    setShowModal(false);
    setEditing(null);
    setSelectedDay(null);
    setLoading(true);

    try {
      const memberEmails = selectedFilterMembers
        .map((member) => normalizeEmail(member.email))
        .filter(Boolean);
      const params = memberEmails.length > 0 ? { members: memberEmails.join(',') } : {};
      const response = await api.get('/calendar', { params });
      setData(response.data);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this event?')) {
      return;
    }

    await api.delete(`/calendar/${id}`);
    setSelectedDay(null);
    setLoading(true);

    try {
      const memberEmails = selectedFilterMembers
        .map((member) => normalizeEmail(member.email))
        .filter(Boolean);
      const params = memberEmails.length > 0 ? { members: memberEmails.join(',') } : {};
      const response = await api.get('/calendar', { params });
      setData(response.data);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Calendar</div>
          <div className="page-subtitle">Track deadlines, tasks and events</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-3)',
              borderRadius: '8px',
              padding: '3px',
              gap: '2px',
            }}
          >
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
          {isManager && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditing(null);
                setShowModal(true);
              }}
            >
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
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
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

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const nextDate = new Date(current);
                if (view === 'month') nextDate.setMonth(nextDate.getMonth() - 1);
                else if (view === 'week') nextDate.setDate(nextDate.getDate() - 7);
                else nextDate.setDate(nextDate.getDate() - 1);
                setCurrent(nextDate);
              }}
            >
              {'<-'} Prev
            </button>

            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
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
            >
              Next {'->'}
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
              onClickEvent={(item) => {
                setEditing(item);
                setShowModal(true);
              }}
              onClickTimeSlot={(date, hour) => {
                setSelectedTimeSlot({ date, hour });
                const newDate = new Date(date);
                newDate.setHours(hour, 0);
                setEditing({ start_date: newDate.toISOString(), type: 'event' });
                setShowModal(true);
              }}
            />
          )}
          {view === 'day' && (
            <DayView
              current={current}
              items={getItemsForDate(current)}
              isManager={isManager}
              onEdit={(item) => {
                setEditing(item);
                setShowModal(true);
              }}
              onDelete={handleDelete}
            />
          )}
        </div>

        {selectedDay && (
          <div style={{ marginTop: '20px' }}>
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h3 style={{ fontSize: '14px', fontWeight: 700 }}>
                  {selectedDay.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDay(null)}>
                  Close
                </button>
              </div>

              {getItemsForDate(selectedDay).length === 0 ? (
                <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>No items on this day.</p>
              ) : (
                getItemsForDate(selectedDay).map((item, index) => (
                  <div
                    key={`${item.itemType}-${item.id || item.name || index}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      marginBottom: '8px',
                      background: 'var(--bg-3)',
                      borderLeft: `3px solid ${COLORS[item.itemType]}`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                        {item.displayTitle}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>
                          {item.description}
                        </div>
                      )}
                      {formatDayMeta(item) && (
                        <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                          {formatDayMeta(item)}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: `${COLORS[item.itemType]}20`,
                          color: COLORS[item.itemType],
                          fontWeight: 600,
                        }}
                      >
                        {item.itemType}
                      </span>
                      {isManager && item.itemType === 'event' && (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setEditing(item);
                              setShowModal(true);
                            }}
                          >
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          title={editing ? 'Edit Event' : 'New Event'}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
        >
          <EventForm
            initial={editing}
            members={members.filter((member) => member.active !== false)}
            onSave={handleSave}
            onCancel={() => {
              setShowModal(false);
              setEditing(null);
            }}
          />
        </Modal>
      )}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {DAYS.map((dayName) => (
          <div
            key={dayName}
            style={{
              padding: '10px',
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {dayName}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((date, index) => {
          if (!date) {
            return (
              <div
                key={`empty-${index}`}
                style={{
                  minHeight: '100px',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-3)',
                }}
              />
            );
          }

          const items = getItemsForDate(date);
          const isToday = date.toDateString() === today.toDateString();
          const baseBackground = isToday ? 'rgba(99,102,241,0.04)' : 'var(--bg-2)';

          return (
            <div
              key={date.toISOString()}
              onClick={() => onDayClick(date)}
              style={{
                minHeight: '100px',
                padding: '8px',
                borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'background 0.15s',
                background: baseBackground,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'var(--bg-3)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = baseBackground;
              }}
            >
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '4px',
                  fontSize: '13px',
                  fontWeight: isToday ? 700 : 400,
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? 'white' : 'var(--text)',
                }}
              >
                {date.getDate()}
              </div>

              {items.slice(0, 3).map((item, itemIndex) => (
                <div
                  key={`${item.itemType}-${item.id || item.name || itemIndex}`}
                  style={{
                    fontSize: '10px',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    marginBottom: '2px',
                    background: `${COLORS[item.itemType]}20`,
                    color: COLORS[item.itemType],
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={formatCellLabel(item)}
                >
                  {formatCellLabel(item)}
                </div>
              ))}

              {items.length > 3 && (
                <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>
                  +{items.length - 3} more
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
    return dateItems.filter(item => {
      if (item.itemType === 'event' && item.start_date) {
        const eventDate = new Date(item.start_date);
        return eventDate.getHours() === hour;
      }
      return false;
    });
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'auto', borderTop: '1px solid var(--border)' }}>
      {/* Time column on the left */}
      <div style={{ minWidth: '80px', borderRight: '1px solid var(--border)', background: 'var(--bg-3)' }}>
        <div style={{ height: '60px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '8px', fontWeight: 600, fontSize: '12px' }}></div>
        {hours.map(hour => (
          <div
            key={hour}
            style={{
              height: '60px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '2px 0',
              fontSize: '11px',
              color: 'var(--text-3)',
              fontWeight: 500,
              borderBottom: '1px solid var(--border)',
            }}
          >
            {String(hour).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, 1fr)`, flex: 1 }}>
        {/* Day headers */}
        {days.map((date, dayIndex) => {
          const isToday = date.toDateString() === today.toDateString();
          return (
            <div
              key={`header-${date.toISOString()}`}
              style={{
                padding: '12px 4px',
                textAlign: 'center',
                borderRight: dayIndex < 6 ? '1px solid var(--border)' : 'none',
                borderBottom: '1px solid var(--border)',
                background: isToday ? 'rgba(99,102,241,0.04)' : 'var(--bg-2)',
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
                  background: isToday ? 'var(--accent)' : 'transparent',
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
        {hours.map(hour =>
          days.map((date, dayIndex) => {
            const isToday = date.toDateString() === today.toDateString();
            const slotEvents = getEventsForTimeSlot(date, hour);
            
            return (
              <div
                key={`slot-${date.toISOString()}-${hour}`}
                onClick={() => isManager && onClickTimeSlot(date, hour)}
                style={{
                  minHeight: '60px',
                  padding: '4px',
                  borderRight: dayIndex < 6 ? '1px solid var(--border)' : 'none',
                  borderBottom: '1px solid var(--border)',
                  background: isToday ? 'rgba(99,102,241,0.02)' : 'var(--bg-2)',
                  cursor: isManager ? 'pointer' : 'default',
                  position: 'relative',
                }}
              >
                {slotEvents.map((event, idx) => (
                  <div
                    key={`${event.id}-${idx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClickEvent(event);
                    }}
                    style={{
                      fontSize: '11px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      marginBottom: '2px',
                      background: COLORS[event.itemType],
                      color: 'white',
                      fontWeight: 600,
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
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

function DayView({ current, items, isManager, onEdit, onDelete }) {
  return (
    <div style={{ padding: '20px', minHeight: '300px' }}>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>No items</div>
          <p>No events on this day</p>
        </div>
      ) : (
        items.map((item, index) => (
          <div
            key={`${item.itemType}-${item.id || item.name || index}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              borderRadius: '10px',
              marginBottom: '10px',
              background: 'var(--bg-3)',
              borderLeft: `4px solid ${COLORS[item.itemType]}`,
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{item.displayTitle}</div>
              {item.description && (
                <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '3px' }}>
                  {item.description}
                </div>
              )}
              {formatDayMeta(item) && (
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                  {formatDayMeta(item)}
                </div>
              )}
            </div>

            {isManager && item.itemType === 'event' && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(item)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(item.id)}>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function EventForm({ initial, members, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    start_date: initial?.start_date ? new Date(initial.start_date).toISOString().slice(0, 16) : '',
    end_date: initial?.end_date ? new Date(initial.end_date).toISOString().slice(0, 16) : '',
    type: initial?.type || 'event',
    member_ids: initial?.attendees?.map((attendee) => attendee.id) || [],
    guest_email: '',
  });

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
    
    try {
      // Send notification email to guest
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
        <select className="form-select" value={form.type} onChange={(event) => setField('type', event.target.value)}>
          <option value="event">Custom Event</option>
          <option value="birthday">Birthday</option>
        </select>
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="form-input"
            type="email"
            value={form.guest_email}
            onChange={(event) => setField('guest_email', event.target.value)}
            placeholder="guest@example.com"
            onKeyPress={(e) => e.key === 'Enter' && handleAddGuest()}
          />
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={handleAddGuest}
            style={{ whiteSpace: 'nowrap' }}
          >
            Send Invite
          </button>
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onSave(form)}>
          {initial?.id ? 'Save Changes' : 'Create Event'}
        </button>
      </div>
    </div>
  );
}
