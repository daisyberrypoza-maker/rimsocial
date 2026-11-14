import React, { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, Modal, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import Video from 'react-native-video';
import { ArrowLeft, MoreHorizontal, Users, Send, Plus } from 'lucide-react-native';
import { api } from '../api';
import { useAppStore } from '../store';
import { colors } from '../theme';
import { mediaUrl } from '../config';
import { logError } from '../lib/toast';

function clock(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function labelOf(kind) {
  if (kind === 'photo') return 'Photo';
  if (kind === 'video') return 'Video';
  if (kind === 'audio') return 'Audio';
  return 'File';
}

// The small copy of a message that a reply quotes
function quoteOf(m) {
  return m ? { id: m.id, senderId: m.senderId, body: m.body || '', mediaKind: m.mediaKind || null, mediaUrl: m.mediaUrl || null } : null;
}

const VIEW_CHOICES = [
  { value: 0, label: 'Unlimited views' },
  { value: 1, label: 'View once' },
  { value: 2, label: 'View twice' },
];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [photoPick, setPhotoPick] = useState(null);
  const [preview, setPreview] = useState(null);
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

  function scrollToEnd() {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  async function sendText() {
    const value = body.trim();
    if (!value || sending) return;
    const quoted = replyTo;
    setSending(true);
    setError('');
    try {
      const result = await api('/v1/messages/groups/' + groupId + '/messages', { method: 'POST', body: { body: value, replyToId: quoted?.id || undefined } });
      setMessages((current) => [...(current || []), { ...result.message, replyTo: quoteOf(quoted) }]);
      setBody('');
      setReplyTo(null);
      scrollToEnd();
    } catch (e) {
      setError(e.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  // Photo or video from the phone, with the same caption, reply and view limit as the web app
  async function uploadMedia(asset, viewLimit) {
    const video = String(asset.type || '').startsWith('video');
    const caption = body.trim();
    const quoted = replyTo;
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.append('media', { uri: asset.uri, name: asset.fileName || `media-${Date.now()}.${video ? 'mp4' : 'jpg'}`, type: asset.type || (video ? 'video/mp4' : 'image/jpeg') });
      if (caption) form.append('body', caption);
      if (quoted) form.append('replyToId', quoted.id);
      if (!video && viewLimit) form.append('viewLimit', String(viewLimit));
      const result = await api('/v1/messages/groups/' + groupId + '/media', { method: 'POST', body: form });
      setMessages((current) => [...(current || []), { ...result.message, replyTo: quoteOf(quoted) }]);
      setBody('');
      setReplyTo(null);
      scrollToEnd();
    } catch (e) {
      setError(e.message || 'Could not send');
    } finally {
      setSending(false);
    }
  }

  async function pickAndSend() {
    const result = await launchImageLibrary({ mediaType: 'mixed', selectionLimit: 1 }).catch((e) => { logError(e); return null; });
    const asset = result?.assets?.[0];
    if (!asset?.uri) return;
    if (String(asset.type || '').startsWith('video')) return uploadMedia(asset, 0);
    setPhotoPick(asset);
  }

  // Opening a view-limited photo counts this member's view, then shows it
  async function openLimitedPhoto(item) {
    try {
      const data = await api('/v1/messages/groups/' + groupId + '/messages/' + item.id + '/view', { method: 'POST', body: {} });
      setMessages((current) => (current || []).map((row) => (String(row.id) === String(item.id) ? { ...row, viewedByMe: data.viewedByMe } : row)));
      setPreview(mediaUrl(item.mediaUrl));
    } catch (e) {
      Alert.alert('Photo', e.message || 'Could not open this photo.');
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

  function showOptions() { setMenuOpen(true); }
  function runGroupAction(action) {
    setMenuOpen(false);
    if (action === 'mute') return toggleMute();
    if (action === 'leave') return leaveGroup();
    if (action === 'delete') return deleteForEveryone();
  }

  function deleteMessage(message) {
    setMenuFor(null);
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

  function renderMedia(message, mine) {
    const uri = mediaUrl(message.mediaUrl);
    if (!uri) return null;
    if (!mine && message.mediaKind === 'photo' && message.viewLimit > 0) {
      if ((message.viewedByMe || 0) >= message.viewLimit) return <Text style={styles.once}>Opened</Text>;
      return <Pressable onPress={() => openLimitedPhoto(message)} style={styles.onceButton} accessibilityLabel="Tap to view"><Text style={styles.onceText}>Tap to view</Text></Pressable>;
    }
    if (message.mediaKind === 'photo') return <Pressable onPress={() => setPreview(uri)}><Image source={{ uri }} style={styles.photo} resizeMode="cover" /></Pressable>;
    if (message.mediaKind === 'video') return <Video source={{ uri }} style={styles.video} controls resizeMode="contain" paused />;
    if (message.mediaKind === 'audio') return <Text style={styles.fileLabel}>Audio: {message.mediaName || 'Audio'}</Text>;
    return <Text style={styles.fileLabel}>{message.mediaName || 'File'}</Text>;
  }

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
              <Pressable onLongPress={() => setMenuFor(message)} delayLongPress={350} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {!!message.replyTo && (
                  <View style={styles.quote}>
                    <Text style={styles.quoteName}>{String(message.replyTo.senderId) === String(me?.id) ? 'You' : senderName(message.replyTo.senderId)}</Text>
                    <Text style={styles.quoteBody} numberOfLines={1}>{message.replyTo.body || labelOf(message.replyTo.mediaKind)}</Text>
                  </View>
                )}
                {!!message.replyToId && !message.replyTo && (
                  <View style={styles.quote}><Text style={styles.quoteBody}>Original message is no longer available</Text></View>
                )}
                {!!message.mediaUrl && renderMedia(message, mine)}
                {!!message.body && <Text style={[styles.message, mine && styles.messageMine]}>{message.body}</Text>}
                <Text style={[styles.time, mine && styles.timeMine]}>{clock(message.createdAt)}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyText}>
            <Text style={styles.quoteName}>{String(replyTo.senderId) === String(me?.id) ? 'Replying to yourself' : `Replying to ${senderName(replyTo.senderId)}`}</Text>
            <Text style={styles.quoteBody} numberOfLines={1}>{replyTo.body || labelOf(replyTo.mediaKind)}</Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply"><Text style={styles.replyCancel}>×</Text></Pressable>
        </View>
      )}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Group options</Text>
            <Pressable style={styles.menuOption} onPress={() => runGroupAction('mute')}><Text style={styles.menuText}>{muted ? 'Unmute messages' : 'Mute messages'}</Text></Pressable>
            {String(group?.createdById) === String(me?.id) && <Pressable style={styles.menuOption} onPress={() => runGroupAction('delete')}><Text style={styles.menuDanger}>Delete group for everyone</Text></Pressable>}
            <Pressable style={styles.menuOption} onPress={() => runGroupAction('leave')}><Text style={styles.menuDanger}>Leave group</Text></Pressable>
            <Pressable style={styles.menuCancel} onPress={() => setMenuOpen(false)}><Text style={styles.menuText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(menuFor)} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuFor(null)} />
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Message options</Text>
            <Pressable style={styles.menuOption} onPress={() => { const m = menuFor; setMenuFor(null); setReplyTo(m); }}><Text style={styles.menuText}>Reply</Text></Pressable>
            {!!menuFor && String(menuFor.senderId) === String(me?.id) && (
              <Pressable style={styles.menuOption} onPress={() => deleteMessage(menuFor)}><Text style={styles.menuDanger}>Delete for everyone</Text></Pressable>
            )}
            <Pressable style={styles.menuCancel} onPress={() => setMenuFor(null)}><Text style={styles.menuText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(photoPick)} transparent animationType="fade" onRequestClose={() => setPhotoPick(null)}>
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhotoPick(null)} />
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Who can view this photo?</Text>
            {VIEW_CHOICES.map((choice) => (
              <Pressable key={choice.value} style={styles.menuOption} onPress={() => { const asset = photoPick; setPhotoPick(null); uploadMedia(asset, choice.value); }}>
                <Text style={styles.menuText}>{choice.label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.menuCancel} onPress={() => setPhotoPick(null)}><Text style={styles.menuText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
          {!!preview && <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="contain" />}
        </Pressable>
      </Modal>
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable onPress={pickAndSend} disabled={sending} accessibilityLabel="Send photo or video" hitSlop={8} style={styles.attach}><Plus size={24} color={colors.text} /></Pressable>
        <TextInput style={styles.input} value={body} onChangeText={setBody} placeholder="Message the group" placeholderTextColor={colors.muted} maxLength={2000} multiline />
        <Pressable onPress={sendText} disabled={!body.trim() || sending} style={[styles.send, (!body.trim() || sending) && styles.disabled]} accessibilityLabel="Send message"><Send size={20} color="#fff" /></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  menuCard: { width: '100%', maxWidth: 320, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, elevation: 12 },
  menuTitle: { fontSize: 14, fontWeight: '600', color: '#777', paddingVertical: 9 },
  menuOption: { minHeight: 46, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  menuText: { fontSize: 15, color: '#111', fontWeight: '500' },
  menuDanger: { fontSize: 15, color: '#d93025', fontWeight: '500' },
  menuCancel: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee', marginTop: 4 },
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
  quote: { borderLeftWidth: 3, borderLeftColor: '#25a244', backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 6 },
  quoteName: { fontSize: 12, fontWeight: '700', color: '#262626' },
  quoteBody: { fontSize: 13, color: '#262626', opacity: 0.85 },
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dbdbdb', backgroundColor: '#fafafa' },
  replyText: { flex: 1, minWidth: 0 },
  replyCancel: { fontSize: 22, color: colors.muted, paddingHorizontal: 8 },
  photo: { width: 220, height: 220, borderRadius: 14, marginBottom: 4 },
  video: { width: 220, height: 200, borderRadius: 14, marginBottom: 4, backgroundColor: '#111' },
  fileLabel: { color: '#111', fontSize: 14, marginBottom: 4 },
  once: { fontSize: 14, color: '#777', fontStyle: 'italic' },
  onceButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#6a4cff' },
  onceText: { color: '#fff', fontWeight: '600' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '100%' },
  error: { color: '#d93025', paddingHorizontal: 14, paddingVertical: 6, fontSize: 13 },
  attach: { paddingBottom: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 21, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111' },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#3797f0', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
});
