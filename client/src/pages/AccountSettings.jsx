import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import DatePicker from '../components/ui/DatePicker';

// Reusable avatar renderer — shows image if url exists, else initial letter
export function UserAvatar({ avatarUrl, name, size = 34, fontSize = 13 }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'avatar'}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', display: 'block',
        }}
      />
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

export default function AccountSettings() {
  const { user, logout, updateUser } = useAuth();

  // ── Avatar ─────────────────────────────────────────────────
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const fileInputRef = useRef(null);

  // ── Form (right side) — these drive left side too ──────────
  const [form, setForm] = useState({
    name: '', email: '', phone: '', role: '', location: '', bio: '', dob: '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── UI ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      if (user.avatar_url) setAvatarPreview(user.avatar_url);
    }
  }, [user]);

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

  const handleSave = async () => {
    if (newPassword && newPassword !== confirmPassword) {
      setSaveMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        location: form.location,
        bio: form.bio,
        birthday: form.dob || null,
      };
      if (newPassword) payload.password = newPassword;

      // Encode avatar as base64 if a new file was selected
      if (avatarFile) {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => { payload.avatar_base64 = ev.target.result; resolve(); };
          reader.readAsDataURL(avatarFile);
        });
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
      setAvatarFile(null);
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save changes.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
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

  // Format dob for display in left panel
  const formatDob = (val) => {
    if (!val) return '—';
    try {
      return new Date(val).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return val; }
  };

  return (
    <div style={{ padding: '32px'}}>
      {/* Page title */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.4px' }}>
          Account Settings
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '4px' }}>
          Manage your profile and account preferences
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', alignItems: 'start' }}>

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
                  ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : form.name?.[0]?.toUpperCase() || user?.name?.[0]?.toUpperCase()
                }
              </div>
              <button
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

          {/* Account Settings card */}
          <div style={{
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: '14px', padding: '24px', boxShadow: 'var(--shadow)',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '20px' }}>
              Account Settings
            </h2>

            {/* Name + Email */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <input style={inputStyle} value={form.name} onChange={handleChange('name')} placeholder="Your full name"
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} value={form.email} type="email" onChange={handleChange('email')} placeholder="your@email.com"
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
            </div>

            {/* Phone + Role */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>New Password</label>
                <input style={inputStyle} value={newPassword} type="password" onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank to keep current"
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div>
                <label style={labelStyle}>Confirm Password</label>
                <input style={inputStyle} value={confirmPassword} type="password" onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password"
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
            </div>

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
              <button onClick={handleSave} disabled={saving} style={{
                marginLeft: 'auto', padding: '9px 22px', borderRadius: '8px',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                fontFamily: 'var(--font-body)', boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {saving && <div className="spinner" style={{ width: '13px', height: '13px', borderWidth: '2px' }} />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

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
    </div>
  );
}