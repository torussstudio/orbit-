import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { updateCachedMember } from '../api/membersCache';
import DatePicker from '../components/ui/DatePicker';
import Loader, { LoadingSkeleton } from '../components/ui/Loader';

// ── Tailwind class tokens ────────────────────────────────────
// All colours come from the app's existing CSS variables, so light/dark
// themes keep working. `color:` hints keep Tailwind from guessing the type.
const CARD =
  'rounded-2xl border border-[color:var(--border)] bg-[var(--bg-2)] [box-shadow:var(--shadow)]';

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

const BTN_NEUTRAL =
  'rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] px-4 py-2 text-xs font-semibold text-[color:var(--text-2)] transition duration-200 hover:text-[color:var(--text)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70';

const BTN_DANGER =
  'rounded-lg bg-[var(--danger)] px-4 py-2 text-xs font-semibold text-white transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70';

// ── Icons (one stroke weight everywhere) ─────────────────────
const ICON_PATHS = {
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
  phone: (<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />),
  pin: (<><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  lock: (<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>),
  alert: (<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>),
  camera: (<><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></>),
  monitor: (<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>),
  mobile: (<><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>),
  bell: (<><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>),
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
        className="absolute right-6 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg text-white transition duration-200 hover:bg-white/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        ✕
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

// ── Small layout helpers ─────────────────────────────────────
function Section({ id, icon, title, description, children }) {
  return (
    <section id={id} className={`${CARD} scroll-mt-6 p-5 sm:p-6`}>
      <header className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg-3)] text-[color:var(--accent)]">
          <Icon name={icon} />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-[color:var(--text)]">{title}</h2>
          <p className="mt-0.5 text-xs text-[color:var(--text-3)]">{description}</p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, className = '', children }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold tracking-wide text-[color:var(--text-2)]">
        {label}
      </label>
      {children}
    </div>
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

// Sections shown in the quick-jump bar at the top of the page.
const SECTION_LINKS = [
  { id: 'personal', label: 'Personal' },
  { id: 'contact', label: 'Contact' },
  { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'sessions', label: 'Active sessions' },
  { id: 'danger', label: 'Danger zone', danger: true },
];

// ── Notifications ────────────────────────────────────────────
// What Orbit tells the member about, and how. Its own card outside the main
// form, with its own Save button: saving here never sends the profile form
// and never asks for the current password. The list of types, their groups
// and labels come from the server (GET /notifications/preferences), so the
// card shows exactly the types this member can receive.

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
      className={`grid w-full grid-cols-3 gap-1 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] p-1 sm:w-[300px] sm:shrink-0 ${
        disabled ? 'opacity-60' : ''
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
                ? 'bg-[var(--accent)] text-white'
                : 'text-[color:var(--text-2)] hover:text-[color:var(--text)]'
            } ${FOCUS_RING}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function NotificationsCard() {
  const [prefs, setPrefs] = useState(null);
  // The last saved state, to know whether there is anything to save.
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);
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

  const handleTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const { data } = await api.post('/notifications/test');
      const devices = Number(data?.push_devices) || 0;
      setTestMsg({
        type: 'success',
        text: devices > 0
          ? `Test sent to the bell and, by push, to ${devices} device${devices === 1 ? '' : 's'}.`
          : 'Test sent to the bell. No browser is subscribed to push for your account yet.',
      });
      // The bell reloads on this event.
      window.dispatchEvent(new Event('orbit:notifications-updated'));
    } catch (err) {
      setTestMsg({ type: 'error', text: err.response?.data?.error || "We couldn't send the test notification. Please try again." });
    } finally {
      setTesting(false);
      setTimeout(() => setTestMsg(null), 6000);
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

  let pushText = 'Checking…';
  if (push) {
    if (!push.supported) pushText = 'This browser does not support push notifications.';
    else if (push.permission === 'denied') pushText = "Blocked in this browser's settings. Allow notifications for Orbit there to turn push on.";
    else if (pushReady) pushText = 'On. This browser gets push notifications.';
    else pushText = 'Not enabled in this browser.';
  }

  return (
    <Section
      id="notifications"
      icon="bell"
      title="Notifications"
      description="Choose what Orbit tells you about, and how."
    >
      <div className="sm:col-span-2">
        {loading ? (
          <div aria-label="Loading notification settings">
            <LoadingSkeleton lines={4} />
          </div>
        ) : loadError || !prefs ? (
          <div role="alert" className="flex flex-col items-start gap-3 text-xs font-medium text-[color:var(--danger)]">
            <span>✕ {loadError || "We couldn't load your notification settings."}</span>
            <button type="button" onClick={load} className={`${BTN_NEUTRAL} ${FOCUS_RING}`}>
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">

            {/* Pause all */}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] p-3.5">
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
                <div key={group.id} className={locked ? 'opacity-50' : ''}>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-3)]">
                    {group.label}
                  </h3>
                  <ul className="divide-y divide-[color:var(--border)]">
                    {rows.map((row) => (
                      <li key={row.type} className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:gap-4">
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                          <span className="break-words text-[13px] font-medium text-[color:var(--text)]">{row.label}</span>
                          {row.can_disable ? (
                            <Toggle
                              checked={row.enabled}
                              onChange={(value) => setType(row.type, { enabled: value })}
                              disabled={locked}
                              label={row.label}
                            />
                          ) : (
                            <span className="shrink-0 rounded-md bg-[var(--bg-3)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--text-2)]">
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
                    <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                      <Field label="Reminder time (IST)" htmlFor="notifications-reminder-hour">
                        <select
                          id="notifications-reminder-hour"
                          className={inputClass()}
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
                      <div className="flex items-center justify-between gap-3 sm:items-end sm:pb-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[color:var(--text)]">{offDays.label}</div>
                          <p className="mt-0.5 text-[11px] text-[color:var(--text-3)]">{offDays.hint}</p>
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
            <div className="rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] p-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[color:var(--text)]">Push on this device</div>
                  <p className="mt-0.5 text-xs text-[color:var(--text-3)]">{pushText}</p>
                </div>
                {push?.supported && push.permission !== 'denied' && !pushReady && (
                  <button
                    type="button"
                    onClick={enablePush}
                    disabled={pushBusy}
                    className={`${BTN_NEUTRAL} flex shrink-0 items-center gap-1.5 self-start sm:self-center ${FOCUS_RING}`}
                  >
                    {pushBusy ? <Loader label="Enabling..." size="sm" variant="button" /> : 'Enable push on this device'}
                  </button>
                )}
              </div>
              {hasPushOnly && push && !pushReady && (
                <p className="mt-2.5 text-xs font-medium text-[color:var(--warning)]">
                  Some types are set to Push only, but push is not enabled in this browser, so they will not reach you here.
                </p>
              )}
            </div>

            {/* Test + Save */}
            <div className="flex flex-col gap-3 border-t border-[color:var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className={`${BTN_NEUTRAL} flex items-center gap-1.5 self-start ${FOCUS_RING}`}
              >
                {testing ? <Loader label="Sending..." size="sm" variant="button" /> : 'Send me a test notification'}
              </button>
              <div className="flex items-center gap-3 self-end sm:self-auto">
                {dirty && !saveMsg && (
                  <span className="text-xs text-[color:var(--text-3)]">Unsaved changes</span>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className={`flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-white transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${FOCUS_RING}`}
                >
                  {saving ? <Loader label="Saving..." size="sm" variant="button" /> : 'Save notification settings'}
                </button>
              </div>
            </div>

            {[testMsg, saveMsg].filter(Boolean).map((message) => (
              <div
                key={message.text}
                role={message.type === 'error' ? 'alert' : 'status'}
                className={`-mt-2 flex items-center gap-1.5 text-xs font-medium ${
                  message.type === 'success'
                    ? 'text-[color:var(--success)]'
                    : 'text-[color:var(--danger)]'
                }`}
              >
                {message.type === 'success' ? '✓' : '✕'} {message.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Active sessions ──────────────────────────────────────────
// Where the member is signed in. The server groups browser tabs of the same
// device (same browser + IP) into one entry. Its own card outside the main
// form, with its own messages: nothing here is part of "Save changes".
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

  return (
    <Section
      id="sessions"
      icon="monitor"
      title="Active sessions"
      description="Devices and browsers where you are signed in to Orbit."
    >
      <div className="sm:col-span-2">
        {loading ? (
          <div aria-label="Loading sessions">
            <LoadingSkeleton lines={3} />
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-col items-start gap-3 text-xs font-medium text-[color:var(--danger)]">
            <span>✕ {loadError}</span>
            <button type="button" onClick={() => load()} className={`${BTN_NEUTRAL} ${FOCUS_RING}`}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {sessions.length === 0 ? (
              <p className="text-xs text-[color:var(--text-3)]">
                No active sessions to show.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
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
                    <li key={key} className="rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] p-3.5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-2)] text-[color:var(--text-3)]">
                            <Icon name={entry.deviceType === 'mobile' ? 'mobile' : 'monitor'} className="h-[15px] w-[15px]" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="break-words text-[13px] font-semibold text-[color:var(--text)]">
                                {entry.deviceLabel}
                              </span>
                              {entry.current && (
                                <span className="rounded-md bg-[color:color-mix(in_srgb,var(--success)_15%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--success)]">
                                  This device
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 break-words text-xs text-[color:var(--text-3)]">{details}</p>
                          </div>
                        </div>

                        {!entry.current && confirming !== key && (
                          <button
                            type="button"
                            onClick={() => { setConfirming(key); setMsg(null); }}
                            disabled={busy !== null}
                            className={`shrink-0 self-start rounded-md px-2 py-1 text-xs font-semibold text-[color:var(--danger)] transition duration-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-70 sm:self-center ${FOCUS_RING}`}
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
                            className={`shrink-0 self-start rounded-md px-2 py-1 text-xs font-semibold text-[color:var(--danger)] transition duration-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-70 sm:self-center ${FOCUS_RING}`}
                          >
                            Sign out other tabs ({otherTabs})
                          </button>
                        )}
                      </div>

                      {/* Inline confirm step, like Remove photo */}
                      {confirming === key && (
                        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.08] p-3">
                          <p className="mb-2.5 text-xs font-medium text-[color:var(--text)]">
                            {entry.current
                              ? `Sign out ${otherTabs} other tab${otherTabs === 1 ? '' : 's'} in this browser? This tab stays signed in.`
                              : `Sign out of ${entry.deviceLabel}? It will have to sign in again.`}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => (entry.current ? signOutOtherTabs(entry, key) : signOutEntry(entry, key))}
                              disabled={busy !== null}
                              className={`${BTN_DANGER} flex items-center gap-1.5`}
                            >
                              {busy === key ? <Loader label="Signing out..." size="sm" variant="button" /> : 'Yes, sign out'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming(null)}
                              disabled={busy !== null}
                              className={BTN_NEUTRAL}
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
            <div className="mt-4 border-t border-[color:var(--border)] pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[52ch] text-xs leading-relaxed text-[color:var(--text-3)]">
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
                <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.08] p-3">
                  <p className="mb-2.5 text-xs font-medium text-[color:var(--text)]">
                    Sign out everywhere except here? Every other device and browser tab will have to sign in again.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={signOutOthers}
                      disabled={busy !== null}
                      className={`${BTN_DANGER} flex items-center gap-1.5`}
                    >
                      {busy === OTHERS ? <Loader label="Signing out..." size="sm" variant="button" /> : 'Yes, sign out'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      disabled={busy !== null}
                      className={BTN_NEUTRAL}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {msg && (
                <div
                  role={msg.type === 'error' ? 'alert' : 'status'}
                  className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${
                    msg.type === 'success'
                      ? 'text-[color:var(--success)]'
                      : 'text-[color:var(--danger)]'
                  }`}
                >
                  {msg.type === 'success' ? '✓' : '✕'} {msg.text}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

export default function AccountSettings() {
  const { user, logout, updateUser } = useAuth();

  // ── Avatar ─────────────────────────────────────────────────
  const [avatarPreview, setAvatarPreview] = useState(null);
  // The shrunk photo (data URL) waiting for Save. Same image as the preview.
  const [avatarData, setAvatarData] = useState(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const fileInputRef = useRef(null);

  // ── Form (right side) — these drive left side too ──────────
  const [form, setForm] = useState({
    name: '', email: '', phone: '', role: '', location: '', bio: '', dob: '',
  });
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
  const [removePhotoConfirm, setRemovePhotoConfirm] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);
  // Bumped after a password change so the Active sessions card reloads.
  const [sessionsReloadKey, setSessionsReloadKey] = useState(0);

  // Filled from the saved profile. Keyed on the profile fields rather than the
  // user object, so removing the photo does not undo edits not saved yet.
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || '',
        location: user.location || '',
        bio: user.bio || '',
        dob: user.birthday || '',
      });
    }
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

  // Live check while typing: shown under Confirm password once it has text.
  const liveMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const liveMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const confirmMessage = confirmPasswordError || (liveMismatch ? 'Passwords do not match.' : '');

  // handleSave now also serves as the form's onSubmit handler
  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    // Check everything first, so all problems show at once.
    let currentErr = '';
    let newErr = '';
    let confirmErr = '';
    if (needsCurrentPassword && !currentPassword) {
      currentErr = 'Enter your current password to continue.';
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
      document.getElementById(firstId)?.focus();
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

      setSaveMsg({ type: 'success', text: 'Changes saved successfully.' });
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
      const message = err.response?.data?.error || 'Failed to save changes.';
      // Current-password problems are shown under that field.
      if (err.response?.status === 400 && /current password/i.test(message)) {
        setCurrentPasswordError(message);
        document.getElementById('account-current-password')?.focus();
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
    try {
      await api.delete('/auth/account');
      await logout();
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.response?.data?.error || 'Failed to delete account.' });
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const scrollToSection = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Format dob for display in left panel
  const formatDob = (val) => {
    if (!val) return '—';
    try {
      return new Date(val).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return val; }
  };

  // Rows for the "At a glance" card — mirrors the form in real time
  const glanceRows = [
    { icon: 'mail', label: 'Email', value: form.email },
    { icon: 'phone', label: 'Phone', value: form.phone },
    { icon: 'calendar', label: 'Date of birth', value: formatDob(form.dob) },
    { icon: 'pin', label: 'Location', value: form.location },
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8 sm:py-9">
      {/* Page header + quick jump */}
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[color:var(--text)] [text-wrap:balance] sm:text-[28px]">
            Account settings
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--text-2)]">
            Manage your profile, contact details and sign-in security.
          </p>
        </div>
        <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:pb-0">
          {SECTION_LINKS.map(({ id, label, danger }) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollToSection(id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition duration-200 hover:bg-[var(--bg-3)] active:scale-[0.98] ${FOCUS_RING} ${
                danger
                  ? 'text-[color:var(--danger)]'
                  : 'text-[color:var(--text-2)] hover:text-[color:var(--text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">

        {/* ══ LEFT: profile summary ═══════════════════════════ */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-6">

          {/* Profile photo card */}
          <div className={`${CARD} overflow-hidden`}>
            <div
              aria-hidden="true"
              className="h-24 bg-[radial-gradient(120%_150%_at_15%_0%,color-mix(in_srgb,var(--accent)_30%,transparent),transparent_70%)]"
            />
            <div className="-mt-12 px-5 pb-5 text-center">

              {/* Avatar with camera button */}
              <div className="relative mx-auto h-24 w-24">
                <div
                  className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full border-4 border-[color:var(--bg-2)] text-3xl font-semibold text-white [box-shadow:var(--shadow)] ${
                    avatarPreview ? 'bg-[var(--bg-3)]' : 'bg-[var(--accent)]'
                  }`}
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="avatar"
                      onClick={() => setAvatarExpanded(true)}
                      title="View photo"
                      className="h-full w-full cursor-zoom-in object-cover"
                    />
                  ) : (
                    form.name?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase()
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processingPhoto}
                  title="Change profile photo"
                  aria-label="Change profile photo"
                  className={`absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[color:var(--bg-2)] bg-[var(--accent)] text-white transition duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 ${FOCUS_RING}`}
                >
                  <Icon name="camera" className="h-3.5 w-3.5" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>

              <div className="mt-3 text-base font-semibold tracking-tight text-[color:var(--text)]">
                {form.name || user?.name || '—'}
              </div>
              {(form.role || user?.role) && (
                <span className="mt-1.5 inline-block rounded-md bg-[var(--bg-3)] px-2 py-0.5 text-[11px] font-medium capitalize text-[color:var(--text-2)]">
                  {form.role || user?.role}
                </span>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={processingPhoto}
                className={`mt-4 w-full rounded-lg border border-dashed border-[color:var(--border)] bg-[var(--bg-3)] py-2 text-xs font-medium text-[color:var(--text-2)] transition duration-200 hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 ${FOCUS_RING}`}
              >
                {processingPhoto ? 'Preparing photo…' : avatarData ? '✓ Image selected' : 'Upload photo'}
              </button>
              <p className="mt-2 text-[11px] text-[color:var(--text-3)]">
                JPG, PNG or GIF · Resized automatically
              </p>

              {/* Remove photo: only when a photo is saved, with an inline confirm step */}
              {user?.avatar_url && (
                !removePhotoConfirm ? (
                  <button
                    type="button"
                    onClick={() => { setRemovePhotoConfirm(true); setPhotoMsg(null); }}
                    className={`mt-2 rounded-md px-2 py-1 text-xs font-semibold text-[color:var(--danger)] transition duration-200 hover:bg-red-500/10 ${FOCUS_RING}`}
                  >
                    Remove photo
                  </button>
                ) : (
                  <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.08] p-3 text-left">
                    <p className="mb-2.5 text-xs font-medium text-[color:var(--text)]">
                      Remove your profile photo? Your initials will show instead.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={removingPhoto}
                        className={`${BTN_DANGER} flex items-center gap-1.5`}
                      >
                        {removingPhoto ? <Loader label="Removing..." size="sm" variant="button" /> : 'Yes, remove'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemovePhotoConfirm(false)}
                        disabled={removingPhoto}
                        className={BTN_NEUTRAL}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              )}
              {photoMsg && (
                <div
                  role={photoMsg.type === 'error' ? 'alert' : 'status'}
                  className={`mt-2 flex items-center justify-center gap-1.5 text-xs font-medium ${
                    photoMsg.type === 'success'
                      ? 'text-[color:var(--success)]'
                      : 'text-[color:var(--danger)]'
                  }`}
                >
                  {photoMsg.type === 'success' ? '✓' : '✕'} {photoMsg.text}
                </div>
              )}
            </div>
          </div>

          {/* At a glance — mirrors the form in real time */}
          <div className={`${CARD} p-5`}>
            <h2 className="mb-4 text-[13px] font-semibold tracking-tight text-[color:var(--text)]">
              At a glance
            </h2>
            <dl className="flex flex-col gap-3.5">
              {glanceRows.map(({ icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-3)] text-[color:var(--text-3)]">
                    <Icon name={icon} className="h-[15px] w-[15px]" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-medium text-[color:var(--text-3)]">{label}</dt>
                    <dd
                      className={`break-words text-[13px] font-medium ${
                        value && value !== '—' ? 'text-[color:var(--text)]' : 'text-[color:var(--text-3)]'
                      }`}
                    >
                      {value || '—'}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        {/* ══ RIGHT: categorised settings ═════════════════════ */}
        <div className="flex min-w-0 flex-col gap-5">

          {/* One <form> around all three sections, so the password fields sit
              inside a form (browser password managers need that) and a single
              Save button covers everything. */}
          <form onSubmit={handleSave} className="flex flex-col gap-5">
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

            {/* ── Personal ── */}
            <Section
              id="personal"
              icon="user"
              title="Personal details"
              description="How you appear to your team."
            >
              <Field label="Full name" htmlFor="account-name">
                <input id="account-name" className={inputClass()} value={form.name}
                  onChange={handleChange('name')} placeholder="Your full name" />
              </Field>
              <Field label="Role">
                <div className="relative">
                  <input
                    className={`${inputClass()} cursor-not-allowed bg-[var(--bg-4)] pr-9 text-[color:var(--text-3)]`}
                    value={form.role} readOnly aria-readonly="true"
                    title="Role can only be changed by a manager"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]">
                    <Icon name="lock" className="h-3.5 w-3.5" />
                  </span>
                </div>
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
                  placeholder="Tell your team a bit about yourself..." />
              </Field>
            </Section>

            {/* ── Contact ── */}
            <Section
              id="contact"
              icon="mail"
              title="Contact"
              description="Where we reach you. Changing your email asks for your current password."
            >
              <Field label="Email" htmlFor="account-email">
                <input id="account-email" className={inputClass()} value={form.email} type="email"
                  autoComplete="email" onChange={handleChange('email')} placeholder="your@email.com" />
              </Field>
              <Field label="Phone" htmlFor="account-phone">
                <input id="account-phone" className={inputClass()} value={form.phone}
                  onChange={handleChange('phone')} placeholder="+91 00000 00000" />
              </Field>
            </Section>

            {/* ── Security ── */}
            <Section
              id="security"
              icon="lock"
              title="Security"
              description="Enter your current password first to set a new one. Leave the fields empty to keep it."
            >
              <Field
                label="Current password"
                htmlFor="account-current-password"
                className="sm:col-span-2 sm:max-w-[calc(50%_-_0.5rem)]"
              >
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
                {currentPasswordError ? (
                  <div
                    id="account-current-password-error"
                    role="alert"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--danger)]"
                  >
                    ✕ {currentPasswordError}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11px] text-[color:var(--text-3)]">
                    Required to set a new password or change your email.
                  </p>
                )}
              </Field>
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
                  describedBy={newPasswordError ? 'account-new-password-error' : undefined}
                />
                {newPasswordError ? (
                  <div id="account-new-password-error" role="alert"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--danger)]">
                    ✕ {newPasswordError}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11px] text-[color:var(--text-3)]">
                    At least {PASSWORD_MIN_LENGTH} characters. Changing it signs out your other devices; this one stays signed in.
                  </p>
                )}
              </Field>
              <Field label="Confirm password" htmlFor="account-confirm-password">
                <PasswordInput
                  id="account-confirm-password"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setConfirmPasswordError(''); }}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword(v => !v)}
                  invalid={Boolean(confirmMessage)}
                  describedBy={confirmMessage ? 'account-confirm-password-error' : undefined}
                />
                {confirmMessage && (
                  <div id="account-confirm-password-error" role="alert"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--danger)]">
                    ✕ {confirmMessage}
                  </div>
                )}
                {!confirmMessage && liveMatch && (
                  <div role="status"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--success)]">
                    ✓ Passwords match
                  </div>
                )}
              </Field>
            </Section>

            {/* Save bar — stays in view while scrolling the long form */}
            <div className={`${CARD} sticky bottom-4 z-10 flex items-center gap-3 px-4 py-3`}>
              {saveMsg && (
                <div
                  role={saveMsg.type === 'error' ? 'alert' : 'status'}
                  className={`flex items-center gap-1.5 text-xs font-medium ${
                    saveMsg.type === 'success'
                      ? 'text-[color:var(--success)]'
                      : 'text-[color:var(--danger)]'
                  }`}
                >
                  {saveMsg.type === 'success' ? '✓' : '✕'} {saveMsg.text}
                </div>
              )}
              <button
                type="submit"
                disabled={saving || processingPhoto}
                className={`ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-white transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${FOCUS_RING}`}
              >
                {saving ? <Loader label="Saving..." size="sm" variant="button" /> : 'Save changes'}
              </button>
            </div>
          </form>

          {/* ── Notifications ── outside the form: it has its own Save button */}
          <NotificationsCard />

          {/* ── Active sessions ── outside the form: it has its own actions */}
          <SessionsCard reloadKey={sessionsReloadKey} />

          {/* ── Danger zone ── */}
          <section
            id="danger"
            className="scroll-mt-6 rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-5 sm:p-6"
          >
            <header className="mb-4 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-red-500/10 text-[color:var(--danger)]">
                <Icon name="alert" />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-[color:var(--danger)]">Danger zone</h2>
                <p className="mt-0.5 text-xs text-[color:var(--text-3)]">Critical actions that affect your account.</p>
              </div>
            </header>

            <div className="border-t border-red-500/15 pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-[color:var(--text)]">Delete account</div>
                  <p className="mt-0.5 max-w-[52ch] text-xs leading-relaxed text-[color:var(--text-2)]">
                    This action is <strong className="font-semibold">permanent</strong> and cannot be undone. All your data will be removed.
                  </p>
                </div>
                {!deleteConfirm && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className={`${BTN_DANGER} shrink-0 py-2.5 text-[13px] ${FOCUS_RING}`}
                  >
                    Delete account
                  </button>
                )}
              </div>

              {deleteConfirm && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.08] p-4">
                  <p className="mb-3 text-[13px] font-medium text-[color:var(--text)]">
                    Are you absolutely sure? This cannot be undone.
                  </p>
                  <div className="flex gap-2.5">
                    <button type="button" onClick={handleDeleteAccount} disabled={deleting} className={BTN_DANGER}>
                      {deleting ? 'Deleting...' : 'Yes, delete'}
                    </button>
                    <button type="button" onClick={() => setDeleteConfirm(false)} className={BTN_NEUTRAL}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>
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