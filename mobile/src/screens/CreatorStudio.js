import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, Modal, Linking, Share } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../api';
import { logError } from '../lib/toast';
import Icon from '../components/Icon';
import { colors } from '../theme';

// Mirrors the web Creator Studio. The web sub-pages (earnings, cashout, matches, grow) are shown
// on this one screen; route.params.screen picks the starting section. Sections switch in place.
const BRAND = '#4b5cff'; // web --brand

const money = (minor, currency = 'NGN') => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format((Number(minor) || 0) / 100);
  } catch {
    return `${currency} ${((Number(minor) || 0) / 100).toFixed(2)}`;
  }
};

// Small option picker (the web page uses <select>)
function OptionPicker({ value, options, placeholder, onChange, label }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <>
      <Pressable style={styles.picker} onPress={() => setOpen(true)} accessibilityLabel={label}>
        <Text style={[styles.pickerText, !current && { color: colors.muted }]} numberOfLines={1}>{current ? current.label : placeholder}</Text>
        <Icon name="chevron-down" size={16} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <ScrollView>
              {options.map((o) => (
                <Pressable key={String(o.value)} style={styles.option} onPress={() => { onChange(String(o.value)); setOpen(false); }}>
                  <Text style={styles.optionText}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function CreatorStudio() {
  const navigation = useNavigation();
  const route = useRoute();
  const [screen, setScreen] = useState(route.params?.screen || 'home');
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
  useEffect(() => { load().catch(logError); }, []);

  async function run(action) {
    setBusy(true);
    try { await action(); await load(); }
    catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  const apply = () => run(() => api('/v1/creator/apply', { method: 'POST', body: {} }));

  function setupPayout() {
    if (accountNumber.length !== 10 || !bankCode) return;
    setBusy(true); setAccountVerified(null);
    api('/v1/creator/payout-profile', { method: 'POST', body: { accountNumber, bankCode } })
      .then((result) => { setAccountVerified(result); setAccountNumber(''); return load(); })
      .catch(logError)
      .finally(() => setBusy(false));
  }

  function payout() {
    const amountMinor = Math.round(Number(amount) * 100);
    run(async () => { await api('/v1/creator/payouts', { method: 'POST', body: { amountMinor } }); setAmount(''); });
  }

  function createMatch() {
    if (!opponent) return;
    run(async () => { await api('/v1/creator/matches', { method: 'POST', body: { opponentId: opponent } }); setOpponent(''); });
  }

  function respond(id, accept) {
    api(`/v1/creator/matches/${id}/respond`, { method: 'POST', body: { accept } })
      .then(load)
      .catch(logError);
  }

  if (!data) return <View style={styles.page} />;
  const currency = data.wallet.currency || 'NGN';
  const profileText = `Follow me on ClipVerse: @${data.creator?.username || ''}`;

  const shortcut = (key, title, sub) => (
    <Pressable style={styles.shortcut} onPress={() => setScreen(key)} key={key}>
      <Text style={styles.shortcutTitle}>{title}</Text>
      <Text style={styles.shortcutSub}>{sub}</Text>
    </Pressable>
  );

  const stat = (label, value, sub) => (
    <View style={styles.stat} key={label}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.body}>
      <View style={styles.heroRow}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={10}><Icon name="arrow-left" size={26} /></Pressable>
        <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('Upload')}>
          <Text style={styles.primaryText}>＋ Create</Text>
        </Pressable>
      </View>
      <View style={styles.hero}>
        <Text style={styles.chip}>CLIPVERSE CREATOR</Text>
        <Text style={styles.h1}>Creator Studio</Text>
        <Text style={styles.muted}>Publish, grow your audience and track your earnings in one place.</Text>
      </View>

      {!isHome && (
        <Pressable onPress={() => setScreen('home')}><Text style={styles.link}>← Creator Studio overview</Text></Pressable>
      )}

      {isHome && (
        <View style={styles.shortcuts}>
          {shortcut('earnings', 'Earnings', 'Wallet, posts and gifts')}
          {shortcut('cashout', 'Cash out', 'Bank and withdrawals')}
          {shortcut('matches', 'Creator Match', 'Invitations and live battles')}
          {shortcut('grow', 'Grow audience', 'Share your profile')}
        </View>
      )}

      {isHome && !data.creator?.isCreator && (
        <View style={styles.panel}>
          <Text style={styles.h2}>Become a creator</Text>
          <Text style={styles.muted}>Unlock creator tools. Monetization eligibility, payout verification and program rules still apply.</Text>
          <Pressable style={[styles.primaryBtn, busy && styles.disabled]} disabled={busy} onPress={apply}>
            <Text style={styles.primaryText}>Enable creator tools</Text>
          </Pressable>
        </View>
      )}

      {(isHome || screen === 'earnings') && (
        <View style={styles.stats}>
          {stat('Available', money(data.wallet.availableMinor, currency), 'Ready after holds')}
          {stat('Pending', money(data.wallet.pendingMinor, currency), 'Security hold')}
          {stat('Posts', String(data.stats.posts), 'Published')}
          {stat('Gifts received', String(data.stats.gifts), 'Gift transactions')}
        </View>
      )}

      {screen === 'cashout' && (
        <View style={styles.panel}>
          <Text style={styles.eyebrow}>CREATOR PAYOUTS</Text>
          <Text style={styles.h2}>Cash out</Text>
          <Text style={styles.muted}>Withdraw your eligible earnings securely.</Text>
          <View style={styles.balance}>
            <Text style={styles.muted}>Available to withdraw</Text>
            <Text style={styles.balanceValue}>{money(data.wallet.availableMinor, currency)}</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.muted}>Pending</Text>
              <Text style={styles.bold}>{money(data.wallet.pendingMinor, currency)}</Text>
            </View>
          </View>
          <View style={styles.policy}>
            <View style={styles.policyCell}>
              <Text style={styles.muted}>Minimum payout</Text>
              <Text style={styles.bold}>{money(data.wallet.minimumPayoutMinor, currency)}</Text>
            </View>
            <View style={styles.policyCell}>
              <Text style={styles.muted}>Destination</Text>
              <Text style={styles.bold}>{data.payoutProfile?.verified ? (data.payoutProfile.bankName || 'Verified bank') : 'Not set up'}</Text>
            </View>
          </View>

          {!data.payoutProfile?.verified ? <>
            <View style={styles.notice}>
              <Text style={styles.bold}>Set up your payout account</Text>
              <Text style={styles.muted}>Verify your bank account once. Your account number is sent securely to the payment provider and is not stored by RimSocial.</Text>
            </View>
            <Text style={styles.label}>Bank</Text>
            <OptionPicker label="Bank" value={bankCode} placeholder="Choose your bank" options={banks.map((b) => ({ value: b.code, label: b.name }))} onChange={setBankCode} />
            <Text style={styles.label}>10-digit account number</Text>
            <TextInput
              keyboardType="number-pad"
              autoComplete="off"
              maxLength={10}
              value={accountNumber}
              onChangeText={(v) => setAccountNumber(v.replace(/\D/g, '').slice(0, 10))}
              placeholder="0123456789"
              placeholderTextColor={colors.muted}
              style={styles.input}
              accessibilityLabel="10-digit account number"
            />
            <Pressable style={[styles.primaryBtn, (busy || accountNumber.length !== 10 || !bankCode) && styles.disabled]} disabled={busy || accountNumber.length !== 10 || !bankCode} onPress={setupPayout}>
              <Text style={styles.primaryText}>Verify payout account</Text>
            </Pressable>
            {accountVerified && <Text style={styles.muted}>Verified: {accountVerified.accountName} · {accountVerified.bankName} · ending {accountVerified.last4}</Text>}
          </> : <>
            <Text style={styles.label}>Withdrawal amount ({currency})</Text>
            <TextInput
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder={(data.wallet.minimumPayoutMinor / 100).toFixed(2)}
              placeholderTextColor={colors.muted}
              style={styles.input}
              accessibilityLabel="Withdrawal amount"
            />
            <Text style={styles.muted}>Minimum {money(data.wallet.minimumPayoutMinor, currency)} · Maximum {money(data.wallet.availableMinor, currency)}</Text>
            <Pressable
              style={[styles.primaryBtn, (busy || Number(amount) * 100 > Number(data.wallet.availableMinor) || Number(amount) * 100 < Number(data.wallet.minimumPayoutMinor) || !amount) && styles.disabled]}
              disabled={busy || Number(amount) * 100 > Number(data.wallet.availableMinor) || Number(amount) * 100 < Number(data.wallet.minimumPayoutMinor) || !amount}
              onPress={payout}
            >
              <Text style={styles.primaryText}>{busy ? 'Submitting…' : 'Request cash out'}</Text>
            </Pressable>
          </>}

          <Text style={styles.h3}>Recent withdrawals</Text>
          {data.payouts.length ? data.payouts.map((p) => (
            <View style={styles.historyRow} key={p.id}>
              <View>
                <Text style={styles.bold}>{money(p.amountMinor, currency)}</Text>
                <Text style={styles.muted}>{new Date(p.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.statusTag}>{p.status}</Text>
            </View>
          )) : <Text style={styles.muted}>No withdrawals yet.</Text>}
        </View>
      )}

      {screen === 'matches' && (
        <View style={styles.panel}>
          <View style={styles.sectionHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h2}>Creator Match</Text>
              <Text style={styles.muted}>Invite another creator to a friendly live battle. Scores must be generated from verified in-app activity.</Text>
            </View>
            <Text style={styles.matchIcon}>⚡</Text>
          </View>
          <Text style={styles.label}>Choose a creator</Text>
          <OptionPicker
            label="Choose a creator"
            value={opponent}
            placeholder="Select opponent"
            options={creators.map((c) => ({ value: c.id, label: `@${c.username} · ${c.followerCount} followers` }))}
            onChange={setOpponent}
          />
          {creators.length === 0 && <Text style={styles.muted}>No other creators have joined yet. Invite creators to enable matches.</Text>}
          <Pressable style={[styles.primaryBtn, (busy || !opponent) && styles.disabled]} disabled={busy || !opponent} onPress={createMatch}>
            <Text style={styles.primaryText}>Invite to match</Text>
          </Pressable>

          {matches.length > 0 && matches.map((m) => (
            <View style={styles.historyRow} key={m.id}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bold}>Match · {m.status}</Text>
                <Text style={styles.muted}>{m.hostId === data.creator.id ? 'You invited a creator' : 'You were invited'}</Text>
              </View>
              {m.status === 'pending' && m.opponentId === data.creator.id && (
                <View style={styles.row}>
                  <Pressable style={styles.smallBtn} onPress={() => respond(m.id, true)}><Text style={styles.primaryText}>Accept</Text></Pressable>
                  <Pressable style={styles.smallGhost} onPress={() => respond(m.id, false)}><Text style={styles.ghostText}>Decline</Text></Pressable>
                </View>
              )}
              {m.status === 'active' && (
                <Pressable style={styles.smallBtn} onPress={() => navigation.navigate('LiveMatchRoom', { matchId: m.id })}>
                  <Text style={styles.primaryText}>Open LIVE room</Text>
                </Pressable>
              )}
            </View>
          ))}
          <Text style={styles.muted}>Accepted matches can open the creator-to-creator video room. Public audience broadcasting, TURN relay, verified gift scoring and moderation still require production integrations.</Text>
        </View>
      )}

      {screen === 'grow' && (
        <View style={styles.panel}>
          <Text style={styles.h2}>Grow your audience</Text>
          <Text style={styles.muted}>Share your ClipVerse profile with your community.</Text>
          <View style={styles.row}>
            <Pressable style={styles.ghostBtn} onPress={() => Share.share({ message: profileText }).catch(logError)}>
              <Text style={styles.ghostText}>Copy profile link</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(profileText)}`).catch(logError)}>
              <Text style={styles.primaryText}>Share on WhatsApp</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isHome && <Text style={styles.footnote}>Creator rewards are subject to eligibility, fraud checks, payment-provider verification and the published ClipVerse monetization terms. Views alone do not guarantee payment.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 40, gap: 14 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: 6 },
  chip: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text },
  h3: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 6 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: '700', color: colors.text },
  link: { color: BRAND, fontWeight: '700', fontSize: 14 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcut: { width: '48%', flexGrow: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 4 },
  shortcutTitle: { fontWeight: '800', color: colors.text, fontSize: 15 },
  shortcutSub: { color: colors.muted, fontSize: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', flexGrow: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 2 },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  statSub: { color: colors.muted, fontSize: 11 },
  panel: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  matchIcon: { fontSize: 22 },
  balance: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 4 },
  balanceValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  policy: { flexDirection: 'row', gap: 10 },
  policyCell: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 2 },
  notice: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 4 },
  label: { color: colors.text, fontWeight: '700', marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: colors.text },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  pickerText: { flex: 1, color: colors.text, fontSize: 15, marginRight: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.bg, borderRadius: 16, maxHeight: '70%', paddingVertical: 8 },
  option: { paddingVertical: 14, paddingHorizontal: 18 },
  optionText: { color: colors.text, fontSize: 15 },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 12 },
  statusTag: { color: colors.text, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryBtn: { alignSelf: 'flex-start', backgroundColor: BRAND, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18 },
  primaryText: { color: '#fff', fontWeight: '700' },
  smallBtn: { backgroundColor: BRAND, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  smallGhost: { backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line },
  ghostBtn: { backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line },
  ghostText: { color: colors.text, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
});
