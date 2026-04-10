import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '36px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', letterSpacing: '4px', marginBottom: '6px' }}>
            ⬡ ORBIT
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-3)', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Agency OS
          </div>
        </div>

        <div className="card" style={{ border: '1px solid var(--border-bright)', boxShadow: 'var(--shadow-glow)' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>Welcome back</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@agency.com" required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: '6px' }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-3)', marginTop: '20px' }}>
          Orbit — Internal use only
        </p>
      </div>
    </div>
  );
}
