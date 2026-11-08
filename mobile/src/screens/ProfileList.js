import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { logError } from '../lib/toast';
import { colors } from '../theme';

// Followers, Following or Blocked people. A pushed screen: Back returns to the profile.
const TITLES = { followers: 'Followers', following: 'Following', blocked: 'Blocked' };

export default function ProfileList() {
  const navigation = useNavigation();
  const { username, list } = useRoute().params;
  const [items, setItems] = useState(null);
  const title = TITLES[list] || 'People';

  useEffect(() => {
    const path = list === 'blocked' ? '/v1/users/blocked' : `/v1/users/${username}/${list}`;
    api(path).then((d) => setItems(d.items || [])).catch((e) => { logError(e); setItems([]); });
  }, [list, username]);

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={24} /></Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={items || []}
        keyExtractor={(p) => String(p.id)}
        ListEmptyComponent={<Text style={styles.empty}>{items === null ? '' : `No ${title.toLowerCase()} yet.`}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('Profile', { username: item.username })}>
            <Avatar user={item} size={48} />
            <View style={styles.text}>
              <Text style={styles.name}>{item.displayName || item.username}</Text>
              <Text style={styles.handle}>@{item.username}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  text: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  handle: { fontSize: 14, color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
