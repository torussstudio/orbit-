/* -------------------------------------------------------------------------- */
/* LOADER                                                                     */
/* -------------------------------------------------------------------------- */

// Spinner sizes. Page and screen loaders are meant to be seen from further
// away, so the same size names map to larger spinners there.
const SPINNER_SIZES = {
  compact: {
    sm: 'h-3.5 w-3.5',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
  },
  large: {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  },
};

// inline and button loaders inherit the surrounding text color, so they read
// correctly on filled buttons (white) and plain text (default) alike.
// page and screen loaders use the accent color.
const VARIANT_CLASSES = {
  inline: 'inline-flex items-center justify-center',
  button: 'inline-flex items-center justify-center gap-2',
  page: 'flex min-h-64 w-full flex-col items-center justify-center gap-3 text-[var(--accent)]',
  screen:
    'fixed inset-0 z-50 flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-[var(--bg)] text-[var(--accent)]',
};

function Spinner({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 animate-spin motion-reduce:[animation-duration:2s] ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" className="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Loader({ label = 'Loading', size = 'md', variant = 'inline' }) {
  const safeVariant = VARIANT_CLASSES[variant] ? variant : 'inline';
  const isLarge = safeVariant === 'page' || safeVariant === 'screen';
  const sizes = isLarge ? SPINNER_SIZES.large : SPINNER_SIZES.compact;
  const spinnerClass = sizes[size] || sizes.md;

  // Button, page and screen loaders show their label. Inline loaders sit
  // next to other content, so their label is announced to screen readers only.
  const showLabel = safeVariant !== 'inline';

  return (
    <span className={VARIANT_CLASSES[safeVariant]} role="status">
      <Spinner className={spinnerClass} />

      {showLabel ? (
        <span
          className={
            isLarge ? 'text-sm text-[var(--text-3)]' : 'text-current'
          }
        >
          {label}
        </span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* SKELETON                                                                   */
/* -------------------------------------------------------------------------- */

// Uneven line lengths read as text; identical bars read as a barcode.
const LINE_WIDTHS = ['w-full', 'w-11/12', 'w-5/6'];
const LAST_LINE_WIDTH = 'w-2/3';

export function LoadingSkeleton({ className = '', lines = 3 }) {
  const safeClassName =
    typeof className === 'string' ? className.trim() : '';

  const count = Number.isFinite(lines) ? Math.max(0, Math.floor(lines)) : 3;

  return (
    <div
      className={[
        'animate-pulse space-y-2.5 motion-reduce:animate-none',
        safeClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => {
        const isLast = count > 1 && index === count - 1;
        const width = isLast
          ? LAST_LINE_WIDTH
          : LINE_WIDTHS[index % LINE_WIDTHS.length];

        return (
          <span
            key={index}
            className={`block h-3.5 rounded-md bg-[var(--bg-3)] ${width}`}
          />
        );
      })}
    </div>
  );
}

export default Loader;