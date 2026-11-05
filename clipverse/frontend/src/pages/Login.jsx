import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadAccount } from '../account.js';

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAppStore((s) => s.setSession);
  const [form, setForm] = useState({
    username: '', password: '', email: '', displayName: '', country: 'US',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(mode) {
    setError('');
    setBusy(true);
    try {
      const data = await api(`/v1/auth/${mode}`, { method: 'POST', body: form });
      setSession(data.token, data.user);
      await loadAccount();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel auth">
      <h2>Join Clipverse</h2>
      <form onSubmit={(e) => { e.preventDefault(); submit('login'); }}>
        <input placeholder="Username" value={form.username} onChange={field('username')} required autoComplete="username" />
        <input type="password" placeholder="Password (8+ characters)" value={form.password} onChange={field('password')} required minLength={8} autoComplete="current-password" />
        <details>
          <summary>New here? Create an account</summary>
          <input type="email" placeholder="Email" value={form.email} onChange={field('email')} />
          <input placeholder="Display name" value={form.displayName} onChange={field('displayName')} />
          <input placeholder="Country code, e.g. US" maxLength={2} value={form.country} onChange={field('country')} />
        </details>
        <div className="row">
          <button type="submit" disabled={busy}>Log in</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => submit('register')}>Create account</button>
        </div>
      </form>
      <p className="error">{error}</p>
    </section>
  );
}
