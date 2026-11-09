import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { logError } from '../lib/toast';
import { colors } from '../theme';

// Same look as the web conversation page (.dm-convo / .dm-bubble rules in styles.css)
const BLUE = '#3797f0';
const GREY = '#8e8e93';
const BUBBLE_THEIRS = '#efefef';

// One chat. Messages refresh every few seconds, oldest at the top and newest at the bottom.
export default function Conversation() {
  const navigation = useNavigation();
  const { userId, user: passedUser } = useRoute().params;
  const me = useAppStore((s) => s.user);
  const [partner, setPartner] = useState(passedUser || null);
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api(`/v1/messages/with/${userId}/info`).then((d) => { if (alive && d.user) setPartner(d.user); }).catch(logError);
    const load = () => api(`/v1/messages/with/${userId}`)
      .then((d) => {
        if (!alive) return;
        const items = d.items || [];
        setMessages(items);
        // Only incoming messages that are still unread need the read call
        if (items.some((m) => String(m.senderId) === String(userId) && !m.readAt)) {
          api(`/v1/messages/with/${userId}/read`, { method: 'POST', body: {} }).catch(() => {});
        }
      })
      .catch(logError);
    load();
    const timer = setInterval(load, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [userId]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setBody('');
    try {
      const data = await api(`/v1/messages/with/${userId}`, { method: 'POST', body: { body: text } });
      setMessages((current) => {
        const list = current || [];
        return list.some((m) => m.id === data.message.id) ? list : [...list, data.message];
      });
    } catch (e) {
      setBody(text);
      logError(e);
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(body.trim()) && !sending;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={26} /></Pressable>
        {partner && <Avatar user={partner} size={38} />}
        <Text style={styles.name} numberOfLines={1}>{partner ? (partner.displayName || partner.username) : ''}</Text>
      </View>
      <FlatList
        ref={listRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        data={messages || []}
        keyExtractor={(m) => String(m.id)}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={messages === null ? null : <Text style={styles.empty}>Say hello to start the conversation.</Text>}
        renderItem={({ item }) => {
          const mine = String(item.senderId) === String(me?.id);
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={mine ? styles.mineText : styles.theirsText}>{item.body}</Text>
            </View>
          );
        }}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          onSubmitEditing={send}
          returnKeyType="send"
          maxLength={2000}
          placeholder="Send a message"
          placeholderTextColor={GREY}
          accessibilityLabel="Message"
        />
        <Pressable onPress={send} disabled={!canSend} accessibilityLabel="Send" style={[styles.send, !canSend && styles.sendOff]}>
          <Icon name="send" size={22} color="#fff" filled />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44, paddingBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#efefef' },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 12, paddingVertical: 14, gap: 8 },
  bubble: { maxWidth: '75%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20 },
  mine: { alignSelf: 'flex-end', backgroundColor: BLUE, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: BUBBLE_THEIRS, borderBottomLeftRadius: 6 },
  mineText: { color: '#fff', fontSize: 15, lineHeight: 20 },
  theirsText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  empty: { textAlign: 'center', color: GREY, fontSize: 15, paddingVertical: 40, paddingHorizontal: 24 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, marginBottom: 4, paddingLeft: 16, paddingRight: 6, paddingVertical: 4, borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 999 },
  input: { flex: 1, minWidth: 0, fontSize: 15, color: colors.text, paddingVertical: 8 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
});
