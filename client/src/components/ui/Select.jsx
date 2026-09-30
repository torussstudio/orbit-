import {
  useState,
  useRef,
  useEffect,
  useCallback,
  Children,
  Fragment,
  isValidElement,
} from 'react';
import { createPortal } from 'react-dom';

const PANEL_WIDTH_MIN = 160;
const MARGIN = 8;
const OPTION_HEIGHT = 36; // keep in sync with the h-9 option class
const PANEL_PADDING = 8; // keep in sync with the p-2 panel class
const MAX_LIST_HEIGHT = 260;

// Must sit above the app's modal layer, since this panel is portalled to <body>
// and is used inside modals. Align with your modal z-index scale.
const PANEL_Z_INDEX = 1100;

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const focusRingInset =
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent)]';

const optionBase = `flex h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm text-[var(--text)] transition-colors duration-150 focus:bg-[var(--bg-3)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${focusRingInset}`;

/* -------------------------------------------------------------------------- */
/* ICONS                                                                      */
/* -------------------------------------------------------------------------- */

function Icon({ size = 16, className, style, children }) {
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
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const ChevronDownIcon = ({ style }) => (
  <Icon size={14} className="shrink-0" style={style}>
    <path d="M5.5 8l4.5 4.5L14.5 8" />
  </Icon>
);

const CheckIcon = () => (
  <Icon className="shrink-0 text-[var(--accent)]">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Icon>
);

/* -------------------------------------------------------------------------- */
/* OPTIONS                                                                    */
/* -------------------------------------------------------------------------- */

// Pulls { value, label, disabled } options out of <option> children —
// including ones produced by .map() or wrapped in fragments/conditionals —
// so migrating from a native <select> only means swapping the tag names.
function extractOptions(children) {
  const options = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      options.push(...extractOptions(child.props.children));
      return;
    }
    if (child.type === 'option') {
      options.push({
        value: child.props.value,
        label: child.props.children,
        disabled: child.props.disabled,
      });
    }
  });
  return options;
}

// Accepts either an `options` array ([{ value, label, disabled }]) or
// <option> children.
function normalizeOptions(optionsProp, children) {
  if (Array.isArray(optionsProp)) {
    return optionsProp.map((o) => ({
      value: o.value,
      label: o.label ?? String(o.value),
      disabled: o.disabled,
    }));
  }
  return extractOptions(children);
}

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function Select({
  id,
  value,
  onChange,
  options: optionsProp,
  children,
  placeholder = 'Select...',
  disabled,
  style,
  arrowColor = 'var(--text-3)',
  labelColor,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [shown, setShown] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelNode, setPanelNode] = useState(null);

  const setPanelRef = useCallback((node) => {
    panelRef.current = node;
    setPanelNode(node);
  }, []);

  const options = normalizeOptions(optionsProp, children);
  const selected = options.find((o) => String(o.value) === String(value));

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimate = Math.min(
      options.length * OPTION_HEIGHT + PANEL_PADDING * 2,
      MAX_LIST_HEIGHT + PANEL_PADDING * 2
    );
    const panelHeight = panelRef.current?.offsetHeight || estimate;
    const panelWidth = Math.max(panelRef.current?.offsetWidth || r.width, PANEL_WIDTH_MIN);

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

    let left = Math.min(r.left, window.innerWidth - panelWidth - MARGIN);
    left = Math.max(MARGIN, left);

    setCoords((prev) =>
      prev &&
      prev.top === top &&
      prev.left === left &&
      prev.width === r.width &&
      prev.placement === placement
        ? prev
        : { top, left, width: r.width, placement }
    );
  }, [options.length]);

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

  // Move focus into the list when it opens: the selected option,
  // else the first enabled one.
  useEffect(() => {
    if (!panelNode) return;
    const target =
      panelNode.querySelector('[role="option"][aria-selected="true"]:not(:disabled)') ||
      panelNode.querySelector('[role="option"]:not(:disabled)');
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest' });
  }, [panelNode]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // Capture phase + stopPropagation: Escape closes only the list, not a
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

  const pick = (opt) => {
    if (opt.disabled) return;
    onChange(String(opt.value));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e) => {
    if (open || disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const focusItem = (item) => {
    item.focus();
    item.scrollIntoView({ block: 'nearest' });
  };

  // Arrow keys, Home/End and first-letter typeahead across enabled options.
  // Enter and Space activate the focused option button natively.
  const handleListKeyDown = (e) => {
    const items = Array.from(
      panelRef.current?.querySelectorAll('[role="option"]:not(:disabled)') || []
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem(items[current < 0 ? 0 : Math.min(current + 1, items.length - 1)]);
        return;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(items[current < 0 ? items.length - 1 : Math.max(current - 1, 0)]);
        return;
      case 'Home':
        e.preventDefault();
        focusItem(items[0]);
        return;
      case 'End':
        e.preventDefault();
        focusItem(items[items.length - 1]);
        return;
      case 'Tab':
        // Close and let the browser continue tabbing from the trigger.
        setOpen(false);
        triggerRef.current?.focus();
        return;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        const char = e.key.toLowerCase();
        const start = current + 1;
        const ordered = [...items.slice(start), ...items.slice(0, start)];
        const match = ordered.find((el) => el.textContent.trim().toLowerCase().startsWith(char));
        if (match) {
          e.preventDefault();
          focusItem(match);
        }
      }
    }
  };

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="form-select select-trigger flex w-full items-center justify-between gap-2 text-left"
        disabled={disabled}
        style={style}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span
          className={`select-trigger-label min-w-0 truncate ${
            selected ? 'text-[var(--text)]' : 'text-[var(--text-3)]'
          }`}
          style={labelColor ? { color: labelColor } : undefined}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDownIcon style={{ color: arrowColor }} />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={setPanelRef}
            style={{
              top: coords.top,
              left: coords.left,
              minWidth: Math.max(coords.width, PANEL_WIDTH_MIN),
              maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
              zIndex: PANEL_Z_INDEX,
            }}
            className={`fixed rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-2 shadow-[0_16px_40px_-12px_rgba(49,46,129,0.28)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
              coords.placement === 'above' ? 'origin-bottom-left' : 'origin-top-left'
            } ${shown ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-0'}`}
          >
            <div
              role="listbox"
              aria-label={ariaLabel}
              className="overflow-y-auto"
              style={{ maxHeight: MAX_LIST_HEIGHT }}
              onKeyDown={handleListKeyDown}
            >
              {options.length === 0 && (
                <div className="px-3 py-2 text-sm text-[var(--text-3)]">No options</div>
              )}

              {options.map((opt, i) => {
                const isSel = Boolean(selected && String(selected.value) === String(opt.value));
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    tabIndex={-1}
                    key={`${opt.value}-${i}`}
                    disabled={opt.disabled}
                    className={`${optionBase} ${
                      isSel ? 'bg-[var(--bg-3)] font-medium' : 'enabled:hover:bg-[var(--bg-3)]'
                    }`}
                    onClick={() => pick(opt)}
                  >
                    <span className="min-w-0 truncate">{opt.label}</span>
                    {isSel && <CheckIcon />}
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