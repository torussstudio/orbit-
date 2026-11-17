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
  'w-full bg-white/60 border border-white/80 rounded-2xl pl-10 py-[9px] text-[#14163b] font-[var(--font-body)] text-[16px] placeholder:text-[#8b8fa8] outline-none shadow-[0_2px_10px_rgba(124,92,255,0.06)] transition-all focus:bg-white/80 focus:border-[#6366f1] focus:ring-4 focus:ring-[#6366f1]/15';

const LABEL_CLASS =
  'block text-[12px] text-[#14163b] mb-1 pl-1 font-semibold';

const PRIMARY_BUTTON_CLASS =
  'group w-full flex items-center justify-center gap-2 px-6 py-[11px] rounded-full text-[14px] font-semibold cursor-pointer transition-all border-0 bg-gradient-to-r from-[#4338ff] to-[#7c3aed] text-white shadow-[0_10px_24px_rgba(91,61,245,0.32)] hover:shadow-[0_14px_30px_rgba(91,61,245,0.45)] hover:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0';

const LINK_BUTTON_CLASS =
  'bg-transparent border-none p-0 text-[14px] font-semibold text-[#5b3df5] cursor-pointer hover:underline disabled:text-[#8b8fa8] disabled:no-underline disabled:cursor-default';

const HEADINGS = {
  login: { title: 'Welcome back', subtitle: 'Sign in to your workspace' },
  forgot: { title: 'Forgot password?', subtitle: "Enter your Orbit email and we'll send you a 6-digit code." },
  reset: { title: 'Set a new password', subtitle: 'Enter the code we sent and choose a new password.' },
};

function MailIcon() {
  return (
    <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-[#14163b]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6z" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-[#14163b]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-[#14163b]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="transition-transform group-hover:translate-x-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      className="absolute right-4 top-1/2 -translate-y-1/2 bg-transparent border-none text-[#6b6f8a] cursor-pointer flex items-center justify-center p-0.5 hover:text-[#14163b] max-[640px]:after:absolute max-[640px]:after:-inset-3 max-[640px]:after:content-['']"
      aria-label={shown ? 'Hide password' : 'Show password'}
    >
      {!shown ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

/* ------------------------------------------------------------------ */
/* Decorative background: glass rings, cubes and orbit lines           */
/* ------------------------------------------------------------------ */

function GlassRing({ id, className }) {
  return (
    <svg className={className} viewBox="0 0 440 440" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" stopOpacity="0.85" />
          <stop offset="0.55" stopColor="#a78bfa" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ddd6fe" stopOpacity="0.35" />
        </linearGradient>
        <filter id={`${id}-b`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <g transform="rotate(-28 220 220)">
        <ellipse cx="220" cy="220" rx="170" ry="92" stroke={`url(#${id}-a)`} strokeWidth="52" filter={`url(#${id}-b)`} />
        <ellipse cx="220" cy="204" rx="170" ry="92" stroke="#fff" strokeOpacity="0.28" strokeWidth="3" />
      </g>
    </svg>
  );
}

function GlassCube({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M32 6l22 12.5L32 31 10 18.5z" fill="#fff" fillOpacity="0.55" />
      <path d="M10 18.5L32 31v27L10 45.5z" fill="#a78bfa" fillOpacity="0.38" />
      <path d="M54 18.5L32 31v27l22-12.5z" fill="#7c3aed" fillOpacity="0.28" />
      <path d="M32 6l22 12.5v27L32 58 10 45.5v-27zM10 18.5L32 31l22-12.5M32 31v27" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const ART_CSS = `
@keyframes orbit-ring-a { 0%,100% { transform: translate(0,0) rotate(0deg); } 50% { transform: translate(26px,-22px) rotate(9deg); } }
@keyframes orbit-ring-b { 0%,100% { transform: translate(0,0) rotate(0deg); } 50% { transform: translate(-24px,20px) rotate(-8deg); } }
@keyframes orbit-cube-a { 0%,100% { transform: translateY(0) rotate(12deg); } 50% { transform: translateY(-18px) rotate(32deg); } }
@keyframes orbit-cube-b { 0%,100% { transform: translateY(0) rotate(-12deg); } 50% { transform: translateY(16px) rotate(-34deg); } }
@keyframes orbit-flow { to { stroke-dashoffset: -240; } }
@keyframes orbit-glow { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity: .9; } 50% { transform: translate(-50%,-50%) scale(1.18); opacity: 1; } }
.orbit-ring-a { animation: orbit-ring-a 20s ease-in-out infinite; }
.orbit-ring-b { animation: orbit-ring-b 24s ease-in-out infinite; }
.orbit-cube-a { animation: orbit-cube-a 7s ease-in-out infinite; }
.orbit-cube-b { animation: orbit-cube-b 8.5s ease-in-out infinite; }
.orbit-flow { stroke-dasharray: 5 9; animation: orbit-flow 30s linear infinite; }
.orbit-glow { animation: orbit-glow 9s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .orbit-ring-a, .orbit-ring-b, .orbit-cube-a, .orbit-cube-b, .orbit-flow, .orbit-glow { animation: none; }
}
`;

function BackgroundArt() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <style>{ART_CSS}</style>

      {/* soft glow behind the card */}
      <div className="orbit-glow absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8b5cf6]/20 blur-3xl" />

      {/* thin orbit lines */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="none" fill="none">
        <g className="orbit-flow" stroke="#7c3aed" strokeOpacity="0.32" strokeWidth="1" vectorEffect="non-scaling-stroke">
          <path d="M0 540 C200 520 350 390 500 335" vectorEffect="non-scaling-stroke" />
          <path d="M600 0 C610 40 590 90 560 125" vectorEffect="non-scaling-stroke" />
          <path d="M1000 250 C870 262 790 320 700 385" vectorEffect="non-scaling-stroke" />
          <path d="M300 600 C520 575 720 505 820 455" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>

      {/* big glass rings */}
      <GlassRing id="ring-bl" className="orbit-ring-a absolute -bottom-40 -left-44 w-[420px] sm:w-[620px] opacity-90" />
      <GlassRing id="ring-tr" className="orbit-ring-b absolute -top-36 -right-40 w-[340px] sm:w-[520px] opacity-80" />

      {/* floating cubes */}
      <GlassCube className="orbit-cube-a absolute left-[22%] top-[20%] hidden h-14 w-14 drop-shadow-[0_8px_16px_rgba(124,58,237,0.25)] md:block" />
      <GlassCube className="orbit-cube-b absolute right-[18%] top-[62%] hidden h-14 w-14 drop-shadow-[0_8px_16px_rgba(124,58,237,0.25)] md:block" />
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
  const [trustDevice, setTrustDevice] = useState(false);

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
      await login(email, password, trustDevice);
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
    <div className="relative min-h-screen min-h-[100dvh] overflow-hidden bg-[linear-gradient(135deg,#faf9ff_0%,#ece8ff_45%,#ddd6fe_100%)]">
      <BackgroundArt />

      <div className="relative flex min-h-screen min-h-[100dvh] items-center justify-center p-3">
        <div className="relative w-full max-w-[380px] my-auto">
          <div className="rounded-[24px] border border-white/70 bg-white/45 px-5 pb-6 pt-6 shadow-[0_24px_60px_rgba(124,92,255,0.22)] backdrop-blur-2xl">

            {/* Brand */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-[48px] w-[48px] items-center justify-center rounded-[14px] border border-white/80 bg-white/60 shadow-[0_8px_20px_rgba(124,92,255,0.25)] backdrop-blur">
                <img src="/assets/images/orbit-logo-transparent.png" alt="Orbit" className="h-[26px] w-[26px] object-contain" />
              </div>
              <div className="mt-3 flex items-center gap-2 text-[15px] leading-none">
                <span className="font-bold tracking-[-0.02em] text-[#14163b]">Orbit</span>
                <span className="h-4 w-px bg-[#6b6f8a]/60" />
                <span className="font-normal text-[#6b6f8a]">Agency OS</span>
              </div>
            </div>

            {/* Heading */}
            <div className="mb-4 mt-4 text-center">
              <h1 className={`mb-2 font-extrabold leading-[1.1] tracking-[-0.03em] text-[#14163b] ${mode === 'login' ? 'text-[22px]' : 'text-[19px]'}`}>{heading.title}</h1>
              <p className="text-[13px] font-medium text-[#6b6f8a]">{heading.subtitle}</p>
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
                  <div className="mb-5">
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
                        placeholder="Enter your email address"
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="mb-6 relative">
                    <div className="flex items-center justify-between mb-2">
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
                        placeholder="Enter your password"
                        required
                      />
                      <EyeToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none" htmlFor="login-trust-device">
                    <input
                      id="login-trust-device"
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--accent,#6366f1)]"
                      checked={trustDevice}
                      onChange={e => setTrustDevice(e.target.checked)}
                    />
                    <span className="text-[13px] leading-snug text-[color:var(--text-2,#475569)]">
                      Trust this device
                      <span className="block text-xs text-[color:var(--text-3,#94a3b8)]">
                        Stay signed in until you log out. Use only on your own device.
                      </span>
                    </span>
                  </label>

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
                      placeholder="Enter your email address"
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

          <p className="mt-5 text-center text-[12px] text-[#6b6f8a]">Orbit — Internal use only</p>
        </div>
      </div>
    </div>
  );
}
