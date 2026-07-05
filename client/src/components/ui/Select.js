import { useState, useRef, useEffect, useCallback, Children, isValidElement } from 'react';
import { createPortal } from 'react-dom';

const PANEL_WIDTH_MIN = 160;
const MARGIN = 8;
const OPTION_HEIGHT = 36;
const PANEL_PADDING = 8;
const MAX_LIST_HEIGHT = 260;

// Pulls { value, label, disabled } options out of <option> children —
// including ones produced by .map() or wrapped in fragments/conditionals —
// so migrating from a native <select> only means swapping the tag names.
function extractOptions(children) {
  const options = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
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

export default function Select({
  value,
  onChange,
  children,
  placeholder = 'Select...',
  disabled,
  style,
  arrowColor = 'var(--text-3)', 
  labelColor,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelNode, setPanelNode] = useState(null);

  const setPanelRef = useCallback((node) => {
    panelRef.current = node;
    setPanelNode(node);
  }, []);

  const options = extractOptions(children);
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
    if (spaceBelow >= panelHeight + MARGIN || spaceBelow >= spaceAbove) {
      top = Math.min(r.bottom + MARGIN, window.innerHeight - panelHeight - MARGIN);
    } else {
      top = r.top - panelHeight - MARGIN;
    }
    top = Math.max(MARGIN, top);

    let left = Math.min(r.left, window.innerWidth - panelWidth - MARGIN);
    left = Math.max(MARGIN, left);

    setCoords({ top, left, width: r.width });
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

  const pick = (opt) => {
    if (opt.disabled) return;
    onChange(String(opt.value));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="form-select select-trigger"
        disabled={disabled}
        style={style}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="select-trigger-label"
          style={{ color: labelColor || (selected ? 'var(--text)' : 'var(--text-3)') }}
        >
          {selected ? selected.label : placeholder}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke={arrowColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={setPanelRef}
            className="select-panel"
            style={{ top: coords.top, left: coords.left, minWidth: coords.width }}
          >
            <div className="select-options">
              {options.length === 0 && <div className="select-empty">No options</div>}
              {options.map((opt, i) => {
                const isSel = selected && String(selected.value) === String(opt.value);
                return (
                  <button
                    type="button"
                    key={`${opt.value}-${i}`}
                    disabled={opt.disabled}
                    className={`select-option ${isSel ? 'is-selected' : ''} ${opt.disabled ? 'is-disabled' : ''}`}
                    onClick={() => pick(opt)}
                  >
                    <span>{opt.label}</span>
                    {isSel && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
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
