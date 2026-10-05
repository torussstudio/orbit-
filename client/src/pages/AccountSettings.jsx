import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { updateCachedMember } from '../api/membersCache';
import DatePicker from '../components/ui/DatePicker';
import Loader from '../components/ui/Loader';

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
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000, padding: '24px', cursor: 'zoom-out',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute', top: '20px', right: '24px',
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', border: 'none',
          color: '#fff', fontSize: '18px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ✕
      </button>
      <img
  src={src}
  alt={name || 'avatar'}
  onClick={(e) => e.stopPropagation()}
  style={{
    width: 'min(80vw, 80vh, 480px)',
    height: 'min(80vw, 80vh, 480px)',
    borderRadius: '50%',
    objectFit: 'cover',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    cursor: 'default',
  }}
/>
    </div>,
    document.body
  );
}

// Reusable avatar renderer — shows image if url exists, else initial letter.
// Clicking an image avatar opens it full-size in a lightbox (initials-only
// avatars aren't clickable since there's nothing to expand).
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
          style={{
            width: size, height: size, borderRadius: '50%',
            objectFit: 'cover', display: 'block', cursor: 'pointer',
          }}
        />
        {expanded && (
          <AvatarLightbox src={avatarUrl} name={name} onClose={() => setExpanded(false)} />
        )}
      </>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: 700, color: 'white', fontFamily: 'var(--font-body)',
      flexShrink: 0,
    }}>
      {name?.[0]?.toUpperCase()}
    </div>
  );
}

// Small eye / eye-off icon used for the password visibility toggle
function EyeIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.4 19.4 0 015.06-5.94M9.9 4.24A10.58 10.58 0 0112 4c7 0 11 8 11 8a19.5 19.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ── Profile photo: shrink before upload ───────────────────────
// Photos are stored inside the member record and sent with member lists, so
// a full-size camera photo (often 1 MB or more) slows those pages down for
// everyone. The chosen photo is redrawn at most 256 px on its longest side
// and saved as JPEG (about 10-40 KB). Photos are shown at 32-100 px, so this
// is still sharp. If the browser cannot do it, the original is sent as before.
const AVATAR_MAX_SIDE = 256;
const AVATAR_JPEG_QUALITY = 0.82;

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

async function shrinkPhoto(file) {
  const original = await readAsDataUrl(file);

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = original;
    });

    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) return original;

    const scale = Math.min(1, AVATAR_MAX_SIDE / longest);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return original;

    // JPEG has no transparency: put the photo on white.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const shrunk = canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);

    return shrunk.startsWith('data:image/jpeg') && shrunk.length < original.length
      ? shrunk
      : original;
  } catch {
    return original;
  }
}

export default function AccountSettings() {
  const { user, logout, updateUser } = useAuth();

  // ── Avatar ─────────────────────────────────────────────────
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
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

  // ── UI ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removePhotoConfirm, setRemovePhotoConfirm] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);

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

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarPreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // Changing the password or the email needs the current password.
  const emailChanged =
    form.email.trim().toLowerCase() !== (user?.email || '').trim().toLowerCase();
  const needsCurrentPassword = Boolean(newPassword) || emailChanged;

  // handleSave now also serves as the form's onSubmit handler
  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (newPassword && newPassword !== confirmPassword) {
      setSaveMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
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

      // A new photo is shrunk in the browser before upload (see shrinkPhoto)
      if (avatarFile) {
        payload.avatar_base64 = await shrinkPhoto(avatarFile);
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

      setSaveMsg({ type: 'success', text: 'Changes saved successfully.' });
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      setAvatarFile(null);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to save changes.';
      // Current-password problems are shown under that field.
      if (err.response?.status === 400 && /current password/i.test(message)) {
        setCurrentPasswordError(message);
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
      setAvatarFile(null);
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

  // ── Shared styles ──────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid var(--border)', background: 'var(--bg-3)',
    fontSize: '13px', color: 'var(--text)', outline: 'none',
    fontFamily: 'var(--font-body)', transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  };
  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 600,
    color: 'var(--text-2)', marginBottom: '6px', letterSpacing: '0.2px',
  };
  const eyeToggleStyle = {
    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', padding: 0, margin: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-3)', cursor: 'pointer', lineHeight: 0,
  };

  // Format dob for display in left panel
  const formatDob = (val) => {
    if (!val) return '—';
    try {
      return new Date(val).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return val; }
  };

  return (
    <div className="account-settings-page" style={{ padding: '32px'}}>
      {/* Page title */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.4px' }}>
          Account Settings
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '4px' }}>
          Manage your profile and account preferences
        </p>
      </div>

      <div className="account-settings-grid" style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', alignItems: 'start' }}>

        {/* ══ LEFT PANEL ══════════════════════════════════════ */}
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: '14px', overflow: 'hidden', boxShadow: 'var(--shadow)',
        }}>
          {/* Top: avatar + name + role */}
          <div style={{ padding: '28px 20px 20px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>

            {/* Avatar with camera button */}
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: '14px' }}>
              <div style={{
                width: '88px', height: '88px', borderRadius: '50%',
                overflow: 'hidden', margin: '0 auto',
                border: '3px solid var(--border)',
                background: avatarPreview ? 'transparent' : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '30px', fontWeight: 700, color: 'white',
              }}>
                {avatarPreview
                  ? <img
                      src={avatarPreview}
                      alt="avatar"
                      onClick={() => setAvatarExpanded(true)}
                      title="View photo"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                    />
                  : form.name?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase()
                }
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Change profile photo"
                style={{
                  position: 'absolute', bottom: '2px', right: '2px',
                  width: '26px', height: '26px', borderRadius: '50%',
                  background: 'var(--accent)', border: '2px solid var(--bg-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'white',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </div>

            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>
              {form.name || user?.name || '—'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-3)', textTransform: 'capitalize', marginBottom: '14px' }}>
              {form.role || user?.role}
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', padding: '7px', borderRadius: '8px',
                border: '1.5px dashed var(--border)', background: 'var(--bg-3)',
                color: 'var(--text-2)', fontSize: '12px', cursor: 'pointer',
                fontFamily: 'var(--font-body)', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
            >
              {avatarFile ? '✓ Image selected' : 'Upload photo'}
            </button>
            <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '7px' }}>
              JPG, PNG or GIF · Max 2MB
            </p>

            {/* Remove photo: only when a photo is saved, with an inline confirm step */}
            {user?.avatar_url && (
              !removePhotoConfirm ? (
                <button
                  type="button"
                  onClick={() => { setRemovePhotoConfirm(true); setPhotoMsg(null); }}
                  style={{
                    marginTop: '8px', padding: '4px 8px', borderRadius: '6px',
                    background: 'none', border: 'none', color: 'var(--danger)',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Remove photo
                </button>
              ) : (
                <div style={{
                  marginTop: '10px', background: 'rgba(239,68,68,0.08)', borderRadius: '10px',
                  padding: '12px', border: '1px solid rgba(239,68,68,0.2)', textAlign: 'left',
                }}>
                  <p style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '10px', fontWeight: 500 }}>
                    Remove your profile photo? Your initials will show instead.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={handleRemovePhoto} disabled={removingPhoto} style={{
                      padding: '6px 14px', borderRadius: '7px', background: 'var(--danger)',
                      color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600,
                      cursor: removingPhoto ? 'not-allowed' : 'pointer', opacity: removingPhoto ? 0.7 : 1,
                      fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      {removingPhoto ? <Loader label="Removing..." size="sm" variant="button" /> : 'Yes, remove'}
                    </button>
                    <button type="button" onClick={() => setRemovePhotoConfirm(false)} disabled={removingPhoto} style={{
                      padding: '6px 14px', borderRadius: '7px', background: 'var(--bg-3)',
                      color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: '12px',
                      fontWeight: 600, cursor: removingPhoto ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
                    }}>Cancel</button>
                  </div>
                </div>
              )
            )}
            {photoMsg && (
              <div role={photoMsg.type === 'error' ? 'alert' : 'status'} style={{
                marginTop: '8px', fontSize: '12px', fontWeight: 500,
                color: photoMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                {photoMsg.type === 'success' ? '✓' : '✕'} {photoMsg.text}
              </div>
            )}
          </div>

          {/* Bottom: Basic Information — mirrors form in real-time */}
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>
              Basic Information
            </div>

            {[
              { label: 'Full Name',     value: form.name },
              { label: 'Email',         value: form.email },
              { label: 'Phone',         value: form.phone },
              { label: 'Date of Birth', value: formatDob(form.dob) },
              { label: 'Location',      value: form.location },
            ].map(({ label, value }) => (
              <div key={label} style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '2px', fontWeight: 500 }}>
                  {label}
                </div>
                <div style={{
                  fontSize: '13px', fontWeight: 600, color: value ? 'var(--text)' : 'var(--text-3)',
                  wordBreak: 'break-word',
                }}>
                  {value || '—'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ══ RIGHT PANEL ═════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Account Settings card — wrapped in a <form> so the password
              fields are properly associated with a form (fixes the Chrome
              DevTools "Password field is not contained in a form" warning
              and lets browser password managers work correctly). */}
          <form
            onSubmit={handleSave}
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: '14px', padding: '24px', boxShadow: 'var(--shadow)',
            }}
          >
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '20px' }}>
              Account Settings
            </h2>

            {/* Hidden username field helps password managers associate the
                credentials with the right account (accessibility best practice) */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={form.email}
              readOnly
              style={{ display: 'none' }}
              tabIndex={-1}
              aria-hidden="true"
            />

            {/* Name + Email */}
            <div className="account-settings-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <input style={inputStyle} value={form.name} onChange={handleChange('name')} placeholder="Your full name"
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} value={form.email} type="email" autoComplete="email" onChange={handleChange('email')} placeholder="your@email.com"
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
            </div>

            {/* Phone + Role */}
            <div className="account-settings-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={form.phone} onChange={handleChange('phone')} placeholder="+91 00000 00000"
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <input style={{ ...inputStyle, background: 'var(--bg-4)', color: 'var(--text-3)', cursor: 'not-allowed' }}
                  value={form.role} readOnly title="Role can only be changed by a manager" />
              </div>
            </div>

            {/* Location + DOB */}
            <div className="account-settings-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Location</label>
                <input style={inputStyle} value={form.location} onChange={handleChange('location')} placeholder="City, Country"
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div>
                <label style={labelStyle}>Date of Birth</label>
                <DatePicker value={form.dob} onChange={val => setForm(prev => ({ ...prev, dob: val }))} placeholder="dd-mm-yyyy" />
              </div>
            </div>

            {/* New Password + Confirm */}
            <div className="account-settings-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inputStyle, paddingRight: '38px' }} value={newPassword}
                    type={showNewPassword ? 'text' : 'password'} autoComplete="new-password"
                    onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank to keep current"
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                  <button type="button" style={eyeToggleStyle}
                    onClick={() => setShowNewPassword(v => !v)}
                    title={showNewPassword ? 'Hide password' : 'Show password'}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}>
                    <EyeIcon open={showNewPassword} />
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inputStyle, paddingRight: '38px' }} value={confirmPassword}
                    type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password"
                    onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password"
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                  <button type="button" style={eyeToggleStyle}
                    onClick={() => setShowConfirmPassword(v => !v)}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                    <EyeIcon open={showConfirmPassword} />
                  </button>
                </div>
              </div>
            </div>

            {/* Current Password — only when changing the password or email */}
            {needsCurrentPassword && (
              <div className="account-settings-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle} htmlFor="account-current-password">Current Password</label>
                  <div style={{ position: 'relative' }}>
                    <input id="account-current-password"
                      style={{ ...inputStyle, paddingRight: '38px', ...(currentPasswordError ? { borderColor: 'var(--danger)' } : null) }}
                      value={currentPassword}
                      type={showCurrentPassword ? 'text' : 'password'} autoComplete="current-password"
                      onChange={e => { setCurrentPassword(e.target.value); setCurrentPasswordError(''); }}
                      placeholder="Enter your current password"
                      aria-invalid={currentPasswordError ? true : undefined}
                      aria-describedby={currentPasswordError ? 'account-current-password-error' : undefined}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = currentPasswordError ? 'var(--danger)' : 'var(--border)'} />
                    <button type="button" style={eyeToggleStyle}
                      onClick={() => setShowCurrentPassword(v => !v)}
                      title={showCurrentPassword ? 'Hide password' : 'Show password'}
                      aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}>
                      <EyeIcon open={showCurrentPassword} />
                    </button>
                  </div>
                  {currentPasswordError && (
                    <div id="account-current-password-error" role="alert" style={{
                      fontSize: '12px', fontWeight: 500, color: 'var(--danger)',
                      display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px',
                    }}>
                      ✕ {currentPasswordError}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bio */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Bio</label>
              <textarea style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
                value={form.bio} onChange={handleChange('bio')} placeholder="Tell your team a bit about yourself..."
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>

            {/* Save row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {saveMsg && (
                <div style={{
                  fontSize: '12px', fontWeight: 500,
                  color: saveMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  {saveMsg.type === 'success' ? '✓' : '✕'} {saveMsg.text}
                </div>
              )}
              <button type="submit" disabled={saving} style={{
                marginLeft: 'auto', padding: '9px 22px', borderRadius: '8px',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                fontFamily: 'var(--font-body)', boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {saving ? <Loader label="Saving..." size="sm" variant="button" /> : 'Save Changes'}
              </button>
            </div>
          </form>

          {/* Danger Zone */}
          <div style={{
            background: 'rgba(239,68,68,0.04)', border: '1.5px solid rgba(239,68,68,0.25)',
            borderRadius: '14px', padding: '20px',
          }}>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)', marginBottom: '2px' }}>Danger Zone</div>
              <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>Critical actions that affect your account.</div>
            </div>
            <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--danger)', marginBottom: '4px' }}>Delete Account</div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '12px' }}>
                This action is <strong>permanent</strong> and cannot be undone. All your data will be removed.
              </div>
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)} style={{
                  padding: '8px 18px', borderRadius: '8px', background: 'var(--danger)',
                  color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}>Delete Account</button>
              ) : (
                <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '12px', fontWeight: 500 }}>
                    Are you absolutely sure? This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleDeleteAccount} disabled={deleting} style={{
                      padding: '7px 16px', borderRadius: '7px', background: 'var(--danger)',
                      color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600,
                      cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1,
                      fontFamily: 'var(--font-body)',
                    }}>{deleting ? 'Deleting...' : 'Yes, Delete'}</button>
                    <button onClick={() => setDeleteConfirm(false)} style={{
                      padding: '7px 16px', borderRadius: '7px', background: 'var(--bg-3)',
                      color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: '12px',
                      fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>

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