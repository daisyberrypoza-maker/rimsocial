import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from '../store.js';
import { api } from '../api.js';
import { toast } from '../toast.js';

const COIN_PACKS = [
  { id: 'ngn-80', coins: 80, price: 1100, label: 'Starter', bonus: 'Try gifting' },
  { id: 'ngn-400', coins: 400, price: 5300, label: 'Popular', bonus: 'More to share' },
  { id: 'ngn-800', coins: 800, price: 10400, label: 'Creator fan', bonus: 'Support creators' },
  { id: 'ngn-4000', coins: 4000, price: 50000, label: 'Big supporter', bonus: 'For big supporters' },
];

export default function TopBar({ immersive, title }) {
  const location = useLocation();
  const navigate = useNavigate();
  const nested = location.pathname.startsWith('/p/') || location.pathname.startsWith('/creator/live/') || location.pathname === '/creator' || location.pathname === '/upload' || (location.pathname.startsWith('/u/') && location.pathname !== '/u/me');
  const coinBalance = useAppStore((s) => s.coinBalance);
  const isNative = Capacitor.isNativePlatform();
  const [showCoinSheet, setShowCoinSheet] = useState(false);
  const [packId, setPackId] = useState('ngn-400');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  function buyCoins() {
    if (isNative) return toast('Android coin purchases are disabled until Google Play Billing is integrated and verified.');
    setShowCoinSheet(true);
  }

  async function checkout() {
    const pack = COIN_PACKS.find((item) => item.id === packId);
    if (!pack) return toast('Choose a valid coin package.');
    if (email.trim() && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim())) return toast('Enter a valid receipt email.');
    setBusy(true);
    try {
      const data = await api('/v1/wallet/topup', { method: 'POST', body: { packId: pack.id, ...(email.trim() ? { email: email.trim() } : {}) } });
      window.location.href = data.authorizationUrl;
    } catch (err) { toast(err.message); }
    finally { setBusy(false); }
  }

  return <>
    <header className={`topbar ${immersive ? 'overlay' : ''}`}>
      {nested ? <><button className="topbar-back" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/'); }} aria-label="Go back"><Icon name="arrow-left" size={22} /></button><div className="topbar-title">{title || 'Back'}</div></> : immersive ? <nav className="segmented"><NavLink to="/" end>For You</NavLink><NavLink to="/following">Following</NavLink></nav> : <div className="brand">{title || 'RimSocial'}</div>}
      <button className="coins" onClick={buyCoins} aria-label="Buy coins"><span className="dot" />{coinBalance.toLocaleString()} <span className="coins-plus">＋</span></button>
    </header>
    {showCoinSheet && <div className="sheet-backdrop coin-backdrop" onClick={() => setShowCoinSheet(false)}>
      <section className="sheet coin-sheet" role="dialog" aria-label="Buy coins" onClick={(e) => e.stopPropagation()}>
        <div className="comments-heading"><h3>Get coins</h3><button className="ghost small" onClick={() => setShowCoinSheet(false)} aria-label="Close">✕</button></div>
        <p className="muted">Use coins to send gifts and support your favourite creators.</p>
        <div className="coin-pack-grid">{COIN_PACKS.map((pack) => <button type="button" key={pack.id} className={packId === pack.id ? 'coin-pack selected' : 'coin-pack'} onClick={() => setPackId(pack.id)}><span className="coin-pack-amount">◉ {pack.coins.toLocaleString()}</span><strong>{pack.label}</strong><small>{pack.bonus}</small><span className="coin-pack-price">₦{pack.price.toLocaleString()}</span></button>)}</div>
        <p className="muted">Draft prices shown for planning only; final prices may change. Paystack checkout is web-only. Coins are credited only after server-side payment verification.</p>
        <label className="coin-email-label">Receipt email (optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <button className="coin-checkout" disabled={busy} onClick={checkout}>{busy ? 'Opening secure checkout…' : `Continue · ₦${COIN_PACKS.find((item) => item.id === packId)?.price.toLocaleString()}`}</button>
      </section>
    </div>}
  </>;
}
