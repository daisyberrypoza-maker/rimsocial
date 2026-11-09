import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Activity from './Activity';
import { MoreHorizontal, SquarePen, Search, Bell, UserPlus, Camera, ChevronRight, Plus } from 'lucide-react-native';
import { api } from '../api';
import { useAppStore } from '../store';
import { messageTime } from '../lib/format';
import { colors } from '../theme';

// Chat to the Snapchat reference: profile and search on the left, centred title, bell / add-friend / more on the right,
// chips My AI / Games / Stories (count) / Near Me / New and the inbox groups, a camera on each row,
// and a floating yellow compose button. Activity lives on this same screen: the bell or more icon switches to it.
const BLUE = '#3797f0';
const GREY = '#8e8e93';
const CHIP = '#f0f0f2';
const CHIP_ON = '#e8eefc';
const YELLOW = '#fffc00';
const GROUPS = [['primary', 'Primary'], ['general', 'General'], ['requests', 'Requests']];

export default function Chat() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const me = useAppStore((s) => s.user);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState(route.params?.view === 'activity' ? 'activity' : 'messages');
  const [newRequests, setNewRequests] = useState(0);
  useEffect(() => {
    api('/v1/users/suggestions').then((d) => setNewRequests((d.followBack || []).filter((p) => !p.isFollowing).length)).catch(() => {});
  }, []);
  const [pulling, setPulling] = useState(false);
  async function pullRefresh() {
    setPulling(true);
    try { const d = await api('/v1/messages/conversations'); setItems(d.items || []); } catch (_) { /* keep the list */ } finally { setPulling(false); }
  }

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
  const storyCount = all.filter((i) => i.hasStory).length;
  const shown = all.filter((i) => {
    if (filter === 'all') return true;
    if (filter === 'stories') return i.hasStory;
    return i.group === filter;
  });
  const totalUnread = all.reduce((sum, i) => sum + (i.unread || 0), 0);
  const toggle = (key) => setFilter(filter === key ? 'all' : key);

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
        <Text style={styles.title}>Chat</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => setView('activity')} accessibilityLabel="Notifications" hitSlop={8} style={styles.iconBtn}>
            <Bell size={24} color={colors.text} strokeWidth={2.2} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Explore')} accessibilityLabel="Add friends" hitSlop={8} style={[styles.iconBtn, styles.addFriend]}>
            <UserPlus size={22} color={colors.text} strokeWidth={2.2} />
            {newRequests > 0 && <View style={styles.reqBadge}><Text style={styles.reqBadgeText}>{newRequests > 99 ? '99+' : newRequests}</Text></View>}
          </Pressable>
          <Pressable onPress={() => setView('activity')} accessibilityLabel="More" hitSlop={8} style={styles.iconBtn}>
            <MoreHorizontal size={24} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.filters}>
        <Pressable style={styles.chip}><Text style={styles.chipText}>My AI</Text></Pressable>
        <Pressable style={styles.chip}><Text style={styles.chipText}>Games</Text></Pressable>
        <Pressable onPress={() => toggle('stories')} accessibilityRole="tab" accessibilityState={{ selected: filter === 'stories' }} style={[styles.chip, filter === 'stories' && styles.chipOn]}>
          <Text style={styles.chipText}>Stories</Text>
          {storyCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{storyCount}</Text></View>}
        </Pressable>
        <Pressable style={styles.chip}><Text style={styles.chipText}>Near Me</Text></Pressable>
        <Pressable onPress={() => navigation.navigate('NewMessage')} style={styles.chip}><Text style={styles.chipText}>New</Text><Plus size={16} color={colors.text} strokeWidth={2.4} /></Pressable>
        {GROUPS.map(([key, label]) => (
          <Pressable key={key} onPress={() => toggle(key)} accessibilityRole="tab" accessibilityState={{ selected: filter === key }} style={[styles.chip, filter === key && styles.chipOn]}>
            <Text style={styles.chipText}>{label}{key === 'requests' ? '  ' : ''}</Text>
            {key === 'requests' && <ChevronRight size={14} color={colors.text} />}
          </Pressable>
        ))}
      </View>

      <FlatList
        data={shown}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={pullRefresh} tintColor="#737373" />}
        keyExtractor={(i) => String(i.user.id)}
        ListEmptyComponent={items === null ? null : <Text style={styles.empty}>{filter === 'all' ? 'No messages yet. Tap the yellow button to start one.' : 'Nothing in this view yet.'}</Text>}
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
        <SquarePen size={26} color="#111" strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  accountDot: { position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.heart },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addFriend: { backgroundColor: YELLOW, borderRadius: 20, position: 'relative' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: CHIP, borderRadius: 999, paddingHorizontal: 16 },
  chipOn: { backgroundColor: CHIP_ON },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  badge: { marginLeft: 6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  fab: { position: 'absolute', right: 16, width: 58, height: 58, borderRadius: 29, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  empty: { textAlign: 'center', color: GREY, fontSize: 15, padding: 40 },
});
