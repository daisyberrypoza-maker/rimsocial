import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadAccount } from '../account.js';
import Icon from '../components/Icon.jsx';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(' ');
const countryNames = new Intl.DisplayNames([typeof navigator !== 'undefined' ? navigator.language : 'en'], { type: 'region' });
const COUNTRIES = COUNTRY_CODES.map((code) => ({ code, name: countryNames.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name));


export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAppStore((s) => s.setSession);
  const googleButton = useRef(null);
  const [mode, setMode] = useState('login');
  const [registerStep, setRegisterStep] = useState(0);
  const [form, setForm] = useState({ username: '', password: '', email: '', displayName: '', country: 'NG' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function finishSession(data) {
    setSession(data.token, data.user);
    await loadAccount();
    const requestedPath = location.state?.from;
    navigate(typeof requestedPath === 'string' && requestedPath.startsWith('/') ? requestedPath : '/', { replace: true });
  }

  async function submit(e) {
    e?.preventDefault();
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
      window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', shape: 'pill', text: mode === 'register' ? 'signup_with' : 'continue_with', width: Math.min(340, googleButton.current.clientWidth || 340), logo_alignment: 'left' });
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

    const registerSteps = [
    { title: 'What should we call you?', subtitle: 'Start with the name your friends will see.', field: 'displayName' },
    { title: 'What’s your email?', subtitle: 'Use an email address you can access.', field: 'email' },
    { title: 'Choose your username', subtitle: 'Make it easy for friends to find you.', field: 'username' },
    { title: 'Create a password', subtitle: 'Use at least 8 characters to keep your account secure.', field: 'password' },
    { title: 'Where are you from?', subtitle: 'Choose your country to finish setting up your account.', field: 'country' },
  ];
  const currentStep = registerSteps[registerStep];
  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && registerStep < registerSteps.length - 1) {
      setRegisterStep((step) => Math.min(step + 1, registerSteps.length - 1));
      return;
    }
    submit(e);
  };
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-label="RimSocial account">
        <div className="auth-brand-row">
          <div className="snap-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M24 5c-6.2 0-10.4 4.4-10.4 11.2 0 2.3.4 4.4.7 6.2-1.3.9-3.1 1.3-4.5-.4-.9-.5-1.8-.2-2.1.8-.3 1.1.8 2.2 2.5 2.7 1.5.4 2.4.7 3 1.7-1.6 3.7-4.6 5.5-8 6.5-1.1.3-1.2 1.8.1 2.2 1.9.6 4.1.7 5.6 1.9 1 .8 1.3 2.2 2.9 2.4 2.4.3 4.8-1.3 7.5-1.3h5.4c2.7 0 5.1 1.6 7.5 1.3 1.6-.2 1.9-1.6 2.9-2.4 1.5-1.2 3.7-1.3 5.6-1.9 1.3-.4 1.2-1.9.1-2.2-3.4-1-6.4-2.8-8-6.5.6-1 1.5-1.3 3-1.7 1.7-.5 2.8-1.6 2.5-2.7-.3-1-1.2-1.3-2.1-.8-1.4.8-3.2 1.3-4.5.4.3-1.8.7-3.9.7-6.2C34.4 9.4 30.2 5 24 5Z" fill="currentColor"/></svg></div>
          <span className="auth-brand">RimSocial</span>
        </div>
        {mode === 'login' ? (
          <>
            <div className="auth-intro"><p className="auth-eyebrow">YOUR PEOPLE. YOUR MOMENTS.</p><h1>Welcome back</h1><p>Log in to see what your friends are sharing.</p></div>
            <div className="auth-mode-switch" role="tablist" aria-label="Account action">
              <button type="button" role="tab" aria-selected="true" className="selected">Log in</button>
              <button type="button" role="tab" aria-selected="false" onClick={() => { setMode('register'); setRegisterStep(0); setError(''); setNotice(''); }}>Sign up</button>
            </div>
            <form className="auth-form" onSubmit={submit}>
              <label>Username<input autoComplete="username" placeholder="Your username" value={form.username} onChange={field('username')} required minLength={3} maxLength={32} /></label>
              <label>Password<div className="auth-password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Your password" value={form.password} onChange={field('password')} required minLength={8} /><button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}><Icon name={showPassword ? 'eye-off' : 'eye'} size={22} /></button></div></label>
              <button className="auth-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Log in'}</button>
            </form>
            <div className="auth-divider"><span>or continue with</span></div>
            {GOOGLE_CLIENT_ID ? <div className="google-signin-wrap"><div ref={googleButton} className="google-signin-button" /></div> : <button type="button" className="google-unconfigured" onClick={() => setNotice('Google sign-in needs a Google OAuth Web client ID. Set VITE_GOOGLE_CLIENT_ID in frontend/.env.local and GOOGLE_CLIENT_ID in backend/.env, then restart both servers.')}><span className="google-g">G</span><span>Continue with Google</span></button>}
          </>
        ) : (
          <>
            <div className="auth-step-meta"><button type="button" className="auth-back" onClick={() => { if (registerStep === 0) { setMode('login'); } else { setRegisterStep((step) => step - 1); } setError(''); }} aria-label="Go back"><Icon name="arrow-left" size={32} strokeWidth={2.5} /></button><span aria-hidden="true"></span><button type="button" className="auth-cancel" onClick={() => { setMode('login'); setError(''); }}>Log in</button></div>
            <div className="auth-progress" aria-label={`Step ${registerStep + 1} of ${registerSteps.length}`}><span style={{ width: `${((registerStep + 1) / registerSteps.length) * 100}%` }} /></div>
            <div className="auth-intro auth-step-intro"><p className="auth-eyebrow">LET’S GET YOU SET UP</p><h1>{currentStep.title}</h1><p className="auth-step-description">{currentStep.subtitle}</p></div>
            <form className="auth-form auth-step-form" onSubmit={handleSubmit}>
              {registerStep === 0 && <label>Display name<input autoFocus autoComplete="name" placeholder="Your name" value={form.displayName} onChange={field('displayName')} required maxLength={64} /></label>}
              {registerStep === 1 && <label>Email address<input autoFocus type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={field('email')} required /></label>}
              {registerStep === 2 && <label>Username<input autoFocus autoComplete="username" placeholder="Choose a username" value={form.username} onChange={field('username')} required minLength={3} maxLength={32} pattern="[A-Za-z0-9._]+" title="Use letters, numbers, dots or underscores." /></label>}
              {registerStep === 3 && <label>Password<div className="auth-password-field"><input autoFocus type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" value={form.password} onChange={field('password')} required minLength={8} /><button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}><Icon name={showPassword ? 'eye-off' : 'eye'} size={22} /></button></div></label>}
              {registerStep === 4 && <label>Country<select autoFocus value={form.country} onChange={field('country')} required>{COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>}
              <button className="auth-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : registerStep === registerSteps.length - 1 ? 'Create account' : 'Continue'} <span aria-hidden="true">→</span></button>
            </form>
            <p className="auth-step-footnote">You can go back at any time to change your details.</p>
          </>
        )}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <p className="auth-terms">By continuing, you agree to RimSocial’s Terms and Privacy Policy.</p>
      </section>
      <p className="auth-footer">A little more fun, a little more you. <span>●</span></p>
    </main>
  );
}
