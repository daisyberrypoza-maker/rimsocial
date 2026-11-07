import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { toast } from '../toast.js';

const money = (minor, currency = 'NGN') => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format((Number(minor) || 0) / 100);

export default function CreatorStudio() {
  const location = useLocation();
  const screen = location.pathname.split('/')[2] || 'home';
  const isHome = screen === 'home';
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [opponent, setOpponent] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [banks, setBanks] = useState([]);
  const [creators, setCreators] = useState([]);
  const [accountVerified, setAccountVerified] = useState(null);
  const [matches, setMatches] = useState([]);


  async function load() {
    const d = await api('/v1/creator/dashboard');
    setData(d);
    const [m, discovered] = await Promise.all([
      api('/v1/creator/matches'),
      api('/v1/creator/discover'),
    ]);
    setMatches(m.items || []);
    setCreators(discovered.items || []);
    if (!d.payoutProfile?.verified) {
      try { const b = await api('/v1/creator/payout-banks'); setBanks(b.items || []); }
      catch { setBanks([]); }
    } else {
      setBanks([]);
    }
  }
  useEffect(() => { load().catch((e) => toast(e.message)); }, []);

  async function apply() {
    setBusy(true); try { await api('/v1/creator/apply', { method: 'POST', body: {} }); await load(); toast('Creator tools enabled'); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function setupPayout(e) {
    e.preventDefault(); setBusy(true); setAccountVerified(null);
    try { const result = await api('/v1/creator/payout-profile', { method: 'POST', body: { accountNumber, bankCode } }); setAccountVerified(result); setAccountNumber(''); await load(); toast('Payout destination verified'); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function payout(e) {
    e.preventDefault(); setBusy(true);
    try { const amountMinor = Math.round(Number(amount) * 100); await api('/v1/creator/payouts', { method: 'POST', body: { amountMinor } }); setAmount(''); await load(); toast('Withdrawal request submitted'); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function createMatch(e) {
    e.preventDefault(); setBusy(true);
    try { await api('/v1/creator/matches', { method: 'POST', body: { opponentId: opponent } }); setOpponent(''); await load(); toast('Match invitation sent'); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function respond(id, accept) {
    try { await api(`/v1/creator/matches/${id}/respond`, { method: 'POST', body: { accept } }); await load(); }
    catch (e) { toast(e.message); }
  }

  if (!data) return <main className="page"><p className="muted center">Loading Creator Studio…</p></main>;
  const currency = data.wallet.currency || 'NGN';
  return <main className="page creator-page">
    <header className="creator-hero"><div><span className="chip">CLIPVERSE CREATOR</span><h1>Creator Studio</h1><p>Publish, grow your audience and track your earnings in one place.</p></div><Link className="studio-share" to="/upload">＋ Create</Link></header>
    {!isHome && <Link className="studio-share" to="/creator">← Creator Studio overview</Link>}
    {isHome && <nav className="studio-shortcuts" aria-label="Creator Studio sections">
      <Link to="/creator/earnings"><strong>Earnings</strong><span>Wallet, posts and gifts</span></Link>
      <Link to="/creator/cashout"><strong>Cash out</strong><span>Bank and withdrawals</span></Link>
      <Link to="/creator/matches"><strong>Creator Match</strong><span>Invitations and live battles</span></Link>
      <Link to="/creator/grow"><strong>Grow audience</strong><span>Share your profile</span></Link>
    </nav>}
    {isHome && !data.creator?.isCreator && <section className="panel"><h2>Become a creator</h2><p className="muted">Unlock creator tools. Monetization eligibility, payout verification and program rules still apply.</p><button disabled={busy} onClick={apply}>Enable creator tools</button></section>}
    {(isHome || screen === 'earnings') && <section className="studio-stats">
      <article><span>Available</span><strong>{money(data.wallet.availableMinor, currency)}</strong><small>Ready after holds</small></article>
      <article><span>Pending</span><strong>{money(data.wallet.pendingMinor, currency)}</strong><small>Security hold</small></article>
      <article><span>Posts</span><strong>{data.stats.posts}</strong><small>Published</small></article>
      <article><span>Gifts received</span><strong>{data.stats.gifts}</strong><small>Gift transactions</small></article>
    </section>}
    {(isHome || screen === 'cashout') && <section className="panel cashout-panel"><div className="cashout-heading"><div><span className="cashout-eyebrow">CREATOR PAYOUTS</span><h2>Cash out</h2><p className="muted">Withdraw your eligible earnings securely.</p></div><span className="cashout-icon">↗</span></div>
      <div className="cashout-balance"><span>Available to withdraw</span><strong>{money(data.wallet.availableMinor, currency)}</strong><div><span>Pending</span><b>{money(data.wallet.pendingMinor, currency)}</b></div></div>
      <div className="cashout-policy"><span><b>Minimum payout</b><strong>{money(data.wallet.minimumPayoutMinor, currency)}</strong></span><span><b>Destination</b><strong>{data.payoutProfile?.verified ? (data.payoutProfile.bankName || 'Verified bank') : 'Not set up'}</strong></span></div>
      {!data.payoutProfile?.verified ? <><div className="notice payout-notice"><strong>Set up your payout account</strong><p>Verify your bank account once. Your account number is sent securely to the payment provider and is not stored by RimSocial.</p></div><form onSubmit={setupPayout} className="payout-form"><label htmlFor="bank-code">Bank</label><select id="bank-code" value={bankCode} onChange={(e) => setBankCode(e.target.value)} required><option value="">Choose your bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select><label htmlFor="account-number">10-digit account number</label><input id="account-number" inputMode="numeric" autoComplete="off" maxLength={10} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789" required/><button disabled={busy}>Verify payout account</button></form>{accountVerified && <p className="verified-note">Verified: {accountVerified.accountName} · {accountVerified.bankName} · ending {accountVerified.last4}</p>}</> : <form onSubmit={payout} className="payout-form"><label htmlFor="withdraw-amount">Withdrawal amount ({currency})</label><input id="withdraw-amount" type="number" min={data.wallet.minimumPayoutMinor / 100} max={data.wallet.availableMinor / 100} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={(data.wallet.minimumPayoutMinor / 100).toFixed(2)} required/><small className="cashout-helper">Minimum {money(data.wallet.minimumPayoutMinor, currency)} · Maximum {money(data.wallet.availableMinor, currency)}</small><button className="cashout-submit" disabled={busy || Number(amount) * 100 > Number(data.wallet.availableMinor) || Number(amount) * 100 < Number(data.wallet.minimumPayoutMinor)}>{busy ? "Submitting…" : "Request cash out"}</button></form>}
      <h3>Recent withdrawals</h3>{data.payouts.length ? <div className="history-list">{data.payouts.map((p) => <div className="history-row" key={p.id}><div><strong>{money(p.amountMinor, currency)}</strong><small>{new Date(p.createdAt).toLocaleDateString()}</small></div><span className={`status status-${p.status}`}>{p.status}</span></div>)}</div> : <p className="muted">No withdrawals yet.</p>}
    </section>}
    {(isHome || screen === 'matches') && <section className="panel"><div className="section-heading"><div><h2>Creator Match</h2><p className="muted">Invite another creator to a friendly live battle. Scores must be generated from verified in-app activity.</p></div><span className="match-icon">⚡</span></div>
      <form className="match-form" onSubmit={createMatch}><label htmlFor="opponent-id">Choose a creator</label><select id="opponent-id" value={opponent} onChange={(e) => setOpponent(e.target.value)} required><option value="">Select opponent</option>{creators.map((creator) => <option key={creator.id} value={creator.id}>@{creator.username} · {creator.followerCount} followers</option>)}</select>{creators.length === 0 && <p className="muted">No other creators have joined yet. Invite creators to enable matches.</p>}<button disabled={busy}>Invite to match</button></form>
      {matches.length > 0 && <div className="history-list">{matches.map((m) => <div className="history-row" key={m.id}><div><strong>Match · {m.status}</strong><small>{m.hostId === data.creator.id ? 'You invited a creator' : 'You were invited'}</small></div>{m.status === 'pending' && m.opponentId === data.creator.id && <div className="row-actions"><button className="small" onClick={() => respond(m.id, true)}>Accept</button><button className="small ghost" onClick={() => respond(m.id, false)}>Decline</button></div>}{m.status === 'active' && <Link className="studio-share" to={`/creator/live/${m.id}`}>Open LIVE room</Link>}</div>)}</div>}
      <p className="muted">Accepted matches can open the creator-to-creator video room. Public audience broadcasting, TURN relay, verified gift scoring and moderation still require production integrations.</p>
    </section>}
    {(isHome || screen === 'grow') && <section className="panel"><h2>Grow your audience</h2><p className="muted">Share your ClipVerse profile with your community.</p><div className="row"><button className="ghost" onClick={() => { const url = `${window.location.origin}/u/${data.creator.username}`; navigator.clipboard?.writeText(url).then(() => toast('Profile link copied')).catch(() => toast(url)); }}>Copy profile link</button><button onClick={() => { const url = `${window.location.origin}/u/${data.creator.username}`; window.open(`https://wa.me/?text=${encodeURIComponent(`Follow me on ClipVerse: ${url}`)}`, '_blank', 'noopener,noreferrer'); }}>Share on WhatsApp</button></div></section>
    {isHome && <p className="studio-footnote">Creator rewards are subject to eligibility, fraud checks, payment-provider verification and the published ClipVerse monetization terms. Views alone do not guarantee payment.</p>}
  </main>;
}
