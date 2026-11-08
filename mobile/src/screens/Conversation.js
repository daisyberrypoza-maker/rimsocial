import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { messageTime } from '../lib/format';
import { logError } from '../lib/toast';
import { colors } from '../theme';

// One chat. Messages refresh every few seconds; the newest message is at the bottom.
export default function Conversation() {
  const navigation = useNavigation();
  const { userId, user: passedUser } = useRoute().params;
  const me = useAppStore((s) => s.user);
  const [user, setUser] = useState(passedUser || null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api(`/v1/messages/with/${userId}/info`).then((d) => { if (alive && d.user) setUser(d.user); }).catch(logError);
    const load = () => api(`/v1/messages/with/${userId}`)
      .then((d) => { if (alive) setMessages(d.items || []); })
      .catch(logError);
    load();
    api(`/v1/messages/with/${userId}/read`, { method: 'POST' }).catch(() => {});
    const timer = setInterval(load, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [userId]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const sent = await api(`/v1/messages/with/${userId}`, { method: 'POST', body: { body: text } });
      setMessages((list) => [...list, sent]);
      setBody('');
    } catch (e) { logError(e); }
    finally { setSending(false); }
  }

  // The list is shown newest-first so the latest message stays at the bottom without scrolling
  const newestFirst = [...messages].reverse();

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={24} /></Pressable>
        <Avatar user={user || {}} size={36} />
        <Text style={styles.name} numberOfLines={1}>{user?.displayName || user?.username || ''}</Text>
      </View>
      <FlatList
        ref={listRef}
        data={newestFirst}
        inverted
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => {
          const mine = item.senderId === me?.id;
          return (
            <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={mine ? styles.mineText : styles.theirsText}>{item.body}</Text>
                <Text style={styles.time}>{messageTime(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
      />
      <View style={styles.composer}>
        <TextInput style={styles.input} value={body} onChangeText={setBody} placeholder="Message…" placeholderTextColor={colors.muted} maxLength={2000} />
        <Pressable onPress={send} disabled={!body.trim() || sending} accessibilityLabel="Send"><Icon name="send" size={24} color={body.trim() ? colors.text : colors.muted} /></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  bubbleRow: { flexDirection: 'row', marginVertical: 3 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  mine: { backgroundColor: colors.text },
  theirs: { backgroundColor: colors.surface },
  mineText: { color: '#fff', fontSize: 16 },
  theirsText: { color: colors.text, fontSize: 16 },
  time: { fontSize: 10, color: colors.muted, marginTop: 2, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.line },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.text },
});
