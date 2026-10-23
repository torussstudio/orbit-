import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLogoutNotice, clearLogoutNotice } from '../api/tokenStore';
import api from '../api/client';
import Loader from '../components/ui/Loader';

// Seconds before "Resend code" can be used again. The server has the same
// 60 s gap per email, so a faster resend would be ignored anyway.
const RESEND_SECONDS = 60;

const INPUT_CLASS =
  'w-full bg-[var(--bg-3)] border border-[var(--border)] rounded-xl pl-9 py-[10px] text-[var(--text)] font-[var(--font-body)] text-sm outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25';

const LABEL_CLASS =
  'block text-[12px] text-[var(--text-2)] mb-1.5 font-semibold tracking-[0.2px]';

const PRIMARY_BUTTON_CLASS =
  'group w-full flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer transition-all border-0 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)] hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)] disabled:opacity-70 disabled:cursor-not-allowed';

const LINK_BUTTON_CLASS =
  'bg-transparent border-none p-0 text-[12px] font-semibold text-[var(--accent)] cursor-pointer hover:underline disabled:text-[var(--text-3)] disabled:no-underline disabled:cursor-default';

const HEADINGS = {
  login: { title: 'Welcome back', subtitle: 'Sign in to your workspace' },
  forgot: { title: 'Forgot password?', subtitle: "Enter your Orbit email and we'll send you a 6-digit code." },
  reset: { title: 'Set a new password', subtitle: 'Enter the code we sent and choose a new password.' },
};

function MailIcon() {
  return (
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6z" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="transition-transform group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function EyeToggle({ shown, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none text-[var(--text-3)] cursor-pointer flex items-center justify-center p-0.5 hover:text-[var(--text)] max-[640px]:after:absolute max-[640px]:after:-inset-3 max-[640px]:after:content-['']"
      aria-label={shown ? 'Hide password' : 'Show password'}
    >
      {shown ? (
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
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 text-[13px] text-[var(--danger)] mb-4 px-3 py-2 border-l-2 border-[var(--danger)] bg-[var(--danger)]/10 rounded-r-md">
      <svg className="mt-[1px] flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12.01" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function InfoBox({ children, tone = 'accent' }) {
  const color = tone === 'success' ? 'var(--success)' : 'var(--accent)';
  return (
    <div
      role="status"
      className="flex items-start gap-2 text-[13px] text-[var(--text)] mb-4 px-3 py-2 border-l-2 rounded-r-md"
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      {tone === 'success' ? (
        <svg className="mt-[1px] flex-shrink-0" style={{ color }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="8 12.5 11 15.5 16 9.5" />
        </svg>
      ) : (
        <svg className="mt-[1px] flex-shrink-0" style={{ color }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <line x1="12.01" y1="8" x2="12.01" y2="8" />
        </svg>
      )}
      <span>{children}</span>
    </div>
  );
}

function errorText(err, fallback) {
  if (!err?.response) return 'Network error. Please check your connection.';
  return err.response.data?.error || fallback;
}

export default function Login() {
  // login | forgot (ask for the email) | reset (code + new password)
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [codeNotice, setCodeNotice] = useState('');
  const [passwordReset, setPasswordReset] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Set by the API client when this tab's session was ended from another
  // device (never for normal expiry or the member's own logout). It is
  // cleared on the next successful sign-in, not when this screen opens: the
  // sign-out reloads the page on its way here, and clearing on open could
  // lose the message before the member sees it.
  const [signedOutElsewhere] = useState(() => getLogoutNotice() === 'revoked');

  // "Resend code" countdown.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const goTo = next => {
    setError('');
    setMode(next);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      clearLogoutNotice();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  const sendCode = async () => {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() }, { silent: true });
      setCodeNotice(data?.message || "If this email has an Orbit account, we've sent a 6-digit code to it.");
      setResendIn(RESEND_SECONDS);
      setCode('');
      setMode('reset');
    } catch (err) {
      setError(errorText(err, 'Could not send the code. Try again.'));
    } finally { setLoading(false); }
  };

  const handleForgotSubmit = e => {
    e.preventDefault();
    sendCode();
  };

  const handleResetSubmit = async e => {
    e.preventDefault();
    setError('');

    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await api.post(
        '/auth/reset-password',
        { email: email.trim(), code, password: newPassword },
        { silent: true },
      );
      setPassword('');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordReset(true);
      goTo('login');
    } catch (err) {
      setError(errorText(err, 'Could not reset the password. Try again.'));
    } finally { setLoading(false); }
  };

  const heading = HEADINGS[mode];

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
              <h1 className="text-[19px] font-semibold mb-1 text-[var(--text)]">{heading.title}</h1>
              <p className="text-[13px] text-[var(--text-2)]">{heading.subtitle}</p>
            </div>

            {mode === 'login' && (
              <>
                {passwordReset ? (
                  <InfoBox tone="success">Password changed. Sign in with your new password.</InfoBox>
                ) : signedOutElsewhere && (
                  <InfoBox>You were signed out from another device.</InfoBox>
                )}

                <form onSubmit={handleSubmit}>
                  {/* Email */}
                  <div className="mb-4">
                    <label htmlFor="login-email" className={LABEL_CLASS}>Email</label>
                    <div className="relative">
                      <MailIcon />
                      <input
                        id="login-email"
                        className={`${INPUT_CLASS} pr-3`}
                        type="email"
                        autoComplete="username"
                        autoFocus={!passwordReset}
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@agency.com"
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="mb-4 relative">
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="login-password" className={`${LABEL_CLASS} !mb-0`}>Password</label>
                      <button type="button" className={LINK_BUTTON_CLASS} onClick={() => goTo('forgot')}>
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <LockIcon />
                      <input
                        id="login-password"
                        className={`${INPUT_CLASS} pr-10`}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        autoFocus={passwordReset}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                      <EyeToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
                  </div>

                  <ErrorBox message={error} />

                  <button type="submit" disabled={loading} className={PRIMARY_BUTTON_CLASS}>
                    {loading ? (
                      <Loader label="Signing in..." size="sm" variant="button" />
                    ) : (
                      <>Sign In<ArrowIcon /></>
                    )}
                  </button>
                </form>
              </>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgotSubmit}>
                <div className="mb-4">
                  <label htmlFor="forgot-email" className={LABEL_CLASS}>Email</label>
                  <div className="relative">
                    <MailIcon />
                    <input
                      id="forgot-email"
                      className={`${INPUT_CLASS} pr-3`}
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

                <ErrorBox message={error} />

                <button type="submit" disabled={loading} className={PRIMARY_BUTTON_CLASS}>
                  {loading ? (
                    <Loader label="Sending..." size="sm" variant="button" />
                  ) : (
                    <>Send code<ArrowIcon /></>
                  )}
                </button>

                <div className="text-center mt-4">
                  <button type="button" className={LINK_BUTTON_CLASS} onClick={() => goTo('login')}>
                    ← Back to sign in
                  </button>
                </div>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleResetSubmit}>
                {codeNotice && (
                  <InfoBox>
                    {codeNotice} Check your inbox, and Orbit notifications on a device where you're still signed in.
                  </InfoBox>
                )}

                <div className="flex items-center justify-between text-[12px] text-[var(--text-2)] mb-4 gap-2">
                  <span className="truncate">Email: <b className="text-[var(--text)]">{email.trim()}</b></span>
                  <button type="button" className={`${LINK_BUTTON_CLASS} flex-shrink-0`} onClick={() => goTo('forgot')}>
                    Change
                  </button>
                </div>

                {/* Code */}
                <div className="mb-4">
                  <label htmlFor="reset-code" className={LABEL_CLASS}>6-digit code</label>
                  <div className="relative">
                    <KeyIcon />
                    <input
                      id="reset-code"
                      className={`${INPUT_CLASS} pr-3 font-mono tracking-[6px] text-[16px]`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      maxLength={6}
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      required
                    />
                  </div>
                </div>

                {/* New password */}
                <div className="mb-4">
                  <label htmlFor="reset-password" className={LABEL_CLASS}>New password</label>
                  <div className="relative">
                    <LockIcon />
                    <input
                      id="reset-password"
                      className={`${INPUT_CLASS} pr-10`}
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                    />
                    <EyeToggle shown={showNewPassword} onToggle={() => setShowNewPassword(!showNewPassword)} />
                  </div>
                </div>

                {/* Confirm */}
                <div className="mb-4">
                  <label htmlFor="reset-confirm" className={LABEL_CLASS}>Confirm new password</label>
                  <div className="relative">
                    <LockIcon />
                    <input
                      id="reset-confirm"
                      className={`${INPUT_CLASS} pr-3`}
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Type it again"
                      required
                    />
                  </div>
                </div>

                <ErrorBox message={error} />

                <button type="submit" disabled={loading} className={PRIMARY_BUTTON_CLASS}>
                  {loading ? (
                    <Loader label="Saving..." size="sm" variant="button" />
                  ) : (
                    <>Set new password<ArrowIcon /></>
                  )}
                </button>

                <div className="flex items-center justify-between mt-4 gap-2">
                  <button type="button" className={LINK_BUTTON_CLASS} onClick={() => goTo('login')}>
                    ← Back to sign in
                  </button>
                  <button
                    type="button"
                    className={LINK_BUTTON_CLASS}
                    disabled={resendIn > 0 || loading}
                    onClick={sendCode}
                  >
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                  </button>
                </div>

                <p className="text-[11.5px] text-[var(--text-3)] mt-4 text-center">
                  Didn't get a code? Ask your Orbit admin to reset your password.
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-[var(--text-3)] mt-5">Orbit — Internal use only</p>
      </div>
    </div>
  );
}
