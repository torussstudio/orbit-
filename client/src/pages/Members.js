import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import Modal from '../components/ui/Modal';

export default function Members() {
  const { isManager } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'developer', skills: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get('/members').then(r => setMembers(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', email: '', password: '', role: 'developer', skills: '' }); setError(''); setShowModal(true); };
  const openEdit = m => { setEditing(m); setForm({ name: m.name, email: m.email, password: '', role: m.role, skills: m.skills?.join(', ') || '' }); setError(''); setShowModal(true); };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const payload = { ...form, skills: form.skills ? form.skills.split(',').map(s => s.trim()).filter(Boolean) : [] };
      if (editing) await api.put(`/members/${editing.id}`, payload);
      else await api.post('/members', payload);
      setShowModal(false); load();
    } catch (e) { setError(e.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async id => {
    if (window.confirm('Deactivate this member? They will no longer be able to log in.')) { await api.patch(`/members/${id}/deactivate`); load(); }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Team Members</div>
          <div className="page-subtitle">{members.filter(m => m.active).length} active member{members.filter(m => m.active).length !== 1 ? 's' : ''}</div>
        </div>
        {isManager && <button className="btn btn-primary" onClick={openCreate}>+ Add Member</button>}
      </div>

      <div className="page-body">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Skills</th><th>Joined</th><th>Status</th>{isManager && <th>Actions</th>}</tr></thead>
            <tbody>
              {members.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '40px' }}>No members yet</td></tr>}
              {members.map(m => (
                <tr key={m.id} style={{ opacity: m.active ? 1 : 0.5 }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="user-avatar">{m.name[0]}</div>
                      <span style={{ fontWeight: 500 }}>{m.name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-2)' }}>{m.email}</td>
                  <td><span className={`badge ${m.role === 'manager' ? 'badge-deployed' : 'badge-inprogress'}`}>{m.role}</span></td>
                  <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>
                    {m.skills?.length ? m.skills.map(s => (
                      <span key={s} style={{ display: 'inline-block', background: 'var(--bg-4)', borderRadius: '4px', padding: '1px 6px', marginRight: '4px', marginBottom: '2px', fontSize: '11px' }}>{s}</span>
                    )) : '—'}
                  </td>
                  <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>{formatDate(m.created_at)}</td>
                  <td><span style={{ fontSize: '11px', color: m.active ? 'var(--success)' : 'var(--text-3)' }}>{m.active ? '● Active' : '○ Inactive'}</span></td>
                  {isManager && (
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(m)}>Edit</button>
                        {m.active && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeactivate(m.id)}>Deactivate</button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Member' : 'Add Member'} onClose={() => setShowModal(false)}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="developer">Developer</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@agency.com" />
          </div>
          <div className="form-group">
            <label className="form-label">{editing ? 'New Password (leave blank to keep current)' : 'Password'}</label>
            <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
          </div>
          <div className="form-group">
            <label className="form-label">Skills (comma-separated)</label>
            <input className="form-input" value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} placeholder="React, Node.js, CSS" />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: '6px' }}>{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Member'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
