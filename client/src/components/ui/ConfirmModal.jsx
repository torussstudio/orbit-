import Modal from "./Modal";
import Loader from "./Loader";

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";

const buttonBase = `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium transition-[background-color,opacity,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

const cancelButton = `${buttonBase} border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--bg-3)]`;

const confirmButton = `${buttonBase} text-white hover:opacity-90`;

/* -------------------------------------------------------------------------- */
/* ICONS                                                                      */
/* -------------------------------------------------------------------------- */

function Icon({ children }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const WarningIcon = () => (
  <Icon>
    <path d="M10 3.5l7 12.5H3L10 3.5Z" />
    <path d="M10 8.5v3M10 14h.01" />
  </Icon>
);

const InfoIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 9v4.5M10 6.5h.01" />
  </Icon>
);

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function ConfirmModal({
  isOpen,
  title = "Confirm action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  loadingText = "Processing…",
  onConfirm,
  onCancel,
  isDangerous = true,
  loading = false,
}) {
  if (!isOpen) return null;

  const handleClose = () => {
    if (!loading) onCancel?.();
  };

  return (
    <Modal title={title} onClose={handleClose} size="sm">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isDangerous
                ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                : "bg-[var(--bg-3)] text-[var(--accent)]"
            }`}
          >
            {isDangerous ? <WarningIcon /> : <InfoIcon />}
          </div>

          <p className="min-w-0 break-words pt-2 text-sm leading-6 text-[var(--text-2)] [text-wrap:pretty]">
            {message}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
          {/* Cancel gets initial focus so Enter never confirms by accident */}
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            autoFocus
            className={cancelButton}
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
            className={`${confirmButton} ${
              isDangerous
                ? "bg-[var(--danger)]"
                : "bg-[var(--accent)]"
            }`}
          >
            {loading && <Loader size="sm" variant="inline" />}

            {loading ? loadingText : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}