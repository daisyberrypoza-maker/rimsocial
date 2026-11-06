import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';

const LANES = [
  { id: 'find', title: 'Find', subtitle: 'Discover real businesses and verified opportunities', action: 'Find opportunity' },
  { id: 'flip', title: 'Flip', subtitle: 'Make a deal, improve value and track the outcome', action: 'List a deal' },
  { id: 'fix', title: 'Fix', subtitle: 'Request help, propose work and document delivery', action: 'Post a Fix job' },
];
const money = (minor, currency = 'NGN') => minor == null ? 'Not stated' : new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(minor) / 100);
const blankOpportunity = (country = 'NG') => ({ lane: 'find', title: '', description: '', category: '', country, city: '', currency: country === 'NG' ? 'NGN' : 'USD', askingPrice: '', estimatedCost: '', targetPrice: '', budget: '', evidenceUrl: '', businessId: '' });

export default function BusinessHub() {
  const user = useAppStore((s) => s.user);
  const [lane, setLane] = useState('find');
  const [tab, setTab] = useState('discover');
  const [items, setItems] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [form, setForm] = useState(() => blankOpportunity(user?.country || 'NG'));
  const [profileForm, setProfileForm] = useState({ name: '', category: '', description: '', country: user?.country || 'NG', city: '', website: '' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [updateKind, setUpdateKind] = useState('progress');
  const [updateBody, setUpdateBody] = useState('');
  const [updateEvidence, setUpdateEvidence] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [adminItems, setAdminItems] = useState([]);
  const [adminProfiles, setAdminProfiles] = useState([]);
  const [adminOpen, setAdminOpen] = useState(false);

  async function loadItems() {
    setLoading(true);
    try {
      const path = tab === 'mine' ? '/v1/business/opportunities/mine' : '/v1/business/opportunities?lane=' + encodeURIComponent(lane);
      const result = await api(path);
      setItems(result.items || []);
    } catch (e) { toast(e.message); }
    finally { setLoading(false); }
  }
  async function loadProfiles() {
    try { const result = await api('/v1/business/profiles/me'); setProfiles(result.items || []); }
    catch (e) { toast(e.message); }
  }
  async function openDetail(item) {
    setSelected(item);
    setDetail(null);
    setOfferAmount(item.lane === 'flip' && item.askingPriceMinor != null ? String(item.askingPriceMinor / 100) : '');
    try { setDetail(await api('/v1/business/opportunities/' + encodeURIComponent(item.id))); }
    catch (e) { toast(e.message); setSelected(null); }
  }
  async function refreshDetail() {
    if (selected) await openDetail(selected);
    await loadItems();
  }
  useEffect(() => { loadItems(); }, [lane, tab]);
  useEffect(() => { loadProfiles(); }, []);

  function patchForm(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function patchProfile(key, value) { setProfileForm((current) => ({ ...current, [key]: value })); }
  async function createProfile(e) {
    e.preventDefault(); setBusy(true);
    try {
      const result = await api('/v1/business/profiles', { method: 'POST', body: profileForm });
      setProfiles((current) => [result.profile, ...current]);
      setShowProfile(false);
      setProfileForm({ name: '', category: '', description: '', country: user?.country || 'NG', city: '', website: '' });
      toast(result.message || 'Business profile submitted');
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }
  async function createOpportunity(e) {
    e.preventDefault(); setBusy(true);
    try {
      const toMinor = (value) => value === '' ? null : Math.round(Number(value) * 100);
      const body = {
        lane: form.lane, title: form.title, description: form.description, category: form.category,
        country: form.country, city: form.city, currency: form.currency,
        askingPriceMinor: toMinor(form.askingPrice), estimatedCostMinor: toMinor(form.estimatedCost),
        targetPriceMinor: toMinor(form.targetPrice), budgetMinor: toMinor(form.budget),
        evidenceUrl: form.evidenceUrl || null, businessId: form.businessId || null,
      };
      const result = await api('/v1/business/opportunities', { method: 'POST', body });
      toast(result.message || 'Opportunity submitted for review');
      setShowCreate(false); setTab('mine'); setLane(form.lane);
      setForm(blankOpportunity(user?.country || 'NG'));
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }
  async function sendOffer(e) {
    e.preventDefault(); if (!selected) return;
    setBusy(true);
    try {
      const amountMinor = Math.round(Number(offerAmount) * 100);
      await api('/v1/business/opportunities/' + encodeURIComponent(selected.id) + '/offers', {
        method: 'POST', body: { amountMinor, message: offerMessage },
        headers: { 'Idempotency-Key': makeIdempotencyKey() },
      });
      setOfferMessage(''); toast('Offer sent. No payment has been taken.');
      await refreshDetail();
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }
  async function respondOffer(offerId, decision) {
    setBusy(true);
    try { const r = await api('/v1/business/offers/' + encodeURIComponent(offerId) + '/respond', { method: 'POST', body: { decision } }); toast(r.message); await refreshDetail(); }
    catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }
  async function completeOffer(offerId) {
    setBusy(true);
    try { const r = await api('/v1/business/offers/' + encodeURIComponent(offerId) + '/complete', { method: 'POST', body: {} }); toast(r.message); await refreshDetail(); }
    catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }
  async function sendWorkUpdate(e) {
    e.preventDefault(); if (!selected) return;
    setBusy(true);
    try {
      const r = await api('/v1/business/opportunities/' + encodeURIComponent(selected.id) + '/updates', { method: 'POST', body: { kind: updateKind, body: updateBody, evidenceUrl: updateEvidence || null } });
      toast(r.message); setUpdateBody(''); setUpdateEvidence(''); await refreshDetail();
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }
  async function pauseOpportunity(item) {
    setBusy(true);
    try { await api('/v1/business/opportunities/' + encodeURIComponent(item.id) + '/pause', { method: 'POST', body: {} }); toast('Listing status updated'); await loadItems(); }
    catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }
  async function loadAdminQueue() {
    if (!adminKey.trim()) return toast('Enter the operator API key');
    setBusy(true);
    try {
      const [r, p] = await Promise.all([
        api('/v1/business/admin/opportunities?status=pending', { headers: { 'X-Admin-Api-Key': adminKey } }),
        api('/v1/business/admin/profiles?status=pending', { headers: { 'X-Admin-Api-Key': adminKey } }),
      ]);
      setAdminItems(r.items || []); setAdminProfiles(p.items || []); setAdminOpen(true);
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }
  async function reviewOpportunity(id, decision) {
    setBusy(true);
    try {
      await api('/v1/business/admin/opportunities/' + encodeURIComponent(id) + '/review', { method: 'PATCH', headers: { 'X-Admin-Api-Key': adminKey }, body: { decision } });
      setAdminItems((current) => current.filter((item) => item.id !== id));
      toast('Review saved');
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }
  async function reviewProfile(id, decision) {
    setBusy(true);
    try {
      await api('/v1/business/admin/profiles/' + encodeURIComponent(id) + '/review', { method: 'PATCH', headers: { 'X-Admin-Api-Key': adminKey }, body: { decision } });
      setAdminProfiles((current) => current.filter((item) => item.id !== id));
      toast('Business profile review saved');
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }

  const currentLane = LANES.find((item) => item.id === lane) || LANES[0];
  const isOwner = selected && selected.ownerId === user?.id;
  const ownOffers = detail?.offers || [];
  const myOffer = ownOffers.find((offer) => offer.senderId === user?.id && ['accepted', 'completed'].includes(offer.status));
  const activeOffer = ownOffers.find((offer) => offer.status === 'accepted');

  return <main className="page business-page">
    <header className="business-hero">
      <div><span className="chip">RIMSOCIAL BUSINESS</span><h1>Find, Flip &amp; Fix</h1><p>Find opportunities, negotiate real deals, and document the work that improves a business.</p></div>
      <button onClick={() => { setForm({ ...blankOpportunity(user?.country || 'NG'), lane }); setShowCreate(true); }}>＋ List opportunity</button>
    </header>
    <div className="business-tabs" role="tablist" aria-label="Find Flip Fix">
      {LANES.map((item) => <button key={item.id} role="tab" aria-selected={lane === item.id} className={lane === item.id ? 'on' : ''} onClick={() => { setLane(item.id); setTab('discover'); }}>{item.title}</button>)}
      <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My listings</button>
    </div>
    {tab === 'discover' && <p className="muted business-intro">{currentLane.subtitle}. Public discovery only shows opportunities approved by an operator.</p>}
    <div className="business-toolbar">
      <button className="ghost small" onClick={() => setShowProfile((value) => !value)}>{showProfile ? 'Close business profile' : '＋ Business profile'}</button>
      <button className="ghost small" onClick={() => { setTab('mine'); loadItems(); }}>My listings</button>
    </div>
    {showProfile && <form className="panel business-form" onSubmit={createProfile}>
      <h2>Business profile</h2><p className="muted">New profiles remain pending until reviewed. Do not post private customer information.</p>
      <label>Business name<input required maxLength={120} value={profileForm.name} onChange={(e) => patchProfile('name', e.target.value)} /></label>
      <label>Category<input required maxLength={80} value={profileForm.category} onChange={(e) => patchProfile('category', e.target.value)} placeholder="Wholesale, retail, logistics…" /></label>
      <label>Description<textarea required maxLength={4000} rows={3} value={profileForm.description} onChange={(e) => patchProfile('description', e.target.value)} /></label>
      <div className="business-form-grid"><label>Country code<input required maxLength={2} value={profileForm.country} onChange={(e) => patchProfile('country', e.target.value.toUpperCase())} /></label><label>City<input required maxLength={100} value={profileForm.city} onChange={(e) => patchProfile('city', e.target.value)} /></label></div>
      <label>Website (HTTPS only, optional)<input type="url" value={profileForm.website} onChange={(e) => patchProfile('website', e.target.value)} placeholder="https://…" /></label>
      <button disabled={busy}>{busy ? 'Saving…' : 'Submit profile for review'}</button>
    </form>}
    {showCreate && <form className="panel business-form" onSubmit={createOpportunity}>
      <div className="business-form-heading"><h2>{LANES.find((x) => x.id === form.lane)?.action || 'List opportunity'}</h2><button type="button" className="ghost small" onClick={() => setShowCreate(false)}>Cancel</button></div>
      <label>Workflow<select required value={form.lane} onChange={(e) => patchForm('lane', e.target.value)}>{LANES.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
      <label>Title<input required maxLength={140} value={form.title} onChange={(e) => patchForm('title', e.target.value)} placeholder="Clear, specific opportunity or business problem" /></label>
      <label>Description<textarea required maxLength={10000} rows={4} value={form.description} onChange={(e) => patchForm('description', e.target.value)} placeholder="Explain the business, evidence, current problem, expected outcome and known risks." /></label>
      <div className="business-form-grid"><label>Category<input required maxLength={80} value={form.category} onChange={(e) => patchForm('category', e.target.value)} placeholder="e.g. wholesale" /></label><label>City<input required maxLength={100} value={form.city} onChange={(e) => patchForm('city', e.target.value)} /></label></div>
      <div className="business-form-grid"><label>Country code<input required maxLength={2} value={form.country} onChange={(e) => patchForm('country', e.target.value.toUpperCase())} /></label><label>Currency<select value={form.currency} onChange={(e) => patchForm('currency', e.target.value)}>{['NGN','USD','GBP','EUR','GHS','KES','ZAR'].map((c) => <option key={c}>{c}</option>)}</select></label></div>
      {form.lane === 'flip' && <div className="business-form-grid"><label>Asking price ({form.currency})<input required type="number" min="0" step="0.01" value={form.askingPrice} onChange={(e) => patchForm('askingPrice', e.target.value)} /></label><label>Target value ({form.currency})<input required type="number" min="0" step="0.01" value={form.targetPrice} onChange={(e) => patchForm('targetPrice', e.target.value)} /></label><label>Estimated costs ({form.currency})<input type="number" min="0" step="0.01" value={form.estimatedCost} onChange={(e) => patchForm('estimatedCost', e.target.value)} /></label></div>}
      {form.lane === 'fix' && <label>Budget ({form.currency})<input required type="number" min="0" step="0.01" value={form.budget} onChange={(e) => patchForm('budget', e.target.value)} /><small className="muted">Enter 0 for a volunteer project. No payment is processed by this workflow yet.</small></label>}
      <label>Evidence link (HTTPS only)<input type="url" value={form.evidenceUrl} onChange={(e) => patchForm('evidenceUrl', e.target.value)} placeholder="https://…" /></label>
      {profiles.length > 0 && <label>Business profile (optional)<select value={form.businessId} onChange={(e) => patchForm('businessId', e.target.value)}><option value="">No profile attached</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.verificationStatus}</option>)}</select></label>}
      <p className="muted">Your listing is not publicly discoverable until an operator approves it. Prices are stored in minor units. Creating a listing does not collect or hold money.</p>
      <button disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</button>
    </form>}
    {loading ? <p className="muted center">Loading opportunities…</p> : items.length === 0 ? <section className="panel business-empty"><h2>{tab === 'mine' ? 'No listings yet' : 'No approved opportunities yet'}</h2><p className="muted">{tab === 'mine' ? 'Create a Find, Flip or Fix listing and track its review here.' : 'Try another workflow, or create a listing for operator review.'}</p><button onClick={() => { setForm({ ...blankOpportunity(user?.country || 'NG'), lane }); setShowCreate(true); }}>Create listing</button></section> : <section className="business-list">
      {items.map((item) => <article className="panel business-card" key={item.id}>
        <div className="business-card-top"><span className={'business-lane lane-' + item.lane}>{item.lane.toUpperCase()}</span><span className={'business-status status-' + item.reviewStatus}>{item.reviewStatus === 'approved' ? item.status.replace('_', ' ') : 'review ' + item.reviewStatus}</span></div>
        <h2>{item.title}</h2><p className="muted">{item.category} · {item.city}, {item.country}</p><p className="business-description">{item.description}</p>
        <div className="business-price-grid">
          {item.lane === 'flip' && <><span><small>Asking price</small><strong>{money(item.askingPriceMinor, item.currency)}</strong></span><span><small>Target value</small><strong>{money(item.targetPriceMinor, item.currency)}</strong></span></>}
          {item.lane === 'fix' && <span><small>Budget</small><strong>{money(item.budgetMinor, item.currency)}</strong></span>}
          {item.lane === 'find' && <span><small>Evidence</small><strong>{item.evidenceUrl ? 'Provided' : 'Not supplied'}</strong></span>}
        </div>
        <div className="business-card-footer"><span className="muted">{item.business?.verificationStatus === 'verified' ? '✓ Verified business profile' : 'Business identity not verified'}</span><div><button className="ghost small" onClick={() => openDetail(item)}>Details</button>{item.ownerId === user?.id && !['in_progress','review','completed'].includes(item.status) && <button className="ghost small" onClick={() => pauseOpportunity(item)} disabled={busy}>{item.status === 'paused' ? 'Resume' : 'Pause'}</button>}</div></div>
      </article>)}
    </section>}
    {selected && <div className="sheet-backdrop business-backdrop" onClick={() => { setSelected(null); setDetail(null); }}>
      <section className="sheet business-detail" role="dialog" aria-modal="true" aria-label="Opportunity details" onClick={(e) => e.stopPropagation()}>
        <div className="business-detail-heading"><div><span className={'business-lane lane-' + selected.lane}>{selected.lane.toUpperCase()}</span><h2>{selected.title}</h2></div><button className="ghost small" onClick={() => { setSelected(null); setDetail(null); }}>Close</button></div>
        {!detail ? <p className="muted">Loading details…</p> : <>
          <p>{detail.opportunity.description}</p><p className="muted">{detail.opportunity.category} · {detail.opportunity.city}, {detail.opportunity.country}</p>
          <p className="muted">Review: {detail.opportunity.reviewStatus}. Status: {detail.opportunity.status.replace('_', ' ')}. Currency: {detail.opportunity.currency}. No payment is processed in this version.</p>
          {detail.opportunity.evidenceUrl && <p><a href={detail.opportunity.evidenceUrl} target="_blank" rel="noreferrer">Open evidence link</a></p>}
          {detail.opportunity.business && <div className="business-profile-summary"><strong>{detail.opportunity.business.name}</strong><span className="muted">{detail.opportunity.business.verificationStatus === 'verified' ? 'Verified profile' : 'Not verified'}</span><p className="muted">{detail.opportunity.business.description}</p></div>}
          {!isOwner && detail.opportunity.status === 'published' && detail.opportunity.reviewStatus === 'approved' && <form className="business-inline-form" onSubmit={sendOffer}>
            <h3>{selected.lane === 'fix' ? 'Propose to do this work' : 'Make an offer'}</h3>
            <label>Offer amount ({detail.opportunity.currency})<input required type="number" min="0.01" step="0.01" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} /></label>
            <label>Message<textarea rows={2} maxLength={1000} value={offerMessage} onChange={(e) => setOfferMessage(e.target.value)} placeholder="Explain your offer, experience or proposed approach" /></label>
            <button disabled={busy}>{busy ? 'Sending…' : 'Send offer'}</button>
          </form>}
          {detail.offers?.length > 0 && <section className="business-detail-section"><h3>Offers / agreements</h3>{detail.offers.map((offer) => <article className="business-offer" key={offer.id}><div><strong>{money(offer.amountMinor, offer.currency)}</strong><span className="business-status">{offer.status}</span></div><p>{offer.message || 'No message supplied'}</p><small className="muted">Sender: {offer.senderId === user?.id ? 'You' : offer.senderId} · Recipient: {offer.recipientId === user?.id ? 'You' : offer.recipientId}</small><div className="business-offer-actions">{isOwner && offer.status === 'pending' && <><button className="small" disabled={busy} onClick={() => respondOffer(offer.id, 'accept')}>Accept</button><button className="ghost small" disabled={busy} onClick={() => respondOffer(offer.id, 'reject')}>Reject</button></>}{[offer.senderId, offer.recipientId].includes(user?.id) && ['accepted','completed'].includes(offer.status) && offer.status !== 'completed' && <button className="small" disabled={busy} onClick={() => completeOffer(offer.id)}>Confirm completion</button>}</div></article>)}</section>}
          {detail.opportunity.lane === 'fix' && ['in_progress','review'].includes(detail.opportunity.status) && <section className="business-detail-section"><h3>Work progress</h3>{(detail.updates || []).map((update) => <article className="business-work-update" key={update.id}><span className="business-status">{update.kind}</span><p>{update.body}</p>{update.evidenceUrl && <a href={update.evidenceUrl} target="_blank" rel="noreferrer">View evidence</a>}<small className="muted">{new Date(update.createdAt).toLocaleString()}</small></article>)}{[detail.opportunity.ownerId, detail.opportunity.assignedUserId].includes(user?.id) && <form className="business-inline-form" onSubmit={sendWorkUpdate}><h3>Post a work update</h3><label>Update type<select value={updateKind} onChange={(e) => setUpdateKind(e.target.value)}><option value="progress">Progress</option><option value="blocker">Blocker</option>{detail.opportunity.assignedUserId === user?.id && <option value="completion">Submit completion</option>}</select></label><label>Update<textarea required maxLength={2000} rows={3} value={updateBody} onChange={(e) => setUpdateBody(e.target.value)} /></label><label>Evidence link (HTTPS)<input type="url" value={updateEvidence} onChange={(e) => setUpdateEvidence(e.target.value)} /></label><button disabled={busy}>{busy ? 'Saving…' : 'Save update'}</button></form>}</section>}
        </>}
      </section>
    </div>}
    <details className="panel business-admin-tools"><summary>Operator moderation (restricted)</summary><p className="muted">Use only over HTTPS with the operator key. The key stays in this page's memory and is not saved. Never paste the key into posts or chat.</p><label>Operator API key<input type="password" autoComplete="off" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} /></label><button className="ghost small" disabled={busy} onClick={loadAdminQueue}>Load pending listings</button>{adminOpen && <div><h3>Opportunity review ({adminItems.length})</h3>{adminItems.length === 0 ? <p className="muted">No pending opportunities.</p> : adminItems.map((item) => <article className="business-admin-item" key={item.id}><strong>{item.title}</strong><p className="muted">{item.lane} · {item.city} · owner {item.ownerId}</p><p>{item.description}</p>{item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer">Review evidence</a>}<div><button disabled={busy} onClick={() => reviewOpportunity(item.id, 'approve')}>Approve</button><button className="ghost small" disabled={busy} onClick={() => reviewOpportunity(item.id, 'reject')}>Reject</button></div></article>)}<h3>Business profile review ({adminProfiles.length})</h3>{adminProfiles.length === 0 ? <p className="muted">No pending business profiles.</p> : adminProfiles.map((profile) => <article className="business-admin-item" key={profile.id}><strong>{profile.name}</strong><p className="muted">{profile.category} · {profile.city}, {profile.country} · owner {profile.ownerId}</p><p>{profile.description}</p>{profile.website && <a href={profile.website} target="_blank" rel="noreferrer">Open website</a>}<div><button disabled={busy} onClick={() => reviewProfile(profile.id, 'approve')}>Verify profile</button><button className="ghost small" disabled={busy} onClick={() => reviewProfile(profile.id, 'reject')}>Reject</button></div></article>)}</div>}</details>
  </main>;
}

function makeIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'offer-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
}
