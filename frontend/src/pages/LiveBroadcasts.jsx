import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const styles = {
  page: { maxWidth: 760, margin: '0 auto', padding: '16px 14px 90px', color: 'var(--text, #f7f7f7)' },
  panel: { background: 'var(--surface, #171717)', border: '1px solid var(--border, #303030)', borderRadius: 16, padding: 16, marginBottom: 14 },
  button: { border: 0, borderRadius: 10, padding: '11px 14px', fontWeight: 700, cursor: 'pointer', background: '#ff2448', color: 'white' },
  secondary: { border: '1px solid #555', borderRadius: 10, padding: '10px 13px', cursor: 'pointer', background: 'transparent', color: 'inherit' },
};

export default function LiveBroadcasts() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(null);
  const [role, setRole] = useState('');
  const videoArea = useRef(null);
  const roomRef = useRef(null);
  const tracksRef = useRef([]);

  const refresh = useCallback(async () => {
    try { const result = await api('/v1/broadcasts'); setItems(result.items || []); }
    catch (e) { setMessage(e.message || 'Could not load LIVE broadcasts.'); }
  }, []);

  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 12000); return () => window.clearInterval(timer); }, [refresh]);

  const disconnect = useCallback(async () => {
    try { roomRef.current?.disconnect(); } catch {}
    roomRef.current = null;
    tracksRef.current.forEach((track) => { try { track.stop(); track.detach(); } catch {} });
    tracksRef.current = [];
    if (videoArea.current) videoArea.current.replaceChildren();
  }, []);

  useEffect(() => () => { disconnect(); }, [disconnect]);

  async function connectRoom(serverUrl, token, isHost) {
    await disconnect();
    if (!videoArea.current) throw new Error('Video area is not ready yet. Retry.');
    setMessage('Connecting to LIVE…');
    // Load the browser SDK at runtime so the app can build without a missing local dependency.
    const sdk = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/livekit-client@2.15.6/+esm');
    const room = new sdk.Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const attachTrack = (track) => {
      if (!videoArea.current) return;
      const element = track.attach();
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.objectFit = 'cover';
      element.autoplay = true;
      if (element.tagName === 'VIDEO') element.playsInline = true;
      videoArea.current.appendChild(element);
      tracksRef.current.push(track);
      element.play?.().catch(() => setMessage('Tap the video to start playback.'));
    };
    room.on(sdk.RoomEvent.TrackSubscribed, (track) => attachTrack(track));
    room.on(sdk.RoomEvent.TrackUnsubscribed, (track) => {
      try { track.detach().forEach((el) => el.remove()); } catch {}
    });
    room.on(sdk.RoomEvent.Disconnected, () => setMessage('Disconnected from LIVE.'));
    await room.connect(serverUrl, token, { autoSubscribe: true });
    if (isHost) {
      const localTracks = await sdk.createLocalTracks({ audio: true, video: { facingMode: 'user' } });
      for (const track of localTracks) {
        tracksRef.current.push(track);
        await room.localParticipant.publishTrack(track);
        if (track.kind === 'video') attachTrack(track);
      }
    }
    setMessage(isHost ? 'You are live. Viewers can now join.' : 'Watching LIVE.');
  }

  async function startBroadcast(event) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const result = await api('/v1/broadcasts', { method: 'POST', body: { title: title.trim() } });
      setActive(result.broadcast); setRole('host');
      await connectRoom(result.serverUrl, result.token, true);
      await refresh();
    } catch (e) {
      setMessage(e.message || 'Could not start LIVE. Check camera permission and server configuration.');
      if (active?.id) { try { await api('/v1/broadcasts/' + active.id + '/end', { method: 'POST' }); } catch {} }
    } finally { setBusy(false); }
  }

  async function watchBroadcast(item) {
    setBusy(true); setMessage('');
    try {
      const result = await api('/v1/broadcasts/' + item.id + '/token', { method: 'POST' });
      setActive(item); setRole(result.role);
      await connectRoom(result.serverUrl, result.token, false);
    } catch (e) { setMessage(e.message || 'Could not join this LIVE.'); }
    finally { setBusy(false); }
  }

  async function endBroadcast() {
    setBusy(true);
    try {
      if (active?.id && role === 'host') await api('/v1/broadcasts/' + active.id + '/end', { method: 'POST' });
      await disconnect(); setActive(null); setRole(''); setMessage('LIVE ended.'); await refresh();
    } catch (e) { setMessage(e.message || 'Could not end LIVE.'); }
    finally { setBusy(false); }
  }

  return <main style={styles.page}>
    <header style={{ marginBottom: 16 }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 25 }}>LIVE</h1>
      <p style={{ margin: 0, opacity: .72 }}>Go live with your camera or watch creators in real time.</p>
    </header>
    {message && <div role="status" style={{ ...styles.panel, borderColor: message.toLowerCase().includes('not configured') ? '#a66b27' : undefined }}>{message}</div>}
    <section style={styles.panel}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Start a public broadcast</h2>
      <form onSubmit={startBroadcast}>
        <label htmlFor="live-title" style={{ display: 'block', marginBottom: 7 }}>What are you going live about?</label>
        <input id="live-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Add a LIVE title (optional)" style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, border: '1px solid #555', background: 'transparent', color: 'inherit', marginBottom: 10 }} />
        <button style={styles.button} disabled={busy || Boolean(active)}>{busy ? 'Connecting…' : 'Go LIVE'}</button>
      </form>
    </section>
    <section style={{ ...styles.panel, display: active ? 'block' : 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div><strong>{active.title || 'Live broadcast'}</strong><div style={{ opacity: .7, fontSize: 13 }}>{role === 'host' ? 'HOST' : 'VIEWER'} · {message}</div></div>
        <button style={styles.secondary} onClick={endBroadcast} disabled={busy}>{role === 'host' ? 'End LIVE' : 'Leave'}</button>
      </div>
      <div ref={videoArea} onClick={(e) => e.currentTarget.querySelectorAll('video').forEach((v) => v.play().catch(() => {}))} style={{ minHeight: 260, aspectRatio: '9 / 16', maxHeight: '70vh', background: '#050505', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
    </section>
    <section>
      <h2 style={{ fontSize: 18 }}>Creators live now</h2>
      {!items.length ? <p style={{ opacity: .7 }}>No public broadcasts are live right now.</p> : items.map((item) => <article key={item.id} style={{ ...styles.panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}><strong>{item.title || 'Live broadcast'}</strong><div style={{ opacity: .72, fontSize: 13 }}>@{item.host?.username || 'creator'} · Live now</div></div>
        <button style={styles.button} disabled={busy || Boolean(active)} onClick={() => watchBroadcast(item)}>Watch</button>
      </article>)}
    </section>
  </main>;
}
