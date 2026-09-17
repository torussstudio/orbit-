import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-5">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-4xl font-bold font-mono text-[var(--accent)] tracking-[4px] mb-1.5 flex items-center justify-center gap-2.5">
            <span>⬡</span><span>ORBIT</span>
          </div>
          <div className="text-[12px] text-[var(--text-3)] tracking-[2px] uppercase">Agency OS</div>
        </div>

        <div className="bg-[var(--bg-2)] border border-[var(--border-bright)] rounded-xl p-6 shadow-[var(--shadow-glow)]">
          <div className="mb-6">
            <h1 className="text-[18px] font-semibold mb-1 text-[var(--text)]">Welcome back</h1>
            <p className="text-[13px] text-[var(--text-2)]">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-[12px] text-[var(--text-2)] mb-1.5 font-semibold tracking-[0.2px]">Email</label>
              <input
                className="w-full bg-[var(--bg-3)] border-[1.5px] border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-[9px] text-[var(--text)] font-[var(--font-body)] text-sm outline-none transition-all focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] focus:bg-[var(--bg-2)]"
                type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@agency.com" required
              />
            </div>
            <div className="mb-4 relative">
              <label className="block text-[12px] text-[var(--text-2)] mb-1.5 font-semibold tracking-[0.2px]">Password</label>
              <input
                className="w-full bg-[var(--bg-3)] border-[1.5px] border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-[9px] pr-10 text-[var(--text)] font-[var(--font-body)] text-sm outline-none transition-all focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] focus:bg-[var(--bg-2)]"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 bottom-[9px] bg-transparent border-none text-[var(--text-3)] cursor-pointer flex items-center justify-center p-0.5 hover:text-[var(--text)]"
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
            {error && <div className="text-[var(--danger)] text-[13px] mb-3 px-3 py-2 bg-red-50 rounded-md">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-[var(--radius-sm)] text-[13px] font-semibold cursor-pointer transition-all border-0 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)] hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)] hover:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-[var(--text-3)] mt-5">Orbit — Internal use only</p>
      </div>
    </div>
  );
}
