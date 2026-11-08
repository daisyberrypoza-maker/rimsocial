import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { logError } from '../lib/toast';
import { colors } from '../theme';

// Followers, Following or Blocked people. A pushed screen: Back returns to the profile.
// Followers you do not follow back get a blue "Follow back"; people you follow get "Message".
const TITLES = { followers: 'Followers', following: 'Following', blocked: 'Blocked' };
const BLUE = '#4f5bfa';

export default function ProfileList() {
  const navigation = useNavigation();
  const { username, list } = useRoute().params;
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState({});
  const title = TITLES[list] || 'People';

  useEffect(() => {
    const path = list === 'blocked' ? '/v1/users/blocked' : `/v1/users/${username}/${list}`;
    api(path).then((d) => setItems(d.items || [])).catch((e) => { logError(e); setItems([]); });
  }, [list, username]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((p) => `${p.displayName || ''} ${p.username || ''}`.toLowerCase().includes(q));
  }, [items, query]);

  async function toggleFollow(person) {
    setBusy((b) => ({ ...b, [person.id]: true }));
    try {
      const r = await api(`/v1/users/${person.id}/follow`, { method: person.isFollowing ? 'DELETE' : 'POST' });
      setItems((list2) => (list2 || []).map((p) => (p.id === person.id ? { ...p, isFollowing: r.isFollowing ?? !p.isFollowing } : p)));
    } catch (e) { logError(e); }
    finally { setBusy((b) => ({ ...b, [person.id]: false })); }
  }

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={24} /></Pressable>
        <Text style={styles.title} numberOfLines={1}>{list === 'blocked' ? title : `@${username}`}</Text>
        <View style={{ width: 24 }} />
      </View>
      {list !== 'blocked' && (
        <View style={styles.tabs}>
          <Pressable style={styles.tab} onPress={() => navigation.setParams({ list: 'followers' })}>
            <Text style={[styles.tabText, list === 'followers' && styles.tabOn]}>Followers</Text>
            {list === 'followers' && <View style={styles.underline} />}
          </Pressable>
          <Pressable style={styles.tab} onPress={() => navigation.setParams({ list: 'following' })}>
            <Text style={[styles.tabText, list === 'following' && styles.tabOn]}>Following</Text>
            {list === 'following' && <View style={styles.underline} />}
          </Pressable>
        </View>
      )}
      {list !== 'blocked' && (
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.muted} style={styles.search} />
        </View>
      )}
      {list !== 'blocked' && (
        <View style={styles.sort}>
          <Text style={styles.sortText}>Sorted by <Text style={styles.sortBold}>Default</Text></Text>
          <Icon name="sort" size={20} color={colors.text} />
        </View>
      )}
      <FlatList
        data={shown}
        keyExtractor={(p) => String(p.id)}
        ListEmptyComponent={<Text style={styles.empty}>{items === null ? '' : `No ${title.toLowerCase()} yet.`}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={styles.person} onPress={() => navigation.navigate('Profile', { username: item.username })}>
              <Avatar user={item} size={52} />
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={1}>{item.username}</Text>
                <Text style={styles.handle} numberOfLines={1}>{item.displayName || ''}</Text>
              </View>
            </Pressable>
            {list === 'blocked' ? null : list === 'followers' && !item.isFollowing ? (
              <Pressable style={[styles.btn, styles.btnBlue]} onPress={() => toggleFollow(item)} disabled={busy[item.id]}>
                <Text style={styles.btnBlueText}>{busy[item.id] ? '…' : 'Follow back'}</Text>
              </Pressable>
            ) : (
              <>
                <Pressable style={styles.btn} onPress={() => navigation.navigate('Conversation', { userId: item.id, user: item })}>
                  <Text style={styles.btnText}>Message</Text>
                </Pressable>
                {list === 'following' && (
                  <Pressable style={styles.more} onPress={() => toggleFollow(item)} accessibilityLabel="Unfollow" disabled={busy[item.id]}>
                    <Icon name="more-vertical" size={20} color={colors.text} />
                  </Pressable>
                )}
              </>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 15, color: colors.muted, fontWeight: '500' },
  tabOn: { color: colors.text, fontWeight: '700' },
  underline: { position: 'absolute', bottom: -1, left: '10%', right: '10%', height: 2, backgroundColor: colors.text },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, height: 42, borderRadius: 10, backgroundColor: '#efefef' },
  search: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  sort: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  sortText: { fontSize: 15, color: colors.muted },
  sortBold: { color: colors.text, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  handle: { fontSize: 14, color: colors.muted },
  btn: { paddingHorizontal: 16, height: 36, borderRadius: 8, backgroundColor: '#efefef', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '700', color: colors.text },
  btnBlue: { backgroundColor: BLUE, minWidth: 110, alignItems: 'center' },
  btnBlueText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  more: { padding: 6 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
