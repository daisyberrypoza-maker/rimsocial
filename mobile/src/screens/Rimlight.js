import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, Text, Pressable, Image, StyleSheet, useWindowDimensions, RefreshControl } from 'react-native';
import Video from 'react-native-video';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Search, UserPlus, Plus } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import { useAppStore } from '../store';
import { loadPage } from '../lib/paged';
import { logError } from '../lib/toast';
import { colors } from '../theme';

const STALE_AFTER_MS = 60 * 1000;
const SNAP_YELLOW = '#FFFC00'; // active tab underline, as on the web
const TABS = [['discover', 'Discover'], ['following', 'Following']];
const isStale = (feed) => !feed?.updatedAt || Date.now() - feed.updatedAt > STALE_AFTER_MS;

// Rimlight: full-screen vertical posts. Discover and Following are two saved lists.
export default function Rimlight() {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const [tab, setTab] = useState('discover');
  const feed = useAppStore((s) => s.feeds[tab]);
  const pending = useAppStore((s) => s.pendingUpload);
  const me = useAppStore((s) => s.user);
  const { height: winHeight } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(() => (isStale(feed) ? 0 : feed?.activeIndex || 0));
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(() => isStale(feed));
  const [scrolling, setScrolling] = useState(false);
  const items = feed?.items || [];
  const listRef = useRef(null);
  const pageHeight = height || winHeight;

  const run = useCallback((reset) => {
    setLoading(true);
    return loadPage(tab, `/v1/feed/${tab}`, reset).catch(logError).finally(() => setLoading(false));
  }, [tab]);

  // Opening a tab shows saved posts at once and refreshes only when they are old
  useEffect(() => {
    const current = useAppStore.getState().feeds[tab];
    if (isStale(current)) { setActive(0); run(true); }
    else setActive(current?.activeIndex || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function onViewable({ viewableItems }) {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === 'number') {
      setActive(first.index);
      useAppStore.getState().setFeed(tab, { activeIndex: first.index });
    }
  }

  async function refresh() {
    setRefreshing(true);
    try { await run(true); } finally { setRefreshing(false); }
  }

  // Restore the saved position on the same tab (the list is keyed by tab, so it mounts again on a switch)
  const startIndex = isStale(feed) ? 0 : Math.min(feed?.activeIndex || 0, Math.max(items.length - 1, 0));

  return (
    <View style={styles.page} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {pending?.kind === 'post' && (
        <View style={styles.upload} pointerEvents="none">
          {pending.mediaKind === 'video'
            ? <Video source={{ uri: pending.thumb }} style={styles.uploadThumb} paused muted resizeMode="cover" />
            : <Image source={{ uri: pending.thumb }} style={styles.uploadThumb} />}
        </View>
      )}
      <View style={styles.spTop} pointerEvents="box-none">
        <Pressable onPress={() => navigation.navigate('Profile', { username: me?.username })} accessibilityLabel="Your profile" style={styles.spRound}><Avatar user={me || {}} size={34} /></Pressable>
        <Pressable onPress={() => navigation.navigate('Search')} accessibilityLabel="Search" style={styles.spRound}><Search size={20} color="#fff" strokeWidth={2.4} /></Pressable>
        <Text style={styles.spTitle}>Spotlight</Text>
        <Pressable onPress={() => navigation.navigate('Explore')} accessibilityLabel="Find friends" style={styles.spRound}><UserPlus size={20} color="#fff" strokeWidth={2.2} /></Pressable>
        <Pressable onPress={() => navigation.navigate('Upload')} accessibilityLabel="Create" style={styles.spRound}><Plus size={22} color="#fff" strokeWidth={2.4} /></Pressable>
      </View>
      <View style={styles.tabs} pointerEvents="box-none">
        {TABS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} accessibilityLabel={label} style={styles.tab}>
            <Text style={[styles.tabText, tab === key && styles.tabOn]}>{label}</Text>
            {tab === key && <View style={styles.tabLine} />}
          </Pressable>
        ))}
      </View>
      <FlatList
        key={tab}
        ref={listRef}
        data={items}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item, index }) => (
          <PostCard post={item} active={index === active} focused={focused} navigation={navigation} height={pageHeight} scrolling={scrolling} />
        )}
        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
        initialScrollIndex={startIndex}
        pagingEnabled
        snapToInterval={pageHeight}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onScrollBeginDrag={() => setScrolling(true)}
        onMomentumScrollEnd={() => setScrolling(false)}
        onScrollEndDrag={(e) => { if (Math.abs(e.nativeEvent.velocity?.y || 0) < 0.05) setScrolling(false); }}
        onEndReached={() => { if (feed?.nextCursor && !loading) run(false); }}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
        ListEmptyComponent={!loading ? (
          <View style={[styles.empty, { height: pageHeight }]}>
            <Text style={styles.emptyText}>Nothing here yet. Post something or follow creators.</Text>
          </View>
        ) : null}
        initialNumToRender={2}
        windowSize={3}
        removeClippedSubviews
        style={{ backgroundColor: colors.darkBg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.darkBg },
  tabs: { position: 'absolute', top: 48, left: 0, right: 0, zIndex: 5, flexDirection: 'row', justifyContent: 'center', gap: 16 },
  tab: { alignItems: 'center', paddingVertical: 4 },
  tabText: { color: 'rgba(255,255,255,0.65)', fontSize: 16, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  tabOn: { color: '#fff' },
  spTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  spRound: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  spTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  tabLine: { alignSelf: 'stretch', height: 3, marginTop: 4, borderRadius: 2, backgroundColor: SNAP_YELLOW },
  upload: { position: 'absolute', top: 72, right: 14, zIndex: 6, width: 46, height: 46, borderRadius: 23, padding: 3, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  uploadThumb: { width: '100%', height: '100%', borderRadius: 20 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.darkBg },
  emptyText: { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center' },
});
