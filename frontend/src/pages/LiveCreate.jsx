import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { goBack } from '../lib/goBack.js';
import './LiveCreate.css';

// LIVE setup: camera preview, title, opponent (TikTok-style battle) and Go LIVE.
// Going live creates the broadcast and opens it as host.
export default function LiveCreate() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [title, setTitle] = useState('');
  const [facing, setFacing] = useState('user');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [battleOpen, setBattleOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [matches, setMatches] = useState([]);
  const [creators, setCreators] = useState([]);
  const [battleError, setBattleError] = useState('');
  const [battleBusy, setBattleBusy] = useState('');

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

  // Battle panel: load me, invitable creators and match state; refresh while open
  async function refreshBattles() {
    try {
      const [matchData, creatorData] = await Promise.all([api('/v1/creator/matches'), api('/v1/creator/discover')]);
      setMatches(matchData.items || []);
      setCreators(creatorData.items || []);
    } catch (err) {
      setBattleError(err.message || 'Could not load creators');
    }
  }

  useEffect(() => {
    if (!battleOpen) return undefined;
    api('/v1/auth/me').then(({ user }) => setMe(user)).catch(() => {});
    refreshBattles();
    const timer = setInterval(refreshBattles, 5000);
    return () => clearInterval(timer);
  }, [battleOpen]);

  async function runBattleAction(key, action) {
    setBattleBusy(key);
    setBattleError('');
    try {
      await action();
    } catch (err) {
      setBattleError(err.message || 'Could not complete this action');
    } finally {
      setBattleBusy('');
      refreshBattles();
    }
  }

  const myId = String(me?.id || '');
  const incoming = matches.filter((m) => m.status === 'pending' && String(m.opponentId) === myId);
  const outgoing = matches.filter((m) => m.status === 'pending' && String(m.hostId) === myId);
  const active = matches.filter((m) => m.status === 'active');
  const busyCreatorIds = new Set(matches.flatMap((m) => [String(m.hostId), String(m.opponentId)]));
  const invitedIds = new Set(outgoing.map((m) => String(m.opponentId)));

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
          <button type="button" className="live-create-battle" onClick={() => setBattleOpen((open) => !open)} aria-expanded={battleOpen}>
            {battleOpen ? 'Close battle' : 'Battle a creator'}
          </button>
        </div>

        {battleOpen && (
          <section className="live-battle" aria-label="Creator battle">
            {battleError && <p className="live-battle-error" role="alert">{battleError}</p>}

            {incoming.length > 0 && (
              <>
                <h3>Invitations</h3>
                {incoming.map((m) => (
                  <div className="live-battle-row" key={m.id}>
                    <span className="live-battle-name">Creator invited you to a battle</span>
                    <button type="button" className="live-battle-btn" disabled={battleBusy === m.id} onClick={() => runBattleAction(m.id, () => api(`/v1/creator/matches/${m.id}/respond`, { method: 'POST', body: { accept: true } }))}>Accept</button>
                    <button type="button" className="live-battle-btn ghost" disabled={battleBusy === m.id} onClick={() => runBattleAction(m.id, () => api(`/v1/creator/matches/${m.id}/respond`, { method: 'POST', body: { accept: false } }))}>Decline</button>
                  </div>
                ))}
              </>
            )}

            {active.length > 0 && (
              <>
                <h3>Live battles</h3>
                {active.map((m) => (
                  <div className="live-battle-row" key={m.id}>
                    <span className="live-battle-name">Battle in progress</span>
                    <Link className="live-battle-btn" to={`/creator/live/${m.id}`}>Open room</Link>
                  </div>
                ))}
              </>
            )}

            {outgoing.length > 0 && <p className="live-battle-empty">Waiting for a creator to accept your invitation.</p>}

            <h3>Invite a creator</h3>
            {creators.length === 0 && <p className="live-battle-empty">No other creators yet.</p>}
            {creators.map((c) => {
              const inBattle = busyCreatorIds.has(String(c.id));
              const invited = invitedIds.has(String(c.id));
              return (
                <div className="live-battle-row" key={c.id}>
                  <span className="live-battle-avatar" aria-hidden="true">{(c.displayName || c.username || '?').charAt(0).toUpperCase()}</span>
                  <span className="live-battle-name">
                    {c.displayName || c.username}
                    <small>@{c.username} · {Number(c.followerCount || 0).toLocaleString()} followers</small>
                  </span>
                  <button type="button" className="live-battle-btn" disabled={inBattle || invited || battleBusy === c.id} onClick={() => runBattleAction(c.id, () => api('/v1/creator/matches', { method: 'POST', body: { opponentId: c.id } }))}>
                    {invited ? 'Invited' : inBattle ? 'In a battle' : 'Invite'}
                  </button>
                </div>
              );
            })}
          </section>
        )}

        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What are you going LIVE about?" aria-label="LIVE title" />
        {error && <p className="live-create-error" role="alert">{error}</p>}
        <button className="live-create-go" type="submit" disabled={busy}>{busy ? 'Starting…' : 'Go LIVE'}</button>
      </form>
    </main>
  );
}
