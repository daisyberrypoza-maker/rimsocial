import React, { useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Shield } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { formatCount } from '../lib/format';
import { logError, toast } from '../lib/toast';
import { colors } from '../theme';

// Followers, Following, Blocked accounts or Activity, matched to the web list sheet. A pushed screen: Back returns to the profile.
// Followers you do not follow back get a blue "Follow back"; people you follow get "Message".
const BLUE = '#4f5bfa';
const TITLES = { followers: 'Followers', following: 'Following', blocked: 'Blocked accounts', activity: 'Activity' };
const EMPTY = {
  followers: ['No followers yet', 'People who connect with this account will appear here.'],
  following: ['No following yet', 'People who connect with this account will appear here.'],
  blocked: ['No blocked accounts', 'Accounts you block will appear here.'],
};

function activityText(item) {
  const name = item.actor?.username || 'Someone';
  if (item.type === 'follow') return `${name} started following you`;
  if (item.type === 'like') return `${name} liked your post`;
  if (item.type === 'comment') return `${name} commented${item.comment ? `: ${item.comment}` : ' on your post'}`;
  if (item.type === 'repost') return `${name} reposted your post`;
  if (item.type === 'mention') return `${name} mentioned you`;
  if (item.type === 'post') return `${name} posted a new Rimlight`;
  return `${name} interacted with you`;
}

export default function ProfileList() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { username, list = 'followers' } = useRoute().params;
  const me = useAppStore((s) => s.user);
  const profile = useAppStore((s) => s.profiles[username]?.user);
  const isMe = me?.username === username || Boolean(profile?.isMe);
  const [items, setItems] = useState(null);
  const [activity, setActivity] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState({});
  const isActivity = list === 'activity';
  const isBlocked = list === 'blocked';
  const ownerName = profile?.username || username;
  const title = list === 'blocked' ? TITLES.blocked : list === 'activity' ? TITLES.activity : ownerName;

  useEffect(() => {
    let alive = true;
    setQuery('');
    if (list === 'activity') {
      setActivity(null);
      api('/v1/activity')
        .then((d) => { if (alive) setActivity(d.items || []); })
        .catch((e) => { logError(e); if (alive) setActivity([]); });
    } else {
      setItems(null);
      const path = list === 'blocked' ? '/v1/users/blocked' : `/v1/users/${username}/${list}`;
      api(path)
        .then((d) => { if (alive) setItems(d.items || []); })
        .catch((e) => { logError(e); if (alive) setItems([]); });
    }
    return () => { alive = false; };
  }, [list, username]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((p) => `${p.displayName || ''} ${p.username || ''}`.toLowerCase().includes(q));
  }, [items, query]);

  function setBusyFor(id, value) {
    setBusy((b) => ({ ...b, [id]: value }));
  }

  async function toggleFollow(person) {
    if (busy[person.id]) return;
    setBusyFor(person.id, true);
    try {
      const r = person.isFollowing
        ? await api(`/v1/users/${person.id}/follow`, { method: 'DELETE' })
        : await api(`/v1/users/${person.id}/follow`, { method: 'POST' });
      setItems((list2) => (list2 || []).map((p) => (p.id === person.id
        ? { ...p, isFollowing: r.isFollowing ?? !p.isFollowing, followerCount: r.followerCount ?? p.followerCount }
        : p)));
    } catch (e) { logError(e); }
    finally { setBusyFor(person.id, false); }
  }

  async function unblock(person) {
    if (busy[person.id]) return;
    setBusyFor(person.id, true);
    try {
      await api(`/v1/users/${person.id}/block`, { method: 'DELETE' });
      setItems((list2) => (list2 || []).filter((p) => p.id !== person.id));
      toast(`@${person.username} unblocked`);
    } catch (e) { logError(e); }
    finally { setBusyFor(person.id, false); }
  }

  const followerCount = profile?.followerCount || 0;
  const followingCount = profile?.followingCount || 0;
  const emptyNode = isActivity
    ? (activity && activity.length === 0 ? (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No activity yet. Likes, comments, follows and new posts from creators you follow will appear here.</Text>
      </View>
    ) : null)
    : (items && items.length === 0 && EMPTY[list] ? (
      <View style={styles.empty}>
        {isBlocked ? <Shield size={28} color={colors.muted} /> : <Icon name="users" size={28} color={colors.muted} />}
        <Text style={styles.emptyTitle}>{EMPTY[list][0]}</Text>
        <Text style={styles.emptyText}>{EMPTY[list][1]}</Text>
      </View>
    ) : null);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={8}><Icon name="arrow-left" size={24} color={colors.text} /></Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {isMe && !isBlocked
          ? <Pressable onPress={() => navigation.navigate('Explore')} accessibilityLabel="Find people" hitSlop={8}><Icon name="user-plus" size={22} color={colors.text} /></Pressable>
          : <View style={{ width: 24 }} />}
      </View>

      {!isBlocked && (
        <View style={styles.tabs} accessibilityRole="tablist">
          <Tab on={list === 'followers'} count={followerCount} label="Followers" onPress={() => { if (list !== 'followers') navigation.setParams({ list: 'followers' }); }} />
          <Tab on={list === 'following'} count={followingCount} label="Following" onPress={() => { if (list !== 'following') navigation.setParams({ list: 'following' }); }} />
          {isMe && <Tab on={isActivity} count={activity?.length || 0} label="Activity" onPress={() => { if (!isActivity) navigation.setParams({ list: 'activity' }); }} />}
        </View>
      )}

      {!isBlocked && !isActivity && (
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.muted} accessibilityLabel="Search people" style={styles.search} />
        </View>
      )}
      {!isBlocked && !isActivity && (
        <View style={styles.sort}>
          <Text style={styles.sortText}>Sorted by <Text style={styles.sortBold}>Default</Text></Text>
        </View>
      )}

      {isActivity ? (
        <FlatList
          data={activity || []}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={emptyNode}
          renderItem={({ item }) => (
            <Pressable style={styles.activityRow} onPress={() => { if (item.actor?.username) navigation.navigate('Profile', { username: item.actor.username }); }}>
              <Avatar user={item.actor || {}} size={44} />
              <View style={styles.text}>
                <Text style={styles.activityText}>{activityText(item)}</Text>
                <Text style={styles.handle}>{item.createdAt ? new Date(item.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => String(p.id)}
          ListEmptyComponent={emptyNode}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable style={styles.person} onPress={() => navigation.navigate('Profile', { username: item.username })}>
                <Avatar user={item} size={52} />
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={1}>{item.username}</Text>
                  <Text style={styles.handle} numberOfLines={1}>{item.displayName || ''}</Text>
                </View>
              </Pressable>
              {isBlocked ? (
                <Pressable style={[styles.btn, busy[item.id] && styles.dim]} onPress={() => unblock(item)} disabled={!!busy[item.id]}>
                  <Text style={styles.btnText}>Unblock</Text>
                </Pressable>
              ) : list === 'followers' && !item.isFollowing ? (
                <Pressable style={[styles.btn, styles.btnBlue, busy[item.id] && styles.dim]} onPress={() => toggleFollow(item)} disabled={!!busy[item.id]}>
                  <Text style={styles.btnBlueText}>Follow back</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable style={styles.btn} onPress={() => navigation.navigate('Conversation', { userId: item.id, user: item })}>
                    <Text style={styles.btnText}>Message</Text>
                  </Pressable>
                  {list === 'following' && (
                    <Pressable style={[styles.more, busy[item.id] && styles.dim]} onPress={() => toggleFollow(item)} accessibilityLabel={`More options for ${item.username}`} disabled={!!busy[item.id]}>
                      <Icon name="more-vertical" size={20} color={colors.text} />
                    </Pressable>
                  )}
                </>
              )}
            </View>
          )}
          ListEmptyComponent={items === null ? null : emptyNode}
        />
      )}
    </View>
  );
}

function Tab({ on, count, label, onPress }) {
  return (
    <Pressable style={styles.tab} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }}>
      <Text style={[styles.tabCount, on && styles.tabOn]}>{formatCount(count || 0)}</Text>
      <Text style={[styles.tabText, on && styles.tabOn]}>{label}</Text>
      {on && <View style={styles.underline} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 0 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  tabs: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
  tabCount: { fontSize: 16, fontWeight: '700', color: colors.muted },
  tabText: { fontSize: 13, color: colors.muted, fontWeight: '500', marginTop: 1 },
  tabOn: { color: colors.text },
  underline: { position: 'absolute', bottom: -1, left: '10%', right: '10%', height: 2, backgroundColor: colors.text },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, height: 42, borderRadius: 10, backgroundColor: '#efefef' },
  search: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  sort: { paddingHorizontal: 16, paddingVertical: 14 },
  sortText: { fontSize: 15, color: colors.muted },
  sortBold: { color: colors.text, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  activityText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  handle: { fontSize: 14, color: colors.muted },
  btn: { paddingHorizontal: 16, height: 36, borderRadius: 8, backgroundColor: '#efefef', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '700', color: colors.text },
  btnBlue: { backgroundColor: BLUE, minWidth: 110, alignItems: 'center' },
  btnBlueText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  dim: { opacity: 0.5 },
  more: { padding: 6 },
  empty: { alignItems: 'center', gap: 6, paddingHorizontal: 32, paddingTop: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
  emptyText: { textAlign: 'center', color: colors.muted, fontSize: 14, lineHeight: 20 },
});
