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
import { MoreHorizontal, Plus } from 'lucide-react-native';
import Video from 'react-native-video';

// Same look as the web conversation page (.dm-convo / .dm-bubble rules in styles.css)
const BLUE = '#3797f0';
const GREY = '#8e8e93';
const BUBBLE_THEIRS = '#efefef';

function MessageAttachment({ message, onOpenImage }) {
  const uri = mediaUrl(message.mediaUrl);
  if (!uri) return null;
  if (message.mediaKind === 'video') return <Video source={{ uri }} style={styles.messageVideo} controls resizeMode="contain" paused={false} onError={() => Alert.alert('Video unavailable', 'This video could not be played.')} />;
  if (message.mediaKind === 'photo') return <Pressable onPress={() => onOpenImage(uri)}><Image source={{ uri }} style={styles.messageImage} resizeMode="cover" /></Pressable>;
  if (message.mediaKind === 'audio') return <Text style={styles.attachmentLabel}>Audio attachment: {message.mediaName || 'Audio'}</Text>;
  return <Text style={styles.attachmentLabel}>{message.mediaName || 'File attachment'}</Text>;
}

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
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedItems, setSharedItems] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderAmount, setOrderAmount] = useState('');
  const [orderDescription, setOrderDescription] = useState('');
  const [orderSaving, setOrderSaving] = useState(false);
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
      Alert.alert('Message not sent', e.message || 'Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  // Seller creates an order for this person; the buyer sees it as a card in the chat
  async function createOrder() {
    const amount = Number(orderAmount);
    if (!(amount > 0) || orderSaving) return;
    setOrderSaving(true);
    try {
      const data = await api(`/v1/messages/with/${userId}/order`, { method: 'POST', body: { amount, description: orderDescription.trim() } });
      setMessages((current) => {
        const list = current || [];
        return list.some((m) => m.id === data.message.id) ? list : [...list, { ...data.message, order: data.order }];
      });
      setOrderOpen(false);
      setOrderAmount('');
      setOrderDescription('');
    } catch (e) {
      logError(e);
      Alert.alert('Order not created', e.message || 'Check your connection and try again.');
    } finally {
      setOrderSaving(false);
    }
  }

  // Seller marks the order as paid, or cancels it while it is waiting for payment
  async function orderAction(order, action) {
    try {
      const data = await api(`/v1/messages/orders/${order.id}/${action}`, { method: 'POST', body: {} });
      setMessages((current) => (current || []).map((m) => (m.order && m.order.id === order.id ? { ...m, order: data.order } : m)));
    } catch (e) {
      logError(e);
      Alert.alert('Order', e.message || 'Could not update the order.');
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
  function showChatOptions() { setChatMenuOpen(true); }
  function runConversationAction(action) {
    setChatMenuOpen(false);
    if (action === 'mute') return toggleMute();
    if (action === 'shared') return openSharedActivity();
    if (action === 'delete') Alert.alert('Delete conversation?', 'This removes the conversation from your inbox only.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await api(`/v1/messages/direct/${userId}`, { method: 'DELETE' }); navigation.goBack(); } catch (error) { Alert.alert('RimSocial', error.message || 'Could not delete conversation'); } } }]);
    if (action === 'block') Alert.alert('Block account?', 'This account will no longer be able to interact with you normally.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: async () => { try { await api(`/v1/users/${userId}/block`, { method: 'POST', body: {} }); navigation.goBack(); } catch (error) { Alert.alert('RimSocial', error.message || 'Could not block account'); } } }]);
  }
  const canSend = Boolean(body.trim()) && !sending;

  return (
    <KeyboardAvoidingView style={[styles.page, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
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
          if (item.order) {
            const order = item.order;
            const isSeller = String(order.sellerId) === String(me?.id);
            const title = order.status === 'paid' ? 'Order paid' : order.status === 'cancelled' ? 'Order cancelled' : 'Order created';
            return (
              <View style={[styles.orderCard, mine ? styles.orderMine : styles.orderTheirs]}>
                <Text style={styles.orderTitle}>{title}</Text>
                <Text style={styles.orderSub}>Order number {String(order.id).slice(0, 8).toUpperCase()}</Text>
                <Text style={styles.orderAmount}>${(Number(order.amountCents || 0) / 100).toFixed(2)} {order.currency || 'USD'}</Text>
                {!!order.description && <Text style={styles.orderSub}>{order.description}</Text>}
                {order.status === 'created' && isSeller && (
                  <View style={styles.orderButtons}>
                    <Pressable style={styles.orderPrimary} onPress={() => orderAction(order, 'paid')} accessibilityLabel="Mark as paid"><Text style={styles.orderPrimaryText}>Mark as paid</Text></Pressable>
                    <Pressable style={styles.orderGhost} onPress={() => orderAction(order, 'cancel')} accessibilityLabel="Cancel order"><Text style={styles.orderGhostText}>Cancel</Text></Pressable>
                  </View>
                )}
              </View>
            );
          }
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              {!!item.mediaUrl && <MessageAttachment message={item} onOpenImage={setImagePreview} />}
              {!!item.body && <Text style={mine ? styles.mineText : styles.theirsText}>{item.body}</Text>}
            </View>
          );
        }}
      />
      <View style={styles.composer}>
        <Pressable onPress={() => setOrderOpen(true)} accessibilityLabel="Create order" hitSlop={8}><Plus size={24} color={colors.text} /></Pressable>
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
      <Modal visible={Boolean(imagePreview)} transparent animationType="fade" onRequestClose={() => setImagePreview(null)}>
        <Pressable style={styles.imagePreviewBackdrop} onPress={() => setImagePreview(null)}>
          {!!imagePreview && <Image source={{ uri: imagePreview }} style={styles.imagePreview} resizeMode="contain" />}
        </Pressable>
      </Modal>
      <Modal visible={orderOpen} transparent animationType="slide" onRequestClose={() => setOrderOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.orderSheet}>
            <View style={styles.sharedHead}>
              <Pressable onPress={() => setOrderOpen(false)} disabled={orderSaving}><Text style={styles.close}>Close</Text></Pressable>
              <Text style={styles.sharedTitle}>Create order</Text>
              <View style={{ width: 44 }} />
            </View>
            <Text style={styles.orderLead}>Create an order in chat</Text>
            <Text style={styles.orderSub}>This helps you track orders easily and share updates with customers directly in chat.</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountSign}>$</Text>
              <TextInput style={styles.amountInput} value={orderAmount} onChangeText={setOrderAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={GREY} accessibilityLabel="Total price in USD" />
            </View>
            <Text style={styles.orderSub}>Total Price (USD)</Text>
            <TextInput style={styles.descInput} value={orderDescription} onChangeText={setOrderDescription} maxLength={500} placeholder="Write a description..." placeholderTextColor={GREY} accessibilityLabel="Description" />
            <Pressable onPress={createOrder} disabled={!(Number(orderAmount) > 0) || orderSaving} style={[styles.orderSubmit, (!(Number(orderAmount) > 0) || orderSaving) && styles.sendOff]}>
              <Text style={styles.orderPrimaryText}>{orderSaving ? 'Creating…' : 'Create order'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={chatMenuOpen} transparent animationType="fade" onRequestClose={() => setChatMenuOpen(false)}>
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setChatMenuOpen(false)} />
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Conversation options</Text>
            <Pressable style={styles.menuOption} onPress={() => runConversationAction('mute')}><Text style={styles.menuText}>{muted ? 'Unmute notifications' : 'Mute notifications'}</Text></Pressable>
            <Pressable style={styles.menuOption} onPress={() => runConversationAction('shared')}><Text style={styles.menuText}>Shared activity</Text></Pressable>
            <Pressable style={styles.menuOption} onPress={() => runConversationAction('delete')}><Text style={styles.menuDanger}>Delete conversation</Text></Pressable>
            <Pressable style={styles.menuOption} onPress={() => runConversationAction('block')}><Text style={styles.menuDanger}>Block account</Text></Pressable>
            <Pressable style={styles.menuCancel} onPress={() => setChatMenuOpen(false)}><Text style={styles.menuText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={sharedOpen} transparent animationType="slide" onRequestClose={() => setSharedOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sharedSheet}>
            <View style={styles.sharedHead}><Text style={styles.sharedTitle}>Shared activity</Text><Pressable onPress={() => setSharedOpen(false)}><Text style={styles.close}>Close</Text></Pressable></View>
            {sharedLoading ? <Text style={styles.empty}>Loading shared activity…</Text> : sharedItems.length === 0 ? <Text style={styles.empty}>No photos, videos or posts shared yet.</Text> : (
              <ScrollView contentContainerStyle={styles.sharedList}>
                {sharedItems.map((item) => {
                  const media = item.thumbUrl || item.mediaUrl || item.post?.thumbUrl || item.post?.mediaUrl;
                  return <View key={String(item.id)} style={styles.sharedRow}>{!!media && (item.mediaKind === 'video' || item.post?.kind === 'video' ? <Video source={{ uri: mediaUrl(media) }} style={styles.sharedMedia} controls resizeMode="contain" paused={false} /> : <Image source={{ uri: mediaUrl(media) }} style={styles.sharedMedia} resizeMode="cover" />)} {!!(item.body || item.post?.caption) && <Text style={styles.sharedText}>{item.body || item.post?.caption}</Text>} <Text style={styles.sharedTime}>{new Date(item.createdAt).toLocaleString()}</Text></View>;
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
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  menuCard: { width: '100%', maxWidth: 320, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, elevation: 12 },
  menuTitle: { fontSize: 14, fontWeight: '600', color: '#777', paddingVertical: 9 },
  menuOption: { minHeight: 46, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  menuText: { fontSize: 15, color: '#111', fontWeight: '500' },
  menuDanger: { fontSize: 15, color: '#d93025', fontWeight: '500' },
  menuCancel: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee', marginTop: 4 },
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
  messageRow: { width: '100%', flexDirection: 'row' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', minWidth: 48, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, gap: 5 },
  messageImage: { width: 220, height: 220, maxWidth: '100%', borderRadius: 12, backgroundColor: '#ddd' },
  messageVideo: { width: 240, height: 210, maxWidth: '100%', borderRadius: 12, backgroundColor: '#111' },
  messageTime: { alignSelf: 'flex-end', color: '#777', fontSize: 10, marginTop: 3 },
  attachmentLabel: { color: colors.text, fontSize: 13, paddingVertical: 8 },
  imagePreviewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.96)', justifyContent: 'center', alignItems: 'center' },
  imagePreview: { width: '100%', height: '85%' },
  mine: { alignSelf: 'flex-end', backgroundColor: BLUE, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: BUBBLE_THEIRS, borderBottomLeftRadius: 6 },
  mineText: { color: '#fff', fontSize: 15, lineHeight: 20 },
  theirsText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  empty: { textAlign: 'center', color: GREY, fontSize: 15, paddingVertical: 40, paddingHorizontal: 24 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, marginBottom: 4, paddingLeft: 16, paddingRight: 6, paddingVertical: 4, borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 999 },
  input: { flex: 1, minWidth: 0, fontSize: 15, color: colors.text, paddingVertical: 8 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  orderCard: { maxWidth: '82%', borderRadius: 18, padding: 14, gap: 4, backgroundColor: BUBBLE_THEIRS },
  orderMine: { alignSelf: 'flex-end' },
  orderTheirs: { alignSelf: 'flex-start' },
  orderTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  orderSub: { color: GREY, fontSize: 13 },
  orderAmount: { color: colors.text, fontSize: 15, marginTop: 4 },
  orderButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  orderPrimary: { flex: 1, height: 40, borderRadius: 10, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  orderPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  orderGhost: { height: 40, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  orderGhostText: { color: '#ed4956', fontSize: 15, fontWeight: '600' },
  orderSheet: { maxHeight: '90%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 10 },
  orderLead: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 18 },
  amountSign: { fontSize: 48, fontWeight: '700', color: colors.text, marginRight: 4 },
  amountInput: { fontSize: 48, fontWeight: '700', color: colors.text, minWidth: 120, textAlign: 'center', padding: 0 },
  descInput: { borderBottomWidth: 1, borderBottomColor: '#dbdbdb', fontSize: 16, color: colors.text, paddingVertical: 10 },
  orderSubmit: { height: 48, borderRadius: 12, backgroundColor: '#4f5bff', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
});
