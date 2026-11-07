import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';

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
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const videoRef = useRef(null);
  const roomRef = useRef(null);
  const chatTailRef = useRef(null);
  const remoteMediaRef = useRef(null);
  const localTracksRef = useRef([]);

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
      if (!live) return;
      if (track.kind === 'video' && videoRef.current) {
        track.attach(videoRef.current);
      } else if (track.kind === 'audio' && remoteMediaRef.current) {
        const element = track.attach();
        element.autoplay = true;
        remoteMediaRef.current.appendChild(element);
        element.play?.().catch(() => {});
      }
    };
    room.remoteParticipants.forEach((participant) => participant.trackPublications.forEach((publication) => {
      if (publication.track) attachSubscribed(publication.track);
    }));
    const detachUnsubscribed = (track) => track.detach().forEach((element) => element.remove());
    room.on('trackSubscribed', attachSubscribed);
    room.on('trackUnsubscribed', detachUnsubscribed);
    return () => {
      live = false;
      room.off('trackSubscribed', attachSubscribed);
      room.off('trackUnsubscribed', detachUnsubscribed);
    };
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
    localTracksRef.current.forEach((track) => { try { track.stop(); track.detach(); } catch {} });
    localTracksRef.current = [];
    setLocalTracks([]);
    setRoom(null);
  }, [localTracks]);

  useEffect(() => () => {
    if (roomRef.current) roomRef.current.disconnect();
    localTracksRef.current.forEach((track) => { try { track.stop(); track.detach(); } catch {} });
    localTracksRef.current = [];
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
      localTracksRef.current = tracks;
      setLocalTracks(tracks);
      setSelected(broadcast);
      setRole(host ? 'host' : 'viewer');
      setRoom(nextRoom);
      setMessages([]);
    } catch (e) {
      // A failed camera permission or room connection must not leave a ghost LIVE
      // session or camera/microphone tracks running in the background.
      const failedRoom = roomRef.current;
      roomRef.current = null;
      if (failedRoom) { try { failedRoom.disconnect(); } catch {} }
      localTracksRef.current.forEach((track) => { try { track.stop(); track.detach(); } catch {} });
      localTracksRef.current = [];
      setLocalTracks([]);
      setRoom(null);
      setError(e.message || 'Could not connect to LIVE. Check camera permission and provider configuration.');
    } finally { setBusy(false); }
  };

  const startBroadcast = async (event) => {
    event.preventDefault();
    if (!title.trim()) { setError('Add a title before going LIVE.'); return; }
    setBusy(true); setError('');
    let createdBroadcastId = null;
    try {
      const data = await api('/v1/broadcasts', { method: 'POST', body: { title: title.trim() } });
      createdBroadcastId = data.broadcast?.id || null;
      setTitle('');
      await refresh();
      await connectToBroadcast(data.broadcast, true);
    } catch (e) {
      // If the session was created but camera permission/connection failed, end it
      // server-side so it does not remain visible as a ghost LIVE broadcast.
      if (createdBroadcastId) {
        await api(`/v1/broadcasts/${createdBroadcastId}/end`, { method: 'POST', body: {} }).catch(() => {});
        await refresh();
      }
      setError(e.message || 'Could not start LIVE');
      setBusy(false);
    }
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
      {selected && <div className="live-toolbar"><h1>LIVE</h1><span><span className="live-dot" />Live broadcasts</span></div>}
      {error && <p className="live-error" role="alert">{error}</p>}
      {!selected ? <>
        {goLiveOpen && <form className="live-start-form" onSubmit={startBroadcast}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What are you going LIVE about?" aria-label="LIVE title" />
          <button className="live-primary" type="submit" disabled={busy}>{busy ? 'Connecting…' : 'Go LIVE'}</button>
        </form>}
        {!goLiveOpen && <button type="button" className="live-fab" onClick={() => setGoLiveOpen(true)}>Go LIVE</button>}
        <section className="live-list" aria-label="Current live broadcasts">
          {items.length ? items.map((item) => <article className="live-card" key={item.id}>
            <div className="live-tile-photo" style={item.host?.avatarUrl ? { backgroundImage: `url(${mediaUrl(item.host.avatarUrl)})` } : undefined} aria-hidden="true" />
            <span className="live-tag"><span className="live-dot" />LIVE</span>
            <span className="live-count"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></svg>{item.viewerCount || 0}</span>
            <div className="live-card-copy"><strong>{item.title}</strong><small>@{item.host?.username || 'creator'}</small></div>
            <button type="button" className="live-watch" aria-label={`Watch LIVE: ${item.title}`} onClick={() => connectToBroadcast(item, false)} disabled={busy}>{busy ? 'Joining…' : 'Watch LIVE'}</button>
          </article>) : <div className="live-empty">No one is live right now. Start a broadcast and invite your audience.</div>}
        </section>
      </> : <>
        <div className="live-room">
          <section>
            <div className="live-video-wrap">
              <span className="live-video-label">{role === 'host' ? 'YOU ARE LIVE' : 'LIVE'}</span>
              <video ref={videoRef} autoPlay playsInline muted={role === 'host'} />
              <div ref={remoteMediaRef} className="live-remote-audio" aria-hidden="true" />
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
