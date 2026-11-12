import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Activity from './Activity';
import { SquarePen, Search, Bell, UserPlus, Camera } from 'lucide-react-native';
import { api } from '../api';
import { useAppStore } from '../store';
import { messageTime } from '../lib/format';
import { colors } from '../theme';

// Chat to the Snapchat reference: profile and search on the left, centred title, bell / add-friend / more on the right,
// chips My AI / Games / Stories (count) / Near Me / New and the inbox groups, a camera on each row,
// and a floating yellow compose button. Activity lives on this same screen: the bell or more icon switches to it.
const GREY = '#8e8e93';
const BLUE = '#0095f6';
const GROUPS = [['primary', 'Primary'], ['general', 'General'], ['requests', 'Requests']];

export default function Chat() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const me = useAppStore((s) => s.user);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('primary');
  const [view, setView] = useState(route.params?.view === 'activity' ? 'activity' : 'messages');
  const [newRequests, setNewRequests] = useState(0);
  useEffect(() => {
    api('/v1/users/suggestions').then((d) => setNewRequests((d.followBack || []).filter((p) => !p.isFollowing).length)).catch(() => {});
  }, []);
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
  const shown = all.filter((i) => i.group === filter);
  const totalUnread = all.reduce((sum, item) => sum + Number(item.unread || 0), 0);
  const unreadByGroup = GROUPS.reduce((counts, [key]) => {
    counts[key] = all.reduce((sum, item) => sum + (item.group === key ? Number(item.unread || 0) : 0), 0);
    return counts;
  }, {});

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Pressable onPress={() => navigation.navigate('Profile', { username: me?.username })} accessibilityLabel="Your profile" hitSlop={6} style={styles.avatarBtn}>
            <Avatar user={me || {}} size={36} />
            {totalUnread > 0 && <View style={styles.accountDot} />}
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Explore', { search: true })} accessibilityLabel="Search" hitSlop={8} style={styles.iconBtn}>
            <Search size={22} color={colors.text} strokeWidth={2.4} />
          </Pressable>
        </View>
        <Text style={styles.title}>Messages</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => setView('activity')} accessibilityLabel="Notifications" hitSlop={8} style={styles.iconBtn}>
            <Bell size={24} color={colors.text} strokeWidth={2.2} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Explore')} accessibilityLabel="Add friends" hitSlop={8} style={[styles.iconBtn, styles.addFriend]}>
            <UserPlus size={22} color={colors.text} strokeWidth={2.2} />
            {newRequests > 0 && <View style={styles.reqBadge}><Text style={styles.reqBadgeText}>{newRequests > 99 ? '99+' : newRequests}</Text></View>}
          </Pressable>
          <Pressable onPress={() => navigation.navigate('NewMessage')} accessibilityLabel="New message" hitSlop={8} style={styles.iconBtn}>
            <SquarePen size={22} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {GROUPS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setFilter(key)} accessibilityRole="tab" accessibilityState={{ selected: filter === key }} style={[styles.chip, filter === key && styles.chipOn]}>
            <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>{label}</Text>
            {unreadByGroup[key] > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unreadByGroup[key] > 99 ? '99+' : unreadByGroup[key]}</Text></View>}
          </Pressable>
        ))}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.user.id)}
        ListEmptyComponent={items === null ? null : <Text style={styles.empty}>{filter === 'primary' ? 'No primary conversations yet.' : filter === 'general' ? 'No general conversations yet.' : 'No message requests yet.'}</Text>}
        renderItem={({ item }) => {
          const mine = item.lastMessage.senderId === me?.id;
          const unread = item.unread > 0;
          const subtitle = item.isOnline ? 'Active now' : mine ? `Sent · ${messageTime(item.lastMessage.createdAt)}` : `${item.lastMessage.body} · ${messageTime(item.lastMessage.createdAt)}`;
          const open = () => navigation.navigate('Conversation', { userId: item.user.id, user: item.user });
          return (
            <View style={styles.rowWrap}>
              <Pressable style={styles.row} onPress={open}>
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
              {item.group === 'primary' ? (
                <Pressable onPress={open} accessibilityLabel={`Snap ${item.user.displayName || item.user.username}`} style={styles.snap}>
                  <Camera size={22} color={colors.text} strokeWidth={2.2} />
                  <Text style={styles.snapText}>Snap</Text>
                </Pressable>
              ) : (
                <Pressable onPress={open} accessibilityLabel={`Message ${item.user.displayName || item.user.username}`} hitSlop={8} style={styles.cam}>
                  <Camera size={26} color={colors.text} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          );
        }}
      />

      <Pressable style={[styles.fab, { bottom: insets.bottom + 90 }]} onPress={() => navigation.navigate('NewMessage')} accessibilityLabel="New message">
        <SquarePen size={24} color="#fff" strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  accountDot: { position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.heart },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '700', color: '#111' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addFriend: { backgroundColor: 'transparent', borderRadius: 20, position: 'relative' },
  filters: { flexDirection: 'row', flexWrap: 'nowrap', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#efefef' },
  chip: { flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  chipOn: { borderBottomColor: '#111' },
  chipText: { color: '#8e8e93', fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: '#111' },

  badge: { marginLeft: 2, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#efefef', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#262626', fontSize: 11, fontWeight: '600' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', paddingRight: 10 },
  row: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
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
  cam: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  snap: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: YELLOW },
  snapText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  reqBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#ff3b5c', alignItems: 'center', justifyContent: 'center' },
  reqBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  fab: { position: 'absolute', right: 16, width: 54, height: 54, borderRadius: 27, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  empty: { textAlign: 'center', color: GREY, fontSize: 15, padding: 40 },
});
