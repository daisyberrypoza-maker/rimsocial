import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Activity from './Activity';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { messageTime } from '../lib/format';
import { colors } from '../theme';

// Same colours as the web Chat page (.dm-* rules in styles.css)
const BLUE = '#3797f0';
const GREY = '#8e8e93';
const CHIP = '#f0f0f2';
const CHIP_ON = '#e8eefc';

// Chat list: people you have messages with, newest first. Refreshes every few seconds.
export default function Chat() {
  const navigation = useNavigation();
  const route = useRoute();
  const me = useAppStore((s) => s.user);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  // Messages and Activity live on this one screen; the bell switches to Activity
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

  const shown = (items || []).filter((i) => filter === 'all' || i.unread > 0);

  if (view === 'activity') return <Activity onBack={() => setView('messages')} />;

  return (
    <View style={styles.page}>
      <View style={styles.head}>
        <View style={styles.side} />
        <Text style={styles.title}>Chat</Text>
        <View style={[styles.actions, styles.side]}>
          <Pressable onPress={() => setView('activity')} accessibilityLabel="Activity"><Icon name="bell" size={24} /></Pressable>
          <Pressable onPress={() => navigation.navigate('NewMessage')} accessibilityLabel="New message"><Icon name="pencil" size={24} /></Pressable>
        </View>
      </View>
      <View style={styles.filters}>
        {['all', 'unread'].map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]}>
            <Text style={styles.chipText}>{f === 'all' ? 'All' : 'Unread'}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.user.id)}
        ListEmptyComponent={items === null ? null : <Text style={styles.empty}>{filter === 'unread' ? 'No unread messages.' : 'No messages yet. Tap the compose icon to start one.'}</Text>}
        renderItem={({ item }) => {
          const mine = item.lastMessage.senderId === me?.id;
          const unread = item.unread > 0;
          return (
            <Pressable style={styles.row} onPress={() => navigation.navigate('Conversation', { userId: item.user.id, user: item.user })}>
              <Avatar user={item.user} size={56} />
              <View style={styles.text}>
                <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>{item.user.displayName || item.user.username}</Text>
                <Text style={[styles.last, unread && styles.lastUnread]} numberOfLines={1}>{mine ? 'Sent' : item.lastMessage.body} · {messageTime(item.lastMessage.createdAt)}</Text>
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
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  side: { width: 64 },
  actions: { flexDirection: 'row', gap: 16, justifyContent: 'flex-end' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  chip: { backgroundColor: CHIP, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  chipOn: { backgroundColor: CHIP_ON },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  nameUnread: { fontWeight: '700', color: colors.text },
  last: { fontSize: 14, color: GREY, marginTop: 2 },
  lastUnread: { fontWeight: '700', color: colors.text },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: BLUE },
  empty: { textAlign: 'center', color: GREY, fontSize: 15, marginTop: 40, paddingHorizontal: 24 },
});
