import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { updateCachedMember } from '../api/membersCache';
import DatePicker from '../components/ui/DatePicker';
import Loader, { LoadingSkeleton } from '../components/ui/Loader';

// ── Tailwind class tokens ────────────────────────────────────
// All colours come from the app's existing CSS variables, so light/dark
// themes keep working. `color:` hints keep Tailwind from guessing the type.

// One surface per tab. Groups inside it are separated by dividers instead of
// each being its own bordered card.
const SURFACE =
  'rounded-2xl border border-[color:var(--border)] bg-[var(--bg-2)] px-5 py-6 sm:px-7';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-2)]';

const inputClass = (invalid = false) =>
  [
    'w-full rounded-lg border bg-[var(--bg-3)] px-3 py-2.5 text-[13px] text-[color:var(--text)] outline-none',
    'transition-[border-color,box-shadow] duration-200 placeholder:text-[color:var(--text-3)]',
    invalid
      ? 'border-[color:var(--danger)]'
      : 'border-[color:var(--border)] focus:border-[color:var(--accent)]',
    'focus:[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]',
  ].join(' ');

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

const BTN_NEUTRAL =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] px-3.5 py-2 text-xs font-semibold text-[color:var(--text-2)] transition duration-200 hover:border-[color:var(--text-3)] hover:text-[color:var(--text)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

const BTN_DANGER =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--danger)] px-3.5 py-2 text-xs font-semibold text-white transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

// Text-only action (Remove photo, Sign out, Discard).
const BTN_TEXT_DANGER =
  'rounded-md px-2 py-1 text-xs font-semibold text-[color:var(--danger)] transition duration-200 hover:bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-60';

// Inline "are you sure?" box used by every destructive action on the page.
const CONFIRM_BOX =
  'rounded-xl border border-[color:color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_7%,transparent)] p-3.5';

// Slate-tinted shadow, same light source as the dashboard cards.
const FLOAT_SHADOW = '[box-shadow:0_14px_32px_-14px_rgba(15,23,42,0.4)]';

// ── Icons (one stroke weight everywhere) ─────────────────────
const ICON_PATHS = {
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
  lock: (<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>),
  alert: (<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>),
  camera: (<><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></>),
  monitor: (<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>),
  mobile: (<><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>),
  bell: (<><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>),
  check: (<path d="M5 12.5l4.5 4.5L19 7.5" />),
  x: (<path d="M6 6l12 12M18 6L6 18" />),
};

function Icon({ name, className = 'h-4 w-4' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// Small eye / eye-off icon used for the password visibility toggle
function EyeIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.4 19.4 0 015.06-5.94M9.9 4.24A10.58 10.58 0 0112 4c7 0 11 8 11 8a19.5 19.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// Success / error line with a real icon (no unicode ✓ ✕).
function Msg({ type, children, className = '' }) {
  const ok = type === 'success';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={`flex items-start gap-1.5 text-xs font-medium ${
        ok ? 'text-[color:var(--success)]' : 'text-[color:var(--danger)]'
      } ${className}`}
    >
      <Icon name={ok ? 'check' : 'x'} className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// Full-size avatar preview shown in a modal overlay. Shared by the top-bar
// avatar and the details-page avatar so both "click to expand" the same way.
function AvatarLightbox({ src, name, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Profile photo"
      className="fixed inset-0 z-[3000] flex cursor-zoom-out items-center justify-center bg-black/75 p-6"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-6 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition duration-200 hover:bg-white/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <Icon name="x" className="h-4 w-4" />
      </button>
      <img
        src={src}
        alt={name || 'avatar'}
        onClick={(e) => e.stopPropagation()}
        className="h-[min(80vw,80vh,480px)] w-[min(80vw,80vh,480px)] cursor-default rounded-full object-cover shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      />
    </div>,
    document.body
  );
}

// Reusable avatar renderer — shows image if url exists, else initial letter.
// Clicking an image avatar opens it full-size in a lightbox (initials-only
// avatars aren't clickable since there's nothing to expand).
// `size` and `fontSize` are runtime props, so those two values are the only
// inline styles left in this file.
export function UserAvatar({ avatarUrl, name, size = 34, fontSize = 13 }) {
  const [expanded, setExpanded] = useState(false);

  if (avatarUrl) {
    return (
      <>
        <img
          src={avatarUrl}
          alt={name || 'avatar'}
          onClick={() => setExpanded(true)}
          title="View photo"
          style={{ width: size, height: size }}
          className="block cursor-pointer rounded-full object-cover"
        />
        {expanded && (
          <AvatarLightbox src={avatarUrl} name={name} onClose={() => setExpanded(false)} />
        )}
      </>
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize }}
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-bold text-white"
    >
      {name?.[0]?.toUpperCase()}
    </div>
  );
}

// ── Layout helpers ───────────────────────────────────────────

// Title of the open tab, above its surface.
function PanelHeader({ title, description, danger = false }) {
  return (
    <header className="mb-4">
      <h2
        className={`text-lg font-semibold leading-tight tracking-[-0.02em] ${
          danger ? 'text-[color:var(--danger)]' : 'text-[color:var(--text)]'
        }`}
      >
        {title}
      </h2>
      <p className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
        {description}
      </p>
    </header>
  );
}

// One group of settings: title + hint on the left (wide screens), controls on
// the right. Groups sit in a `divide-y` list inside SURFACE.
function Group({ title, description, children }) {
  return (
    <div className="grid gap-x-10 gap-y-4 py-6 first:pt-0 last:pb-0 xl:grid-cols-[200px_minmax(0,1fr)]">
      <div>
        <h3 className="text-[13px] font-semibold text-[color:var(--text)]">{title}</h3>
        {description && (
          <p className="mt-1 max-w-[42ch] text-xs leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const FIELDS_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2';

function Field({ label, htmlFor, className = '', children }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-[color:var(--text-2)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function Hint({ children, id, tone = 'muted' }) {
  const color =
    tone === 'success' ? 'text-[color:var(--success)]' : 'text-[color:var(--text-3)]';
  return (
    <p id={id} className={`mt-1.5 text-[11px] leading-relaxed ${color}`}>
      {children}
    </p>
  );
}

function PasswordInput({
  id, value, onChange, placeholder, autoComplete,
  visible, onToggle, invalid = false, describedBy,
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={`${inputClass(invalid)} pr-10`}
      />
      <button
        type="button"
        onClick={onToggle}
        title={visible ? 'Hide password' : 'Show password'}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded p-1 leading-none text-[color:var(--text-3)] transition-colors duration-200 hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────
// One section at a time. The open tab is kept in the URL hash
// (/account#security), so a refresh or a shared link opens the same tab.
// Every panel stays mounted and is only hidden, so switching tabs never
// loses typed text or unsaved notification settings, and nothing reloads.
// Wide screens: a vertical list on the left. Narrow screens: a row that
// scrolls sideways.
const TABS = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'security', label: 'Security', icon: 'lock' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'sessions', label: 'Active sessions', icon: 'monitor' },
  { id: 'danger', label: 'Danger zone', icon: 'alert', danger: true },
];
const TAB_IDS = TABS.map((t) => t.id);
// Links to the old section anchors still land on the right tab.
const HASH_ALIAS = { personal: 'profile', contact: 'profile' };

function tabFromHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const id = HASH_ALIAS[raw] || raw;
  return TAB_IDS.includes(id) ? id : 'profile';
}

// `dirty`: { [tabId]: true } puts a small dot on that tab (unsaved changes).
function TabNav({ active, onChange, dirty }) {
  const refs = useRef({});

  // Arrow keys (both directions, the list is vertical on wide screens and
  // horizontal on narrow ones), Home and End move between tabs.
  const onKeyDown = (e, index) => {
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    const id = TABS[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <nav aria-label="Settings sections" className="lg:sticky lg:top-6 lg:self-start">
      <div
        role="tablist"
        aria-label="Account settings"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {TABS.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <div key={tab.id} className="contents" role="presentation">
              {/* Danger zone sits apart from the everyday settings */}
              {tab.danger && (
                <div role="presentation" className="mx-3 my-2 hidden h-px bg-[var(--border)] lg:block" />
              )}
              <button
                ref={(el) => { refs.current[tab.id] = el; }}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(tab.id)}
                onKeyDown={(e) => onKeyDown(e, index)}
                className={[
                  'relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-200 lg:w-full',
                  // Wide screens: an accent bar on the left of the open tab.
                  "lg:before:absolute lg:before:inset-y-2 lg:before:left-0 lg:before:w-[3px] lg:before:rounded-full lg:before:content-['']",
                  FOCUS_RING,
                  selected
                    ? `bg-[var(--bg-3)] ${
                        tab.danger
                          ? 'text-[color:var(--danger)] lg:before:bg-[var(--danger)]'
                          : 'text-[color:var(--text)] lg:before:bg-[var(--accent)]'
                      }`
                    : tab.danger
                      ? 'text-[color:var(--danger)] opacity-75 hover:bg-[var(--bg-3)] hover:opacity-100'
                      : 'text-[color:var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[color:var(--text)]',
                ].join(' ')}
              >
                <Icon name={tab.icon} className="h-[15px] w-[15px] shrink-0" />
                <span className="lg:flex-1 lg:text-left">{tab.label}</span>
                {dirty?.[tab.id] && (
                  <>
                    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]" />
                    <span className="sr-only">(unsaved changes)</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// Wrapper for one tab's content. Hidden panels stay in the DOM.
function TabPanel({ id, active, children }) {
  const shown = id === active;
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!shown}
      className={shown ? 'block' : 'hidden'}
    >
      {children}
    </div>
  );
}

// ── Password rule ─────────────────────────────────────────────
// Must match assertPasswordLength() in the backend's utils/accountRules.js.
// The server stays the final check; this only gives the message sooner.
const PASSWORD_MIN_LENGTH = 8;

// ── Profile photo: shrink as soon as it is chosen ─────────────
// Photos are stored inside the member record and sent with member lists, so
// a full-size camera photo (often 1 MB or more) slows those pages down for
// everyone. The photo is shrunk the moment it is chosen: it is redrawn at
// most 512 px on its longest side and saved as JPEG (about 40-75 KB). The
// preview shows exactly what will be saved. Photos are shown from 32 px up to
// the 480 px full-size view, so 512 px stays sharp there, also on screens with
// display scaling. If a photo is still too big, the quality (then the size) is
// lowered step by step until it fits the budget. A photo that cannot
// be read or cannot be made small enough is never sent as it is; the member
// gets a clear message instead.
const AVATAR_MAX_SIDE = 512;
const AVATAR_FALLBACK_SIDE = 384;
const AVATAR_QUALITIES = [0.9, 0.85, 0.78, 0.7, 0.6];
// Budget for the saved photo: the whole data URL, counted in characters.
// Kept safely under the server's limit.
const AVATAR_MAX_DATA_URL_CHARS = 105000;
// Largest file we are willing to open in the browser at all.
const AVATAR_MAX_INPUT_BYTES = 20 * 1024 * 1024;

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

// Opens the file through an object URL (lighter than reading a big file into a
// string first) and always releases the URL.
const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    el.src = url;
  });

function drawJpeg(img, maxSide, quality) {
  try {
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) return null;

    const scale = Math.min(1, maxSide / longest);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // JPEG has no transparency: put the photo on white.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

// Returns a data URL that fits the budget, or throws.
async function shrinkPhoto(file) {
  let img = null;
  try {
    img = await loadImage(file);
  } catch {
    img = null;
  }

  if (img) {
    for (const side of [AVATAR_MAX_SIDE, AVATAR_FALLBACK_SIDE]) {
      for (const quality of AVATAR_QUALITIES) {
        const out = drawJpeg(img, side, quality);
        if (out && out.startsWith('data:image/jpeg') && out.length <= AVATAR_MAX_DATA_URL_CHARS) {
          return out;
        }
      }
    }
  }

  // The browser could not redraw the photo. A file that is already tiny can be
  // sent as it is (base64 adds about a third); anything bigger is refused here.
  if (file.size * 1.4 <= AVATAR_MAX_DATA_URL_CHARS) {
    const original = await readAsDataUrl(file);
    if (original.length <= AVATAR_MAX_DATA_URL_CHARS) return original;
  }
  throw new Error('photo-too-large-or-unreadable');
}

// ── Notifications ────────────────────────────────────────────
// What Orbit tells the member about, and how. Its own surface outside the
// main form, with its own Save button: saving here never sends the profile
// form and never asks for the current password. The list of types, their
// groups and labels come from the server (GET /notifications/preferences), so
// the card shows exactly the types this member can receive.

const DELIVERY_OPTIONS = [
  { value: 'both', label: 'Push + in-app' },
  { value: 'push', label: 'Push only' },
  { value: 'in_app', label: 'In-app only' },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

// The label and hint of the "skip days off" switch. Which days are off is a
// server setting (REMINDER_OFF_DAYS), sent as off_days in week order, e.g.
// ["sun"] or ["sat", "sun"].
function offDaysText(offDays) {
  const days = Array.isArray(offDays) && offDays.length > 0 ? offDays : ['sun'];
  const key = days.join(',');

  if (key === 'sun') {
    return {
      label: 'Skip Sundays',
      hint: 'Nothing on Sunday. Those reminders move to Saturday and Monday.',
    };
  }

  if (key === 'sat,sun') {
    return {
      label: 'Skip weekends',
      hint: 'Nothing on Saturday or Sunday. Those reminders move to Friday and Monday.',
    };
  }

  const list = days.map((day) => DAY_SHORT[day] || day).join(', ');
  return {
    label: `Skip days off (${list})`,
    hint: `Nothing on days off (${list}). Those reminders move to the working days before and after.`,
  };
}

// What the Save button sends, and what "anything changed?" compares.
function preferencesPayload(prefs) {
  return {
    pause_all: prefs.pause_all,
    reminder_hour: prefs.reminder_hour,
    skip_weekends: prefs.skip_weekends,
    types: prefs.types.map(({ type, enabled, delivery }) => ({ type, enabled, delivery })),
  };
}

// Whether THIS browser can get push notifications right now.
async function readPushStatus() {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return { supported: false, permission: 'default', subscribed: false };
  }

  let subscribed = false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    subscribed = Boolean(await registration?.pushManager.getSubscription());
  } catch {
    subscribed = false;
  }

  return { supported: true, permission: Notification.permission, subscribed };
}

function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked
          ? 'border-[color:var(--accent)] bg-[var(--accent)]'
          : 'border-[color:var(--border)] bg-[var(--bg-4)]'
      } ${FOCUS_RING}`}
    >
      {/* On: the knob takes the card's background colour, so it stands out
          on the accent track in both themes (white on indigo in the light
          theme, dark on the light grey accent of the dark theme). Off keeps
          the white knob. */}
      <span
        aria-hidden="true"
        className={`inline-block h-[18px] w-[18px] rounded-full shadow transition-[transform,background-color] duration-200 ${
          checked ? 'translate-x-[22px] bg-[var(--bg-2)]' : 'translate-x-[2px] bg-white'
        }`}
      />
    </button>
  );
}

// Three-way choice of how one type is delivered.
function DeliveryControl({ value, onChange, disabled = false, label }) {
  return (
    <div
      role="radiogroup"
      aria-label={`How to get: ${label}`}
      className={`grid w-full grid-cols-3 gap-0.5 rounded-lg bg-[var(--bg-3)] p-0.5 sm:w-[288px] sm:shrink-0 ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      {DELIVERY_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-1.5 py-1.5 text-center text-[11px] font-semibold leading-tight transition duration-200 disabled:cursor-not-allowed ${
              selected
                ? 'bg-[var(--bg-2)] text-[color:var(--text)] [box-shadow:0_1px_2px_rgba(15,23,42,0.12)]'
                : 'text-[color:var(--text-3)] hover:text-[color:var(--text)]'
            } ${FOCUS_RING}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Coloured dot + text, for "is push on in this browser?".
function StatusDot({ tone }) {
  const color =
    tone === 'on'
      ? 'bg-[var(--success)]'
      : tone === 'blocked'
        ? 'bg-[var(--danger)]'
        : 'bg-[var(--text-3)]';
  return <span aria-hidden="true" className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

// `onDirtyChange(bool)` tells the page whether there are unsaved changes,
// for the dot on the Notifications tab.
function NotificationsCard({ onDirtyChange }) {
  const [prefs, setPrefs] = useState(null);
  // The last saved state, to know whether there is anything to save.
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [push, setPush] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);

  const accept = (data) => {
    setPrefs(data);
    setSavedSnapshot(JSON.stringify(preferencesPayload(data)));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/notifications/preferences');
      accept(data);
    } catch (err) {
      setLoadError(err.response?.data?.error || "We couldn't load your notification settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    readPushStatus().then(setPush);
  }, [load]);

  const setGeneral = (patch) => {
    setSaveMsg(null);
    setPrefs((current) => ({ ...current, ...patch }));
  };

  const setType = (key, patch) => {
    setSaveMsg(null);
    setPrefs((current) => ({
      ...current,
      types: current.types.map((row) => (row.type === key ? { ...row, ...patch } : row)),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const { data } = await api.put('/notifications/preferences', preferencesPayload(prefs));
      accept(data);
      setSaveMsg({ type: 'success', text: 'Notification settings saved.' });
      setTimeout(() => setSaveMsg(null), 4000);
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.response?.data?.error || "We couldn't save your notification settings." });
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async () => {
    setPushBusy(true);
    try {
      // Asked right here, inside the click: browsers only show the permission
      // prompt as a direct answer to something the member did.
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      // The rest (service worker, subscribe, save) is the app's one subscribe
      // flow, which lives in the notification bell.
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 15000);
        window.dispatchEvent(
          new CustomEvent('orbit:enable-push', {
            detail: { done: () => { clearTimeout(timer); resolve(); } },
          }),
        );
      });
    } catch {
      // The status line below shows what the browser ended up with.
    } finally {
      setPush(await readPushStatus());
      setPushBusy(false);
    }
  };

  const paused = Boolean(prefs?.pause_all);
  const dirty = prefs ? JSON.stringify(preferencesPayload(prefs)) !== savedSnapshot : false;
  const pushReady = Boolean(push?.supported && push.permission === 'granted' && push.subscribed);
  const hasPushOnly = Boolean(prefs?.types.some((row) => row.enabled && row.delivery === 'push'));
  const offDays = offDaysText(prefs?.off_days);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  let pushText = 'Checking…';
  let pushTone = 'off';
  if (push) {
    if (!push.supported) pushText = 'This browser does not support push notifications.';
    else if (push.permission === 'denied') {
      pushText = "Blocked in this browser's settings. Allow notifications for Orbit there to turn push on.";
      pushTone = 'blocked';
    } else if (pushReady) {
      pushText = 'On. This browser gets push notifications.';
      pushTone = 'on';
    } else pushText = 'Not enabled in this browser.';
  }

  if (loading) {
    return (
      <div className={SURFACE} aria-label="Loading notification settings">
        <LoadingSkeleton lines={5} />
      </div>
    );
  }

  if (loadError || !prefs) {
    return (
      <div className={`${SURFACE} flex flex-col items-start gap-3`}>
        <Msg type="error">{loadError || "We couldn't load your notification settings."}</Msg>
        <button type="button" onClick={load} className={`${BTN_NEUTRAL} ${FOCUS_RING}`}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={SURFACE}>
      <div className="divide-y divide-[color:var(--border)]">

        {/* Pause all */}
        <div className="flex items-center justify-between gap-4 pb-5">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[color:var(--text)]">Pause all notifications</div>
            <p className="mt-0.5 text-xs text-[color:var(--text-3)]">Security alerts are always sent.</p>
          </div>
          <Toggle
            checked={paused}
            onChange={(value) => setGeneral({ pause_all: value })}
            label="Pause all notifications"
          />
        </div>

        {/* Types, grouped as the server sends them */}
        {prefs.groups.map((group) => {
          const rows = prefs.types.filter((row) => row.group === group.id);
          if (rows.length === 0) return null;
          // Paused: everything is dimmed and locked except the security
          // alerts, which are still sent.
          const locked = paused && group.id !== 'security';

          return (
            <div
              key={group.id}
              className={`py-5 transition-opacity duration-200 ${locked ? 'opacity-50' : ''}`}
            >
              <h3 className="text-[13px] font-semibold text-[color:var(--text)]">{group.label}</h3>
              {group.id === 'messages' && (
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-3)]">
                  Choose chat alerts for your account. Push sends a browser notification;
                  in-app means your Messages inbox, never the project notification bell.
                  Messages and unread badges remain available even when alerts are off.
                </p>
              )}
              <ul className="mt-1 divide-y divide-[color:var(--border)]">
                {rows.map((row) => (
                  <li key={row.type} className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:gap-5">
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span className="break-words text-[13px] text-[color:var(--text-2)]">{row.label}</span>
                      {row.can_disable ? (
                        <Toggle
                          checked={row.enabled}
                          onChange={(value) => setType(row.type, { enabled: value })}
                          disabled={locked}
                          label={row.label}
                        />
                      ) : (
                        <span className="shrink-0 rounded-md bg-[var(--bg-3)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--text-3)]">
                          Always on
                        </span>
                      )}
                    </div>
                    <DeliveryControl
                      value={row.delivery}
                      onChange={(value) => setType(row.type, { delivery: value })}
                      disabled={locked || !row.enabled}
                      label={row.label}
                    />
                  </li>
                ))}
              </ul>

              {group.id === 'reminders' && (
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl bg-[var(--bg-3)] p-4 sm:grid-cols-2">
                  <Field label="Reminder time (IST)" htmlFor="notifications-reminder-hour">
                    <select
                      id="notifications-reminder-hour"
                      className={`${inputClass()} bg-[var(--bg-2)]`}
                      disabled={locked}
                      value={prefs.reminder_hour === null ? '' : String(prefs.reminder_hour)}
                      onChange={(e) => setGeneral({ reminder_hour: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">Default ({prefs.default_reminder_hour}:00)</option>
                      {HOURS.map((hour) => (
                        <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-center justify-between gap-3 sm:items-end">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[color:var(--text)]">{offDays.label}</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[color:var(--text-3)]">{offDays.hint}</p>
                    </div>
                    <Toggle
                      checked={prefs.skip_weekends}
                      onChange={(value) => setGeneral({ skip_weekends: value })}
                      disabled={locked}
                      label={offDays.label}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* This browser's push status */}
        <div className="py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              <StatusDot tone={pushTone} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[color:var(--text)]">Push on this device</div>
                <p className="mt-0.5 text-xs text-[color:var(--text-3)]">{pushText}</p>
              </div>
            </div>
            {push?.supported && push.permission !== 'denied' && !pushReady && (
              <button
                type="button"
                onClick={enablePush}
                disabled={pushBusy}
                className={`${BTN_NEUTRAL} shrink-0 self-start sm:self-center ${FOCUS_RING}`}
              >
                {pushBusy ? <Loader label="Enabling..." size="sm" variant="button" /> : 'Enable push on this device'}
              </button>
            )}
          </div>
          {hasPushOnly && push && !pushReady && (
            <p className="mt-3 rounded-lg bg-[color:color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-xs font-medium text-[color:var(--warning)]">
              Some types are set to Push only, but push is not enabled in this browser, so they will not reach you here.
            </p>
          )}
        </div>

        {/* Save row */}
        <div className="flex flex-wrap items-center gap-3 pt-5">
          {saveMsg ? (
            <Msg type={saveMsg.type}>{saveMsg.text}</Msg>
          ) : dirty ? (
            <span className="text-xs text-[color:var(--text-3)]">Unsaved changes</span>
          ) : (
            <span className="text-xs text-[color:var(--text-3)]">All changes saved</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`${BTN_PRIMARY} ml-auto ${FOCUS_RING}`}
          >
            {saving ? <Loader label="Saving..." size="sm" variant="button" /> : 'Save notification settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Active sessions ──────────────────────────────────────────
// Where the member is signed in. The server groups browser tabs of the same
// device (same browser + IP) into one entry. Its own surface outside the
// main form, with its own messages: nothing here is part of "Save changes".
// `reloadKey` changes when the list should be fetched again from outside
// (after a password change, which signs the other devices out).

// "5 minutes ago". Empty when the server sent no usable time.
function lastActiveText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `Last active ${formatDistanceToNow(date, { addSuffix: true })}`;
}

// Stands for "all other devices" in the `confirming` / `busy` state below
// (the listed entries use their own key).
const OTHERS = 'others';

// A browser has ONE push subscription, shared by all its tabs, and the server
// links it to the tab that saved it last. If that was a tab that has just
// been signed out, the server removed the subscription with that session and
// this browser would stop getting notifications until its next page load.
// Saving it again from this tab links it to this session. Best effort: it
// never changes the outcome of the sign-out.
async function keepPushForThisTab() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await api.post('/notifications/push-subscribe', subscription.toJSON());
  } catch {
    // The bell saves the subscription again on the next page load.
  }
}

function SessionsCard({ reloadKey }) {
  const [sessions, setSessions] = useState([]);
  const [idleDays, setIdleDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Which inline confirm is open: an entry's key, OTHERS, or null.
  const [confirming, setConfirming] = useState(null);
  // Which action is running: an entry's key, OTHERS, or null.
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  // `silent` (after an action): keep the list on screen while it reloads.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const { data } = await api.get('/auth/sessions');
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      if (Number.isInteger(data?.idleDays)) setIdleDays(data.idleDays);
      setLoadError('');
    } catch (err) {
      if (!silent) {
        setLoadError(err.response?.data?.error || "We couldn't load your sessions.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const showMsg = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  // One listed entry: all its tabs. A single tab uses the one-session
  // endpoint, several tabs the group endpoint.
  const signOutEntry = async (entry, key) => {
    setBusy(key);
    setMsg(null);
    try {
      if (entry.sessionIds.length === 1) {
        await api.delete(`/auth/sessions/${entry.sessionIds[0]}`);
      } else {
        await api.post('/auth/sessions/revoke-group', { sessionIds: entry.sessionIds });
      }
      showMsg('success', `Signed out of ${entry.deviceLabel}.`);
    } catch (err) {
      // Already gone (it logged out, or was signed out a moment ago).
      if (err.response?.status === 404) {
        showMsg('success', `${entry.deviceLabel} was already signed out.`);
      } else {
        showMsg('error', err.response?.data?.error || "We couldn't sign that device out. Please try again.");
      }
    } finally {
      setBusy(null);
      setConfirming(null);
      load({ silent: true });
    }
  };

  // The current entry only: the other tabs of this browser. The whole group
  // is sent; the server skips the session that makes the request, so this tab
  // stays signed in.
  const signOutOtherTabs = async (entry, key) => {
    setBusy(key);
    setMsg(null);
    try {
      const { data } = await api.post('/auth/sessions/revoke-group', { sessionIds: entry.sessionIds });
      const count = Array.isArray(data?.revoked) ? data.revoked.length : 0;
      await keepPushForThisTab();
      showMsg(
        'success',
        count > 0
          ? `Signed out ${count} other tab${count === 1 ? '' : 's'}.`
          : 'The other tabs were already signed out.',
      );
    } catch (err) {
      showMsg('error', err.response?.data?.error || "We couldn't sign the other tabs out. Please try again.");
    } finally {
      setBusy(null);
      setConfirming(null);
      load({ silent: true });
    }
  };

  const signOutOthers = async () => {
    setBusy(OTHERS);
    setMsg(null);
    try {
      await api.post('/auth/logout-others');
      // "Other devices" includes other tabs of this browser.
      await keepPushForThisTab();
      showMsg('success', 'All other devices were signed out.');
    } catch (err) {
      showMsg('error', err.response?.data?.error || "We couldn't sign the other devices out. Please try again.");
    } finally {
      setBusy(null);
      setConfirming(null);
      load({ silent: true });
    }
  };

  if (loading) {
    return (
      <div className={SURFACE} aria-label="Loading sessions">
        <LoadingSkeleton lines={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`${SURFACE} flex flex-col items-start gap-3`}>
        <Msg type="error">{loadError}</Msg>
        <button type="button" onClick={() => load()} className={`${BTN_NEUTRAL} ${FOCUS_RING}`}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={SURFACE}>
      {sessions.length === 0 ? (
        <p className="text-[13px] text-[color:var(--text-3)]">No active sessions to show.</p>
      ) : (
        <ul className="-mt-3 divide-y divide-[color:var(--border)]">
          {sessions.map((entry) => {
            const key = entry.sessionIds[0];
            // Tabs of this browser other than the one being used.
            const otherTabs = entry.current ? entry.tabCount - 1 : 0;
            const details = [
              entry.ip,
              lastActiveText(entry.lastActiveAt),
              entry.tabCount > 1 ? `${entry.tabCount} tabs` : '',
            ].filter(Boolean).join(' · ');

            return (
              <li key={key} className="py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        entry.current
                          ? 'bg-[color:color-mix(in_srgb,var(--success)_14%,transparent)] text-[color:var(--success)]'
                          : 'bg-[var(--bg-3)] text-[color:var(--text-3)]'
                      }`}
                    >
                      <Icon name={entry.deviceType === 'mobile' ? 'mobile' : 'monitor'} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="break-words text-[13px] font-semibold text-[color:var(--text)]">
                          {entry.deviceLabel}
                        </span>
                        {entry.current && (
                          <span className="rounded-md bg-[color:color-mix(in_srgb,var(--success)_14%,transparent)] px-1.5 py-0.5 text-[11px] font-semibold text-[color:var(--success)]">
                            This device
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 break-words text-xs tabular-nums text-[color:var(--text-3)]">{details}</p>
                    </div>
                  </div>

                  {!entry.current && confirming !== key && (
                    <button
                      type="button"
                      onClick={() => { setConfirming(key); setMsg(null); }}
                      disabled={busy !== null}
                      className={`${BTN_TEXT_DANGER} shrink-0 self-start sm:self-center ${FOCUS_RING}`}
                    >
                      Sign out
                    </button>
                  )}

                  {/* This device: only its other tabs can be signed out here */}
                  {otherTabs > 0 && confirming !== key && (
                    <button
                      type="button"
                      onClick={() => { setConfirming(key); setMsg(null); }}
                      disabled={busy !== null}
                      className={`${BTN_TEXT_DANGER} shrink-0 self-start sm:self-center ${FOCUS_RING}`}
                    >
                      Sign out other tabs ({otherTabs})
                    </button>
                  )}
                </div>

                {/* Inline confirm step, like Remove photo */}
                {confirming === key && (
                  <div className={`mt-3 ${CONFIRM_BOX}`}>
                    <p className="mb-3 text-xs font-medium text-[color:var(--text)]">
                      {entry.current
                        ? `Sign out ${otherTabs} other tab${otherTabs === 1 ? '' : 's'} in this browser? This tab stays signed in.`
                        : `Sign out of ${entry.deviceLabel}? It will have to sign in again.`}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => (entry.current ? signOutOtherTabs(entry, key) : signOutEntry(entry, key))}
                        disabled={busy !== null}
                        className={`${BTN_DANGER} ${FOCUS_RING}`}
                      >
                        {busy === key ? <Loader label="Signing out..." size="sm" variant="button" /> : 'Yes, sign out'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={busy !== null}
                        className={`${BTN_NEUTRAL} ${FOCUS_RING}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Everything except this tab, listed above or not */}
      <div className="mt-2 border-t border-[color:var(--border)] pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[52ch] text-xs leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">
            Sessions not used for {idleDays} day{idleDays === 1 ? '' : 's'} are not listed. Signing out all other devices ends those too.
          </p>
          {confirming !== OTHERS && (
            <button
              type="button"
              onClick={() => { setConfirming(OTHERS); setMsg(null); }}
              disabled={busy !== null}
              className={`${BTN_NEUTRAL} shrink-0 self-start sm:self-center ${FOCUS_RING}`}
            >
              Sign out all other devices
            </button>
          )}
        </div>

        {confirming === OTHERS && (
          <div className={`mt-3 ${CONFIRM_BOX}`}>
            <p className="mb-3 text-xs font-medium text-[color:var(--text)]">
              Sign out everywhere except here? Every other device and browser tab will have to sign in again.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={signOutOthers}
                disabled={busy !== null}
                className={`${BTN_DANGER} ${FOCUS_RING}`}
              >
                {busy === OTHERS ? <Loader label="Signing out..." size="sm" variant="button" /> : 'Yes, sign out'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={busy !== null}
                className={`${BTN_NEUTRAL} ${FOCUS_RING}`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {msg && <Msg type={msg.type} className="mt-3">{msg.text}</Msg>}
      </div>
    </div>
  );
}

// The form's starting values, from the saved profile.
const formFromUser = (u) => ({
  name: u?.name || '',
  email: u?.email || '',
  phone: u?.phone || '',
  role: u?.role || '',
  location: u?.location || '',
  bio: u?.bio || '',
  dob: u?.birthday || '',
});

export default function AccountSettings() {
  const { user, logout, updateUser } = useAuth();

  // ── Tabs (kept in the URL hash) ────────────────────────────
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabFromHash(location.hash);
  const setTab = useCallback(
    (id) => navigate({ hash: `#${id}` }, { replace: true }),
    [navigate],
  );
  // Opens a tab and puts the cursor in one of its fields (used when a problem
  // is found in a field that sits on another tab).
  const focusField = useCallback(
    (tabId, fieldId) => {
      setTab(tabId);
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
    },
    [setTab],
  );
  const [notificationsDirty, setNotificationsDirty] = useState(false);

  // ── Avatar ─────────────────────────────────────────────────
  const [avatarPreview, setAvatarPreview] = useState(null);
  // The shrunk photo (data URL) waiting for Save. Same image as the preview.
  const [avatarData, setAvatarData] = useState(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const fileInputRef = useRef(null);

  // ── Form ───────────────────────────────────────────────────
  const [form, setForm] = useState(() => formFromUser(null));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  // ── UI ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [removePhotoConfirm, setRemovePhotoConfirm] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);
  // Bumped after a password change so the Active sessions card reloads.
  const [sessionsReloadKey, setSessionsReloadKey] = useState(0);

  // Filled from the saved profile. Keyed on the profile fields rather than the
  // user object, so removing the photo does not undo edits not saved yet.
  useEffect(() => {
    if (user) setForm(formFromUser(user));
  }, [user?.id, user?.name, user?.email, user?.phone, user?.role, user?.location, user?.bio, user?.birthday]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.avatar_url) setAvatarPreview(user.avatar_url);
  }, [user?.avatar_url]);

  const showPhotoError = (text) => {
    setPhotoMsg({ type: 'error', text });
    setTimeout(() => setPhotoMsg(null), 5000);
  };

  // The photo is checked and shrunk right here, so the preview is the exact
  // image that will be saved and a bad photo is reported before Save.
  const handleAvatarChange = async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    // Allow choosing the same file again later.
    input.value = '';
    if (!file) return;

    setPhotoMsg(null);

    if (!file.type || !file.type.startsWith('image/')) {
      showPhotoError('Please choose an image file (JPG, PNG or GIF).');
      return;
    }
    if (file.size > AVATAR_MAX_INPUT_BYTES) {
      showPhotoError('That photo is too large. Please choose one under 20 MB.');
      return;
    }

    setProcessingPhoto(true);
    try {
      const shrunk = await shrinkPhoto(file);
      setAvatarData(shrunk);
      setAvatarPreview(shrunk);
    } catch {
      setAvatarData(null);
      showPhotoError("We couldn't prepare this photo. Please try a different JPG or PNG.");
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // Changing the password or the email needs the current password.
  const emailChanged =
    form.email.trim().toLowerCase() !== (user?.email || '').trim().toLowerCase();
  const needsCurrentPassword = Boolean(newPassword) || emailChanged;

  // Unsaved changes per tab (a dot on the tab, and the save bar).
  const profileDirty =
    Boolean(user) &&
    (form.name !== (user.name || '') ||
      form.email !== (user.email || '') ||
      form.phone !== (user.phone || '') ||
      form.location !== (user.location || '') ||
      form.bio !== (user.bio || '') ||
      form.dob !== (user.birthday || '') ||
      Boolean(avatarData));
  const securityDirty = Boolean(newPassword || confirmPassword || currentPassword);
  const formDirty = profileDirty || securityDirty;

  // Live checks while typing.
  const lengthOk = newPassword.length >= PASSWORD_MIN_LENGTH;
  const liveMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const liveMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const confirmMessage = confirmPasswordError || (liveMismatch ? 'Passwords do not match.' : '');

  // Back to the saved profile: fields, passwords and a photo not saved yet.
  const discardChanges = () => {
    setForm(formFromUser(user));
    setNewPassword('');
    setConfirmPassword('');
    setCurrentPassword('');
    setCurrentPasswordError('');
    setNewPasswordError('');
    setConfirmPasswordError('');
    setAvatarData(null);
    setAvatarPreview(user?.avatar_url || null);
    setSaveMsg(null);
  };

  // handleSave now also serves as the form's onSubmit handler
  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    // Check everything first, so all problems show at once.
    let currentErr = '';
    let newErr = '';
    let confirmErr = '';
    if (needsCurrentPassword && !currentPassword) {
      currentErr = emailChanged && !newPassword
        ? 'Enter your current password to change your email.'
        : 'Enter your current password to continue.';
    }
    if (newPassword) {
      if (newPassword.length < PASSWORD_MIN_LENGTH) {
        newErr = `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
      } else if (currentPassword && newPassword === currentPassword) {
        newErr = 'New password must be different from your current password.';
      }
      if (!confirmPassword) confirmErr = 'Confirm your new password.';
      else if (newPassword !== confirmPassword) confirmErr = 'Passwords do not match.';
    } else if (confirmPassword) {
      newErr = 'Enter the new password first.';
    }
    if (currentErr || newErr || confirmErr) {
      setCurrentPasswordError(currentErr);
      setNewPasswordError(newErr);
      setConfirmPasswordError(confirmErr);
      const firstId = currentErr
        ? 'account-current-password'
        : newErr ? 'account-new-password' : 'account-confirm-password';
      // All three fields are on the Security tab.
      focusField('security', firstId);
      return;
    }
    setNewPasswordError('');
    setConfirmPasswordError('');
    const passwordChanged = Boolean(newPassword);
    setSaving(true);
    setSaveMsg(null);
    setCurrentPasswordError('');
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        location: form.location,
        bio: form.bio,
      };
      // The date of birth is sent only when it was picked again: the value
      // the form opened with is the API's UTC string, and sent back it would
      // be stored as the day before.
      if (form.dob !== (user?.birthday || '')) payload.birthday = form.dob || null;
      if (newPassword) payload.password = newPassword;
      if (needsCurrentPassword) payload.current_password = currentPassword;

      // A new photo was already shrunk when it was chosen (see shrinkPhoto)
      if (avatarData) {
        payload.avatar_base64 = avatarData;
      }

      const res = await api.put('/auth/profile', payload);

      // Update user in AuthContext so header avatar & name refresh immediately
      if (updateUser) {
        updateUser({
          ...user,
          ...res.data.user,
          avatar_url: payload.avatar_base64 || res.data.user?.avatar_url || user?.avatar_url,
        });
      }
      // Keep the in-memory members list in step, like removing a photo does.
      if (payload.avatar_base64) {
        updateCachedMember(user?.id, { avatar_url: res.data.user?.avatar_url || payload.avatar_base64 });
      }

      setSaveMsg({ type: 'success', text: 'Changes saved.' });
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      setAvatarData(null);

      // Changing the password signs out every other device on the server and
      // keeps this one signed in, so there is no sign-out here. The sessions
      // card is loaded again, because the other devices are gone from it.
      if (passwordChanged) {
        setSaveMsg({ type: 'success', text: 'Password changed. Other devices were signed out.' });
        // Other tabs of this browser were signed out too (see the helper).
        keepPushForThisTab();
        setSessionsReloadKey((n) => n + 1);
      }
    } catch (err) {
      const message = err.response?.data?.error || "We couldn't save your changes.";
      // Current-password problems are shown under that field (Security tab).
      if (err.response?.status === 400 && /current password/i.test(message)) {
        setCurrentPasswordError(message);
        focusField('security', 'account-current-password');
      } else {
        setSaveMsg({ type: 'error', text: message });
      }
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  // Removes the saved photo straight away (the rest of the form is not saved).
  const handleRemovePhoto = async () => {
    setRemovingPhoto(true);
    setPhotoMsg(null);
    try {
      await api.put('/auth/profile', { remove_avatar: true });
      // The top bar and this page show the initials at once; the member list
      // a page starts from no longer has the old photo either.
      if (updateUser) updateUser({ avatar_url: null });
      updateCachedMember(user?.id, { avatar_url: null });
      setAvatarPreview(null);
      setAvatarData(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setRemovePhotoConfirm(false);
      setPhotoMsg({ type: 'success', text: 'Profile photo removed.' });
    } catch (err) {
      setPhotoMsg({ type: 'error', text: err.response?.data?.error || "We couldn't remove your photo. Please try again." });
    } finally {
      setRemovingPhoto(false);
      setTimeout(() => setPhotoMsg(null), 4000);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete('/auth/account');
      await logout();
    } catch (err) {
      setDeleteError(err.response?.data?.error || "We couldn't delete your account. Please try again.");
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // "Save changes" covers Profile and Security. The bar shows on those two
  // tabs only when there is something to save (or a result to report).
  const showSaveBar = (tab === 'profile' || tab === 'security') && (formDirty || Boolean(saveMsg));
  // Saving from one tab also saves edits made on the other one; say so.
  const otherTabDirty = tab === 'profile' ? securityDirty : tab === 'security' ? profileDirty : false;

  const displayName = form.name || user?.name || '';
  const initial = displayName.trim()[0]?.toUpperCase() || '?';

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-8 sm:py-10">
      {/* Page header */}
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-[color:var(--text)] [text-wrap:balance] sm:text-[28px]">
          Account settings
        </h1>
        <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--text-3)]">
          Your profile, sign-in and notifications.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-10">
        <TabNav
          active={tab}
          onChange={setTab}
          dirty={{ profile: profileDirty, security: securityDirty, notifications: notificationsDirty }}
        />

        <main className="min-w-0">

          {/* One <form> around the Profile and Security tabs, so the password
              fields sit inside a form (browser password managers need that)
              and one Save button covers both. Both panels stay mounted, so
              edits on one tab are kept while the other is open. */}
          <form onSubmit={handleSave} noValidate>
            {/* Hidden username field helps password managers associate the
                credentials with the right account (accessibility best practice) */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={form.email}
              readOnly
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
            />

            {/* ── Profile tab ── */}
            <TabPanel id="profile" active={tab}>
              <PanelHeader
                title="Profile"
                description="How you appear to your team, and where we reach you."
              />
              <div className={`${SURFACE} divide-y divide-[color:var(--border)]`}>

                {/* Photo */}
                <Group title="Photo" description="Shown on your tasks, comments and the team list.">
                  <div className="flex flex-wrap items-center gap-4">
                    {avatarPreview ? (
                      <button
                        type="button"
                        onClick={() => setAvatarExpanded(true)}
                        aria-label="View profile photo"
                        className={`group relative h-[72px] w-[72px] shrink-0 cursor-zoom-in overflow-hidden rounded-full bg-[var(--bg-3)] ${FOCUS_RING}`}
                      >
                        <img src={avatarPreview} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      </button>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-2xl font-semibold text-white"
                      >
                        {initial}
                      </span>
                    )}

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={processingPhoto}
                          className={`${BTN_NEUTRAL} ${FOCUS_RING}`}
                        >
                          <Icon name="camera" className="h-3.5 w-3.5" />
                          {processingPhoto ? 'Preparing…' : avatarPreview ? 'Change photo' : 'Upload photo'}
                        </button>
                        {user?.avatar_url && !removePhotoConfirm && !avatarData && (
                          <button
                            type="button"
                            onClick={() => { setRemovePhotoConfirm(true); setPhotoMsg(null); }}
                            className={`${BTN_TEXT_DANGER} ${FOCUS_RING}`}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <Hint tone={avatarData ? 'success' : 'muted'}>
                        {avatarData
                          ? 'New photo ready. Save changes to keep it.'
                          : 'JPG, PNG or GIF. Resized automatically.'}
                      </Hint>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </div>
                  </div>

                  {/* Remove photo: inline confirm step */}
                  {removePhotoConfirm && (
                    <div className={`mt-4 ${CONFIRM_BOX}`}>
                      <p className="mb-3 text-xs font-medium text-[color:var(--text)]">
                        Remove your profile photo? Your initials will show instead.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          disabled={removingPhoto}
                          className={`${BTN_DANGER} ${FOCUS_RING}`}
                        >
                          {removingPhoto ? <Loader label="Removing..." size="sm" variant="button" /> : 'Yes, remove'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemovePhotoConfirm(false)}
                          disabled={removingPhoto}
                          className={`${BTN_NEUTRAL} ${FOCUS_RING}`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {photoMsg && <Msg type={photoMsg.type} className="mt-3">{photoMsg.text}</Msg>}
                </Group>

                {/* Personal */}
                <Group title="Personal details" description="Your name and role are visible to everyone in the workspace.">
                  <div className={FIELDS_GRID}>
                    <Field label="Full name" htmlFor="account-name">
                      <input id="account-name" className={inputClass()} value={form.name}
                        onChange={handleChange('name')} placeholder="Your full name" autoComplete="name" />
                    </Field>
                    <Field label="Role">
                      <div className="relative">
                        <input
                          className={`${inputClass()} cursor-not-allowed bg-[var(--bg-4)] pr-9 capitalize text-[color:var(--text-3)]`}
                          value={form.role} readOnly aria-readonly="true"
                          title="Role can only be changed by a manager"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]">
                          <Icon name="lock" className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <Hint>Only a manager can change roles.</Hint>
                    </Field>
                    <Field label="Date of birth">
                      <DatePicker value={form.dob} onChange={val => setForm(prev => ({ ...prev, dob: val }))} placeholder="dd-mm-yyyy" />
                    </Field>
                    <Field label="Location" htmlFor="account-location">
                      <input id="account-location" className={inputClass()} value={form.location}
                        onChange={handleChange('location')} placeholder="City, Country" />
                    </Field>
                    <Field label="Bio" htmlFor="account-bio" className="sm:col-span-2">
                      <textarea id="account-bio" className={`${inputClass()} min-h-[96px] resize-y leading-relaxed`}
                        value={form.bio} onChange={handleChange('bio')}
                        placeholder="A line or two about what you work on." />
                    </Field>
                  </div>
                </Group>

                {/* Contact */}
                <Group title="Contact" description="Changing your email asks for your current password.">
                  <div className={FIELDS_GRID}>
                    <Field label="Email" htmlFor="account-email">
                      <input id="account-email" className={inputClass()} value={form.email} type="email"
                        autoComplete="email" onChange={handleChange('email')} placeholder="your@email.com" />
                      {/* The current password field is on the Security tab. */}
                      {emailChanged && (
                        currentPassword ? (
                          <Hint tone="success">Current password entered in Security.</Hint>
                        ) : (
                          <Hint>
                            Needs your current password.{' '}
                            <button
                              type="button"
                              onClick={() => focusField('security', 'account-current-password')}
                              className={`rounded font-semibold text-[color:var(--accent)] hover:underline ${FOCUS_RING}`}
                            >
                              Enter it in Security
                            </button>
                          </Hint>
                        )
                      )}
                    </Field>
                    <Field label="Phone" htmlFor="account-phone">
                      <input id="account-phone" className={`${inputClass()} tabular-nums`} value={form.phone}
                        onChange={handleChange('phone')} placeholder="+91 00000 00000" autoComplete="tel" />
                    </Field>
                  </div>
                </Group>
              </div>
            </TabPanel>

            {/* ── Security tab ── */}
            <TabPanel id="security" active={tab}>
              <PanelHeader
                title="Security"
                description="Your password. Leave the new password empty to keep the one you have."
              />
              <div className={`${SURFACE} divide-y divide-[color:var(--border)]`}>
                <Group
                  title="Current password"
                  description="Needed to set a new password or change your email."
                >
                  <div className="sm:max-w-[calc(50%_-_0.5rem)]">
                    <Field label="Current password" htmlFor="account-current-password">
                      <PasswordInput
                        id="account-current-password"
                        value={currentPassword}
                        onChange={e => { setCurrentPassword(e.target.value); setCurrentPasswordError(''); }}
                        placeholder="Enter your current password"
                        autoComplete="current-password"
                        visible={showCurrentPassword}
                        onToggle={() => setShowCurrentPassword(v => !v)}
                        invalid={Boolean(currentPasswordError)}
                        describedBy={currentPasswordError ? 'account-current-password-error' : undefined}
                      />
                      {currentPasswordError && (
                        <Msg type="error" className="mt-1.5">
                          <span id="account-current-password-error">{currentPasswordError}</span>
                        </Msg>
                      )}
                    </Field>
                  </div>
                </Group>

                <Group
                  title="New password"
                  description="Changing it signs out your other devices. This one stays signed in."
                >
                  <div className={FIELDS_GRID}>
                    <Field label="New password" htmlFor="account-new-password">
                      <PasswordInput
                        id="account-new-password"
                        value={newPassword}
                        onChange={e => { setNewPassword(e.target.value); setNewPasswordError(''); }}
                        placeholder="Leave blank to keep current"
                        autoComplete="new-password"
                        visible={showNewPassword}
                        onToggle={() => setShowNewPassword(v => !v)}
                        invalid={Boolean(newPasswordError)}
                        describedBy={newPasswordError ? 'account-new-password-error' : 'account-new-password-rule'}
                      />
                      {newPasswordError ? (
                        <Msg type="error" className="mt-1.5">
                          <span id="account-new-password-error">{newPasswordError}</span>
                        </Msg>
                      ) : (
                        // The rule turns green once it is met.
                        <p
                          id="account-new-password-rule"
                          className={`mt-1.5 flex items-center gap-1.5 text-[11px] transition-colors duration-200 ${
                            newPassword && lengthOk ? 'text-[color:var(--success)]' : 'text-[color:var(--text-3)]'
                          }`}
                        >
                          <Icon name="check" className="h-3 w-3 shrink-0" />
                          At least {PASSWORD_MIN_LENGTH} characters
                        </p>
                      )}
                    </Field>
                    <Field label="Confirm new password" htmlFor="account-confirm-password">
                      <PasswordInput
                        id="account-confirm-password"
                        value={confirmPassword}
                        onChange={e => { setConfirmPassword(e.target.value); setConfirmPasswordError(''); }}
                        placeholder="Type it again"
                        autoComplete="new-password"
                        visible={showConfirmPassword}
                        onToggle={() => setShowConfirmPassword(v => !v)}
                        invalid={Boolean(confirmMessage)}
                        describedBy={confirmMessage ? 'account-confirm-password-error' : undefined}
                      />
                      {confirmMessage && (
                        <Msg type="error" className="mt-1.5">
                          <span id="account-confirm-password-error">{confirmMessage}</span>
                        </Msg>
                      )}
                      {!confirmMessage && liveMatch && (
                        <Msg type="success" className="mt-1.5">Passwords match</Msg>
                      )}
                    </Field>
                  </div>
                </Group>
              </div>
            </TabPanel>

            {/* Save bar: Profile and Security, only with something to save */}
            {showSaveBar && (
              <div
                className={`sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[var(--bg-2)] px-4 py-3 ${FLOAT_SHADOW}`}
              >
                {saveMsg ? (
                  <Msg type={saveMsg.type}>{saveMsg.text}</Msg>
                ) : (
                  <span className="flex items-center gap-2 text-xs text-[color:var(--text-2)]">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
                    {otherTabDirty
                      ? `Unsaved changes, including on the ${tab === 'profile' ? 'Security' : 'Profile'} tab`
                      : 'Unsaved changes'}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {formDirty && (
                    <button
                      type="button"
                      onClick={discardChanges}
                      disabled={saving}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
                    >
                      Discard
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving || processingPhoto || !formDirty}
                    className={`${BTN_PRIMARY} ${FOCUS_RING}`}
                  >
                    {saving ? <Loader label="Saving..." size="sm" variant="button" /> : 'Save changes'}
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* ── Notifications tab ── outside the form: it has its own Save button */}
          <TabPanel id="notifications" active={tab}>
            <PanelHeader
              title="Notifications"
              description="Choose what Orbit tells you about, and how it reaches you."
            />
            <NotificationsCard onDirtyChange={setNotificationsDirty} />
          </TabPanel>

          {/* ── Active sessions tab ── outside the form: it has its own actions */}
          <TabPanel id="sessions" active={tab}>
            <PanelHeader
              title="Active sessions"
              description="Devices and browsers where you are signed in to Orbit."
            />
            <SessionsCard reloadKey={sessionsReloadKey} />
          </TabPanel>

          {/* ── Danger zone tab ── */}
          <TabPanel id="danger" active={tab}>
            <PanelHeader
              title="Danger zone"
              description="Actions here can't be undone."
              danger
            />
            <div className={`${SURFACE} border-[color:color-mix(in_srgb,var(--danger)_30%,var(--border))]`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[color:var(--text)]">Delete account</div>
                  <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-[color:var(--text-2)] [text-wrap:pretty]">
                    Permanently removes your account and your data. You will be signed out everywhere.
                  </p>
                </div>
                {!deleteConfirm && (
                  <button
                    type="button"
                    onClick={() => { setDeleteConfirm(true); setDeleteError(''); }}
                    className={`${BTN_DANGER} shrink-0 self-start px-4 py-2.5 text-[13px] sm:self-center ${FOCUS_RING}`}
                  >
                    Delete account
                  </button>
                )}
              </div>

              {deleteConfirm && (
                <div className={`mt-4 ${CONFIRM_BOX}`}>
                  <p className="mb-3 text-[13px] font-medium text-[color:var(--text)]">
                    Delete your account? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className={`${BTN_DANGER} ${FOCUS_RING}`}
                    >
                      {deleting ? <Loader label="Deleting..." size="sm" variant="button" /> : 'Yes, delete my account'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(false)}
                      disabled={deleting}
                      className={`${BTN_NEUTRAL} ${FOCUS_RING}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {deleteError && <Msg type="error" className="mt-3">{deleteError}</Msg>}
            </div>
          </TabPanel>
        </main>
      </div>

      {avatarExpanded && avatarPreview && (
        <AvatarLightbox
          src={avatarPreview}
          name={form.name || user?.name}
          onClose={() => setAvatarExpanded(false)}
        />
      )}
    </div>
  );
}
