import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import PostCard from '../components/PostCard';
import Icon from '../components/Icon';
import { useAppStore } from '../store';
import { loadPage } from '../lib/paged';
import { logError } from '../lib/toast';
import { colors } from '../theme';

const KEY = 'explore';
const PATH = '/v1/feed/explore';

// Full-screen vertical feed of Explore posts, starting at the post that was tapped.
// No bottom bar: the screen is pushed over the tabs, like the web page.
export default function ExploreWatch() {
  const navigation = useNavigation();
  const postId = useRoute().params?.postId;
  const focused = useIsFocused();
  const feed = useAppStore((s) => s.feeds[KEY]);
  const items = feed?.items || [];
  const nextCursor = feed?.nextCursor ?? null;
  const { height } = useWindowDimensions();
  const listRef = useRef(null);
  const started = useRef(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(() => !items.length);
  const [scrolling, setScrolling] = useState(false);

  const load = useCallback((reset = false) => {
    setLoading(true);
    return loadPage(KEY, PATH, reset).catch(logError).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!items.length) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jump to the tapped post once the list is available
  useEffect(() => {
    if (started.current || !items.length) return;
    started.current = true;
    const index = Math.max(0, items.findIndex((p) => String(p.id) === String(postId)));
    setActive(index);
    if (index > 0) requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, postId]);

  return (
    <View style={styles.page}>
      <Pressable style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Back to Explore" hitSlop={8}>
        <Icon name="arrow-left" size={18} color="#fff" />
        <Text style={styles.backText}>Explore</Text>
      </Pressable>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item, index }) => (
          <PostCard post={item} active={index === active} focused={focused} navigation={navigation} height={height} scrolling={scrolling} />
        )}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={({ viewableItems }) => {
          const first = viewableItems.find((v) => v.isViewable);
          if (first && typeof first.index === 'number') setActive(first.index);
        }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onScrollBeginDrag={() => setScrolling(true)}
        onMomentumScrollEnd={() => setScrolling(false)}
        onEndReached={() => { if (nextCursor && !loading) load(false); }}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={!loading ? (
          <View style={[styles.empty, { height }]}>
            <Text style={styles.emptyText}>Nothing to watch yet.</Text>
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
  back: {
    position: 'absolute', top: 48, left: 12, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.48)',
  },
  backText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.darkBg },
  emptyText: { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center' },
});
