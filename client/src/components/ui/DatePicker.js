import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  isSameMonth,
  parseISO,
} from 'date-fns';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), 'MMMM'));

// Safely parse a 'yyyy-MM-dd' string (or Date) into a Date, ignoring bad input.
const toDate = (v) => {
  if (!v) return null;
  try {
    const d = typeof v === 'string' ? parseISO(v) : v;
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  minDate,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const [viewDate, setViewDate] = useState(selected || new Date());
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelNode, setPanelNode] = useState(null);

  // Callback ref: lets us know the instant the panel mounts/unmounts (or
  // swaps identity), so we can (re)attach a ResizeObserver to it.
  const setPanelRef = useCallback((node) => {
    panelRef.current = node;
    setPanelNode(node);
  }, []);

  useEffect(() => {
    if (selected) setViewDate(selected);
  }, [value]);

  const PANEL_HEIGHT_ESTIMATE = 340; // used only before the panel has mounted
  const PANEL_WIDTH = 300;
  const MARGIN = 8;

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Use the panel's real rendered height once it exists, so the gap
    // when flipped above the field is always accurate — never guessed.
    const panelHeight = panelRef.current?.offsetHeight || PANEL_HEIGHT_ESTIMATE;

    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;

    let top;
    if (spaceBelow >= panelHeight + MARGIN || spaceBelow >= spaceAbove) {
      top = Math.min(r.bottom + MARGIN, window.innerHeight - panelHeight - MARGIN);
    } else {
      top = r.top - panelHeight - MARGIN;
    }
    top = Math.max(MARGIN, top);

    // Keep it from running off the right edge of the screen too.
    let left = Math.min(r.left, window.innerWidth - PANEL_WIDTH - MARGIN);
    left = Math.max(MARGIN, left);

    setCoords({ top, left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  // The moment the panel is actually in the DOM (and any time its size
  // changes — e.g. navigating to a month with fewer/more calendar rows),
  // reposition using its real height. This is the reliable fix for the
  // "first open has a bigger gap than the second open" issue: a single
  // requestAnimationFrame guess can race font loading / first paint,
  // ResizeObserver cannot — it only fires once real layout is settled.
  useEffect(() => {
    if (!open || !panelNode) return;
    const ro = new ResizeObserver(updatePos);
    ro.observe(panelNode);
    return () => ro.disconnect();
  }, [open, panelNode, updatePos]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const gridStart = startOfWeek(startOfMonth(viewDate));
  const gridEnd = endOfWeek(endOfMonth(viewDate));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const min = toDate(minDate);

  const pick = (day) => {
    if (min && day < min) return;
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
  };

  const currentYear = viewDate.getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="form-input date-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ color: selected ? 'var(--text)' : 'var(--text-3)' }}>
          {selected ? format(selected, 'MMM d, yyyy') : placeholder}
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <rect x="3" y="5" width="18" height="16" rx="3" stroke="var(--text-3)" strokeWidth="1.8" />
          <path d="M3 9.5H21" stroke="var(--text-3)" strokeWidth="1.8" />
          <path d="M8 3V6.5M16 3V6.5" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={setPanelRef}
            className="date-picker-panel"
            style={{ top: coords.top, left: coords.left }}
          >
            <div className="date-picker-header">
              <button
                type="button"
                className="date-picker-nav"
                onClick={() => setViewDate((d) => subMonths(d, 1))}
              >
                ‹
              </button>
              <div className="date-picker-dropdowns">
                <div className="date-picker-select-wrap">
                  <select
                    value={viewDate.getMonth()}
                    onChange={(e) =>
                      setViewDate((d) => new Date(d.getFullYear(), Number(e.target.value), 1))
                    }
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <span>▾</span>
                </div>
                <div className="date-picker-select-wrap">
                  <select
                    value={currentYear}
                    onChange={(e) =>
                      setViewDate((d) => new Date(Number(e.target.value), d.getMonth(), 1))
                    }
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <span>▾</span>
                </div>
              </div>
              <button
                type="button"
                className="date-picker-nav"
                onClick={() => setViewDate((d) => addMonths(d, 1))}
              >
                ›
              </button>
            </div>

            <div className="date-picker-weekdays">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>

            <div className="date-picker-grid">
              {days.map((day) => {
                const inMonth = isSameMonth(day, viewDate);
                const isSel = selected && isSameDay(day, selected);
                const isTod = isToday(day);
                const isDisabled = min && day < min;
                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    disabled={isDisabled}
                    className={[
                      'date-picker-day',
                      !inMonth ? 'is-muted' : '',
                      isSel ? 'is-selected' : '',
                      isTod && !isSel ? 'is-today' : '',
                      isDisabled ? 'is-disabled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => pick(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
