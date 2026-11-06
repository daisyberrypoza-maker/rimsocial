import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { toast } from '../toast.js';

export default function LiveMatchRoom() {
  const { matchId } = useParams();
  const [match, setMatch] = useState(null);
  const [starting, setStarting] = useState(false);
  const [roomState, setRoomState] = useState('Ready to connect');
  const [error, setError] = useState('');
  const [turnConfigured, setTurnConfigured] = useState(false);
  const [giftOptions, setGiftOptions] = useState({ posts: [], creators: [], gifts: [], match: null });
  const [coinBalance, setCoinBalance] = useState(null);
  const [sendingGift, setSendingGift] = useState(false);
  const [selectedGift, setSelectedGift] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const seenRef = useRef(new Set());
  const cursorRef = useRef('1970-01-01T00:00:00.000Z');
  const cursorIdRef = useRef('');
  const pendingCandidatesRef = useRef([]);

  useEffect(() => {
    let alive = true;
    api('/v1/creator/matches')
      .then(({ items }) => {
        const found = (items || []).find((item) => item.id === matchId);
        if (!found) throw new Error('Match not found or you are not a participant.');
        if (alive) {
          setMatch(found);
          api('/v1/auth/me').then(({ user }) => alive && setCurrentUserId(user?.id || '')).catch(() => {});
          if (found.status === 'active') {
            Promise.all([
              api(`/v1/live/matches/${matchId}/gift-options`),
              api('/v1/wallet'),
            ]).then(([options, wallet]) => {
              if (!alive) return;
              setGiftOptions(options);
              setCoinBalance(Number(wallet?.coinBalance ?? 0));
              if (options.gifts?.length) setSelectedGift(String(options.gifts[0].id));
            }).catch((e) => alive && setGiftMessage(e.message || 'Could not load LIVE gifts.'));
          }
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [matchId]);

  useEffect(() => () => {
    if (pcRef.current?._rimsocialPollTimer) window.clearInterval(pcRef.current._rimsocialPollTimer);
    if (pcRef.current) pcRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
  }, []);

  async function sendSignal(kind, payload) {
    await api(`/v1/live/matches/${matchId}/signals`, { method: 'POST', body: { kind, payload } });
  }

  async function flushCandidates(pc) {
    if (!pc.remoteDescription) return;
    const candidates = pendingCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn('Ignoring stale ICE candidate', e); }
    }
  }

  async function startRoom() {
    if (!match || match.status !== 'active' || starting) return;
    setStarting(true); setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        throw new Error('This device or WebView does not support WebRTC camera access.');
      }
      const iceConfig = await api(`/v1/live/matches/${matchId}/ice-servers`);
      setTurnConfigured(Boolean(iceConfig.turnConfigured));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;

      const pc = new RTCPeerConnection({
        iceServers: iceConfig.iceServers?.length ? iceConfig.iceServers : [{ urls: ['stun:stun.l.google.com:19302'] }],
        iceCandidatePoolSize: 4,
      });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => {
        if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0];
        setRoomState('Connected to your match opponent');
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) sendSignal('candidate', event.candidate.toJSON()).catch((e) => setError(e.message));
      };
      pc.onconnectionstatechange = () => {
        setRoomState(pc.connectionState === 'connected' ? 'Video connected' : `Connection: ${pc.connectionState}`);
      };

      if (match.hostId === (await api('/v1/auth/me')).user.id) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal('offer', pc.localDescription.toJSON());
      }
      setRoomState('Connecting…');

      let pollInProgress = false;
      const poll = async () => {
        if (pollInProgress || !pcRef.current || pcRef.current !== pc || pc.signalingState === 'closed') return;
        pollInProgress = true;
        try {
          const { items } = await api(`/v1/live/matches/${matchId}/signals?since=${encodeURIComponent(cursorRef.current)}&afterId=${encodeURIComponent(cursorIdRef.current)}`);
          for (const signal of items || []) {
            const signalTime = signal.createdAt ? new Date(signal.createdAt).toISOString() : null;
            if (seenRef.current.has(signal.id)) {
              if (signalTime && (signalTime > cursorRef.current || (signalTime === cursorRef.current && signal.id > cursorIdRef.current))) {
                cursorRef.current = signalTime;
                cursorIdRef.current = signal.id;
              }
              continue;
            }
            // Do not advance the cursor or mark a signal as seen until its
            // handling succeeds. Otherwise a transient SDP/API error could
            // permanently skip the offer/answer and leave both creators stuck.
            if (signal.kind === 'offer' && pc.signalingState === 'stable') {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
              await flushCandidates(pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await sendSignal('answer', pc.localDescription.toJSON());
            } else if (signal.kind === 'answer' && pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
              await flushCandidates(pc);
            } else if (signal.kind === 'candidate') {
              if (pc.remoteDescription) {
                try { await pc.addIceCandidate(new RTCIceCandidate(signal.payload)); } catch (e) { console.warn('Ignoring ICE candidate', e); }
              } else pendingCandidatesRef.current.push(signal.payload);
            }
            seenRef.current.add(signal.id);
            if (signalTime && (signalTime > cursorRef.current || (signalTime === cursorRef.current && signal.id > cursorIdRef.current))) {
              cursorRef.current = signalTime;
              cursorIdRef.current = signal.id;
            }
          }
        } catch (e) {
          if (e.status === 409) setError('This match is no longer active.');
          else setError(e.message);
        } finally {
          pollInProgress = false;
        }
      };
      await poll();
      const timer = window.setInterval(poll, 1200);
      pc.addEventListener('connectionstatechange', () => {
        if (['failed', 'closed'].includes(pc.connectionState)) window.clearInterval(timer);
      });
      pc._rimsocialPollTimer = timer;
      setRoomState('Waiting for opponent video…');
    } catch (e) {
      setError(e.message || 'Could not start the LIVE room.');
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    } finally {
      setStarting(false);
    }
  }

  async function sendLiveGift(recipientId) {
    if (sendingGift || !selectedGift) return;
    const post = giftOptions.posts.find((item) => item.authorId === recipientId);
    if (!post) {
      setGiftMessage('This creator needs an eligible public post before gifts can be sent.');
      return;
    }
    const gift = giftOptions.gifts.find((item) => String(item.id) === String(selectedGift));
    if (!gift) return;
    if (coinBalance !== null && coinBalance < Number(gift.coinPrice)) {
      setGiftMessage('Not enough coins in your wallet.');
      return;
    }
    setSendingGift(true); setGiftMessage('');
    try {
      const idempotencyKey = window.crypto?.randomUUID ? window.crypto.randomUUID() : `live-${matchId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await api('/v1/gifts', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: { postId: post.id, giftId: Number(gift.id), liveMatchId: matchId },
      });
      const [wallet, score] = await Promise.all([
        api('/v1/wallet'),
        api(`/v1/creator/matches/${matchId}/score`, { method: 'POST', body: {} }),
      ]);
      setCoinBalance(Number(wallet?.coinBalance ?? 0));
      setMatch((previous) => previous ? { ...previous, ...(score.match || {}) } : previous);
      setGiftOptions((previous) => ({ ...previous, match: score.match || previous.match }));
      setGiftMessage(`Sent ${gift.name} to ${giftOptions.creators.find((creator) => creator.id === recipientId)?.displayName || 'creator'}!`);
    } catch (e) {
      setGiftMessage(e.message || 'Gift could not be sent.');
    } finally {
      setSendingGift(false);
    }
  }

  function stopRoom() {
    if (pcRef.current?._rimsocialPollTimer) window.clearInterval(pcRef.current._rimsocialPollTimer);
    pcRef.current?.close();
    pcRef.current = null;
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    setRoomState('Disconnected');
  }

  return <main className="page live-room-page">
    <header className="section-heading"><div><span className="chip">RIM SOCIAL LIVE</span><h1>Creator Match</h1><p className="muted">Private creator-to-creator video connection</p></div><Link className="studio-share" to="/creator">Back to studio</Link></header>
    {error && <p className="error" role="alert">{error}</p>}
    {!match ? <p className="muted">Loading match…</p> : <>
      <section className="live-room-videos">
        <article><video ref={localVideo} autoPlay muted playsInline/><span>You</span></article>
        <article><video ref={remoteVideo} autoPlay playsInline/><span>Opponent</span></article>
      </section>
      <section className="panel">
        <h2>{roomState}</h2>
        <p className="muted">Match status: {match.status}. Allow camera and microphone access when prompted.</p>
        {match.status === 'active' ? <div className="row"><button disabled={starting || Boolean(pcRef.current)} onClick={startRoom}>{starting ? 'Starting…' : 'Start camera & connect'}</button><button className="ghost" onClick={stopRoom}>Stop camera</button></div> : <p className="notice">The other creator must accept the invitation before the room can start.</p>}
      </section>
      {match.status === 'active' && <section className="panel live-match-gifts">
        <h2>Send a LIVE gift</h2>
        <p className="muted">Gifts deduct coins from your wallet and add their value to this match's verified score.</p>
        <p><strong>Coins:</strong> {coinBalance === null ? 'Loading…' : coinBalance} · <strong>Score:</strong> {Number(match.hostScore || 0)} – {Number(match.opponentScore || 0)}</p>
        {giftOptions.gifts.length > 0 ? <>
          <label htmlFor="live-gift-choice">Choose a gift</label>
          <select id="live-gift-choice" value={selectedGift} onChange={(event) => setSelectedGift(event.target.value)} disabled={sendingGift}>
            {giftOptions.gifts.map((gift) => <option key={gift.id} value={gift.id}>{gift.name} — {gift.coinPrice} coins</option>)}
          </select>
          <div className="row">
            {[match.hostId, match.opponentId].filter((id) => id !== currentUserId).map((creatorId) => {
              const creator = giftOptions.creators.find((item) => item.id === creatorId);
              return <button key={creatorId} disabled={sendingGift || !selectedGift} onClick={() => sendLiveGift(creatorId)}>{sendingGift ? 'Sending…' : `Gift ${creator?.displayName || creator?.username || 'opponent'}`}</button>;
            })}
          </div>
        </> : <p className="muted">No active gifts are available right now.</p>}
        {giftMessage && <p role="status" className={giftMessage.startsWith('Sent ') ? 'notice' : 'muted'}>{giftMessage}</p>}
        <p className="muted">Only gifts sent to a participating creator's eligible public post count toward the match.</p>
      </section>}
      <p className={turnConfigured ? 'notice' : 'muted'}>{turnConfigured ? 'TURN relay is configured for cross-network connection attempts.' : 'TURN relay is not configured on the server. Video may fail across restrictive mobile networks until TURN_URLS and TURN_SECRET (or TURN_USERNAME and TURN_PASSWORD) are set.'}</p>
      <p className="muted">This room is creator-to-creator WebRTC, not public audience broadcasting. A TURN provider must be deployed and configured before cross-network reliability can be confirmed.</p>
    </>}
  </main>;
}
