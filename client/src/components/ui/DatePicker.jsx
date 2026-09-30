import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  format,
  addMonths,
  subMonths,
  startOfDay,
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

const PANEL_HEIGHT_ESTIMATE = 340; // used only before the panel has mounted
const PANEL_WIDTH = 300;
const MARGIN = 8;

// Must sit above the app's modal layer, since this panel is portalled to <body>
// and is used inside modals. Align with your modal z-index scale.
const PANEL_Z_INDEX = 1100;

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';

const focusRingInset =
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent)]';

const navButton = `inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-2)] transition-[background-color,transform] duration-200 hover:bg-[var(--bg-3)] active:scale-95 ${focusRing}`;

const selectClass = `h-8 cursor-pointer appearance-none rounded-md bg-transparent py-1 pl-2.5 pr-7 text-sm font-semibold tracking-tight text-[var(--text)] transition-colors duration-200 hover:bg-[var(--bg-3)] [&>option]:bg-[var(--bg-2)] [&>option]:text-[var(--text)] ${focusRing}`;

const dayBase = `flex h-9 items-center justify-center rounded-lg border text-[13px] tabular-nums transition-[background-color,transform] duration-200 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${focusRingInset}`;

/* -------------------------------------------------------------------------- */
/* ICONS                                                                      */
/* -------------------------------------------------------------------------- */

function Icon({ size = 16, className, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const CalendarIcon = ({ className }) => (
  <Icon className={className}>
    <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" />
    <path d="M3 8.5h14M6.5 3v3M13.5 3v3" />
  </Icon>
);

const ChevronLeftIcon = () => (
  <Icon>
    <path d="M12 5l-5 5 5 5" />
  </Icon>
);

const ChevronRightIcon = () => (
  <Icon>
    <path d="M8 5l5 5-5 5" />
  </Icon>
);

const ChevronDownIcon = ({ className }) => (
  <Icon size={14} className={className}>
    <path d="M5.5 8l4.5 4.5L14.5 8" />
  </Icon>
);

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function DatePicker({
  id,
  value,
  onChange,
  placeholder = 'Select date',
  minDate,
  disabled,
  fromYear = 1900,
  toYear = new Date().getFullYear() + 10,
}) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const [viewDate, setViewDate] = useState(selected || new Date());
  const [coords, setCoords] = useState(null);
  const [shown, setShown] = useState(false);
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
    let placement = 'below';
    if (spaceBelow >= panelHeight + MARGIN || spaceBelow >= spaceAbove) {
      top = Math.min(r.bottom + MARGIN, window.innerHeight - panelHeight - MARGIN);
    } else {
      top = r.top - panelHeight - MARGIN;
      placement = 'above';
    }
    top = Math.max(MARGIN, top);

    // Keep it from running off the right edge of the screen too.
    let left = Math.min(r.left, window.innerWidth - PANEL_WIDTH - MARGIN);
    left = Math.max(MARGIN, left);

    setCoords((prev) =>
      prev && prev.top === top && prev.left === left && prev.placement === placement
        ? prev
        : { top, left, placement }
    );
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
  // reposition using its real height. ResizeObserver only fires once real
  // layout is settled, so the first open never has a bigger gap than the second.
  useEffect(() => {
    if (!open || !panelNode) return;
    const ro = new ResizeObserver(updatePos);
    ro.observe(panelNode);
    return () => ro.disconnect();
  }, [open, panelNode, updatePos]);

  // Fade/scale in once the panel is mounted. Transforms don't affect
  // offsetHeight, so the position maths above is unaffected.
  useEffect(() => {
    if (!panelNode) {
      setShown(false);
      return;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [panelNode]);

  // Move focus into the panel when it opens: selected day, else today,
  // else the first enabled day.
  useEffect(() => {
    if (!panelNode) return;
    const target =
      panelNode.querySelector('[data-autofocus]:not(:disabled)') ||
      panelNode.querySelector('[data-day]:not(:disabled)');
    target?.focus({ preventScroll: true });
  }, [panelNode]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // Capture phase + stopPropagation: Escape closes only the picker, not a
    // parent modal that is also listening for it.
    const handleKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Always reopen on the selected month (or today), not wherever the
    // user last browsed to.
    setViewDate(selected || new Date());
    setOpen(true);
  };

  const gridStart = startOfWeek(startOfMonth(viewDate));
  const gridEnd = endOfWeek(endOfMonth(viewDate));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Compare by calendar day, so a minDate carrying a time of day
  // (e.g. new Date()) doesn't disable the day it falls on.
  const min = toDate(minDate);
  const minDay = min ? startOfDay(min) : null;

  const today = new Date();
  const todayDisabled = Boolean(minDay && startOfDay(today) < minDay);

  const focusDay =
    selected && isSameMonth(selected, viewDate)
      ? selected
      : isSameMonth(today, viewDate)
        ? today
        : startOfMonth(viewDate);

  const pick = (day) => {
    if (minDay && day < minDay) return;
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const currentYear = viewDate.getFullYear();
  // Full year range (fromYear → toYear). The year being viewed is always
  // included so the <select> never goes blank if it falls outside the range.
  const startYear = Math.min(fromYear, currentYear);
  const endYear = Math.max(toYear, currentYear);
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="form-input date-picker-trigger flex w-full items-center justify-between gap-2 text-left"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className={selected ? 'text-[var(--text)]' : 'text-[var(--text-3)]'}>
          {selected ? format(selected, 'MMM d, yyyy') : placeholder}
        </span>
        <CalendarIcon className="shrink-0 text-[var(--text-3)]" />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={setPanelRef}
            role="dialog"
            aria-label="Choose date"
            style={{
              top: coords.top,
              left: coords.left,
              width: PANEL_WIDTH,
              maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
              zIndex: PANEL_Z_INDEX,
            }}
            className={`fixed rounded-2xl border border-[var(--border)] bg-[var(--bg-2)] p-3 shadow-[0_16px_40px_-12px_rgba(49,46,129,0.28)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
              coords.placement === 'above' ? 'origin-bottom-left' : 'origin-top-left'
            } ${shown ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-0'}`}
          >
            {/* ------------------------------------------------------------ */}
            {/* HEADER                                                       */}
            {/* ------------------------------------------------------------ */}

            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                aria-label="Previous month"
                className={navButton}
                onClick={() => setViewDate((d) => subMonths(d, 1))}
              >
                <ChevronLeftIcon />
              </button>

              <div className="flex items-center gap-0.5">
                <div className="relative">
                  <select
                    aria-label="Month"
                    className={selectClass}
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
                  <ChevronDownIcon className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                </div>

                <div className="relative">
                  <select
                    aria-label="Year"
                    className={`${selectClass} tabular-nums`}
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
                  <ChevronDownIcon className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                </div>
              </div>

              <button
                type="button"
                aria-label="Next month"
                className={navButton}
                onClick={() => setViewDate((d) => addMonths(d, 1))}
              >
                <ChevronRightIcon />
              </button>
            </div>

            {/* ------------------------------------------------------------ */}
            {/* WEEKDAYS                                                     */}
            {/* ------------------------------------------------------------ */}

            <div className="mt-3 grid grid-cols-7 text-center" aria-hidden="true">
              {WEEKDAYS.map((w) => (
                <span key={w} className="py-1.5 text-[11px] font-medium text-[var(--text-3)]">
                  {w}
                </span>
              ))}
            </div>

            {/* ------------------------------------------------------------ */}
            {/* DAYS                                                         */}
            {/* ------------------------------------------------------------ */}

            <div className="grid grid-cols-7 gap-y-0.5">
              {days.map((day) => {
                const inMonth = isSameMonth(day, viewDate);
                const isSel = Boolean(selected && isSameDay(day, selected));
                const isTod = isToday(day);
                const isDisabled = Boolean(minDay && day < minDay);

                const state = isSel
                  ? 'border-transparent bg-[var(--accent)] font-semibold text-white'
                  : [
                      isTod ? 'border-[var(--accent)] font-medium' : 'border-transparent',
                      inMonth ? 'text-[var(--text)]' : 'text-[var(--text-3)]',
                      'enabled:hover:bg-[var(--bg-3)]',
                    ].join(' ');

                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    data-day="true"
                    data-autofocus={isSameDay(day, focusDay) ? 'true' : undefined}
                    disabled={isDisabled}
                    aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                    aria-pressed={isSel}
                    aria-current={isTod ? 'date' : undefined}
                    className={`${dayBase} ${state}`}
                    onClick={() => pick(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            {/* ------------------------------------------------------------ */}
            {/* FOOTER                                                       */}
            {/* ------------------------------------------------------------ */}

            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5">
              <button
                type="button"
                disabled={todayDisabled}
                onClick={() => pick(startOfDay(today))}
                className={`rounded-md px-2 py-1.5 text-xs font-medium text-[var(--accent)] transition-[background-color,transform] duration-200 enabled:hover:bg-[var(--bg-3)] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
              >
                Today
              </button>

              <span className="text-xs tabular-nums text-[var(--text-3)]">
                {format(today, 'EEE, MMM d')}
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}