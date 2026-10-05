import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Sits below the Select and DatePicker panels (1100), which are portalled to
// <body> and must open above any modal. Keep the two in step.
const MODAL_Z_INDEX = 1000;

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/* -------------------------------------------------------------------------- */
/* SHARED STATE (stacked modals, scroll lock)                                 */
/* -------------------------------------------------------------------------- */

// Open modals, oldest first. Only the last one reacts to Escape and Tab, so
// a confirm dialog opened over a form closes alone.
const modalStack = [];

let scrollLockCount = 0;
let savedBodyStyles = null;

function lockScroll() {
  if (scrollLockCount === 0) {
    const { body, documentElement } = document;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    const currentPadding = parseFloat(getComputedStyle(body).paddingRight) || 0;

    savedBodyStyles = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };

    body.style.overflow = 'hidden';
    // Replace the scrollbar's width so the page behind doesn't shift.
    if (scrollbarWidth > 0) body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
  }
  scrollLockCount += 1;
}

function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0 && savedBodyStyles) {
    document.body.style.overflow = savedBodyStyles.overflow;
    document.body.style.paddingRight = savedBodyStyles.paddingRight;
    savedBodyStyles = null;
  }
}

function getFocusable(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0
  );
}

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function Modal({ title, onClose, children, size = 'lg' }) {
  const [titleId] = useState(() => `modal-title-${Math.random().toString(36).slice(2, 9)}`);
  const [shown, setShown] = useState(false);

  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const pointerDownOnOverlay = useRef(false);

  // Latest onClose without re-running the effects below on every render
  // (callers usually pass a new function each time).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Captured during the first render, before any child autoFocus runs.
  const previouslyFocused = useRef(
    typeof document !== 'undefined' ? document.activeElement : null
  );

  // Register in the modal stack and lock page scroll.
  useEffect(() => {
    modalStack.push(titleId);
    lockScroll();

    return () => {
      const index = modalStack.indexOf(titleId);
      if (index !== -1) modalStack.splice(index, 1);
      unlockScroll();
    };
  }, [titleId]);

  // Fade/slide in once mounted.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Initial focus: keep a child's autoFocus if it worked, otherwise the first
  // field in the body, otherwise the dialog itself. Restore focus on close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.contains(document.activeElement)) {
      const target = getFocusable(bodyRef.current)[0] || dialog;
      target.focus({ preventScroll: true });
    }

    const opener = previouslyFocused.current;
    return () => {
      if (opener && document.contains(opener) && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  // Escape closes the top modal only. Tab is kept inside it. Select and
  // DatePicker stop Escape in the capture phase, so an open list closes
  // first and never reaches this handler.
  useEffect(() => {
    const handleKey = (e) => {
      if (modalStack[modalStack.length - 1] !== titleId) return;

      if (e.key === 'Escape') {
        if (e.isComposing) return;
        onCloseRef.current?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const items = getFocusable(dialog);
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }

      const active = document.activeElement;
      // Focus is in a portalled popover (Select, DatePicker): let it manage itself.
      if (!dialog.contains(active)) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [titleId]);

  if (typeof document === 'undefined') return null;

  // Close on a backdrop click only when the press also started on the
  // backdrop, so dragging a text selection out of a field doesn't dismiss it.
  const handleOverlayMouseDown = (e) => {
    pointerDownOnOverlay.current = e.target === e.currentTarget;
  };

  const handleOverlayClick = (e) => {
    const startedOnOverlay = pointerDownOnOverlay.current;
    pointerDownOnOverlay.current = false;
    if (startedOnOverlay && e.target === e.currentTarget) onCloseRef.current?.();
  };

  return createPortal(
    <div
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
      style={{ zIndex: MODAL_Z_INDEX }}
      className={`fixed inset-0 flex items-center justify-center overflow-y-auto bg-[rgba(30,27,75,0.45)] p-4 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[calc(100dvh-2rem)] w-full ${
          SIZE_CLASSES[size] || SIZE_CLASSES.lg
        } flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-2)] shadow-[0_24px_60px_-16px_rgba(49,46,129,0.35)] outline-none transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
          shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.98] opacity-0'
        }`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
          <h2
            id={titleId}
            className="min-w-0 break-words text-base font-semibold leading-8 tracking-tight text-[var(--text)]"
          >
            {title}
          </h2>

          <button
            type="button"
            onClick={() => onCloseRef.current?.()}
            aria-label="Close dialog"
            className={`-mr-2 inline-flex h-10 w-10 shrink-0 sm:h-8 sm:w-8 items-center justify-center rounded-md text-[var(--text-3)] transition-[background-color,color,transform] duration-200 hover:bg-[var(--bg-3)] hover:text-[var(--text)] active:scale-95 ${focusRing}`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div ref={bodyRef} className="overflow-y-auto px-6 pb-6 pt-2">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}