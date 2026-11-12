import React, { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, MoreHorizontal, Users, Send } from 'lucide-react-native';
import { api } from '../api';
import { useAppStore } from '../store';
import { colors } from '../theme';

function clock(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function GroupConversation() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { groupId } = useRoute().params;
  const me = useAppStore((state) => state.user);
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState('');
  const [muted, setMuted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [data, list] = await Promise.all([
          api('/v1/messages/groups/' + groupId),
          api('/v1/messages/groups'),
        ]);
        if (!alive) return;
        setGroup(data.group);
        setMessages(data.items || []);
        const current = (list.items || []).find((item) => String(item.id) === String(groupId));
        setMuted(Boolean(current?.muted));
        setError('');
      } catch (e) {
        if (alive) setError(e.message || 'Could not load this group');
      }
    };
    load();
    const timer = setInterval(load, 3500);
    return () => { alive = false; clearInterval(timer); };
  }, [groupId]);

  async function send() {
    const value = body.trim();
    if (!value || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await api('/v1/messages/groups/' + groupId + '/messages', { method: 'POST', body: { body: value } });
      setMessages((current) => [...(current || []), result.message]);
      setBody('');
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError(e.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  async function toggleMute() {
    try {
      const result = await api('/v1/messages/groups/' + groupId + '/mute', { method: 'PUT', body: { enabled: !muted } });
      setMuted(Boolean(result.muted));
    } catch (e) { Alert.alert('RimSocial', e.message || 'Could not update mute setting'); }
  }

  function leaveGroup() {
    Alert.alert('Leave group?', 'You will stop receiving messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try {
          await api('/v1/messages/groups/' + groupId, { method: 'DELETE' });
          navigation.goBack();
        } catch (e) { Alert.alert('RimSocial', e.message || 'Could not leave group'); }
      } },
    ]);
  }

  function deleteForEveryone() {
    Alert.alert('Delete group for everyone?', 'This permanently deletes the group and its messages for every member.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete group', style: 'destructive', onPress: async () => {
        try {
          await api('/v1/messages/groups/' + groupId + '?scope=everyone', { method: 'DELETE' });
          navigation.goBack();
        } catch (e) { Alert.alert('RimSocial', e.message || 'Could not delete group'); }
      } },
    ]);
  }

  function showOptions() {
    const actions = [
      { text: muted ? 'Unmute messages' : 'Mute messages', onPress: toggleMute },
    ];
    if (String(group?.createdById) === String(me?.id)) actions.push({ text: 'Delete group for everyone', style: 'destructive', onPress: deleteForEveryone });
    actions.push({ text: 'Leave group', style: 'destructive', onPress: leaveGroup });
    actions.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(group?.name || 'Group chat', 'Group options', actions);
  }

  function deleteMessage(message) {
    Alert.alert('Delete message?', 'This removes your message for every group member.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api('/v1/messages/groups/' + groupId + '/messages/' + message.id, { method: 'DELETE' });
          setMessages((current) => (current || []).filter((row) => String(row.id) !== String(message.id)));
        } catch (e) { Alert.alert('RimSocial', e.message || 'Could not delete message'); }
      } },
    ]);
  }

  const members = group?.members || [];
  const senderName = (id) => {
    if (String(id) === String(me?.id)) return 'You';
    const person = members.find((item) => String(item.id) === String(id));
    return person?.displayName || person?.username || 'Member';
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back"><ArrowLeft size={24} color={colors.text} /></Pressable>
        <View style={styles.groupIcon}><Users size={20} color={colors.text} /></View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>{group?.name || 'Group chat'}</Text>
          <Text style={styles.subtitle}>{members.length} members</Text>
        </View>
        <Pressable onPress={showOptions} hitSlop={10} accessibilityLabel="Group options"><MoreHorizontal size={24} color={colors.text} /></Pressable>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.thread} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled">
        {messages === null ? <Text style={styles.empty}>Loading group…</Text> : messages.length === 0 ? <Text style={styles.empty}>This group is ready. Send the first message.</Text> : messages.map((message) => {
          const mine = String(message.senderId) === String(me?.id);
          return (
            <View key={String(message.id)} style={[styles.line, mine && styles.lineMine]}>
              {!mine && <Text style={styles.sender}>{senderName(message.senderId)}</Text>}
              <Pressable onLongPress={() => mine && deleteMessage(message)} delayLongPress={450} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.message, mine && styles.messageMine]}>{message.body}</Text>
                <Text style={[styles.time, mine && styles.timeMine]}>{clock(message.createdAt)}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput style={styles.input} value={body} onChangeText={setBody} placeholder="Message the group" placeholderTextColor={colors.muted} maxLength={2000} multiline />
        <Pressable onPress={send} disabled={!body.trim() || sending} style={[styles.send, (!body.trim() || sending) && styles.disabled]} accessibilityLabel="Send message"><Send size={20} color="#fff" /></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e8' },
  groupIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f1f1f1', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  thread: { padding: 14, gap: 12, flexGrow: 1, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 28 },
  line: { alignItems: 'flex-start', maxWidth: '88%' },
  lineMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  sender: { color: colors.muted, fontSize: 12, marginBottom: 4, marginLeft: 8 },
  bubble: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, maxWidth: '100%' },
  mine: { backgroundColor: '#3797f0', borderBottomRightRadius: 5 },
  theirs: { backgroundColor: '#efefef', borderBottomLeftRadius: 5 },
  message: { color: '#111', fontSize: 15, lineHeight: 20 },
  messageMine: { color: '#fff' },
  time: { fontSize: 10, color: '#777', alignSelf: 'flex-end', marginTop: 4 },
  timeMine: { color: 'rgba(255,255,255,.8)' },
  error: { color: '#d93025', paddingHorizontal: 14, paddingVertical: 6, fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  input: { flex: 1, maxHeight: 110, minHeight: 42, borderWidth: 1, borderColor: '#dedede', borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10, color: colors.text, fontSize: 15 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
});
