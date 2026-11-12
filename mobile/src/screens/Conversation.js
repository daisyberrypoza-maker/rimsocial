import React, { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Modal, ScrollView, Image, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { logError } from '../lib/toast';
import { colors } from '../theme';
import { mediaUrl } from '../config';
import { MoreHorizontal } from 'lucide-react-native';

// Same look as the web conversation page (.dm-convo / .dm-bubble rules in styles.css)
const BLUE = '#3797f0';
const GREY = '#8e8e93';
const BUBBLE_THEIRS = '#efefef';

// One chat. Messages refresh every few seconds, oldest at the top and newest at the bottom.
export default function Conversation() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { userId, user: passedUser } = useRoute().params;
  const me = useAppStore((s) => s.user);
  const [partner, setPartner] = useState(passedUser || null);
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedItems, setSharedItems] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api(`/v1/messages/with/${userId}/info`).then((d) => { if (alive && d.user) setPartner(d.user); }).catch(logError);
    api(`/v1/messages/direct/${userId}/preferences`).then((d) => { if (alive) setMuted(Boolean(d.muted)); }).catch(() => {});
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

  async function toggleMute() {
    try {
      const result = await api(`/v1/messages/direct/${userId}/mute`, { method: 'PUT', body: { enabled: !muted } });
      setMuted(Boolean(result.muted));
    } catch (error) { Alert.alert('RimSocial', error.message || 'Could not update mute setting'); }
  }
  async function openSharedActivity() {
    setSharedOpen(true);
    setSharedLoading(true);
    try { const result = await api(`/v1/messages/with/${userId}/shared`); setSharedItems(result.items || []); }
    catch (error) { Alert.alert('RimSocial', error.message || 'Could not load shared activity'); setSharedItems([]); }
    finally { setSharedLoading(false); }
  }
  function showChatOptions() {
    Alert.alert(partner?.displayName || partner?.username || 'Conversation', 'Conversation options', [
      { text: muted ? 'Unmute notifications' : 'Mute notifications', onPress: toggleMute },
      { text: 'Shared activity', onPress: openSharedActivity },
      { text: 'Delete conversation', style: 'destructive', onPress: () => Alert.alert('Delete conversation?', 'This removes the conversation from your inbox only.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await api(`/v1/messages/direct/${userId}`, { method: 'DELETE' }); navigation.goBack(); } catch (error) { Alert.alert('RimSocial', error.message || 'Could not delete conversation'); } } }]) },
      { text: 'Block account', style: 'destructive', onPress: () => Alert.alert('Block account?', 'This account will no longer be able to interact with you normally.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: async () => { try { await api(`/v1/users/${userId}/block`, { method: 'POST', body: {} }); navigation.goBack(); } catch (error) { Alert.alert('RimSocial', error.message || 'Could not block account'); } } }]) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  const canSend = Boolean(body.trim()) && !sending;

  return (
    <KeyboardAvoidingView style={[styles.page, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={26} /></Pressable>
        {partner && <Avatar user={partner} size={38} />}
        <Text style={styles.name} numberOfLines={1}>{partner ? (partner.displayName || partner.username) : ''}</Text>
        <Pressable onPress={showChatOptions} accessibilityLabel="Conversation options" hitSlop={10}><MoreHorizontal size={23} color={colors.text} /></Pressable>
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
      <Modal visible={sharedOpen} transparent animationType="slide" onRequestClose={() => setSharedOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sharedSheet}>
            <View style={styles.sharedHead}><Text style={styles.sharedTitle}>Shared activity</Text><Pressable onPress={() => setSharedOpen(false)}><Text style={styles.close}>Close</Text></Pressable></View>
            {sharedLoading ? <Text style={styles.empty}>Loading shared activity…</Text> : sharedItems.length === 0 ? <Text style={styles.empty}>No photos, videos or posts shared yet.</Text> : (
              <ScrollView contentContainerStyle={styles.sharedList}>
                {sharedItems.map((item) => {
                  const media = item.thumbUrl || item.mediaUrl || item.post?.thumbUrl || item.post?.mediaUrl;
                  return <View key={String(item.id)} style={styles.sharedRow}>{!!media && <Image source={{ uri: mediaUrl(media) }} style={styles.sharedMedia} resizeMode="cover" />} {!!(item.body || item.post?.caption) && <Text style={styles.sharedText}>{item.body || item.post?.caption}</Text>} <Text style={styles.sharedTime}>{new Date(item.createdAt).toLocaleString()}</Text></View>;
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 0, paddingBottom: 6 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sharedSheet: { maxHeight: '78%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24 },
  sharedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sharedTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  close: { color: '#0095f6', fontSize: 15, fontWeight: '600' },
  sharedList: { gap: 12, paddingBottom: 12 },
  sharedRow: { borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 12, gap: 6 },
  sharedMedia: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#f1f1f1' },
  sharedText: { color: colors.text, fontSize: 14 },
  sharedTime: { color: colors.muted, fontSize: 11 },
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
