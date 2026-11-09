import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Image } from 'react-native';
import Video from 'react-native-video';
import { Music } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { loadPage } from '../lib/paged';
import { formatCount } from '../lib/format';
import { logError } from '../lib/toast';
import { mediaUrl } from '../config';
import { colors } from '../theme';

// Search, Instagram-style: the grid of posts first; typing shows For you / Accounts / Tags.
// A tag opens its own screen (SearchTag) with the posts that use it.
const KEY = 'explore';
const PATH = '/v1/feed/explore';
const BLUE = '#4f5bfa';
const TABS = [['foryou', 'For you'], ['accounts', 'Accounts'], ['audio', 'Audio'], ['tags', 'Tags']];

// Hashtags found in the captions of the matching posts, with how many posts use each one
function tagsFrom(posts, term) {
  const needle = term.replace(/^#/, '').toLowerCase();
  const counts = new Map();
  for (const post of posts) {
    for (const tag of new Set(String(post.caption || '').match(/#[\p{L}\p{N}_]+/gu) || [])) {
      const name = tag.slice(1).toLowerCase();
      if (!needle || name.includes(needle)) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

export default function Discover() {
  const navigation = useNavigation();
  const route = useRoute();
  // Opened from a tag: this screen shows that tag's posts
  const tagPage = route.params?.tag ? String(route.params.tag).replace(/^#/, '') : '';
  const [query, setQuery] = useState(tagPage ? `#${tagPage}` : '');
  const [tab, setTab] = useState('foryou');
  const [search, setSearch] = useState(null);
  const [busy, setBusy] = useState({});
  const [playingId, setPlayingId] = useState(null);
  const [tracks, setTracks] = useState([]);
  const feed = useAppStore((s) => s.feeds[KEY]);
  const explore = feed?.items || [];
  const term = query.trim();

  useEffect(() => {
    if (!tagPage && (!feed?.updatedAt || Date.now() - feed.updatedAt > 60 * 1000)) loadPage(KEY, PATH, true).catch(logError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!term) { setSearch(null); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      api(`/v1/search?q=${encodeURIComponent(term)}&type=${tagPage ? 'hashtags' : 'all'}`)
        .then((r) => { if (alive) setSearch(r); })
        .catch(logError);
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [term, tagPage]);

  const posts = term ? (search?.posts || []) : explore;
  const people = search?.people || [];
  const audio = tracks;
  const tags = useMemo(() => tagsFrom(search?.posts || [], term), [search, term]);
  const showTabs = !tagPage && Boolean(term);
  const activeTab = showTabs ? tab : 'foryou';

  // Music library: newest tracks, or the ones matching the search
  useEffect(() => {
    if (tagPage) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      api(`/v1/audio/search?q=${encodeURIComponent(term)}`)
        .then((data) => { if (alive) setTracks(data.items || []); })
        .catch(logError);
    }, term ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [term, tagPage]);

  async function toggleFollow(person) {
    if (busy[person.id]) return;
    setBusy((b) => ({ ...b, [person.id]: true }));
    try {
      const r = await api(`/v1/users/${person.id}/follow`, { method: person.isFollowing ? 'DELETE' : 'POST' });
      setSearch((s) => s && ({ ...s, people: s.people.map((p) => (p.id === person.id ? { ...p, isFollowing: r.isFollowing, followerCount: r.followerCount } : p)) }));
    } catch (e) { logError(e); }
    finally { setBusy((b) => ({ ...b, [person.id]: false })); }
  }

  const header = (
    <View>
      <View style={styles.bar}>
        {tagPage ? (
          <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={10} style={styles.back}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={styles.field}>
          <Icon name="search" size={20} color={colors.muted} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!tagPage}
            returnKeyType="search"
          />
          {!!query && !tagPage && (
            <Pressable onPress={() => { setQuery(''); setTab('foryou'); }} accessibilityLabel="Clear search" hitSlop={8}>
              <Icon name="x" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>
      {showTabs && (
        <View style={styles.tabs}>
          {TABS.map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: activeTab === key }} style={[styles.tab, activeTab === key && styles.tabOn]}>
              <Text style={[styles.tabText, activeTab === key && styles.tabTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const openPost = (post) => navigation.navigate('ExploreWatch', { postId: post.id });

  if (activeTab === 'accounts') {
    return (
      <FlatList
        key="accounts"
        style={styles.page}
        data={people}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={styles.empty}>No accounts found.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.person} onPress={() => navigation.navigate('Profile', { username: item.username })}>
            <Avatar user={item} size={52} />
            <View style={styles.personText}>
              <Text style={styles.name} numberOfLines={1}>{item.username}</Text>
              <Text style={styles.sub} numberOfLines={1}>{item.displayName}{item.followerCount ? ` · ${formatCount(item.followerCount)} followers` : ''}</Text>
            </View>
            <Pressable
              style={[styles.followBtn, item.isFollowing && styles.followOn]}
              onPress={() => toggleFollow(item)}
              disabled={!!busy[item.id]}
              accessibilityLabel={item.isFollowing ? 'Following' : 'Follow'}
            >
              <Text style={[styles.followText, item.isFollowing && styles.followTextOn]}>{item.isFollowing ? 'Following' : 'Follow'}</Text>
            </Pressable>
          </Pressable>
        )}
      />
    );
  }

  if (activeTab === 'audio') {
    return (
      <FlatList
        key="audio"
        style={styles.page}
        data={audio}
        keyExtractor={(t) => String(t.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={styles.empty}>No music found.</Text>}
        renderItem={({ item }) => {
          const playing = playingId === item.id;
          return (
            <Pressable style={styles.person} onPress={() => setPlayingId(playing ? null : item.id)} accessibilityLabel={`${playing ? 'Pause' : 'Play'} ${item.title}`}>
              <View style={styles.hash}><Music size={22} color={colors.text} /></View>
              <View style={styles.personText}>
                <Text style={[styles.name, playing && styles.playingName]} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.sub} numberOfLines={1}>{item.artist}</Text>
              </View>
              {playing && (
                <Video source={{ uri: mediaUrl(item.mediaUrl) }} audioOnly paused={false} onEnd={() => setPlayingId(null)} style={styles.hidden} />
              )}
            </Pressable>
          );
        }}
      />
    );
  }

  if (activeTab === 'tags') {
    return (
      <FlatList
        key="tags"
        style={styles.page}
        data={tags}
        keyExtractor={(t) => t.tag}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={styles.empty}>No tags found.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.person} onPress={() => navigation.navigate('SearchTag', { tag: item.tag })}>
            <View style={styles.hash}><Text style={styles.hashText}>#</Text></View>
            <View style={styles.personText}>
              <Text style={styles.name} numberOfLines={1}>#{item.tag}</Text>
              <Text style={styles.sub}>{formatCount(item.count)} {item.count === 1 ? 'post' : 'posts'}</Text>
            </View>
          </Pressable>
        )}
      />
    );
  }

  // For you (the grid): the explore posts, or the posts matching the search
  return (
    <FlatList
      key="grid"
      style={styles.page}
      data={posts}
      numColumns={3}
      keyExtractor={(p) => String(p.id)}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={styles.empty}>{term ? 'No posts found.' : 'Nothing to explore yet.'}</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.cell} onPress={() => openPost(item)}>
          <Image source={{ uri: mediaUrl(item.thumbUrl || item.mediaUrl) }} style={styles.fill} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  back: { paddingRight: 4 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#efefef', borderRadius: 12, paddingHorizontal: 12, height: 40 },
  input: { flex: 1, fontSize: 16, color: colors.text, padding: 0 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  tab: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 999, paddingHorizontal: 16, height: 34, justifyContent: 'center' },
  tabOn: { backgroundColor: '#efefef', borderColor: '#efefef' },
  tabText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  tabTextOn: { color: colors.text },
  cell: { flex: 1 / 3, aspectRatio: 1, margin: 1 },
  fill: { width: '100%', height: '100%', backgroundColor: colors.surface },
  person: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  personText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  followBtn: { backgroundColor: BLUE, borderRadius: 8, paddingHorizontal: 14, height: 34, justifyContent: 'center' },
  followOn: { backgroundColor: '#efefef' },
  followText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  followTextOn: { color: colors.text },
  hash: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: '#e5e5e5', alignItems: 'center', justifyContent: 'center' },
  hashText: { fontSize: 22, color: colors.text },
  empty: { textAlign: 'center', color: colors.muted, padding: 40 },
  playingName: { color: BLUE },
  hidden: { width: 1, height: 1 },
});
