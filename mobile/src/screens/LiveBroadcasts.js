import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../api';
import { logError } from '../lib/toast';
import { mediaUrl } from '../config';
import Icon from '../components/Icon';
import { colors } from '../theme';

// Mirrors the web LIVE page: who is live now, Watch LIVE, Go LIVE, live chat, and search (route.params.search).
const BRAND = '#4b5cff'; // web --brand

// Video needs the LiveKit React Native SDK, which this app does not have installed yet.
// Until connectMedia() is implemented and MEDIA_READY is set to true, Go LIVE and Watch LIVE
// do nothing, so no broadcast starts that the phone cannot publish.
const MEDIA_READY = false;

async function connectMedia() {
  throw new Error('LIVE media is not available on this device yet');
}

export default function LiveBroadcasts() {
  const navigation = useNavigation();
  const route = useRoute();
  const searching = Boolean(route.params?.search);
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [role, setRole] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [busy, setBusy] = useState(false);
  const roomRef = useRef(null);
  const tracksRef = useRef([]);
  const chatRef = useRef(null);

  const q = query.trim().toLowerCase();
  const visibleItems = searching && q
    ? items.filter((item) => [item.title, item.host?.displayName, item.host?.username].some((v) => (v || '').toLowerCase().includes(q)))
    : items;

  const refresh = useCallback(async () => {
    try { const data = await api('/v1/broadcasts'); setItems(data.items || []); }
    catch (e) { logError(e); }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Live chat is polled every 3 seconds while a broadcast is open
  useEffect(() => {
    if (!selected) return undefined;
    let active = true;
    const loadChat = async () => {
      try { const data = await api(`/v1/broadcasts/${selected.id}/chat`); if (active) setMessages(data.items || []); }
      catch (e) { logError(e); }
    };
    loadChat();
    const timer = setInterval(loadChat, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [selected]);

  function leaveMedia() {
    const current = roomRef.current;
    roomRef.current = null;
    if (current) { try { current.disconnect(); } catch { /* already closed */ } }
    tracksRef.current.forEach((track) => { try { track.stop(); } catch { /* already stopped */ } });
    tracksRef.current = [];
  }

  useEffect(() => () => leaveMedia(), []); // unmount cleanup

  async function connectToBroadcast(broadcast, host) {
    if (!MEDIA_READY || busy) return;
    setBusy(true);
    try {
      const credentials = await api(`/v1/broadcasts/${broadcast.id}/token`, { method: 'POST', body: {} });
      const media = await connectMedia(credentials, host);
      roomRef.current = media.room;
      tracksRef.current = media.tracks || [];
      setSelected(broadcast);
      setRole(host ? 'host' : 'viewer');
      setMessages([]);
    } catch (e) {
      leaveMedia();
      logError(e);
    } finally { setBusy(false); }
  }

  async function startBroadcast() {
    if (!MEDIA_READY || busy || !title.trim()) return;
    setBusy(true);
    let createdId = null;
    try {
      const data = await api('/v1/broadcasts', { method: 'POST', body: { title: title.trim() } });
      createdId = data.broadcast?.id || null;
      setTitle('');
      await refresh();
      setBusy(false);
      await connectToBroadcast(data.broadcast, true);
    } catch (e) {
      // If the session was created but the camera or connection failed, end it so it is not left as a ghost LIVE
      if (createdId) {
        await api(`/v1/broadcasts/${createdId}/end`, { method: 'POST', body: {} }).catch(() => {});
        await refresh();
      }
      logError(e);
      setBusy(false);
    }
  }

  async function endBroadcast() {
    if (!selected) return;
    setBusy(true);
    try { await api(`/v1/broadcasts/${selected.id}/end`, { method: 'POST', body: {} }); }
    catch (e) { logError(e); }
    leaveMedia();
    setSelected(null); setRole(''); setMessages([]);
    await refresh();
    setBusy(false);
  }

  function exitViewer() {
    leaveMedia();
    setSelected(null); setRole(''); setMessages([]);
  }

  async function sendChat() {
    if (!selected || !chatText.trim()) return;
    const body = chatText.trim();
    setChatText('');
    try {
      const data = await api(`/v1/broadcasts/${selected.id}/chat`, { method: 'POST', body: { body } });
      setMessages((current) => [...current, data.message].slice(-60));
    } catch (e) { logError(e); setChatText(body); }
  }

  if (selected) {
    return (
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={10}><Icon name="arrow-left" size={26} /></Pressable>
          <Text style={styles.h1}>LIVE</Text>
          <View style={styles.liveInline}><View style={styles.dot} /><Text style={styles.muted}>Live broadcasts</Text></View>
        </View>
        <View style={styles.videoWrap}>
          <Text style={styles.videoLabel}>{role === 'host' ? 'YOU ARE LIVE' : 'LIVE'}</Text>
        </View>
        <View style={styles.roomActions}>
          {role === 'host'
            ? <Pressable style={styles.primaryBtn} onPress={endBroadcast} disabled={busy}><Text style={styles.primaryText}>{busy ? 'Ending…' : 'End LIVE'}</Text></Pressable>
            : <Pressable style={styles.ghostBtn} onPress={exitViewer} disabled={busy}><Text style={styles.ghostText}>Leave LIVE</Text></Pressable>}
          <Text style={styles.roomTitle} numberOfLines={1}>{selected.title}</Text>
        </View>
        <Text style={styles.chatHead}>Live chat</Text>
        <ScrollView style={styles.chatList} ref={chatRef} onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}>
          {messages.map((message) => (
            <Text key={message.id} style={styles.chatLine}>
              <Text style={styles.chatName}>{message.user?.displayName || message.user?.username || 'Viewer'} </Text>{message.body}
            </Text>
          ))}
        </ScrollView>
        <View style={styles.chatForm}>
          <TextInput value={chatText} onChangeText={setChatText} maxLength={500} placeholder="Say something…" placeholderTextColor={colors.muted} style={styles.chatInput} accessibilityLabel="Live chat message" onSubmitEditing={sendChat} />
          <Pressable style={[styles.primaryBtn, !chatText.trim() && styles.disabled]} onPress={sendChat} disabled={!chatText.trim()}><Text style={styles.primaryText}>Send</Text></Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={10}><Icon name="arrow-left" size={26} /></Pressable>
        <Text style={styles.h1}>LIVE</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {goLiveOpen ? (
          <View style={styles.goLive}>
            <TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder="What are you going LIVE about?" placeholderTextColor={colors.muted} style={styles.input} accessibilityLabel="LIVE title" />
            <Pressable style={[styles.primaryBtn, (busy || !MEDIA_READY) && styles.disabled]} onPress={startBroadcast} disabled={busy}>
              <Text style={styles.primaryText}>{busy ? 'Connecting…' : 'Go LIVE'}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.primaryBtn} onPress={() => setGoLiveOpen(true)}><Text style={styles.primaryText}>Go LIVE</Text></Pressable>
        )}

        {searching && (
          <TextInput value={query} onChangeText={setQuery} placeholder="Search who is live" placeholderTextColor={colors.muted} style={[styles.input, styles.search]} accessibilityLabel="Search who is live" />
        )}

        <View style={styles.list}>
          {visibleItems.length ? visibleItems.map((item) => (
            <View key={item.id} style={styles.card}>
              {item.host?.avatarUrl ? <Image source={{ uri: mediaUrl(item.host.avatarUrl) }} style={styles.photo} /> : <View style={[styles.photo, styles.photoEmpty]} />}
              <View style={styles.tagLive}><View style={styles.dotWhite} /><Text style={styles.tagText}>LIVE</Text></View>
              <View style={styles.countWrap}><Icon name="people" size={13} color="#fff" /><Text style={styles.countText}>{item.viewerCount || 0}</Text></View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.cardSub}>@{item.host?.username || 'creator'}</Text>
              </View>
              <Pressable style={[styles.watchBtn, (busy || !MEDIA_READY) && styles.disabled]} onPress={() => connectToBroadcast(item, false)} disabled={busy} accessibilityLabel={`Watch LIVE: ${item.title}`}>
                <Text style={styles.watchText}>{busy ? 'Joining…' : 'Watch LIVE'}</Text>
              </Pressable>
            </View>
          )) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{searching && q ? 'No one live matches your search.' : 'No one is live right now. Start a broadcast and invite your audience.'}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  h1: { fontSize: 18, fontWeight: '800', color: colors.text },
  spacer: { width: 26 },
  liveInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { color: colors.muted, fontSize: 13 },
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  goLive: { gap: 10 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text },
  search: { marginTop: 4 },
  primaryBtn: { backgroundColor: BRAND, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
  ghostBtn: { backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  ghostText: { color: colors.text, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  list: { gap: 14 },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#050508', minHeight: 180, justifyContent: 'flex-end' },
  photo: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  photoEmpty: { backgroundColor: '#1d1e22' },
  tagLive: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.heart, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },
  tagText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.heart },
  dotWhite: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  countWrap: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  countText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  cardCopy: { padding: 12, paddingBottom: 56 },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cardSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  watchBtn: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: '#fff', borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  watchText: { color: colors.text, fontWeight: '800' },
  empty: { padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 16 },
  emptyText: { color: colors.muted, textAlign: 'center' },
  videoWrap: { marginHorizontal: 16, aspectRatio: 3 / 4, borderRadius: 16, backgroundColor: '#050508', justifyContent: 'flex-start', overflow: 'hidden' },
  videoLabel: { color: '#fff', fontWeight: '800', fontSize: 12, margin: 10 },
  roomActions: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginTop: 12 },
  roomTitle: { flex: 1, color: colors.text, fontWeight: '700' },
  chatHead: { fontSize: 16, fontWeight: '800', color: colors.text, paddingHorizontal: 16, marginTop: 16 },
  chatList: { flex: 1, paddingHorizontal: 16, marginTop: 8 },
  chatLine: { color: colors.text, fontSize: 14, marginBottom: 6 },
  chatName: { fontWeight: '700' },
  chatForm: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.line },
  chatInput: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, color: colors.text },
});
