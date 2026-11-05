import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { toast } from '../toast.js';

const money = (minor, currency = 'NGN') => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format((Number(minor) || 0) / 100);

export default function CreatorStudio() {
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
    const d = await api('/v1/creator/dashboard'); setData(d);
    const m = await api('/v1/creator/matches'); setMatches(m.items || []);
    const discovered = await api('/v1/creator/discover'); setCreators(discovered.items || []);
    if (!data?.payoutProfile?.verified) { try { const b = await api('/v1/creator/payout-banks'); setBanks(b.items || []); } catch { setBanks([]); } }
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
    {!data.creator?.isCreator && <section className="panel"><h2>Become a creator</h2><p className="muted">Unlock creator tools. Monetization eligibility, payout verification and program rules still apply.</p><button disabled={busy} onClick={apply}>Enable creator tools</button></section>}
    <section className="studio-stats">
      <article><span>Available</span><strong>{money(data.wallet.availableMinor, currency)}</strong><small>Ready after holds</small></article>
      <article><span>Pending</span><strong>{money(data.wallet.pendingMinor, currency)}</strong><small>Security hold</small></article>
      <article><span>Posts</span><strong>{data.stats.posts}</strong><small>Published</small></article>
      <article><span>Gifts received</span><strong>{data.stats.gifts}</strong><small>Gift transactions</small></article>
    </section>
    <section className="panel"><div className="section-heading"><div><h2>Withdraw earnings</h2><p className="muted">Minimum withdrawal: {money(data.wallet.minimumPayoutMinor, currency)}</p></div></div>
      {!data.payoutProfile?.verified ? <><div className="notice"><strong>Payout setup required</strong><p>For Nigerian NGN payouts, Paystack verifies the account and stores the payout recipient. ClipVerse does not save your raw account number.</p></div><form onSubmit={setupPayout} className="payout-form"><label htmlFor="bank-code">Bank</label><select id="bank-code" value={bankCode} onChange={(e) => setBankCode(e.target.value)} required><option value="">Choose your bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select><label htmlFor="account-number">10-digit account number</label><input id="account-number" inputMode="numeric" autoComplete="off" maxLength={10} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789" required/><button disabled={busy}>Verify payout account</button></form>{accountVerified && <p className="verified-note">Verified: {accountVerified.accountName} · {accountVerified.bankName} · ending {accountVerified.last4}</p>}</> : <form onSubmit={payout} className="payout-form"><label htmlFor="withdraw-amount">Amount ({currency})</label><input id="withdraw-amount" type="number" min="5000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000.00" required/><button disabled={busy}>Request withdrawal</button></form>}
      <h3>Recent withdrawals</h3>{data.payouts.length ? <div className="history-list">{data.payouts.map((p) => <div className="history-row" key={p.id}><div><strong>{money(p.amountMinor, currency)}</strong><small>{new Date(p.createdAt).toLocaleDateString()}</small></div><span className={`status status-${p.status}`}>{p.status}</span></div>)}</div> : <p className="muted">No withdrawals yet.</p>}
    </section>
    <section className="panel"><div className="section-heading"><div><h2>Creator Match</h2><p className="muted">Invite another creator to a friendly live battle. Scores must be generated from verified in-app activity.</p></div><span className="match-icon">⚡</span></div>
      <form className="match-form" onSubmit={createMatch}><label htmlFor="opponent-id">Choose a creator</label><select id="opponent-id" value={opponent} onChange={(e) => setOpponent(e.target.value)} required><option value="">Select opponent</option>{creators.map((creator) => <option key={creator.id} value={creator.id}>@{creator.username} · {creator.followerCount} followers</option>)}</select>{creators.length === 0 && <p className="muted">No other creators have joined yet. Invite creators to enable matches.</p>}<button disabled={busy}>Invite to match</button></form>
      {matches.length > 0 && <div className="history-list">{matches.map((m) => <div className="history-row" key={m.id}><div><strong>Match · {m.status}</strong><small>{m.hostId === data.creator.id ? 'You invited a creator' : 'You were invited'}</small></div>{m.status === 'pending' && m.opponentId === data.creator.id && <div className="row-actions"><button className="small" onClick={() => respond(m.id, true)}>Accept</button><button className="small ghost" onClick={() => respond(m.id, false)}>Decline</button></div>}</div>)}</div>}
      <p className="muted">Live video rooms, realtime scoring and moderation are separate integrations; this match invitation flow does not pretend to start a live stream.</p>
    </section>
    <section className="panel"><h2>Grow your audience</h2><p className="muted">Share your ClipVerse profile with your community.</p><div className="row"><button className="ghost" onClick={() => { const url = `${window.location.origin}/u/${data.creator.username}`; navigator.clipboard?.writeText(url).then(() => toast('Profile link copied')).catch(() => toast(url)); }}>Copy profile link</button><button onClick={() => { const url = `${window.location.origin}/u/${data.creator.username}`; window.open(`https://wa.me/?text=${encodeURIComponent(`Follow me on ClipVerse: ${url}`)}`, '_blank', 'noopener,noreferrer'); }}>Share on WhatsApp</button></div></section>
    <p className="studio-footnote">Creator rewards are subject to eligibility, fraud checks, payment-provider verification and the published ClipVerse monetization terms. Views alone do not guarantee payment.</p>
  </main>;
}
