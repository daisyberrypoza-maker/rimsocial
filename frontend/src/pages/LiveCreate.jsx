import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { goBack } from '../lib/goBack.js';
import './LiveCreate.css';

// LIVE setup: camera preview, title, audience and Go LIVE. Going live creates the broadcast and opens it as host.
export default function LiveCreate() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [title, setTitle] = useState('');
  const [facing, setFacing] = useState('user');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        stopCamera();
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setError('Allow camera access to go LIVE.');
      }
    })();
    return () => { cancelled = true; };
  }, [facing]);

  useEffect(() => () => stopCamera(), []);

  async function goLive(event) {
    event.preventDefault();
    if (!title.trim()) { setError('Add a title before going LIVE.'); return; }
    setBusy(true); setError('');
    try {
      const data = await api('/v1/broadcasts', { method: 'POST', body: { title: title.trim() } });
      stopCamera();
      navigate('/live', { replace: true, state: { hostBroadcast: data.broadcast } });
    } catch (err) {
      setError(err.message || 'Could not start LIVE');
      setBusy(false);
    }
  }

  return (
    <main className="live-create">
      <video ref={videoRef} className={facing === 'user' ? 'live-create-video mirror' : 'live-create-video'} autoPlay playsInline muted />
      <header className="live-create-top">
        <button type="button" onClick={() => { stopCamera(); goBack(navigate); }} aria-label="Close"><Icon name="x" size={26} /></button>
        <button type="button" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Switch camera"><Icon name="refresh-cw" size={24} /></button>
      </header>
      <form className="live-create-bottom" onSubmit={goLive}>
        <div className="live-create-row">
          <span className="live-create-audience">Everyone</span>
          <button type="button" className="live-create-battle" onClick={() => navigate('/creator/matches')}>Battle a creator</button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What are you going LIVE about?" aria-label="LIVE title" />
        {error && <p className="live-create-error" role="alert">{error}</p>}
        <button className="live-create-go" type="submit" disabled={busy}>{busy ? 'Starting…' : 'Go LIVE'}</button>
      </form>
    </main>
  );
}
