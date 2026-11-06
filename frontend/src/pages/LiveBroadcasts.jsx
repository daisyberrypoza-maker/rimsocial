import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function LiveBroadcasts() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState(null);
  const [role, setRole] = useState('');
  const [room, setRoom] = useState(null);
  const [localTracks, setLocalTracks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const roomRef = useRef(null);
  const chatTailRef = useRef(null);

  const refresh = useCallback(async () => {
    try { const data = await api('/v1/broadcasts'); setItems(data.items || []); }
    catch (e) { setError(e.message || 'Could not load LIVE broadcasts'); }
  }, []);

  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 8000); return () => window.clearInterval(timer); }, [refresh]);

  useEffect(() => {
    if (!selected) return undefined;
    let active = true;
    const loadChat = async () => {
      try { const data = await api(`/v1/broadcasts/${selected.id}/chat`); if (active) setMessages(data.items || []); }
      catch (e) { if (active) setError(e.message || 'Could not load LIVE chat'); }
    };
    loadChat();
    const timer = window.setInterval(loadChat, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected]);

  useEffect(() => { chatTailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  useEffect(() => {
    if (!room || !selected) return undefined;
    let live = true;
    const attachSubscribed = (track) => {
      if (!live || track.kind !== 'video') return;
      if (videoRef.current) track.attach(videoRef.current);
    };
    room.remoteParticipants.forEach((participant) => participant.trackPublications.forEach((publication) => {
      if (publication.track) attachSubscribed(publication.track);
    }));
    room.on(window.__RimLiveKitRoomEvent?.TrackSubscribed || 'trackSubscribed', attachSubscribed);
    room.on(window.__RimLiveKitRoomEvent?.TrackUnsubscribed || 'trackUnsubscribed', (track) => track.detach());
    return () => { live = false; room.removeAllListeners(); };
  }, [room, selected]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const camera = localTracks.find((track) => track.kind === 'video');
    if (camera) { camera.attach(video); video.muted = true; video.play().catch(() => {}); }
    return () => { if (camera) camera.detach(video); };
  }, [localTracks, selected]);

  const leaveRoom = useCallback(async () => {
    const current = roomRef.current;
    roomRef.current = null;
    if (current) { try { current.disconnect(); } catch {} }
    localTracks.forEach((track) => { try { track.stop(); track.detach(); } catch {} });
    setLocalTracks([]);
    setRoom(null);
  }, [localTracks]);

  useEffect(() => () => {
    if (roomRef.current) roomRef.current.disconnect();
    localTracks.forEach((track) => { try { track.stop(); track.detach(); } catch {} });
  }, []); // unmount cleanup

  const connectToBroadcast = async (broadcast, host) => {
    setBusy(true); setError('');
    try {
      const credentials = await api(`/v1/broadcasts/${broadcast.id}/token`, { method: 'POST', body: {} });
      // Keep the SDK as a runtime browser import so the provider can be configured
      // after the rest of the project is complete without exposing server secrets.
      const sdk = await import(/* @vite-ignore */ 'https://esm.sh/livekit-client@2.15.3?bundle');
      const nextRoom = new sdk.Room({ adaptiveStream: true, dynacast: true });
      await nextRoom.connect(credentials.serverUrl, credentials.token);
      let tracks = [];
      if (host) {
        tracks = await sdk.createLocalTracks({ audio: true, video: { facingMode: 'user' } });
        for (const track of tracks) await nextRoom.localParticipant.publishTrack(track);
      }
      roomRef.current = nextRoom;
      setLocalTracks(tracks);
      setSelected(broadcast);
      setRole(host ? 'host' : 'viewer');
      setRoom(nextRoom);
      setMessages([]);
    } catch (e) {
      setError(e.message || 'Could not connect to LIVE. Check camera permission and provider configuration.');
    } finally { setBusy(false); }
  };

  const startBroadcast = async (event) => {
    event.preventDefault();
    if (!title.trim()) { setError('Add a title before going LIVE.'); return; }
    setBusy(true); setError('');
    try {
      const data = await api('/v1/broadcasts', { method: 'POST', body: { title: title.trim() } });
      setTitle('');
      await refresh();
      await connectToBroadcast(data.broadcast, true);
    } catch (e) { setError(e.message || 'Could not start LIVE'); setBusy(false); }
  };

  const endBroadcast = async () => {
    if (!selected) return;
    setBusy(true);
    try { await api(`/v1/broadcasts/${selected.id}/end`, { method: 'POST', body: {} }); }
    catch (e) { setError(e.message || 'Could not end broadcast'); }
    await leaveRoom();
    setSelected(null); setRole(''); setMessages([]);
    await refresh(); setBusy(false);
  };

  const exitViewer = async () => { await leaveRoom(); setSelected(null); setRole(''); setMessages([]); setError(''); };

  const sendChat = async (event) => {
    event.preventDefault();
    if (!selected || !chatText.trim()) return;
    const body = chatText.trim(); setChatText('');
    try {
      const data = await api(`/v1/broadcasts/${selected.id}/chat`, { method: 'POST', body: { body } });
      setMessages((current) => [...current, data.message].slice(-60));
    } catch (e) { setError(e.message || 'Could not send chat message'); setChatText(body); }
  };

  return (
    <main className="live-page">
      <div className="live-toolbar"><h1>LIVE</h1><span><span className="live-dot" />Live broadcasts</span></div>
      {error && <p className="live-error" role="alert">{error}</p>}
      {!selected ? <>
        <form className="live-start-form" onSubmit={startBroadcast}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What are you going LIVE about?" aria-label="LIVE title" />
          <button className="live-primary" type="submit" disabled={busy}>{busy ? 'Connecting…' : 'Go LIVE'}</button>
        </form>
        <section className="live-list" aria-label="Current live broadcasts">
          {items.length ? items.map((item) => <article className="live-card" key={item.id}>
            <div className="live-card-copy"><strong><span className="live-dot" />{item.title}</strong><small>{item.host?.displayName || item.host?.username || 'RimSocial creator'} · {item.viewerCount || 0} watching</small></div>
            <button type="button" onClick={() => connectToBroadcast(item, false)} disabled={busy}>{busy ? 'Joining…' : 'Watch LIVE'}</button>
          </article>) : <div className="live-empty">No one is live right now. Start a broadcast and invite your audience.</div>}
        </section>
      </> : <>
        <div className="live-room">
          <section>
            <div className="live-video-wrap">
              <span className="live-video-label">{role === 'host' ? 'YOU ARE LIVE' : 'LIVE'}</span>
              <video ref={videoRef} autoPlay playsInline muted={role === 'host'} />
            </div>
            <div className="live-room-actions">
              {role === 'host' ? <button className="live-primary" type="button" onClick={endBroadcast} disabled={busy}>{busy ? 'Ending…' : 'End LIVE'}</button> : <button type="button" onClick={exitViewer} disabled={busy}>Leave LIVE</button>}
              <strong>{selected.title}</strong>
            </div>
          </section>
          <section className="live-chat">
            <h3>Live chat</h3>
            <div className="live-chat-list">
              {messages.map((message) => <div className="live-chat-line" key={message.id}><strong>{message.user?.displayName || message.user?.username || 'Viewer'}</strong>{message.body}</div>)}
              <div ref={chatTailRef} />
            </div>
            <form className="live-chat-form" onSubmit={sendChat}>
              <input value={chatText} onChange={(e) => setChatText(e.target.value)} maxLength={500} placeholder="Say something…" aria-label="Live chat message" />
              <button type="submit" disabled={!chatText.trim()}>Send</button>
            </form>
          </section>
        </div>
      </>}
    </main>
  );
}
