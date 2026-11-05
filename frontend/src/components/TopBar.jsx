import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from '../store.js';
import { api } from '../api.js';
import { toast } from '../toast.js';

const COIN_PACKS = [{ amount: 500, label: 'Starter', bonus: 'Try gifting' }, { amount: 1000, label: 'Popular', bonus: 'Great for gifts' }, { amount: 2500, label: 'Creator fan', bonus: 'More to share' }, { amount: 5000, label: 'Big supporter', bonus: 'Support creators' }];

export default function TopBar({ immersive, title }) {
  const coinBalance = useAppStore((s) => s.coinBalance);
  const isNative = Capacitor.isNativePlatform();
  const [showCoinSheet, setShowCoinSheet] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  function buyCoins() {
    if (isNative) return toast('Android coin purchases require Google Play Billing setup before checkout can be enabled.');
    setShowCoinSheet(true);
  }

  async function checkout() {
    if (!Number.isSafeInteger(Number(amount)) || Number(amount) < 100) return toast('Choose a valid coin package amount.');
    setBusy(true);
    try {
      const data = await api('/v1/wallet/topup', { method: 'POST', body: { amountMinor: Number(amount) * 100, ...(email.trim() ? { email: email.trim() } : {}) } });
      window.location.href = data.authorizationUrl;
    } catch (err) { toast(err.message); }
    finally { setBusy(false); }
  }

  return <>
    <header className={`topbar ${immersive ? 'overlay' : ''}`}>
      {immersive ? <nav className="segmented"><NavLink to="/" end>For You</NavLink><NavLink to="/following">Following</NavLink></nav> : <div className="brand">{title || 'Clipverse'}</div>}
      <button className="coins" onClick={buyCoins} aria-label="Buy coins"><span className="dot" />{coinBalance.toLocaleString()} <span className="coins-plus">＋</span></button>
    </header>
    {showCoinSheet && <div className="sheet-backdrop coin-backdrop" onClick={() => setShowCoinSheet(false)}>
      <section className="sheet coin-sheet" role="dialog" aria-label="Buy coins" onClick={(e) => e.stopPropagation()}>
        <div className="comments-heading"><h3>Get coins</h3><button className="ghost small" onClick={() => setShowCoinSheet(false)} aria-label="Close">✕</button></div>
        <p className="muted">Use coins to send gifts and support your favourite creators.</p>
        <div className="coin-pack-grid">{COIN_PACKS.map((pack) => <button type="button" key={pack.amount} className={Number(amount) === pack.amount ? 'coin-pack selected' : 'coin-pack'} onClick={() => setAmount(pack.amount)}><span className="coin-pack-amount">◉ {pack.amount.toLocaleString()}</span><strong>{pack.label}</strong><small>{pack.bonus}</small><span className="coin-pack-price">₦{pack.amount.toLocaleString()}</span></button>)}</div>
        <label className="coin-email-label">Receipt email (optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <p className="muted">Secure checkout is provided by Paystack. Coins are credited after payment confirmation.</p>
        <button className="coin-checkout" disabled={busy} onClick={checkout}>{busy ? 'Opening secure checkout…' : `Continue · ₦${Number(amount).toLocaleString()}`}</button>
      </section>
    </div>}
  </>;
}
