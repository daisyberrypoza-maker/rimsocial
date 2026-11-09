import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import Activity from './Activity';
import { ChevronDown, MoreHorizontal, SquarePen } from 'lucide-react-native';
import { api } from '../api';
import { useAppStore } from '../store';
import { messageTime } from '../lib/format';
import { colors } from '../theme';

// Inbox laid out like the reference: account header, Primary / General / Requests filters, rows with story rings.
// Activity lives on this same screen: the more (⋮) icon switches to it.
const BLUE = '#3797f0';
const GREY = '#8e8e93';
const CHIP = '#f0f0f2';
const CHIP_ON = '#e8eefc';
const FILTERS = [['all', 'All'], ['primary', 'Primary'], ['general', 'General'], ['requests', 'Requests']];

export default function Chat() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const me = useAppStore((s) => s.user);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState(route.params?.view === 'activity' ? 'activity' : 'messages');

  useEffect(() => {
    if (route.params?.view === 'activity') setView('activity');
  }, [route.params?.view]);

  useEffect(() => {
    let alive = true;
    const load = () => api('/v1/messages/conversations').then((d) => { if (alive) setItems(d.items || []); }).catch(() => {});
    load();
    const timer = setInterval(load, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (view === 'activity') return <Activity onBack={() => setView('messages')} />;

  const all = items || [];
  const shown = all.filter((i) => filter === 'all' || i.group === filter);
  const totalUnread = all.reduce((sum, i) => sum + (i.unread || 0), 0);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <View style={styles.account}>
          <Text style={styles.title} numberOfLines={1}>{me?.username || 'Chat'}</Text>
          <ChevronDown size={16} color={colors.text} strokeWidth={2.4} />
          {totalUnread > 0 && <View style={styles.accountDot} />}
        </View>
        <View style={styles.actions}>
          <Pressable onPress={() => setView('activity')} accessibilityLabel="More" hitSlop={8}><MoreHorizontal size={26} color={colors.text} /></Pressable>
          <Pressable onPress={() => navigation.navigate('NewMessage')} accessibilityLabel="New message" hitSlop={8}><SquarePen size={24} color={colors.text} strokeWidth={2} /></Pressable>
        </View>
      </View>

      <View style={styles.filters}>
        {FILTERS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setFilter(key)} accessibilityRole="tab" accessibilityState={{ selected: filter === key }} style={[styles.chip, filter === key && styles.chipOn]}>
            <Text style={styles.chipText}>{label}{key === 'requests' ? '  ›' : ''}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.user.id)}
        ListEmptyComponent={items === null ? null : <Text style={styles.empty}>{filter === 'all' ? 'No messages yet. Tap the compose icon to start one.' : `No ${FILTERS.find(([k]) => k === filter)[1].toLowerCase()} messages.`}</Text>}
        renderItem={({ item }) => {
          const mine = item.lastMessage.senderId === me?.id;
          const unread = item.unread > 0;
          const subtitle = item.isOnline ? 'Active now' : mine ? `Sent · ${messageTime(item.lastMessage.createdAt)}` : `${item.lastMessage.body} · ${messageTime(item.lastMessage.createdAt)}`;
          return (
            <Pressable style={styles.row} onPress={() => navigation.navigate('Conversation', { userId: item.user.id, user: item.user })}>
              <View style={[styles.ring, item.hasStory && styles.ringStory]}>
                <View style={styles.ringFace}><Avatar user={item.user} size={54} /></View>
                {item.isOnline && <View style={styles.online} accessibilityLabel="Online" />}
              </View>
              <View style={styles.text}>
                <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>{item.user.displayName || item.user.username}</Text>
                <Text style={[styles.last, unread && styles.lastUnread]} numberOfLines={1}>{subtitle}</Text>
                {item.group === 'requests' && <Text style={styles.tag}>Request</Text>}
              </View>
              {unread && <View style={styles.dot} accessibilityLabel="Unread" />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, maxWidth: 220 },
  accountDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.heart, marginLeft: 2 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  chip: { height: 34, justifyContent: 'center', backgroundColor: CHIP, borderRadius: 999, paddingHorizontal: 16 },
  chipOn: { backgroundColor: CHIP_ON },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  ring: { width: 62, height: 62, borderRadius: 31, padding: 3, borderWidth: 3, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  ringStory: { borderColor: '#dc2743' },
  ringFace: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  online: { position: 'absolute', right: 0, bottom: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#31c75f', borderWidth: 2, borderColor: '#fff' },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  nameUnread: { fontWeight: '700' },
  last: { fontSize: 14, color: GREY, marginTop: 2 },
  lastUnread: { fontWeight: '700', color: colors.text },
  tag: { color: '#7b3ff2', fontSize: 13, fontWeight: '700', marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: BLUE },
  empty: { textAlign: 'center', color: GREY, fontSize: 15, padding: 40 },
});
