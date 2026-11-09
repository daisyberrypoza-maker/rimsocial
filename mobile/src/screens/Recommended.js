import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { logError } from '../lib/toast';
import { colors } from '../theme';

const SNAP_YELLOW = '#FFFC00'; // Add button, as on the web

// Suggested people to follow. Same list and buttons as the web Recommended page.
export default function Recommended() {
  const navigation = useNavigation();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});

  useEffect(() => {
    api('/v1/users/suggestions')
      .then((data) => setPeople(data.suggested || []))
      .catch(logError)
      .finally(() => setLoading(false));
  }, []);

  async function toggle(person) {
    if (busy[person.id]) return;
    setBusy((current) => ({ ...current, [person.id]: true }));
    try {
      const r = person.isFollowing
        ? await api(`/v1/users/${person.id}/follow`, { method: 'DELETE' })
        : await api(`/v1/users/${person.id}/follow`, { method: 'POST' });
      setPeople((current) => current.map((item) => (item.id === person.id
        ? { ...item, isFollowing: r.isFollowing, followerCount: r.followerCount }
        : item)));
    } catch (e) { logError(e); }
    finally { setBusy((current) => ({ ...current, [person.id]: false })); }
  }

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Pressable style={styles.topBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="chevron-down" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Recommended</Text>
        <View style={styles.topBtn} />
      </View>
      <FlatList
        data={people}
        keyExtractor={(p) => String(p.id)}
        style={styles.list}
        renderItem={({ item, index }) => {
          const added = Boolean(item.isFollowing);
          return (
            <View style={[styles.row, index === 0 && styles.rowFirst]}>
              <Pressable style={styles.person} onPress={() => navigation.navigate('Profile', { username: item.username })}>
                <Avatar user={item} size={52} />
                <Text style={styles.name} numberOfLines={1}>{item.displayName || item.username}</Text>
              </Pressable>
              <Pressable
                style={[styles.follow, added && styles.followAdded, busy[item.id] && styles.followBusy]}
                onPress={() => toggle(item)}
                disabled={Boolean(busy[item.id])}
                accessibilityLabel={added ? 'Added' : 'Add'}
              >
                <Text style={[styles.followText, added && styles.followTextAdded]}>{busy[item.id] ? '…' : added ? 'Added' : 'Add'}</Text>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No suggestions right now.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface, paddingTop: 48 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10, backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  topBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.text },
  list: { margin: 16, backgroundColor: colors.bg, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowFirst: { borderTopWidth: 0 },
  person: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '500', color: colors.text },
  follow: { minWidth: 84, height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: SNAP_YELLOW, alignItems: 'center', justifyContent: 'center' },
  followAdded: { backgroundColor: colors.surface },
  followBusy: { opacity: 0.6 },
  followText: { fontSize: 15, fontWeight: '600', color: colors.text },
  followTextAdded: { color: colors.text },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 24, paddingHorizontal: 16 },
});
