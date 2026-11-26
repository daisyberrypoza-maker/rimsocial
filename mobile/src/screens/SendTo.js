import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, TextInput, FlatList, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Search, UserPlus, Plus, Check, Clock, Send, Image as ImageIcon, MoreHorizontal, TabletSmartphone } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import { api } from '../api';
import { useAppStore } from '../store';
import { logError, toast } from '../lib/toast';

// Send To: the Snapchat-style share screen (web reference: ShareSheet). Pick friends or recents, optionally
// post to My Story, type one message, and send it to every selected friend at once. Blue #1ca8ff is the
// send bar, the selected names and the checks; the send button is a white circle with a blue arrow.
const BLUE = '#1ca8ff';
const GREY = '#8a8a8a';

export default function SendTo({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const me = useAppStore((s) => s.user);
  const url = route?.params?.url || '';
  const caption = route?.params?.caption || '';
  const storyId = route?.params?.storyId || null;
  const thumb = route?.params?.thumb || null;
  const text = [caption, url].filter(Boolean).join('\n');

  const [friends, setFriends] = useState([]);
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [storySelected, setStorySelected] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Everyone you follow plus recent chats, de-duplicated (same sources as the web sheet)
  useEffect(() => {
    let alive = true;
    const chats = api('/v1/messages/share-targets').then((d) => (d.items || []).map((item) => item.user)).catch(() => []);
    const following = me?.username
      ? api(`/v1/users/${encodeURIComponent(me.username)}/following`).then((d) => d.items || []).catch(() => [])
      : Promise.resolve([]);
    Promise.all([following, chats]).then(([follow, chat]) => {
      if (!alive) return;
      const seen = new Set();
      setFriends([...follow, ...chat].filter((u) => u && u.id && !seen.has(String(u.id)) && seen.add(String(u.id))));
    });
    return () => { alive = false; };
  }, [me?.username]);

  // Search people while typing
  useEffect(() => {
    const q = query.trim();
    if (!q) { setPeople([]); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      api(`/v1/search?q=${encodeURIComponent(q)}&type=people`)
        .then((d) => { if (alive) setPeople(d.people || []); })
        .catch(() => { if (alive) setPeople([]); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const shown = query.trim() ? people : friends;
  const isPicked = (user) => picked.some((u) => String(u.id) === String(user.id));
  const toggle = (user) => {
    if (sending) return;
    setPicked((list) => (list.some((u) => String(u.id) === String(user.id)) ? list.filter((u) => String(u.id) !== String(user.id)) : [...list, user]));
  };
  const canSend = (picked.length > 0 || (storySelected && storyId)) && !sending;
  const barVisible = picked.length > 0 || (storySelected && Boolean(storyId));
  // Recipient names in pick order: the chip shows the first, the rest read as a comma list (reference bar)
  const names = [storySelected && storyId ? 'My Story · Public' : null, ...picked.map((u) => u.displayName || u.username)].filter(Boolean);

  // Sends the typed message (or the link) to every selected friend, then reposts to My Story when toggled
  async function send() {
    if (!canSend) return;
    const body = message.trim() || text;
    setSending(true);
    try {
      if (picked.length) {
        const results = await Promise.allSettled(picked.map((user) => api(`/v1/messages/with/${user.id}`, { method: 'POST', body: { body } })));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed === picked.length) throw new Error('Could not send');
        if (failed) toast(`Sent to ${picked.length - failed}. ${failed} failed`);
      }
      if (storySelected && storyId) {
        await api(`/v1/stories/${storyId}/repost`, { method: 'POST' });
      }
      toast(picked.length ? `Sent to ${picked.length}` : 'Added to your story');
      setPicked([]);
      setStorySelected(false);
      setMessage('');
      navigation.goBack();
    } catch (e) {
      logError(e);
      toast(e?.message || 'Could not send');
    } finally {
      setSending(false);
    }
  }

  const header = (
    <View>
      <View style={styles.postTo}>
        <Text style={styles.sectionTitle}>Post to…</Text>
        <Pressable style={styles.newStory} onPress={() => navigation.navigate('Upload')} accessibilityLabel="New story">
          <Plus size={18} color="#000" /><Text style={styles.newStoryText}>New Story</Text>
        </Pressable>
      </View>
      {!query.trim() && storyId ? (
        <Pressable style={styles.row} onPress={() => setStorySelected((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: storySelected }}>
          <View style={styles.storyAvatar}><ImageIcon size={22} color="#000" /></View>
          <View style={styles.nameWrap}>
            <Text style={[styles.name, storySelected && styles.nameOn]}>My Story · Public</Text>
            <Text style={styles.sub} numberOfLines={1}>Friends, Followers, …</Text>
          </View>
          {storySelected ? <View style={styles.timePill}><Clock size={14} color="#000" /><Text style={styles.timeText}>24h</Text></View> : null}
          <Radio on={storySelected} />
        </Pressable>
      ) : null}
      {!query.trim() ? <Text style={styles.sectionTitle2}>Recents & Suggested</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Close">
          <ChevronDown size={28} color="#000" />
        </Pressable>
        <View style={styles.search}>
          <Search size={20} color={GREY} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Send To…" placeholderTextColor={GREY} style={styles.searchInput} accessibilityLabel="Search people to share with" />
        </View>
        <Pressable style={styles.iconBtn} accessibilityLabel="Add friends"><UserPlus size={24} color="#000" /></Pressable>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(user) => String(user.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={styles.empty}>{query.trim() ? 'No one found.' : 'Friends you follow and people you chat with appear here.'}</Text>}
        renderItem={({ item }) => {
          const on = isPicked(item);
          return (
            <Pressable style={styles.row} onPress={() => toggle(item)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <Avatar user={item} size={52} />
              <View style={styles.nameWrap}>
                <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>{item.displayName || item.username}</Text>
              </View>
              <Radio on={on} />
            </Pressable>
          );
        }}
        contentContainerStyle={{ paddingBottom: barVisible ? 180 : 24 }}
        keyboardShouldPersistTaps="handled"
      />

      {barVisible ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.composeRow}>
            {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} accessibilityLabel="Selected post" /> : null}
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Add a chat…"
              placeholderTextColor="rgba(255,255,255,0.92)"
              style={styles.chatInput}
              maxLength={2000}
              editable={!sending}
              accessibilityLabel="Message to send to everyone selected"
            />
          </View>
          <View style={styles.recipientRow}>
            <Pressable onPress={() => { setPicked([]); setStorySelected(false); }} style={styles.dots} accessibilityLabel="Clear selected people">
              <MoreHorizontal size={22} color="#fff" />
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
              {names.length > 1 ? <Text style={styles.namesText} numberOfLines={1}>{names.slice(1).join(', ')},</Text> : null}
              {names.length ? (
                <View style={styles.chip}>
                  <TabletSmartphone size={16} color="#fff" />
                  <Text style={styles.chipText} numberOfLines={1}>{names[0]}</Text>
                </View>
              ) : null}
            </ScrollView>
            <Pressable onPress={send} disabled={!canSend} style={[styles.send, !canSend && styles.sendOff]} accessibilityLabel={sending ? 'Sending' : `Send to ${picked.length + (storySelected ? 1 : 0)}`}>
              <Send size={22} color={BLUE} />
            </Pressable>
          </View>
        </View>
      ) : null}

    </KeyboardAvoidingView>
  );
}

function Radio({ on }) {
  return (
    <View style={[styles.radio, on && styles.radioOn]}>
      {on ? <Check size={16} color="#fff" strokeWidth={3} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 8, backgroundColor: '#fff' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1, height: 40, borderRadius: 20, backgroundColor: '#f1f1f1', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 },
  searchInput: { flex: 1, fontSize: 17, color: '#000', padding: 0 },
  postTo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#000' },
  sectionTitle2: { fontSize: 16, fontWeight: '600', color: '#000', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  newStory: { height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#f1f1f1', flexDirection: 'row', alignItems: 'center', gap: 4 },
  newStoryText: { fontSize: 15, fontWeight: '600', color: '#000' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 64, width: '100%', borderRadius: 0, borderBottomWidth: 1, borderBottomColor: '#e8e8e8', elevation: 0, shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  storyAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#f1f1f1', alignItems: 'center', justifyContent: 'center' },
  nameWrap: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600', color: '#000' },
  nameOn: { color: BLUE },
  sub: { fontSize: 14, color: GREY, marginTop: 2 },
  timePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: '#bdbdbd' },
  timeText: { fontSize: 14, fontWeight: '600', color: '#000' },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#bdbdbd', alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: BLUE, borderColor: BLUE },
  empty: { textAlign: 'center', color: GREY, padding: 24, fontSize: 15 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: BLUE, paddingTop: 10, paddingHorizontal: 12, gap: 8 },
  composeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 40, height: 60, borderRadius: 6, backgroundColor: '#0d3a57' },
  chatInput: { flex: 1, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.28)', paddingHorizontal: 18, fontSize: 17, color: '#fff' },
  namesText: { fontSize: 16, fontWeight: '600', color: '#fff', maxWidth: 220 },
  recipientRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dots: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  chipsScroll: { flex: 1, minWidth: 0 },
  chips: { gap: 6, alignItems: 'center' },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.28)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 15, fontWeight: '600', color: '#fff', maxWidth: 160 },
  send: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.55 },
});
