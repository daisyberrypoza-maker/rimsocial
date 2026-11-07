import { useState } from 'react';
import { api } from '../api.js';
import { useAppStore } from '../store.js';

// Shown in place of the screen when the device cannot reach RimSocial.
export default function ConnectionFailed() {
  const setOffline = useAppStore((s) => s.setOffline);
  const [checking, setChecking] = useState(false);

  async function retry() {
    setChecking(true);
    try {
      await api('/health');
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="conn-failed" role="alert">
      <h2>Connection Failed!</h2>
      <p>Check your Internet connection and try again.</p>
      <button type="button" className="conn-retry" onClick={retry} disabled={checking}>
        {checking ? 'CHECKING…' : 'RETRY'}
      </button>
    </section>
  );
}
