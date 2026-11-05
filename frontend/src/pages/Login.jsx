import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadAccount } from '../account.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAppStore((s) => s.setSession);
  const googleButton = useRef(null);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', email: '', displayName: '', country: 'NG' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function finishSession(data) {
    setSession(data.token, data.user);
    await loadAccount();
    navigate('/', { replace: true });
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
      window.google.accounts.id.renderButton(googleButton.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: mode === 'register' ? 'signup_with' : 'continue_with', width: Math.min(340, googleButton.current.clientWidth || 340), logo_alignment: 'left' });
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
  }, [mode, form.country]);

  return (
    <main className="auth-screen">
      <div className="auth-glow auth-glow-one" /><div className="auth-glow auth-glow-two" />
      <section className="auth-card" aria-label="Clipverse account">
        <div className="auth-brand-row"><div className="snap-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M24 5c-6.2 0-10.4 4.4-10.4 11.2 0 2.3.4 4.4.7 6.2-1.3.9-3.1.4-4.5-.4-.9-.5-1.8-.2-2.1.8-.3 1.1.8 2.2 2.5 2.7 1.5.4 2.4.7 3 1.7-1.6 3.7-4.6 5.5-8 6.5-1.1.3-1.2 1.8.1 2.2 1.9.6 4.1.7 5.6 1.9 1 .8 1.3 2.2 2.9 2.4 2.4.3 4.8-1.3 7.5-1.3h5.4c2.7 0 5.1 1.6 7.5 1.3 1.6-.2 1.9-1.6 2.9-2.4 1.5-1.2 3.7-1.3 5.6-1.9 1.3-.4 1.2-1.9.1-2.2-3.4-1-6.4-2.8-8-6.5.6-1 1.5-1.3 3-1.7 1.7-.5 2.8-1.6 2.5-2.7-.3-1-1.2-1.3-2.1-.8-1.4.8-3.2 1.3-4.5.4.3-1.8.7-3.9.7-6.2C34.4 9.4 30.2 5 24 5Z" fill="currentColor"/></svg></div><span className="auth-brand">clipverse</span></div>
        <div className="auth-intro"><p className="auth-eyebrow">YOUR PEOPLE. YOUR MOMENTS.</p><h1>{mode === 'login' ? 'Welcome back' : 'Join the fun'}</h1><p>{mode === 'login' ? 'Sign in to see what your friends are sharing.' : 'Create an account and share your world.'}</p></div>
        <div className="auth-mode-switch" role="tablist" aria-label="Account action"><button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); }}>Log in</button><button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError(''); }}>Sign up</button></div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && <><label>Display name<input autoComplete="name" placeholder="How should we call you?" value={form.displayName} onChange={field('displayName')} required maxLength={64} /></label><label>Email address<input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={field('email')} required /></label></>}
          <label>Username<input autoComplete="username" placeholder="Your username" value={form.username} onChange={field('username')} required minLength={3} maxLength={32} /></label>
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'} value={form.password} onChange={field('password')} required minLength={8} /></label>
          {mode === 'register' && <label>Country<select value={form.country} onChange={field('country')}><option value="NG">Nigeria</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="GH">Ghana</option><option value="ZA">South Africa</option><option value="CA">Canada</option><option value="IN">India</option></select></label>}
          <button className="auth-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'} <span aria-hidden="true">→</span></button>
        </form>
        <div className="auth-divider"><span>or continue with</span></div>
        {GOOGLE_CLIENT_ID ? <div className="google-signin-wrap"><div ref={googleButton} className="google-signin-button" /></div> : <button type="button" className="google-unconfigured" onClick={() => setNotice('Google sign-in needs a Google OAuth Web client ID. Set VITE_GOOGLE_CLIENT_ID in frontend/.env.local and GOOGLE_CLIENT_ID in backend/.env, then restart both servers.')}><span className="google-g">G</span><span>Continue with Google</span></button>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
        <p className="auth-terms">By continuing, you agree to Clipverse’s Terms and Privacy Policy.</p>
      </section>
      <p className="auth-footer">A little more fun, a little more you. <span>●</span></p>
    </main>
  );
}
