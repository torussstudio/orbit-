import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/ui/Loader';

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
    <div className="relative min-h-screen min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-[var(--bg)]">

      {/* Soft color blobs — visible at every width, this IS the creative layer now */}
      <div className="pointer-events-none absolute -top-24 -left-20 w-72 h-72 rounded-full bg-[var(--accent)]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 w-80 h-80 rounded-full bg-[var(--accent-2)]/20 blur-3xl" />

      <div className="relative w-full max-w-[400px] my-auto">
        <div className="rounded-3xl bg-[var(--bg-2)] shadow-xl overflow-hidden border border-[var(--border)]">

          {/* Hero band — orbit motif, always visible, scales with the card */}
          <div className="relative h-[132px] sm:h-[150px] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center overflow-hidden">
            <svg width="220" height="220" viewBox="0 0 220 220" className="absolute opacity-30">
              <circle cx="110" cy="110" r="48" fill="none" stroke="white" strokeWidth="1" />
              <circle cx="110" cy="110" r="80" fill="none" stroke="white" strokeWidth="1" />
              <circle cx="150" cy="55" r="3" fill="white" />
              <circle cx="42" cy="150" r="2.5" fill="white" />
            </svg>
            <div className="relative text-center">
              <div className="text-2xl sm:text-[26px] font-bold font-mono text-white tracking-[3px] flex items-center justify-center gap-2">
                <span>⬡</span><span>ORBIT</span>
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/70 tracking-[2px] uppercase mt-1">Agency OS</div>
            </div>
          </div>

          {/* Form panel */}
          <div className="p-5 sm:p-7">
            <div className="mb-6">
              <h1 className="text-[19px] font-semibold mb-1 text-[var(--text)]">Welcome back</h1>
              <p className="text-[13px] text-[var(--text-2)]">Sign in to your workspace</p>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div className="mb-4">
                <label className="block text-[12px] text-[var(--text-2)] mb-1.5 font-semibold tracking-[0.2px]">Email</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6z" />
                    <path d="m22 6-10 7L2 6" />
                  </svg>
                  <input
                    className="w-full bg-[var(--bg-3)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-[10px] text-[var(--text)] font-[var(--font-body)] text-sm outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@agency.com"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="mb-4 relative">
                <label className="block text-[12px] text-[var(--text-2)] mb-1.5 font-semibold tracking-[0.2px]">Password</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    className="w-full bg-[var(--bg-3)] border border-[var(--border)] rounded-xl pl-9 pr-10 py-[10px] text-[var(--text)] font-[var(--font-body)] text-sm outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none text-[var(--text-3)] cursor-pointer flex items-center justify-center p-0.5 hover:text-[var(--text)]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
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
              </div>

              {error && (
                <div className="flex items-start gap-2 text-[13px] text-[var(--danger)] mb-4 px-3 py-2 border-l-2 border-[var(--danger)] bg-[var(--danger)]/10 rounded-r-md">
                  <svg className="mt-[1px] flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12.01" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group w-full flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer transition-all border-0 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)] hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader label="Signing in..." size="sm" variant="button" />
                ) : (
                  <>
                    Sign In
                    <svg className="transition-transform group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-[11px] text-[var(--text-3)] mt-5">Orbit — Internal use only</p>
      </div>
    </div>
  );
}