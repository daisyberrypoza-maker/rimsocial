import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, Modal, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../api';
import { useAppStore } from '../store';
import { toast, logError } from '../lib/toast';
import Icon from '../components/Icon';
import { colors } from '../theme';

// Mirrors the web Find, Flip & Fix page: opportunity lanes, listings, business profiles,
// offers, realized-profit records, Fix work updates and operator review.
const BRAND = '#4b5cff'; // web --brand
const LANES = [
  { id: 'find', title: 'Find', subtitle: 'Discover real businesses and verified opportunities', action: 'Find opportunity' },
  { id: 'flip', title: 'Flip', subtitle: 'Make a deal, improve value and track the outcome', action: 'List a deal' },
  { id: 'fix', title: 'Fix', subtitle: 'Request help, propose work and document delivery', action: 'Post a Fix job' },
];
const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR'];
const LANE_TINT = { find: ['#e6f3ff', '#14528b'], flip: ['#fff0d6', '#80500a'], fix: ['#e4f8eb', '#17663a'] };

const money = (minor, currency = 'NGN') => {
  if (minor == null) return 'Not stated';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(minor) / 100);
  } catch {
    return `${currency} ${(Number(minor) / 100).toFixed(2)}`;
  }
};
const toMinor = (value) => (value === '' || value == null ? null : Math.round(Number(value) * 100));
const blankOpportunity = (country = 'NG') => ({ lane: 'find', title: '', description: '', category: '', country, city: '', currency: country === 'NG' ? 'NGN' : 'USD', askingPrice: '', estimatedCost: '', targetPrice: '', budget: '', evidenceUrl: '', businessId: '' });
const blankProfile = (country = 'NG') => ({ name: '', category: '', description: '', country, city: '', website: '' });
const laneTitle = (id) => (LANES.find((x) => x.id === id) || LANES[0]).title;

// Option chips (the web page uses <select> for these)
function Chips({ options, value, onChange, disabled }) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const on = String(o.value) === String(value);
        return (
          <Pressable key={String(o.value)} style={[styles.choice, on && styles.choiceOn, disabled && styles.disabled]} onPress={() => !disabled && onChange(String(o.value))}>
            <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Input({ label, hint, multiline, ...rest }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.textarea]}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...rest}
      />
      {hint ? <Text style={styles.small}>{hint}</Text> : null}
    </View>
  );
}

function Btn({ title, onPress, ghost, small, disabled }) {
  return (
    <Pressable style={[ghost ? styles.ghostBtn : styles.primaryBtn, small && styles.btnSmall, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <Text style={ghost ? styles.ghostText : styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

export default function BusinessHub() {
  const navigation = useNavigation();
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
  const [profileForm, setProfileForm] = useState(() => blankProfile(user?.country || 'NG'));
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [updateKind, setUpdateKind] = useState('progress');
  const [updateBody, setUpdateBody] = useState('');
  const [updateEvidence, setUpdateEvidence] = useState('');
  const [actualSale, setActualSale] = useState('');
  const [actualCosts, setActualCosts] = useState('');
  const [financialNote, setFinancialNote] = useState('');
  const [adminShown, setAdminShown] = useState(false);
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
    } catch (e) { logError(e); }
    finally { setLoading(false); }
  }
  async function loadProfiles() {
    try { const result = await api('/v1/business/profiles/me'); setProfiles(result.items || []); }
    catch (e) { logError(e); }
  }
  async function openDetail(item) {
    setSelected(item);
    setDetail(null);
    setOfferAmount(item.lane === 'flip' && item.askingPriceMinor != null ? String(item.askingPriceMinor / 100) : '');
    try {
      const response = await api('/v1/business/opportunities/' + encodeURIComponent(item.id));
      setDetail(response);
      setActualSale(response.opportunity.actualSalePriceMinor == null ? '' : String(response.opportunity.actualSalePriceMinor / 100));
      setActualCosts(response.opportunity.actualCostMinor == null ? '' : String(response.opportunity.actualCostMinor / 100));
      setFinancialNote('');
    } catch (e) { logError(e); setSelected(null); }
  }
  function closeDetail() { setSelected(null); setDetail(null); }
  async function refreshDetail() {
    if (selected) await openDetail(selected);
    await loadItems();
  }
  useEffect(() => { loadItems(); }, [lane, tab]);
  useEffect(() => { loadProfiles(); }, []);

  const patchForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const patchProfile = (key, value) => setProfileForm((current) => ({ ...current, [key]: value }));
  const openCreate = (forLane = lane) => { setForm({ ...blankOpportunity(user?.country || 'NG'), lane: forLane }); setShowCreate(true); };

  async function createProfile() {
    if (!profileForm.name || !profileForm.category || !profileForm.description || !profileForm.country || !profileForm.city) return;
    setBusy(true);
    try {
      const result = await api('/v1/business/profiles', { method: 'POST', body: profileForm });
      setProfiles((current) => [result.profile, ...current]);
      setShowProfile(false);
      setProfileForm(blankProfile(user?.country || 'NG'));
      toast(result.message || 'Business profile submitted');
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  async function createOpportunity() {
    const needsPrices = form.lane === 'flip' ? [form.askingPrice, form.targetPrice] : form.lane === 'fix' ? [form.budget] : [];
    if (!form.title || !form.description || !form.category || !form.city || !form.country || needsPrices.some((v) => v === '')) return;
    setBusy(true);
    try {
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
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  async function sendOffer() {
    if (!selected || !offerAmount || !(Number(offerAmount) > 0)) return;
    setBusy(true);
    try {
      const amountMinor = Math.round(Number(offerAmount) * 100);
      await api('/v1/business/opportunities/' + encodeURIComponent(selected.id) + '/offers', {
        method: 'POST', body: { amountMinor, message: offerMessage },
        headers: { 'Idempotency-Key': makeIdempotencyKey() },
      });
      setOfferMessage(''); toast('Offer sent. No payment has been taken.');
      await refreshDetail();
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  async function offerAction(path, body, message) {
    setBusy(true);
    try {
      const r = await api(path, { method: 'POST', body });
      toast(r?.message || message);
      await refreshDetail();
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }
  const respondOffer = (offerId, decision) => offerAction('/v1/business/offers/' + encodeURIComponent(offerId) + '/respond', { decision }, '');
  const withdrawOffer = (offerId) => offerAction('/v1/business/offers/' + encodeURIComponent(offerId) + '/withdraw', {}, 'Offer withdrawn');
  const completeOffer = (offerId) => offerAction('/v1/business/offers/' + encodeURIComponent(offerId) + '/complete', {}, '');

  async function recordFinancials() {
    if (!selected || actualSale === '' || actualCosts === '') return;
    setBusy(true);
    try {
      const result = await api('/v1/business/opportunities/' + encodeURIComponent(selected.id) + '/financials', {
        method: 'PATCH',
        body: {
          actualSalePriceMinor: Math.round(Number(actualSale) * 100),
          actualCostMinor: Math.round(Number(actualCosts) * 100),
          note: financialNote,
        },
      });
      toast(result.message || 'Realized profit recorded');
      setFinancialNote('');
      await refreshDetail();
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  async function sendWorkUpdate() {
    if (!selected || !updateBody.trim()) return;
    setBusy(true);
    try {
      const r = await api('/v1/business/opportunities/' + encodeURIComponent(selected.id) + '/updates', { method: 'POST', body: { kind: updateKind, body: updateBody, evidenceUrl: updateEvidence || null } });
      toast(r.message); setUpdateBody(''); setUpdateEvidence(''); await refreshDetail();
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  async function pauseOpportunity(item) {
    setBusy(true);
    try { await api('/v1/business/opportunities/' + encodeURIComponent(item.id) + '/pause', { method: 'POST', body: {} }); toast('Listing status updated'); await loadItems(); }
    catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  async function loadAdminQueue() {
    if (!adminKey.trim()) return;
    setBusy(true);
    try {
      const [r, p] = await Promise.all([
        api('/v1/business/admin/opportunities?status=pending', { headers: { 'X-Admin-Api-Key': adminKey } }),
        api('/v1/business/admin/profiles?status=pending', { headers: { 'X-Admin-Api-Key': adminKey } }),
      ]);
      setAdminItems(r.items || []); setAdminProfiles(p.items || []); setAdminOpen(true);
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  async function reviewOpportunity(id, decision) {
    setBusy(true);
    try {
      await api('/v1/business/admin/opportunities/' + encodeURIComponent(id) + '/review', { method: 'PATCH', headers: { 'X-Admin-Api-Key': adminKey }, body: { decision } });
      setAdminItems((current) => current.filter((item) => item.id !== id));
      toast('Review saved');
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  async function reviewProfile(id, decision) {
    setBusy(true);
    try {
      await api('/v1/business/admin/profiles/' + encodeURIComponent(id) + '/review', { method: 'PATCH', headers: { 'X-Admin-Api-Key': adminKey }, body: { decision } });
      setAdminProfiles((current) => current.filter((item) => item.id !== id));
      toast('Business profile review saved');
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  const currentLane = LANES.find((item) => item.id === lane) || LANES[0];
  const isOwner = selected && selected.ownerId === user?.id;
  const ownOffers = detail?.offers || [];
  const openLink = (url) => url && Linking.openURL(url).catch(logError);

  // ---- Create listing form -------------------------------------------------
  const createForm = (
    <View style={styles.panel}>
      <View style={styles.rowBetween}>
        <Text style={styles.h2}>{(LANES.find((x) => x.id === form.lane) || {}).action || 'List opportunity'}</Text>
        <Pressable onPress={() => setShowCreate(false)}><Text style={styles.link}>Cancel</Text></Pressable>
      </View>
      <Text style={styles.label}>Workflow</Text>
      <Chips options={LANES.map((x) => ({ value: x.id, label: x.title }))} value={form.lane} onChange={(v) => patchForm('lane', v)} />
      <Input label="Title" value={form.title} onChangeText={(v) => patchForm('title', v)} maxLength={140} placeholder="Clear, specific opportunity or business problem" />
      <Input label="Description" value={form.description} onChangeText={(v) => patchForm('description', v)} maxLength={10000} multiline numberOfLines={4} placeholder="Explain the business, evidence, current problem, expected outcome and known risks." />
      <View style={styles.twoCol}>
        <View style={styles.half}><Input label="Category" value={form.category} onChangeText={(v) => patchForm('category', v)} maxLength={80} placeholder="e.g. wholesale" /></View>
        <View style={styles.half}><Input label="City" value={form.city} onChangeText={(v) => patchForm('city', v)} maxLength={100} /></View>
      </View>
      <View style={styles.twoCol}>
        <View style={styles.half}><Input label="Country code" value={form.country} onChangeText={(v) => patchForm('country', v.toUpperCase())} maxLength={2} autoCapitalize="characters" /></View>
        <View style={styles.half}>
          <Text style={styles.label}>Currency</Text>
          <Chips options={CURRENCIES.map((c) => ({ value: c, label: c }))} value={form.currency} onChange={(v) => patchForm('currency', v)} />
        </View>
      </View>
      {form.lane === 'flip' && <>
        <Input label={`Asking price (${form.currency})`} value={form.askingPrice} onChangeText={(v) => patchForm('askingPrice', v)} keyboardType="decimal-pad" />
        <Input label={`Target value (${form.currency})`} value={form.targetPrice} onChangeText={(v) => patchForm('targetPrice', v)} keyboardType="decimal-pad" />
        <Input label={`Estimated costs (${form.currency})`} value={form.estimatedCost} onChangeText={(v) => patchForm('estimatedCost', v)} keyboardType="decimal-pad" />
      </>}
      {form.lane === 'fix' && <Input label={`Budget (${form.currency})`} value={form.budget} onChangeText={(v) => patchForm('budget', v)} keyboardType="decimal-pad" hint="Enter 0 for a volunteer project. No payment is processed by this workflow yet." />}
      <Input label="Evidence link (HTTPS only)" value={form.evidenceUrl} onChangeText={(v) => patchForm('evidenceUrl', v)} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
      {profiles.length > 0 && <>
        <Text style={styles.label}>Business profile (optional)</Text>
        <Chips
          options={[{ value: '', label: 'No profile attached' }, ...profiles.map((p) => ({ value: p.id, label: `${p.name} · ${p.verificationStatus}` }))]}
          value={form.businessId}
          onChange={(v) => patchForm('businessId', v)}
        />
      </>}
      <Text style={styles.muted}>Your listing is not publicly discoverable until an operator approves it. Prices are stored in minor units. Creating a listing does not collect or hold money.</Text>
      <Btn title={busy ? 'Submitting…' : 'Submit for review'} onPress={createOpportunity} disabled={busy} />
    </View>
  );

  // ---- Business profile form -------------------------------------------------
  const profileFormView = (
    <View style={styles.panel}>
      <Text style={styles.h2}>Business profile</Text>
      <Text style={styles.muted}>New profiles remain pending until reviewed. Do not post private customer information.</Text>
      <Input label="Business name" value={profileForm.name} onChangeText={(v) => patchProfile('name', v)} maxLength={120} />
      <Input label="Category" value={profileForm.category} onChangeText={(v) => patchProfile('category', v)} maxLength={80} placeholder="Wholesale, retail, logistics…" />
      <Input label="Description" value={profileForm.description} onChangeText={(v) => patchProfile('description', v)} maxLength={4000} multiline numberOfLines={3} />
      <View style={styles.twoCol}>
        <View style={styles.half}><Input label="Country code" value={profileForm.country} onChangeText={(v) => patchProfile('country', v.toUpperCase())} maxLength={2} autoCapitalize="characters" /></View>
        <View style={styles.half}><Input label="City" value={profileForm.city} onChangeText={(v) => patchProfile('city', v)} maxLength={100} /></View>
      </View>
      <Input label="Website (HTTPS only, optional)" value={profileForm.website} onChangeText={(v) => patchProfile('website', v)} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
      <Btn title={busy ? 'Saving…' : 'Submit profile for review'} onPress={createProfile} disabled={busy} />
    </View>
  );

  // ---- Listing cards ------------------------------------------------------------
  const list = loading ? null : items.length === 0 ? (
    <View style={styles.panel}>
      <Text style={styles.h2}>{tab === 'mine' ? 'No listings yet' : 'No approved opportunities yet'}</Text>
      <Text style={styles.muted}>{tab === 'mine' ? 'Create a Find, Flip or Fix listing and track its review here.' : 'Try another workflow, or create a listing for operator review.'}</Text>
      <Btn title="Create listing" onPress={() => openCreate(lane)} />
    </View>
  ) : items.map((item) => {
    const tint = LANE_TINT[item.lane] || LANE_TINT.find;
    return (
      <View key={item.id} style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text style={[styles.badge, { backgroundColor: tint[0], color: tint[1] }]}>{item.lane.toUpperCase()}</Text>
          <Text style={styles.statusBadge}>{item.reviewStatus === 'approved' ? item.status.replace('_', ' ') : 'review ' + item.reviewStatus}</Text>
        </View>
        <Text style={styles.h2}>{item.title}</Text>
        <Text style={styles.muted}>{item.category} · {item.city}, {item.country}</Text>
        <Text style={styles.body}>{item.description}</Text>
        {item.reviewNote && <Text style={styles.body}><Text style={styles.bold}>Review feedback:</Text> {item.reviewNote}</Text>}
        <View style={styles.priceGrid}>
          {item.lane === 'flip' && <>
            <View style={styles.priceCell}><Text style={styles.small}>Asking price</Text><Text style={styles.bold}>{money(item.askingPriceMinor, item.currency)}</Text></View>
            <View style={styles.priceCell}><Text style={styles.small}>Target value</Text><Text style={styles.bold}>{money(item.targetPriceMinor, item.currency)}</Text></View>
            <View style={styles.priceCell}><Text style={styles.small}>Projected spread before costs</Text><Text style={styles.bold}>{money((item.targetPriceMinor || 0) - (item.askingPriceMinor || 0) - (item.estimatedCostMinor || 0), item.currency)}</Text></View>
          </>}
          {item.lane === 'fix' && <View style={styles.priceCell}><Text style={styles.small}>Budget</Text><Text style={styles.bold}>{money(item.budgetMinor, item.currency)}</Text></View>}
          {item.lane === 'find' && <View style={styles.priceCell}><Text style={styles.small}>Evidence</Text><Text style={styles.bold}>{item.evidenceUrl ? 'Provided' : 'Not supplied'}</Text></View>}
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.small}>{item.business?.verificationStatus === 'verified' ? '✓ Verified business profile' : 'Business identity not verified'}</Text>
          <View style={styles.row}>
            <Btn small ghost title="Details" onPress={() => openDetail(item)} />
            {item.ownerId === user?.id && !['in_progress', 'review', 'completed'].includes(item.status) && (
              <Btn small ghost title={item.status === 'paused' ? 'Resume' : 'Pause'} onPress={() => pauseOpportunity(item)} disabled={busy} />
            )}
          </View>
        </View>
      </View>
    );
  });

  // ---- Detail sheet ------------------------------------------------------------
  const detailBody = !detail ? null : (
    <>
      <Text style={styles.body}>{detail.opportunity.description}</Text>
      <Text style={styles.muted}>{detail.opportunity.category} · {detail.opportunity.city}, {detail.opportunity.country}</Text>
      <Text style={styles.muted}>Review: {detail.opportunity.reviewStatus}. Status: {detail.opportunity.status.replace('_', ' ')}. Currency: {detail.opportunity.currency}. No payment is processed in this version.</Text>
      {detail.opportunity.evidenceUrl && <Pressable onPress={() => openLink(detail.opportunity.evidenceUrl)}><Text style={styles.link}>Open evidence link</Text></Pressable>}
      {detail.opportunity.business && (
        <View style={styles.notice}>
          <Text style={styles.bold}>{detail.opportunity.business.name}</Text>
          <Text style={styles.muted}>{detail.opportunity.business.verificationStatus === 'verified' ? 'Verified profile' : 'Not verified'}</Text>
          <Text style={styles.muted}>{detail.opportunity.business.description}</Text>
        </View>
      )}

      {!isOwner && detail.opportunity.status === 'published' && detail.opportunity.reviewStatus === 'approved' && (
        <View style={styles.subPanel}>
          <Text style={styles.h3}>{selected.lane === 'fix' ? 'Propose to do this work' : 'Make an offer'}</Text>
          <Input label={`Offer amount (${detail.opportunity.currency})`} value={offerAmount} onChangeText={setOfferAmount} keyboardType="decimal-pad" />
          <Input label="Message" value={offerMessage} onChangeText={setOfferMessage} multiline numberOfLines={2} maxLength={1000} placeholder="Explain your offer, experience or proposed approach" />
          <Btn title={busy ? 'Sending…' : 'Send offer'} onPress={sendOffer} disabled={busy} />
        </View>
      )}

      {detail.opportunity.lane === 'flip' && detail.opportunity.status === 'completed' && detail.opportunity.assignedUserId === user?.id && (
        <View style={styles.subPanel}>
          <Text style={styles.h3}>Realized profit</Text>
          {detail.opportunity.realizedProfitMinor != null && (
            <View style={styles.notice}>
              <Text style={styles.muted}>Latest recorded result</Text>
              <Text style={styles.bold}>{money(detail.opportunity.realizedProfitMinor, detail.opportunity.currency)}</Text>
              <Text style={styles.small}>Sale price − additional costs − accepted purchase price. User-entered, not independently audited.</Text>
            </View>
          )}
          <Input label={`Actual sale price (${detail.opportunity.currency})`} value={actualSale} onChangeText={setActualSale} keyboardType="decimal-pad" />
          <Input label={`Additional costs, excluding purchase price (${detail.opportunity.currency})`} value={actualCosts} onChangeText={setActualCosts} keyboardType="decimal-pad" />
          <Input label="Notes / evidence summary" value={financialNote} onChangeText={setFinancialNote} multiline numberOfLines={2} maxLength={1000} />
          <Btn title={busy ? 'Saving…' : 'Record outcome'} onPress={recordFinancials} disabled={busy} />
          {detail.financialHistory?.length > 0 && <>
            <Text style={styles.h3}>Outcome history</Text>
            {detail.financialHistory.map((entry) => (
              <View key={entry.id} style={styles.notice}>
                <Text style={styles.bold}>{money(entry.realizedProfitMinor, detail.opportunity.currency)}</Text>
                <Text style={styles.body}>{entry.note || 'No note'}</Text>
                <Text style={styles.small}>Purchase {money(entry.purchasePriceMinor, entry.currency || detail.opportunity.currency)} · Sale {money(entry.actualSalePriceMinor, detail.opportunity.currency)} · Costs {money(entry.actualCostMinor, detail.opportunity.currency)} · {new Date(entry.createdAt).toLocaleString()}</Text>
              </View>
            ))}
          </>}
        </View>
      )}

      {detail.offers?.length > 0 && (
        <View style={styles.subPanel}>
          <Text style={styles.h3}>Offers / agreements</Text>
          {detail.offers.map((offer) => (
            <View key={offer.id} style={styles.notice}>
              <View style={styles.rowBetween}>
                <Text style={styles.bold}>{money(offer.amountMinor, offer.currency)}</Text>
                <Text style={styles.statusBadge}>{offer.status}</Text>
              </View>
              <Text style={styles.body}>{offer.message || 'No message supplied'}</Text>
              <Text style={styles.small}>Sender: {offer.senderId === user?.id ? 'You' : offer.senderId} · Recipient: {offer.recipientId === user?.id ? 'You' : offer.recipientId}</Text>
              <View style={styles.row}>
                {isOwner && offer.status === 'pending' && <>
                  <Btn small title="Accept" onPress={() => respondOffer(offer.id, 'accept')} disabled={busy} />
                  <Btn small ghost title="Reject" onPress={() => respondOffer(offer.id, 'reject')} disabled={busy} />
                </>}
                {offer.senderId === user?.id && offer.status === 'pending' && <Btn small ghost title="Withdraw" onPress={() => withdrawOffer(offer.id)} disabled={busy} />}
                {[offer.senderId, offer.recipientId].includes(user?.id) && ['accepted', 'completed'].includes(offer.status) && offer.status !== 'completed' && (
                  <Btn small title="Confirm completion" onPress={() => completeOffer(offer.id)} disabled={busy} />
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {detail.opportunity.lane === 'fix' && ['in_progress', 'review'].includes(detail.opportunity.status) && (
        <View style={styles.subPanel}>
          <Text style={styles.h3}>Work progress</Text>
          {(detail.updates || []).map((update) => (
            <View key={update.id} style={styles.notice}>
              <Text style={styles.statusBadge}>{update.kind}</Text>
              <Text style={styles.body}>{update.body}</Text>
              {update.evidenceUrl && <Pressable onPress={() => openLink(update.evidenceUrl)}><Text style={styles.link}>View evidence</Text></Pressable>}
              <Text style={styles.small}>{new Date(update.createdAt).toLocaleString()}</Text>
            </View>
          ))}
          {[detail.opportunity.ownerId, detail.opportunity.assignedUserId].includes(user?.id) && (
            <View style={styles.notice}>
              <Text style={styles.h3}>Post a work update</Text>
              <Text style={styles.label}>Update type</Text>
              <Chips
                options={[
                  { value: 'progress', label: 'Progress' },
                  { value: 'blocker', label: 'Blocker' },
                  ...(detail.opportunity.assignedUserId === user?.id ? [{ value: 'completion', label: 'Submit completion' }] : []),
                ]}
                value={updateKind}
                onChange={setUpdateKind}
              />
              <Input label="Update" value={updateBody} onChangeText={setUpdateBody} multiline numberOfLines={3} maxLength={2000} />
              <Input label="Evidence link (HTTPS)" value={updateEvidence} onChangeText={setUpdateEvidence} autoCapitalize="none" keyboardType="url" />
              <Btn title={busy ? 'Saving…' : 'Save update'} onPress={sendWorkUpdate} disabled={busy} />
            </View>
          )}
        </View>
      )}
    </>
  );

  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={10}><Icon name="arrow-left" size={26} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body2}>
        <View style={styles.hero}>
          <Text style={styles.chip}>RIMSOCIAL BUSINESS</Text>
          <Text style={styles.h1}>Find, Flip &amp; Fix</Text>
          <Text style={styles.muted}>Find opportunities, negotiate real deals, and document the work that improves a business.</Text>
          <Btn title="＋ List opportunity" onPress={() => openCreate(lane)} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
          {LANES.map((item) => {
            const on = lane === item.id;
            return (
              <Pressable key={item.id} style={[styles.tab, on && styles.tabOn]} onPress={() => { setLane(item.id); setTab('discover'); }} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{item.title}</Text>
              </Pressable>
            );
          })}
          <Pressable style={[styles.tab, tab === 'mine' && styles.tabOn]} onPress={() => setTab('mine')} accessibilityRole="tab" accessibilityState={{ selected: tab === 'mine' }}>
            <Text style={[styles.tabText, tab === 'mine' && styles.tabTextOn]}>My listings</Text>
          </Pressable>
        </ScrollView>

        {tab === 'discover' && <Text style={styles.muted}>{currentLane.subtitle}. Public discovery only shows opportunities approved by an operator.</Text>}

        <View style={styles.row}>
          <Btn small ghost title={showProfile ? 'Close business profile' : '＋ Business profile'} onPress={() => setShowProfile((value) => !value)} />
          <Btn small ghost title="My listings" onPress={() => { setTab('mine'); loadItems(); }} />
        </View>

        {showProfile && profileFormView}
        {showCreate && createForm}
        {list}

        <View style={styles.panel}>
          <Pressable style={styles.rowBetween} onPress={() => setAdminShown((v) => !v)}>
            <Text style={styles.h3}>Operator moderation (restricted)</Text>
            <Icon name="chevron-down" size={16} />
          </Pressable>
          {adminShown && <>
            <Text style={styles.muted}>Use only over HTTPS with the operator key. The key stays in this screen's memory and is not saved. Never paste the key into posts or chat.</Text>
            <Input label="Operator API key" value={adminKey} onChangeText={setAdminKey} secureTextEntry autoComplete="off" autoCapitalize="none" />
            <Btn small ghost title="Load pending listings" onPress={loadAdminQueue} disabled={busy} />
            {adminOpen && <>
              <Text style={styles.h3}>Opportunity review ({adminItems.length})</Text>
              {adminItems.length === 0 ? <Text style={styles.muted}>No pending opportunities.</Text> : adminItems.map((item) => (
                <View key={item.id} style={styles.notice}>
                  <Text style={styles.bold}>{item.title}</Text>
                  <Text style={styles.muted}>{item.lane} · {item.city} · owner {item.ownerId}</Text>
                  <Text style={styles.body}>{item.description}</Text>
                  {item.evidenceUrl && <Pressable onPress={() => openLink(item.evidenceUrl)}><Text style={styles.link}>Review evidence</Text></Pressable>}
                  <View style={styles.row}>
                    <Btn small title="Approve" onPress={() => reviewOpportunity(item.id, 'approve')} disabled={busy} />
                    <Btn small ghost title="Reject" onPress={() => reviewOpportunity(item.id, 'reject')} disabled={busy} />
                  </View>
                </View>
              ))}
              <Text style={styles.h3}>Business profile review ({adminProfiles.length})</Text>
              {adminProfiles.length === 0 ? <Text style={styles.muted}>No pending business profiles.</Text> : adminProfiles.map((profile) => (
                <View key={profile.id} style={styles.notice}>
                  <Text style={styles.bold}>{profile.name}</Text>
                  <Text style={styles.muted}>{profile.category} · {profile.city}, {profile.country} · owner {profile.ownerId}</Text>
                  <Text style={styles.body}>{profile.description}</Text>
                  {profile.website && <Pressable onPress={() => openLink(profile.website)}><Text style={styles.link}>Open website</Text></Pressable>}
                  <View style={styles.row}>
                    <Btn small title="Verify profile" onPress={() => reviewProfile(profile.id, 'approve')} disabled={busy} />
                    <Btn small ghost title="Reject" onPress={() => reviewProfile(profile.id, 'reject')} disabled={busy} />
                  </View>
                </View>
              ))}
            </>}
          </>}
        </View>
      </ScrollView>

      <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={closeDetail}>
        <View style={styles.page}>
          <View style={styles.detailHead}>
            <View style={{ flex: 1 }}>
              {selected && <Text style={[styles.badge, { backgroundColor: (LANE_TINT[selected.lane] || LANE_TINT.find)[0], color: (LANE_TINT[selected.lane] || LANE_TINT.find)[1] }]}>{selected.lane.toUpperCase()}</Text>}
              <Text style={styles.h2}>{selected?.title}</Text>
            </View>
            <Pressable onPress={closeDetail}><Text style={styles.link}>Close</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body2}>{detailBody}</ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function makeIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'offer-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: 16, paddingTop: 12 },
  body2: { padding: 16, paddingBottom: 40, gap: 14 },
  hero: { gap: 8, paddingBottom: 6 },
  chip: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text },
  h3: { fontSize: 15, fontWeight: '800', color: colors.text },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  small: { color: colors.muted, fontSize: 12, marginTop: 2 },
  bold: { fontWeight: '700', color: colors.text },
  link: { color: BRAND, fontWeight: '700', fontSize: 14 },
  tabsScroll: { flexGrow: 0 },
  tabs: { gap: 8, paddingVertical: 2 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  tabOn: { backgroundColor: BRAND, borderColor: BRAND },
  tabText: { color: colors.text, fontWeight: '700' },
  tabTextOn: { color: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  panel: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 10 },
  subPanel: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14, gap: 10 },
  notice: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 6 },
  field: { gap: 4 },
  label: { color: colors.text, fontWeight: '700', fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: colors.bg },
  textarea: { minHeight: 80 },
  twoCol: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  choiceOn: { backgroundColor: BRAND, borderColor: BRAND },
  choiceText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  choiceTextOn: { color: '#fff' },
  primaryBtn: { alignSelf: 'flex-start', backgroundColor: BRAND, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18 },
  ghostBtn: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontWeight: '700' },
  ghostText: { color: colors.text, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  badge: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '800', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, overflow: 'hidden' },
  statusBadge: { fontSize: 12, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  priceCell: { flexGrow: 1, minWidth: '45%', backgroundColor: colors.surface, borderRadius: 12, padding: 10, gap: 2 },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
});
