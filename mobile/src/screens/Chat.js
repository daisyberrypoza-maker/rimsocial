import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { messageTime } from '../lib/format';
import { colors } from '../theme';

// Chat list: people you have messages with, newest first. Refreshes every few seconds.
export default function Chat() {
  const navigation = useNavigation();
  const me = useAppStore((s) => s.user);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    const load = () => api('/v1/messages/conversations').then((d) => { if (alive) setItems(d.items || []); }).catch(() => {});
    load();
    const timer = setInterval(load, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const shown = (items || []).filter((i) => filter === 'all' || i.unread > 0);

  return (
    <View style={styles.page}>
      <View style={styles.head}>
        <Text style={styles.title}>Chat</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => navigation.navigate('Activity')} accessibilityLabel="Activity"><Icon name="bell" size={24} /></Pressable>
          <Pressable onPress={() => navigation.navigate('NewMessage')} accessibilityLabel="New message"><Icon name="pencil" size={24} /></Pressable>
        </View>
      </View>
      <View style={styles.filters}>
        {['all', 'unread'].map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f === 'all' ? 'All' : 'Unread'}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.user.id)}
        ListEmptyComponent={<Text style={styles.empty}>{items === null ? '' : filter === 'unread' ? 'No unread messages.' : 'No messages yet. Tap the compose icon to start one.'}</Text>}
        renderItem={({ item }) => {
          const mine = item.lastMessage.senderId === me?.id;
          return (
            <Pressable style={styles.row} onPress={() => navigation.navigate('Conversation', { userId: item.user.id, user: item.user })}>
              <Avatar user={item.user} size={56} />
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={1}>{item.user.displayName || item.user.username}</Text>
                <Text style={styles.last} numberOfLines={1}>{mine ? 'Sent: ' : ''}{item.lastMessage.body} · {messageTime(item.lastMessage.createdAt)}</Text>
              </View>
              {item.unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View>}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  actions: { flexDirection: 'row', gap: 16 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  text: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  last: { fontSize: 14, color: colors.muted },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.unseen, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, paddingHorizontal: 24 },
});
