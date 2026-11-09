import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { mediaUrl } from '../config';
import { colors } from '../theme';

// Same copy, filters and layout as the web Activity page (mobile rules in styles.css)
const READ_KEY = 'rimsocial-activity-read-at';
const BRAND = '#4b5cff';
const SOFT = '#f1f2f4';
const INK = '#17191f';
const GREY = '#777777';

const FILTERS = [['all', 'All'], ['mention', 'Mentions'], ['like', 'Likes'], ['comment', 'Comments'], ['repost', 'Reposts'], ['follow', 'Followers']];

function message(item) {
  if (item.type === 'like') return 'liked your post';
  if (item.type === 'comment') return 'commented on your post';
  if (item.type === 'repost') return 'reposted your post';
  if (item.type === 'follow') return 'started following you';
  if (item.type === 'mention') return 'mentioned you in a post';
  return 'interacted with you';
}

function timeAgo(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd';
  return new Date(value).toLocaleDateString();
}

// Shown inside the Chat screen (onBack returns to messages); also still works as its own screen.
export default function Activity({ onBack }) {
  const navigation = useNavigation();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('all');
  const [readAt, setReadAt] = useState(0);

  const load = useCallback(() => {
    api('/v1/activity')
      .then((data) => { setItems(Array.isArray(data?.items) ? data.items : []); setFailed(false); })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    AsyncStorage.getItem(READ_KEY).then((v) => setReadAt(Number(v || 0))).catch(() => {});
  }, [load]);

  const list = items || [];
  const filtered = useMemo(() => (filter === 'all' ? list : list.filter((item) => item.type === filter)), [list, filter]);
  const unread = list.filter((item) => new Date(item.createdAt).getTime() > readAt).length;

  function markRead() {
    const stamp = Date.now();
    setReadAt(stamp);
    AsyncStorage.setItem(READ_KEY, String(stamp)).catch(() => {});
  }

  function openItem(item) {
    markRead();
    if (item.type !== 'follow' && item.post?.id) navigation.navigate('PostDetail', { postId: item.post.id });
    else navigation.navigate('Profile', { username: item.actor?.username });
  }

  const header = (
    <View>
      <View style={styles.heading}>
        <View style={styles.titleRow}>
          {(onBack || navigation.canGoBack()) && (
            // Back returns to messages (or to the screen the user came from)
            <Pressable onPress={() => (onBack ? onBack() : navigation.goBack())} accessibilityLabel="Back" style={styles.refresh}>
              <Icon name="arrow-left" size={22} color={INK} />
            </Pressable>
          )}
          <Text style={styles.title}>Activity</Text>
        </View>
        <Pressable onPress={load} accessibilityLabel="Refresh activity" style={styles.refresh}>
          <Icon name="refresh" size={19} color={INK} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll} contentContainerStyle={styles.filters}>
        {FILTERS.map(([key, label]) => {
          const on = filter === key;
          return (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setFilter(key)} style={[styles.filter, on && styles.filterOn]}>
              <Text style={[styles.filterText, on && styles.filterTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {unread > 0 && (
        <View style={styles.readRow}>
          <Text style={styles.readText}>{unread} new {unread === 1 ? 'activity' : 'activities'}</Text>
          <Pressable onPress={markRead} accessibilityRole="button"><Text style={styles.markRead}>Mark all read</Text></Pressable>
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      style={styles.page}
      data={filtered}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={header}
      ListEmptyComponent={items === null || failed ? null : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="bell" size={30} color={BRAND} /></View>
          <Text style={styles.emptyTitle}>You’re all caught up</Text>
          <Text style={styles.emptyText}>Mentions, likes, comments, reposts and new followers will show up here.</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const isUnread = new Date(item.createdAt).getTime() > readAt;
        const media = item.post?.mediaUrl ? mediaUrl(item.post.mediaUrl) : null;
        return (
          <Pressable style={styles.item} onPress={() => openItem(item)}>
            <Avatar user={item.actor} size={46} />
            <View style={styles.copy}>
              <Text style={styles.copyText}>
                <Text style={styles.bold}>{item.actor?.displayName || item.actor?.username}</Text> {message(item)}
              </Text>
              {item.type === 'comment' && item.comment ? <Text style={styles.comment} numberOfLines={1}>“{item.comment}”</Text> : null}
              <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
            </View>
            {item.post?.mediaUrl ? (
              <View style={styles.thumb}>
                {item.post.kind === 'video'
                  ? <Icon name="play" size={16} color={GREY} />
                  : <Image source={{ uri: media }} style={styles.thumbImage} />}
              </View>
            ) : <Icon name="chevron" size={18} color={GREY} />}
            {isUnread && <View style={styles.unreadDot} />}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', color: INK },
  refresh: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  filtersScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.line },
  filters: { flexDirection: 'row', gap: 22, paddingHorizontal: 16 },
  filter: { minHeight: 42, justifyContent: 'center', paddingBottom: 2, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterOn: { borderBottomColor: BRAND },
  filterText: { fontSize: 14, fontWeight: '500', color: GREY },
  filterTextOn: { fontWeight: '600', color: INK },
  readRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  readText: { fontSize: 13, color: colors.muted },
  markRead: { fontSize: 13, fontWeight: '600', color: BRAND },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, position: 'relative' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  copyText: { fontSize: 14, lineHeight: 19, color: INK },
  bold: { fontWeight: '700' },
  comment: { fontSize: 14, color: colors.muted },
  time: { fontSize: 12, color: colors.muted },
  thumb: { width: 44, height: 44, borderRadius: 6, overflow: 'hidden', backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: '100%', height: '100%' },
  unreadDot: { position: 'absolute', right: 6, top: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: '#111111' },
  empty: { alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingVertical: 64, paddingHorizontal: 28, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 8, fontSize: 18, fontWeight: '600', color: INK },
  emptyText: { maxWidth: 280, fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: 'center' },
});
