import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Image } from 'react-native';
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

// Mirrors the web Explore page.
// Explore: grid of posts. Find friends (route.friends): follow-back and suggested people.
// Search (route.search or typing): Top / Accounts / Posts / Hashtags results.
const KEY = 'explore';
const PATH = '/v1/feed/explore';
const BLUE = '#4f5bfa';
const TABS = [['all', 'Top'], ['people', 'Accounts'], ['posts', 'Posts'], ['hashtags', 'Hashtags']];

export default function Explore() {
  const navigation = useNavigation();
  const route = useRoute();
  // Explore is Find friends only: the user+ icon and search open it
  const peopleMode = true;
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [results, setResults] = useState(null);
  const [recs, setRecs] = useState({ suggested: [], followBack: [] });
  const [busy, setBusy] = useState({});
  const [searchOpen, setSearchOpen] = useState(Boolean(route.params?.search));
  const [loading, setLoading] = useState(false);
  const feed = useAppStore((s) => s.feeds[KEY]);
  const items = feed?.items || [];

  useEffect(() => {
    api('/v1/users/suggestions').then(setRecs).catch(() => {});
    if (!feed?.updatedAt || Date.now() - feed.updatedAt > 60 * 1000) more(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function more(reset = false) {
    setLoading(true);
    return loadPage(KEY, PATH, reset).catch(logError).finally(() => setLoading(false));
  }

  async function runSearch(term, type = searchType) {
    const q = term.trim();
    if (!q) { setResults(null); return; }
    try { setResults(await api(`/v1/search?q=${encodeURIComponent(q)}&type=${type}`)); }
    catch (e) { logError(e); }
  }

  async function toggleFollow(person) {
    if (busy[person.id]) return;
    setBusy((b) => ({ ...b, [person.id]: true }));
    try {
      const r = await api(`/v1/users/${person.id}/follow`, { method: person.isFollowing ? 'DELETE' : 'POST' });
      const update = (p) => (p.id === person.id ? { ...p, isFollowing: r.isFollowing, followerCount: r.followerCount } : p);
      setResults((cur) => (cur ? { ...cur, people: (cur.people || []).map(update) } : cur));
      setRecs((cur) => ({ suggested: cur.suggested.map(update), followBack: cur.followBack.map(update) }));
    } catch (e) { logError(e); }
    finally { setBusy((b) => ({ ...b, [person.id]: false })); }
  }

  // Build one flat list so headers, people and the post grid scroll together.
  const rows = [];
  if (results) {
    if (results.people?.length) {
      rows.push({ type: 'header', id: 'h-acc', title: 'Accounts' });
      results.people.forEach((p) => rows.push({ type: 'person', id: `a-${p.id}`, person: p, followLabel: p.isFollowing ? 'Following' : 'Follow' }));
    }
    if (results.posts?.length) {
      rows.push({ type: 'header', id: 'h-posts', title: 'Posts' });
      results.posts.forEach((p) => rows.push({ type: 'post', id: `p-${p.id}`, post: p }));
    }
    if (!results.people?.length && !results.posts?.length) rows.push({ type: 'empty', id: 'none', text: 'No results. Try another name or hashtag.' });
  } else if (peopleMode) {
    if (recs.followBack.length) {
      rows.push({ type: 'header', id: 'h-fb', title: 'Follows you' });
      recs.followBack.forEach((p) => rows.push({ type: 'person', id: `f-${p.id}`, person: p, followLabel: p.isFollowing ? 'Following' : 'Follow back', sub: p.displayName || 'Follows you' }));
    }
    // One place per person: anyone who follows you or you follow is never under Suggested
    const followBackIds = new Set(recs.followBack.map((p) => p.id));
    const suggestedOnly = recs.suggested.filter((p) => !p.isFollowing && !followBackIds.has(p.id));
    if (suggestedOnly.length) {
      rows.push({ type: 'header', id: 'h-sug', title: 'Suggested for you' });
      suggestedOnly.forEach((p) => rows.push({ type: 'person', id: `s-${p.id}`, person: p, followLabel: p.isFollowing ? 'Following' : 'Follow', sub: p.mutualCount ? `${p.mutualCount} mutual connection${p.mutualCount === 1 ? '' : 's'}` : (p.displayName || 'Suggested creator') }));
    }
    if (!recs.followBack.length && !suggestedOnly.length) rows.push({ type: 'empty', id: 'none', text: 'Search for people by name or username.' });
  } else if (!searchOpen) {
    for (let i = 0; i < items.length; i += 3) rows.push({ type: 'grid', id: `g-${i}`, items: items.slice(i, i + 3) });
    if (!items.length && !loading) rows.push({ type: 'empty', id: 'none', text: 'Nothing to explore yet.' });
  }

  function renderRow({ item }) {
    if (item.type === 'header') return <Text style={styles.section}>{item.title}</Text>;
    if (item.type === 'empty') return <Text style={styles.empty}>{item.text}</Text>;
    if (item.type === 'person') {
      const p = item.person;
      return (
        <View style={styles.row}>
          <Pressable style={styles.person} onPress={() => navigation.navigate('Profile', { username: p.username })}>
            <Avatar user={p} size={48} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>{p.username}</Text>
              <Text style={styles.handle} numberOfLines={1}>{item.sub || p.displayName || (results ? `${formatCount(p.followerCount)} followers` : '')}</Text>
            </View>
          </Pressable>
          <Pressable style={[styles.btn, item.followLabel === 'Follow' || item.followLabel === 'Follow back' ? styles.btnBlue : null]} onPress={() => toggleFollow(p)} disabled={busy[p.id]}>
            <Text style={[styles.btnText, item.followLabel === 'Follow' || item.followLabel === 'Follow back' ? styles.btnBlueText : null]}>{busy[p.id] ? '…' : item.followLabel}</Text>
          </Pressable>
        </View>
      );
    }
    if (item.type === 'post') {
      const p = item.post;
      return (
        <Pressable style={styles.postRow} onPress={() => navigation.navigate('PostDetail', { postId: p.id })}>
          <Image source={{ uri: mediaUrl(p.thumbUrl || p.mediaUrl) }} style={styles.postThumb} />
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>@{p.author?.username || 'creator'}</Text>
            <Text style={styles.handle} numberOfLines={1}>{p.caption || 'Post'} · {formatCount(p.viewCount)} views</Text>
          </View>
        </Pressable>
      );
    }
    if (item.type === 'grid') {
      return (
        <View style={styles.gridRow}>
          {item.items.map((p) => (
            <Pressable key={p.id} style={styles.cell} onPress={() => navigation.navigate('ExploreWatch', { postId: p.id })}>
              <Image source={{ uri: mediaUrl(p.thumbUrl || p.mediaUrl) }} style={styles.fill} />
              <View style={styles.views}><Icon name="play" size={12} color="#fff" /><Text style={styles.viewsText}>{formatCount(p.viewCount)}</Text></View>
            </Pressable>
          ))}
        </View>
      );
    }
    return null;
  }

  const showSearchBar = searchOpen || Boolean(results) || Boolean(query.trim());

  return (
    <View style={styles.page}>
      {peopleMode && !searchOpen && (
        <View style={styles.heading}>
          <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={24} /></Pressable>
          <View style={styles.headingText}>
            <Text style={styles.h1}>Find friends</Text>
            <Text style={styles.sub}>Discover people and creators you may know</Text>
          </View>
        </View>
      )}
      <View style={styles.head}>
        {showSearchBar || searchOpen ? (
          <>
            <Pressable onPress={() => { if (results || query) { setQuery(''); setResults(null); setSearchOpen(false); } else navigation.goBack(); }} accessibilityLabel="Back">
              <Icon name="arrow-left" size={24} />
            </Pressable>
            <View style={styles.searchBox}>
              <Icon name="search" size={18} color={colors.muted} />
              <TextInput
                style={styles.input}
                placeholder="Search"
                placeholderTextColor={colors.muted}
                value={query}
                autoFocus={Boolean(route.params?.search)}
                autoCapitalize="none"
                onChangeText={(t) => { setQuery(t); if (!t.trim()) setResults(null); }}
                onSubmitEditing={() => runSearch(query)}
                returnKeyType="search"
              />
            </View>
          </>
        ) : (
          <Pressable style={styles.launch} onPress={() => setSearchOpen(true)} accessibilityLabel="Search">
            <Icon name="search" size={18} color={colors.muted} />
            <Text style={styles.launchText}>Search</Text>
          </Pressable>
        )}
      </View>
      {Boolean(results || query.trim()) && (
        <View style={styles.tabs}>
          {TABS.map(([t, label]) => (
            <Pressable key={t} style={[styles.tab, searchType === t && styles.tabOn]} onPress={() => { setSearchType(t); runSearch(query, t); }}>
              <Text style={[styles.tabText, searchType === t && styles.tabTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={renderRow}
        onEndReached={() => { if (!results && !peopleMode && feed?.nextCursor && !loading) more(false); }}
        onEndReachedThreshold={0.6}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 110 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  headingText: { flex: 1 },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10 },
  launch: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#efefef' },
  launchText: { fontSize: 15, color: colors.muted },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#efefef' },
  input: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#efefef' },
  tabOn: { backgroundColor: colors.text },
  tabText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  tabTextOn: { color: '#fff' },
  section: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, fontSize: 16, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  handle: { fontSize: 13, color: colors.muted },
  btn: { minWidth: 96, height: 34, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#efefef', alignItems: 'center', justifyContent: 'center' },
  btnBlue: { backgroundColor: BLUE },
  btnText: { fontSize: 14, fontWeight: '700', color: colors.text },
  btnBlueText: { color: '#fff' },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  postThumb: { width: 58, height: 58, borderRadius: 6, backgroundColor: '#f2f2f2' },
  gridRow: { flexDirection: 'row', gap: 2, marginBottom: 2 },
  cell: { flex: 1, aspectRatio: 0.75, backgroundColor: '#f2f2f2', overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  views: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewsText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, paddingHorizontal: 24 },
});
