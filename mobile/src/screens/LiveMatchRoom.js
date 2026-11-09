import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../api';
import { useAppStore } from '../store';
import { logError } from '../lib/toast';
import Icon from '../components/Icon';
import { colors } from '../theme';

// Mirrors the web Creator Match room: match status, camera connect, LIVE gifts, and TURN notice.
const BRAND = '#4b5cff'; // web --brand

// Creator-to-creator video uses WebRTC, which this app does not have installed yet.
// Until the camera connection is implemented and MEDIA_READY is set to true, the start button does nothing.
const MEDIA_READY = false;

// Small option picker (the web page uses a <select>)
function OptionPicker({ value, options, placeholder, onChange, disabled, label }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <>
      <Pressable style={[styles.picker, disabled && styles.disabled]} onPress={() => !disabled && setOpen(true)} accessibilityLabel={label}>
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

export default function LiveMatchRoom() {
  const navigation = useNavigation();
  const route = useRoute();
  const matchId = route.params?.matchId;
  const currentUserId = useAppStore((s) => s.user?.id) || '';
  const [match, setMatch] = useState(null);
  const [roomState, setRoomState] = useState('Ready to connect');
  const [giftOptions, setGiftOptions] = useState({ posts: [], creators: [], gifts: [], match: null });
  const [coinBalance, setCoinBalance] = useState(null);
  const [sendingGift, setSendingGift] = useState(false);
  const [selectedGift, setSelectedGift] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [turnConfigured, setTurnConfigured] = useState(false);

  useEffect(() => {
    let alive = true;
    api('/v1/creator/matches')
      .then(({ items }) => {
        const found = (items || []).find((item) => item.id === matchId);
        if (!found) throw new Error('Match not found or you are not a participant.');
        if (!alive) return;
        setMatch(found);
        if (found.status === 'active') {
          Promise.all([
            api(`/v1/live/matches/${matchId}/gift-options`),
            api('/v1/wallet'),
          ]).then(([options, wallet]) => {
            if (!alive) return;
            setGiftOptions(options);
            setCoinBalance(Number(wallet?.coinBalance ?? 0));
            if (options.gifts?.length) setSelectedGift(String(options.gifts[0].id));
          }).catch(logError);
        }
      })
      .catch(logError);
    return () => { alive = false; };
  }, [matchId]);

  async function sendLiveGift(recipientId) {
    if (sendingGift || !selectedGift) return;
    const post = giftOptions.posts.find((item) => item.authorId === recipientId);
    if (!post) { logError(new Error('This creator needs an eligible public post before gifts can be sent.')); return; }
    const gift = giftOptions.gifts.find((item) => String(item.id) === String(selectedGift));
    if (!gift) return;
    if (coinBalance !== null && coinBalance < Number(gift.coinPrice)) { logError(new Error('Not enough coins in your wallet.')); return; }
    setSendingGift(true); setGiftMessage('');
    try {
      const idempotencyKey = `live-${matchId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
      setMatch((previous) => (previous ? { ...previous, ...(score.match || {}) } : previous));
      setGiftOptions((previous) => ({ ...previous, match: score.match || previous.match }));
      const name = giftOptions.creators.find((creator) => creator.id === recipientId)?.displayName || 'creator';
      setGiftMessage(`Sent ${gift.name} to ${name}!`);
    } catch (e) {
      logError(e);
    } finally {
      setSendingGift(false);
    }
  }

  function startRoom() {
    if (!MEDIA_READY || !match || match.status !== 'active') return;
    setRoomState('Connecting…');
  }

  function stopRoom() {
    setRoomState('Disconnected');
  }

  const giftChoices = giftOptions.gifts.map((gift) => ({ value: gift.id, label: `${gift.name} — ${gift.coinPrice} coins` }));
  const recipients = match ? [match.hostId, match.opponentId].filter((id) => id !== currentUserId) : [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.body}>
      <View style={styles.header}>
        <View style={styles.headRow}>
          <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={10}><Icon name="arrow-left" size={26} /></Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => navigation.navigate('CreatorStudio')}>
            <Text style={styles.ghostText}>Back to studio</Text>
          </Pressable>
        </View>
        <Text style={styles.chip}>RIM SOCIAL LIVE</Text>
        <Text style={styles.h1}>Creator Match</Text>
        <Text style={styles.muted}>Private creator-to-creator video connection</Text>
      </View>

      {match && <>
        <View style={styles.videos}>
          <View style={styles.videoBox}><Text style={styles.videoName}>You</Text></View>
          <View style={styles.videoBox}><Text style={styles.videoName}>Opponent</Text></View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.h2}>{roomState}</Text>
          <Text style={styles.muted}>Match status: {match.status}. Allow camera and microphone access when prompted.</Text>
          {match.status === 'active' ? (
            <View style={styles.row}>
              <Pressable style={[styles.primaryBtn, !MEDIA_READY && styles.disabled]} onPress={startRoom} disabled={!MEDIA_READY}>
                <Text style={styles.primaryText}>Start camera &amp; connect</Text>
              </Pressable>
              <Pressable style={styles.ghostBtn} onPress={stopRoom}><Text style={styles.ghostText}>Stop camera</Text></Pressable>
            </View>
          ) : (
            <View style={styles.notice}><Text style={styles.noticeText}>The other creator must accept the invitation before the room can start.</Text></View>
          )}
        </View>

        {match.status === 'active' && (
          <View style={styles.panel}>
            <Text style={styles.h2}>Send a LIVE gift</Text>
            <Text style={styles.muted}>Gifts deduct coins from your wallet and add their value to this match's verified score.</Text>
            <Text style={styles.stats}>
              <Text style={styles.bold}>Coins:</Text> {coinBalance === null ? '' : coinBalance}  ·  <Text style={styles.bold}>Score:</Text> {Number(match.hostScore || 0)} – {Number(match.opponentScore || 0)}
            </Text>
            {giftOptions.gifts.length > 0 ? <>
              <Text style={styles.label}>Choose a gift</Text>
              <OptionPicker label="Choose a gift" value={selectedGift} options={giftChoices} onChange={setSelectedGift} disabled={sendingGift} />
              <View style={styles.row}>
                {recipients.map((creatorId) => {
                  const creator = giftOptions.creators.find((item) => item.id === creatorId);
                  return (
                    <Pressable key={creatorId} style={[styles.primaryBtn, (sendingGift || !selectedGift) && styles.disabled]} disabled={sendingGift || !selectedGift} onPress={() => sendLiveGift(creatorId)}>
                      <Text style={styles.primaryText}>{sendingGift ? 'Sending…' : `Gift ${creator?.displayName || creator?.username || 'opponent'}`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </> : <Text style={styles.muted}>No active gifts are available right now.</Text>}
            {giftMessage ? <View style={styles.notice}><Text style={styles.noticeText}>{giftMessage}</Text></View> : null}
            <Text style={styles.muted}>Only gifts sent to a participating creator's eligible public post count toward the match.</Text>
          </View>
        )}

        <Text style={turnConfigured ? styles.noticeText : styles.muted}>
          {turnConfigured ? 'TURN relay is configured for cross-network connection attempts.' : 'TURN relay is not configured on the server. Video may fail across restrictive mobile networks until TURN_URLS and TURN_SECRET (or TURN_USERNAME and TURN_PASSWORD) are set.'}
        </Text>
        <Text style={styles.muted}>This room is creator-to-creator WebRTC, not public audience broadcasting. A TURN provider must be deployed and configured before cross-network reliability can be confirmed.</Text>
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 40, gap: 14 },
  header: { gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  chip: { alignSelf: 'flex-start', color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text },
  h2: { fontSize: 17, fontWeight: '800', color: colors.text },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: '700', color: colors.text },
  stats: { color: colors.text, fontSize: 14 },
  label: { color: colors.text, fontWeight: '700', marginTop: 4 },
  videos: { flexDirection: 'row', gap: 10 },
  videoBox: { flex: 1, aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: '#050508', borderWidth: 1, borderColor: colors.line, justifyContent: 'flex-end', padding: 8 },
  videoName: { color: '#fff', fontWeight: '700', fontSize: 12 },
  panel: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryBtn: { backgroundColor: BRAND, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18 },
  primaryText: { color: '#fff', fontWeight: '700' },
  ghostBtn: { backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line },
  ghostText: { color: colors.text, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  notice: { backgroundColor: colors.surface, borderRadius: 12, padding: 12 },
  noticeText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  pickerText: { flex: 1, color: colors.text, fontSize: 15, marginRight: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.bg, borderRadius: 16, maxHeight: '70%', paddingVertical: 8 },
  option: { paddingVertical: 14, paddingHorizontal: 18 },
  optionText: { color: colors.text, fontSize: 15 },
});
