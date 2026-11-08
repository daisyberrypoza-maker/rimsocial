import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, Text, Pressable, StyleSheet, useWindowDimensions, RefreshControl } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import PostCard from '../components/PostCard';
import { useAppStore } from '../store';
import { loadPage } from '../lib/paged';
import { logError } from '../lib/toast';
import { colors } from '../theme';

const STALE_AFTER_MS = 60 * 1000;

// Rimlight: full-screen vertical posts. Discover and Following are two saved lists.
export default function Rimlight() {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const [tab, setTab] = useState('discover');
  const feed = useAppStore((s) => s.feeds[tab]);
  const pending = useAppStore((s) => s.pendingUpload);
  const { height: winHeight } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const items = feed?.items || [];
  const listRef = useRef(null);

  const run = useCallback((reset) => loadPage(tab, `/v1/feed/${tab}`, reset).catch(logError), [tab]);

  // Opening the screen shows saved posts at once and refreshes only when they are old
  useEffect(() => {
    const stale = !feed?.updatedAt || Date.now() - feed.updatedAt > STALE_AFTER_MS;
    if (stale) { run(true); setActive(0); }
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

  const pageHeight = height || winHeight;
  return (
    <View style={styles.page} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {pending?.kind === 'post' && (
        <View style={styles.uploading} pointerEvents="none">
          <Text style={styles.uploadingText}>Posting…</Text>
        </View>
      )}
      <View style={styles.tabs} pointerEvents="box-none">
        <Pressable onPress={() => setTab('following')} accessibilityLabel="Following"><Text style={[styles.tabText, tab === 'following' && styles.tabOn]}>Following</Text></Pressable>
        <Pressable onPress={() => setTab('discover')} accessibilityLabel="Discover"><Text style={[styles.tabText, tab === 'discover' && styles.tabOn]}>Discover</Text></Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item, index }) => (
          <PostCard post={item} active={index === active} focused={focused} navigation={navigation} height={pageHeight} />
        )}
        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
        pagingEnabled
        snapToInterval={pageHeight}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onEndReached={() => { if (feed?.nextCursor) run(false); }}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
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
  tabs: { position: 'absolute', top: 48, left: 0, right: 0, zIndex: 5, flexDirection: 'row', justifyContent: 'center', gap: 22 },
  tabText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600' },
  tabOn: { color: '#fff' },
  uploading: { position: 'absolute', top: 96, alignSelf: 'center', zIndex: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  uploadingText: { color: '#fff', fontSize: 13 },
});
