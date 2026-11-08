import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { logError } from '../lib/toast';
import { timeAgo } from '../lib/format';
import { colors } from '../theme';

function message(item) {
  if (item.type === 'like') return 'liked your post';
  if (item.type === 'comment') return 'commented on your post';
  if (item.type === 'repost') return 'reposted your post';
  if (item.type === 'follow') return 'started following you';
  if (item.type === 'mention') return 'mentioned you';
  return 'interacted with you';
}

// Notifications: likes, comments, follows and reposts
export default function Activity() {
  const navigation = useNavigation();
  const [items, setItems] = useState(null);

  useEffect(() => {
    api('/v1/activity').then((d) => setItems(d.items || [])).catch((e) => { logError(e); setItems([]); });
  }, []);

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={24} /></Pressable>
        <Text style={styles.title}>Activity</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={items || []}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={<Text style={styles.empty}>{items === null ? '' : 'No activity yet.'}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => (item.post ? navigation.navigate('PostDetail', { postId: item.post.id }) : navigation.navigate('Profile', { username: item.actor?.username }))}>
            <Avatar user={item.actor} size={44} />
            <Text style={styles.text}>
              <Text style={styles.bold}>{item.actor?.username || 'Someone'}</Text> {message(item)}
              {item.comment?.body ? <Text style={styles.muted}> “{item.comment.body}”</Text> : null}
            </Text>
            <Text style={styles.muted}>{timeAgo(item.createdAt)}</Text>
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
  text: { flex: 1, fontSize: 14, color: colors.text },
  bold: { fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
