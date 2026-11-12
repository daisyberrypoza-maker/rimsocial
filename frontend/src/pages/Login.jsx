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

const USERNAME_MESSAGES = {
  checking: ['checking', 'Checking availability…'],
  ok: ['ok', 'Username is available'],
  taken: ['taken', 'That username is taken'],
  reserved: ['taken', 'That username is reserved'],
  invalid: ['invalid', 'Use 3–32 letters, numbers or underscores'],
};

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAppStore((s) => s.setSession);
  const googleButton = useRef(null);
  const [mode, setMode] = useState('login');
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
  const canRegister = form.email.includes('@') && form.displayName.trim() !== '' &&
    usernameStatus.state === 'ok' && form.password.length >= 8;

  function switchMode(next) {
    setMode(next); setError(''); setNotice(''); setShowPassword(false);
  }

  async function finishSession(data) {
    setSession(data.token, data.user);
    await loadAccount();
    // Every sign-in opens the default screen, Stories
    navigate('/stories', { replace: true });
  }

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    if (mode === 'register' ? !canRegister : !canLogin) return;
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

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleButton.current) return;
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
      window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', shape: 'rectangular', text: mode === 'register' ? 'signup_with' : 'continue_with', width: Math.min(350, googleButton.current.clientWidth || 350), logo_alignment: 'center' });
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
  }, [form.country, mode]);

  const passwordToggle = (
    form.password ? (
      <button className="ig-auth-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
        {showPassword ? 'Hide' : 'Show'}
      </button>
    ) : null
  );

  const usernameMessage = USERNAME_MESSAGES[usernameStatus.state];

  return (
    <main className="ig-auth">
      <section className="ig-auth-card" aria-label="RimSocial account">
        <h1 className="ig-auth-logo">RimSocial</h1>

        {mode === 'login' ? (
          <>
            <form className="ig-auth-form" onSubmit={submit}>
              <input aria-label="Username or email" autoComplete="username" autoCapitalize="none" placeholder="Username or email" value={form.username} onChange={field('username')} required maxLength={254} />
              <div className="ig-auth-field-wrap">
                <input aria-label="Password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" value={form.password} onChange={field('password')} required />
                {passwordToggle}
              </div>
              <button className="ig-auth-primary" type="submit" disabled={busy || !canLogin}>{busy ? 'Logging in…' : 'Log in'}</button>
            </form>

            <div className="ig-auth-divider"><span>OR</span></div>

            {GOOGLE_CLIENT_ID
              ? <div className="ig-auth-google-wrap"><div ref={googleButton} className="ig-auth-google-button" /></div>
              : <button type="button" className="ig-auth-google-unconfigured" onClick={() => setNotice('Google sign-in needs a Google OAuth Web client ID. Set VITE_GOOGLE_CLIENT_ID in frontend/.env.local and GOOGLE_CLIENT_ID in backend/.env, then restart both servers.')}><span className="ig-auth-g">G</span><span>Log in with Google</span></button>}
          </>
        ) : (
          <>
            <p className="ig-auth-subtitle">Sign up to see photos and videos from your friends.</p>
            <form className="ig-auth-form" onSubmit={submit}>
              <input aria-label="Email address" autoComplete="email" type="email" autoCapitalize="none" placeholder="Email address" value={form.email} onChange={field('email')} required />
              <input aria-label="Full name" autoComplete="name" placeholder="Full name" value={form.displayName} onChange={field('displayName')} required maxLength={64} />
              <input aria-label="Username" autoComplete="username" autoCapitalize="none" placeholder="Username" value={form.username} onChange={field('username')} required maxLength={32} />
              {usernameMessage && <p className={`ig-auth-status ig-auth-status-${usernameMessage[0]}`} role="status">{usernameMessage[1]}</p>}
              <div className="ig-auth-field-wrap">
                <input aria-label="Password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Password" value={form.password} onChange={field('password')} required minLength={8} />
                {passwordToggle}
              </div>
              {form.password && form.password.length < 8 && <p className="ig-auth-status ig-auth-status-hint">Password must be at least 8 characters</p>}
              <select aria-label="Country" value={form.country} onChange={field('country')} required>
                {COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
              </select>
              <p className="ig-auth-note">By signing up, you agree to our Terms and Privacy Policy. We use your information to create and secure your account.</p>
              <button className="ig-auth-primary" type="submit" disabled={busy || !canRegister}>{busy ? 'Please wait…' : 'Sign up'}</button>
            </form>

            <div className="ig-auth-divider"><span>OR</span></div>

            {GOOGLE_CLIENT_ID
              ? <div className="ig-auth-google-wrap"><div ref={googleButton} className="ig-auth-google-button" /></div>
              : <button type="button" className="ig-auth-google-unconfigured" onClick={() => setNotice('Google sign-in needs a Google OAuth Web client ID. Set VITE_GOOGLE_CLIENT_ID in frontend/.env.local and GOOGLE_CLIENT_ID in backend/.env, then restart both servers.')}><span className="ig-auth-g">G</span><span>Sign up with Google</span></button>}
          </>
        )}

        {notice && <p className="ig-auth-notice" role="status">{notice}</p>}
        {error && <p className="ig-auth-error" role="alert">{error}</p>}
      </section>

      <section className="ig-auth-switch" aria-label={mode === 'login' ? 'Sign up' : 'Log in'}>
        {mode === 'login' ? (
          <p>Don’t have an account? <button type="button" onClick={() => switchMode('register')}>Sign up</button></p>
        ) : (
          <p>Have an account? <button type="button" onClick={() => switchMode('login')}>Log in</button></p>
        )}
      </section>

      <p className="ig-auth-terms">By continuing, you agree to RimSocial’s Terms and Privacy Policy.</p>
    </main>
  );
}
