import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';

const COLORS = {
  event: '#6366f1',
  task: '#3b82f6',
  deadline: '#8b5cf6',
  birthday: '#f59e0b'
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Calendar() {
  const { isManager } = useAuth();
  const [data, setData] = useState({ events: [], tasks: [], projects: [], birthdays: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('month');
  const [current, setCurrent] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);

  const load = async () => {
    const [cal, mem] = await Promise.all([api.get('/calendar'), api.get('/members')]);
    setData(cal.data);
    setMembers(mem.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const allItems = [
    ...data.events.map(e => ({ ...e, itemType: 'event', date: new Date(e.start_date) })),
    ...data.tasks.map(t => ({ ...t, itemType: 'task', date: new Date(t.due_date), title: `📋 ${t.title}` })),
    ...data.projects.map(p => ({ ...p, itemType: 'deadline', date: new Date(p.end_date), title: `🚀 ${p.name}` })),
    ...data.birthdays.map(b => {
      const bd = new Date(b.birthday);
      bd.setFullYear(current.getFullYear());
      return { ...b, itemType: 'birthday', date: bd, title: `🎂 ${b.name}` };
    })
  ];

  const getItemsForDate = (date) => allItems.filter(item => {
    const d = item.date;
    return d.getDate() === date.getDate() &&
      d.getMonth() === date.getMonth() &&
      d.getFullYear() === date.getFullYear();
  });

  const handleSave = async (formData) => {
    if (editing) await api.put(`/calendar/${editing.id}`, formData);
    else await api.post('/calendar', formData);
    setShowModal(false); setEditing(null); load();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this event?')) {
      await api.delete(`/calendar/${id}`);
      load(); setSelectedDay(null);
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Calendar</div>
          <div className="page-subtitle">Track deadlines, tasks and events</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* View switcher */}
          <div style={{ display: 'flex', background: 'var(--bg-3)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {['month', 'week', 'day'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: view === v ? 'var(--bg-2)' : 'transparent',
                color: view === v ? 'var(--accent)' : 'var(--text-2)',
                fontWeight: view === v ? 600 : 400, fontSize: '13px',
                boxShadow: view === v ? 'var(--shadow)' : 'none'
              }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {isManager && (
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
              + New Event
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {Object.entries(COLORS).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-2)' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const d = new Date(current);
              if (view === 'month') d.setMonth(d.getMonth() - 1);
              else if (view === 'week') d.setDate(d.getDate() - 7);
              else d.setDate(d.getDate() - 1);
              setCurrent(d);
            }}>← Prev</button>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
              {view === 'month' && `${MONTHS[current.getMonth()]} ${current.getFullYear()}`}
              {view === 'week' && `Week of ${current.toLocaleDateString()}`}
              {view === 'day' && current.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const d = new Date(current);
              if (view === 'month') d.setMonth(d.getMonth() + 1);
              else if (view === 'week') d.setDate(d.getDate() + 7);
              else d.setDate(d.getDate() + 1);
              setCurrent(d);
            }}>Next →</button>
          </div>

          {/* Month View */}
          {view === 'month' && (
            <MonthView current={current} getItemsForDate={getItemsForDate} onDayClick={setSelectedDay} />
          )}

          {/* Week View */}
          {view === 'week' && (
            <WeekView current={current} getItemsForDate={getItemsForDate} onDayClick={setSelectedDay} />
          )}

          {/* Day View */}
          {view === 'day' && (
            <DayView current={current} items={getItemsForDate(current)} isManager={isManager} onEdit={(e) => { setEditing(e); setShowModal(true); }} onDelete={handleDelete} />
          )}
        </div>

        {/* Day detail popup */}
        {selectedDay && (
          <div style={{ marginTop: '20px' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700 }}>
                  {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDay(null)}>✕ Close</button>
              </div>
              {getItemsForDate(selectedDay).length === 0 ? (
                <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>No events on this day.</p>
              ) : (
                getItemsForDate(selectedDay).map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: '8px', marginBottom: '8px',
                    background: 'var(--bg-3)', borderLeft: `3px solid ${COLORS[item.itemType]}`
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{item.title}</div>
                      {item.description && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>{item.description}</div>}
                      {item.project_name && <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>📁 {item.project_name}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: COLORS[item.itemType] + '20', color: COLORS[item.itemType], fontWeight: 600 }}>
                        {item.itemType}
                      </span>
                      {isManager && item.itemType === 'event' && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(item); setShowModal(true); }}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>Delete</button>
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
        <Modal title={editing ? 'Edit Event' : 'New Event'} onClose={() => { setShowModal(false); setEditing(null); }}>
          <EventForm initial={editing} members={members} onSave={handleSave} onCancel={() => { setShowModal(false); setEditing(null); }} />
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
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {DAYS.map(d => (
          <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} style={{ minHeight: '100px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-3)' }} />;
          const items = getItemsForDate(date);
          const isToday = date.toDateString() === today.toDateString();
          return (
            <div key={i} onClick={() => onDayClick(date)} style={{
              minHeight: '100px', padding: '8px',
              borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
              cursor: 'pointer', transition: 'background 0.15s',
              background: isToday ? 'rgba(99,102,241,0.04)' : 'var(--bg-2)'
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
              onMouseLeave={e => e.currentTarget.style.background = isToday ? 'rgba(99,102,241,0.04)' : 'var(--bg-2)'}
            >
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '4px', fontSize: '13px', fontWeight: isToday ? 700 : 400,
                background: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? 'white' : 'var(--text)'
              }}>{date.getDate()}</div>
              {items.slice(0, 3).map((item, j) => (
                <div key={j} style={{
                  fontSize: '10px', padding: '2px 5px', borderRadius: '4px', marginBottom: '2px',
                  background: COLORS[item.itemType] + '20', color: COLORS[item.itemType],
                  fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>{item.title}</div>
              ))}
              {items.length > 3 && <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' }}>+{items.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ current, getItemsForDate, onDayClick }) {
  const startOfWeek = new Date(current);
  startOfWeek.setDate(current.getDate() - current.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });
  const today = new Date();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
      {days.map((date, i) => {
        const items = getItemsForDate(date);
        const isToday = date.toDateString() === today.toDateString();
        return (
          <div key={i} onClick={() => onDayClick(date)} style={{
            minHeight: '300px', padding: '12px 8px',
            borderRight: i < 6 ? '1px solid var(--border)' : 'none',
            cursor: 'pointer', background: isToday ? 'rgba(99,102,241,0.04)' : 'var(--bg-2)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{DAYS[i]}</div>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%', margin: '4px auto 0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? 'white' : 'var(--text)', fontWeight: isToday ? 700 : 400, fontSize: '14px'
              }}>{date.getDate()}</div>
            </div>
            {items.map((item, j) => (
              <div key={j} style={{
                fontSize: '11px', padding: '4px 6px', borderRadius: '6px', marginBottom: '4px',
                background: COLORS[item.itemType] + '20', color: COLORS[item.itemType],
                fontWeight: 600, borderLeft: `2px solid ${COLORS[item.itemType]}`
              }}>{item.title}</div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DayView({ current, items, isManager, onEdit, onDelete }) {
  return (
    <div style={{ padding: '20px', minHeight: '300px' }}>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>📅</div>
          <p>No events on this day</p>
        </div>
      ) : (
        items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px', borderRadius: '10px', marginBottom: '10px',
            background: 'var(--bg-3)', borderLeft: `4px solid ${COLORS[item.itemType]}`
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{item.title}</div>
              {item.description && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '3px' }}>{item.description}</div>}
              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {item.project_name && ` · 📁 ${item.project_name}`}
              </div>
            </div>
            {isManager && item.itemType === 'event' && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(item)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(item.id)}>Delete</button>
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
    member_ids: initial?.attendees?.map(a => a.id) || []
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleMember = (id) => set('member_ids', form.member_ids.includes(id) ? form.member_ids.filter(m => m !== id) : [...form.member_ids, id]);

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Event Title *</label>
        <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Enter event title" />
      </div>
      <div className="form-group">
        <label className="form-label">Type</label>
        <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
          <option value="event">📅 Custom Event</option>
          <option value="birthday">🎂 Birthday</option>
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Start Date & Time *</label>
          <input className="form-input" type="datetime-local" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">End Date & Time</label>
          <input className="form-input" type="datetime-local" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional description" />
      </div>
      <div className="form-group">
        <label className="form-label">Invite Members (will receive reminder emails)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
          {members.map(m => (
            <div key={m.id} onClick={() => toggleMember(m.id)} style={{
              padding: '5px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
              border: `1.5px solid ${form.member_ids.includes(m.id) ? 'var(--accent)' : 'var(--border)'}`,
              background: form.member_ids.includes(m.id) ? 'var(--accent-light)' : 'var(--bg-3)',
              color: form.member_ids.includes(m.id) ? 'var(--accent)' : 'var(--text-2)'
            }}>{m.name}</div>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(form)}>
          {initial ? 'Save Changes' : 'Create Event'}
        </button>
      </div>
    </div>
  );
}
