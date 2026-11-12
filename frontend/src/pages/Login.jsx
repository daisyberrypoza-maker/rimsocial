import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadAccount } from '../account.js';
import './Login.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;
const COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(' ');
const countryNames = new Intl.DisplayNames([typeof navigator !== 'undefined' ? navigator.language : 'en'], { type: 'region' });
const COUNTRIES = COUNTRY_CODES.map((code) => ({ code, name: countryNames.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name));

// One question per screen, like Instagram's sign-up flow.
const STEPS = [
  { key: 'email', title: 'What’s your email?', hint: 'You’ll use this to log in and secure your account.' },
  { key: 'name', title: 'What’s your name?', hint: 'Add the name people will see on your profile.' },
  { key: 'username', title: 'Choose a username', hint: 'You can change it later.' },
  { key: 'password', title: 'Create a password', hint: 'Use at least 8 characters.' },
  { key: 'country', title: 'Where are you?', hint: 'This sets your country for payments and content.' },
];

const USERNAME_MESSAGES = {
  checking: ['checking', 'Checking availability…'],
  ok: ['ok', 'Username is available'],
  taken: ['taken', 'That username is taken'],
  reserved: ['taken', 'That username is reserved'],
  invalid: ['invalid', 'Use 3–32 letters, numbers or underscores'],
};

const GOOGLE_NOTICE = 'Google sign-in needs a Google OAuth Web client ID. Set VITE_GOOGLE_CLIENT_ID in frontend/.env.local and GOOGLE_CLIENT_ID in backend/.env, then restart both servers.';

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAppStore((s) => s.setSession);
  const googleButton = useRef(null);
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ username: '', password: '', email: '', displayName: '', country: 'NG' });
  const [usernameStatus, setUsernameStatus] = useState({ state: 'idle' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Live username feedback on sign-up, debounced so we do not query on every keystroke.
  useEffect(() => {
    if (mode !== 'register') return undefined;
    const candidate = form.username.trim();
    if (!candidate) { setUsernameStatus({ state: 'idle' }); return undefined; }
    if (!USERNAME_RE.test(candidate)) { setUsernameStatus({ state: 'invalid' }); return undefined; }
    if (candidate.toLowerCase() === 'me') { setUsernameStatus({ state: 'reserved' }); return undefined; }
    setUsernameStatus({ state: 'checking' });
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/v1/auth/username-available?username=${encodeURIComponent(candidate)}`);
        if (stale) return;
        setUsernameStatus(data.available ? { state: 'ok' } : { state: data.reason === 'reserved' ? 'reserved' : 'taken' });
      } catch {
        if (!stale) setUsernameStatus({ state: 'idle' });
      }
    }, 400);
    return () => { stale = true; clearTimeout(timer); };
  }, [form.username, mode]);

  const canLogin = form.username.trim() !== '' && form.password !== '';
  const stepValid = [
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()),
    form.displayName.trim() !== '' && form.displayName.trim().length <= 64,
    usernameStatus.state === 'ok',
    form.password.length >= 8,
    /^[A-Z]{2}$/.test(form.country),
  ][step];

  function switchMode(next) {
    setMode(next); setStep(0); setError(''); setNotice(''); setShowPassword(false);
  }

  function goBack() {
    setError('');
    if (mode === 'register' && step > 0) setStep(step - 1);
    else switchMode('login');
  }

  async function finishSession(data) {
    setSession(data.token, data.user);
    await loadAccount();
    // Every sign-in opens the default screen, Stories
    navigate('/stories', { replace: true });
  }

  async function submit() {
    if (busy) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const payload = mode === 'register'
        ? { username: form.username.trim(), password: form.password, email: form.email.trim(), displayName: form.displayName.trim(), country: form.country.trim().toUpperCase() }
        : { username: form.username.trim(), password: form.password };
      const data = await api(`/v1/auth/${mode}`, { method: 'POST', body: payload });
      await finishSession(data);
    } catch (err) { setError(err.message || 'We could not sign you in. Please try again.'); }
    finally { setBusy(false); }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (mode === 'login') { if (canLogin) submit(); return; }
    if (!stepValid) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  }

  const showGoogle = mode === 'login' || step === 0;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleButton.current || !showGoogle) return;
    let cancelled = false;
    const renderGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButton.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          setError(''); setNotice(''); setBusy(true);
          try {
            const data = await api('/v1/auth/google', { method: 'POST', body: { credential: response.credential, country: form.country } });
            await finishSession(data);
          } catch (err) { setError(err.message || 'Google sign-in failed.'); }
          finally { setBusy(false); }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      googleButton.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', shape: 'pill', text: mode === 'register' ? 'signup_with' : 'continue_with', width: Math.min(400, googleButton.current.clientWidth || 400), logo_alignment: 'center' });
    };
    if (window.google?.accounts?.id) renderGoogleButton();
    else {
      let script = document.querySelector('script[data-google-identity]');
      if (!script) {
        script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; script.dataset.googleIdentity = 'true'; document.head.appendChild(script);
      }
      script.addEventListener('load', renderGoogleButton, { once: true });
    }
    return () => { cancelled = true; };
  }, [form.country, mode, showGoogle]);

  const passwordToggle = (
    form.password ? (
      <button className="ig-auth-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
        {showPassword ? 'Hide' : 'Show'}
      </button>
    ) : null
  );

  const usernameMessage = USERNAME_MESSAGES[usernameStatus.state];
  const current = STEPS[step];

  const googleBlock = GOOGLE_CLIENT_ID
    ? <div className="ig-auth-google-wrap"><div ref={googleButton} className="ig-auth-google-button" /></div>
    : <button type="button" className="ig-auth-secondary" onClick={() => setNotice(GOOGLE_NOTICE)}>
        <span className="ig-auth-g">G</span><span>{mode === 'login' ? 'Log in with Google' : 'Sign up with Google'}</span>
      </button>;

  return (
    <main className="ig-auth">
      <header className="ig-auth-topbar">
        <button className="ig-auth-back" type="button" onClick={goBack} aria-label="Back">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </header>

      <section className="ig-auth-body" aria-label="RimSocial account">
        {mode === 'login' ? (
          <>
            <img className="ig-auth-logo" src="/icons/rimsocial.svg" alt="RimSocial" />
            <form className="ig-auth-form" onSubmit={handleSubmit}>
              <input aria-label="Username or email" autoComplete="username" autoCapitalize="none" placeholder="Username or email" value={form.username} onChange={field('username')} required maxLength={254} />
              <div className="ig-auth-field-wrap">
                <input aria-label="Password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" value={form.password} onChange={field('password')} required />
                {passwordToggle}
              </div>
              <button className="ig-auth-primary" type="submit" disabled={busy || !canLogin}>{busy ? 'Logging in…' : 'Log in'}</button>
            </form>
            <button className="ig-auth-link" type="button" onClick={() => setNotice('Password reset is not set up yet. Please contact RimSocial support.')}>Forgot password?</button>
            <div className="ig-auth-divider"><span>OR</span></div>
            {googleBlock}
            <button className="ig-auth-outline" type="button" onClick={() => switchMode('register')}>Create new account</button>
          </>
        ) : (
          <>
            <h1 className="ig-auth-step-title">{current.title}</h1>
            <p className="ig-auth-step-hint">{current.hint}</p>
            <form className="ig-auth-form" onSubmit={handleSubmit}>
              {current.key === 'email' && (
                <input aria-label="Email address" autoFocus autoComplete="email" type="email" autoCapitalize="none" placeholder="Email address" value={form.email} onChange={field('email')} required />
              )}
              {current.key === 'name' && (
                <input aria-label="Full name" autoFocus autoComplete="name" placeholder="Full name" value={form.displayName} onChange={field('displayName')} required maxLength={64} />
              )}
              {current.key === 'username' && (
                <>
                  <input aria-label="Username" autoFocus autoComplete="username" autoCapitalize="none" placeholder="Username" value={form.username} onChange={field('username')} required maxLength={32} />
                  {usernameMessage && <p className={`ig-auth-status ig-auth-status-${usernameMessage[0]}`} role="status">{usernameMessage[1]}</p>}
                </>
              )}
              {current.key === 'password' && (
                <>
                  <div className="ig-auth-field-wrap">
                    <input aria-label="Password" autoFocus type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Password" value={form.password} onChange={field('password')} required minLength={8} />
                    {passwordToggle}
                  </div>
                  {form.password.length > 0 && form.password.length < 8 && <p className="ig-auth-status ig-auth-status-hint">Password must be at least 8 characters</p>}
                </>
              )}
              {current.key === 'country' && (
                <select aria-label="Country" autoFocus value={form.country} onChange={field('country')} required>
                  {COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
                </select>
              )}
              <button className="ig-auth-primary" type="submit" disabled={busy || !stepValid}>
                {busy ? 'Please wait…' : step === STEPS.length - 1 ? 'Sign up' : 'Next'}
              </button>
            </form>
            {step === 0 && (
              <>
                <div className="ig-auth-divider"><span>OR</span></div>
                {googleBlock}
              </>
            )}
            {step === STEPS.length - 1 && (
              <p className="ig-auth-note">By signing up, you agree to RimSocial’s Terms and Privacy Policy. We use your information to create and secure your account.</p>
            )}
            <button className="ig-auth-link ig-auth-link-blue" type="button" onClick={() => switchMode('login')}>I already have an account</button>
          </>
        )}

        {notice && <p className="ig-auth-notice" role="status">{notice}</p>}
        {error && <p className="ig-auth-error" role="alert">{error}</p>}
      </section>

      <footer className="ig-auth-footer">
        <span className="ig-auth-meta-logo" aria-label="Meta">
          <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true"><path d="M5.2 0C2.4 0 .6 2.8.6 7s1.8 7 4.6 7c1.9 0 3.2-1.5 5.2-4.8.9-1.5 1.7-2.7 2.7-3.3C12.2 2.6 10.5 0 8.2 0c-1 0-1.6.5-2.3 1.4C4.8 2.6 4 4.4 3.5 6c.5-1.9 1.4-3.9 2.5-5C6.5.4 7.2 0 8.2 0M14.8 14c2.8 0 4.6-2.8 4.6-7S17.6 0 14.8 0c-1.9 0-3.2 1.5-5.2 4.8-.9 1.5-1.7 2.7-2.7 3.3.9 1.2 2.6 3.9 4.9 3.9 1 0 1.6-.5 2.3-1.4 1-1.3 1.8-3 2.4-4.6-.5 1.9-1.4 3.9-2.5 5-.8.9-1.5 1.4-2.5 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          <span>Meta</span>
        </span>
      </footer>
    </main>
  );
}
