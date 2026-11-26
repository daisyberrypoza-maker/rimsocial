import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpRight, Play, Pause, Plus, Shuffle, Search } from 'lucide-react-native';
import { api } from '../api';
import { mediaUrl } from '../config';
import { useAppStore } from '../store';
import { logError, toast } from '../lib/toast';

const TABS = [['featured', 'For You'], ['trending', 'Trending'], ['original', 'Original']];
const PAGE_SIZE = 30;

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function MusicPicker({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const selectedId = route.params?.selectedId || null;
  const onSelect = route.params?.onSelect;
  const music = useAppStore((state) => state.music);
  const setMusic = useAppStore((state) => state.setMusic);
  const [busy, setBusy] = useState(false);
  const [paging, setPaging] = useState(false);
  const listRef = useRef(null);
  const tab = music?.tab || 'featured';
  const query = music?.query || '';
  const listKey = `${tab}::${query.trim().toLowerCase()}`;
  const cache = music?.lists?.[listKey] || { items: [], nextOffset: 0, hasMore: true, loaded: false, source: 'local' };
  const items = cache.items || [];
  const activeTrack = music?.activeTrack;

  useEffect(() => {
    if (listRef.current && music?.scrollOffset > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: music.scrollOffset, animated: false }));
    }
  }, []);

  async function fetchPage(activeTab, search, offset, sourceHint) {
    const q = String(search || '').trim();
    if (activeTab === 'trending') {
      if (q) {
        const result = await api(`/v1/audio/audius/search?q=${encodeURIComponent(q)}&offset=${offset}&limit=${PAGE_SIZE}`);
        return { ...result, source: 'audius' };
      }
      if (sourceHint !== 'audius') {
        const network = await api(`/v1/audio/network-trending?offset=${offset}&limit=${PAGE_SIZE}`);
        if ((network.items || []).length || offset > 0) return { ...network, source: 'network' };
      }
      const general = await api(`/v1/audio/audius/trending?offset=${offset}&limit=${PAGE_SIZE}`);
      return { ...general, source: 'audius' };
    }
    const params = new URLSearchParams({ q, offset: String(offset), limit: String(PAGE_SIZE) });
    if (activeTab === 'original') params.set('original', '1');
    return { ...(await api(`/v1/audio/search?${params.toString()}`)), source: 'local' };
  }

  useEffect(() => {
    if (cache.loaded) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const data = await fetchPage(tab, query, 0);
        if (!active) return;
        const nextItems = (data.items || []).map((item) => ({ ...item, source: item.source || data.source }));
        const latest = useAppStore.getState().music;
        setMusic({ lists: { ...latest.lists, [listKey]: {
          items: nextItems, nextOffset: data.nextOffset ?? nextItems.length,
          hasMore: Boolean(data.hasMore), source: data.source, loaded: true,
        } } });
      } catch (error) {
        if (active) { logError(error); toast('Music could not be loaded'); }
      } finally { if (active) setBusy(false); }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [listKey, cache.loaded, tab, query, setMusic]);

  async function loadMore() {
    const latest = useAppStore.getState().music;
    const current = latest.lists?.[listKey] || cache;
    if (paging || busy || !current.hasMore || tab === 'saved') return;
    setPaging(true);
    try {
      const data = await fetchPage(tab, query, current.nextOffset || 0, current.source);
      const more = (data.items || []).map((item) => ({ ...item, source: item.source || data.source }));
      const seen = new Set((current.items || []).map((item) => String(item.id)));
      const updated = {
        ...current,
        items: [...(current.items || []), ...more.filter((item) => !seen.has(String(item.id)))],
        nextOffset: data.nextOffset ?? ((current.nextOffset || 0) + more.length),
        hasMore: Boolean(data.hasMore),
        source: data.source || current.source,
        loaded: true,
      };
      setMusic({ lists: { ...useAppStore.getState().music.lists, [listKey]: updated } });
    } catch (error) { logError(error); }
    finally { setPaging(false); }
  }

  async function togglePreview(item) {
    const current = useAppStore.getState().music;
    const sameTrack = String(current.activeTrack?.id) === String(item.id);
    if (sameTrack && current.playing) {
      setMusic({ playing: false });
      return;
    }
    if (sameTrack && current.playbackUrls?.length) {
      setMusic({ playing: true });
      return;
    }
    // This action starts directly from the user's tap. Native playback is handled by the
    // persistent React Native Video instance mounted above the navigation tree.
    try {
      let urls;
      if (item.source === 'audius') {
        const result = await api(`/v1/audio/audius/${encodeURIComponent(item.id)}/stream`);
        urls = result.urls?.length ? result.urls : (result.url ? [result.url] : []);
      } else {
        urls = [mediaUrl(item.mediaUrl)];
      }
      if (!urls.length || !urls[0]) throw new Error('No playable stream URL');
      setMusic({ activeTrack: item, playbackUrls: urls, playbackIndex: 0, playing: true });
    } catch (error) {
      logError(error);
      setMusic({ playing: false });
      toast('This sound could not be played');
    }
  }

  function choose(item) {
    if (onSelect) onSelect(item);
    navigation.goBack();
  }

  function renderRow({ item }) {
    const selected = String(selectedId) === String(item.id);
    const playing = String(activeTrack?.id) === String(item.id) && Boolean(music?.playing);
    return (
      <View style={[styles.row, selected && styles.rowOn]}>
        <Pressable style={styles.art} onPress={() => togglePreview(item)} accessibilityRole="button" accessibilityLabel={playing ? `Pause ${item.title}` : `Play ${item.title}`}>
          {item.artwork ? <Image source={{ uri: item.artwork }} style={styles.artImg} /> : <View style={styles.artEmpty} />}
          <View style={styles.badge}>{playing ? <Pause size={14} color="#fff" /> : <Play size={14} color="#fff" />}</View>
        </Pressable>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{[item.artist, item.duration ? formatDuration(item.duration) : null].filter(Boolean).join(' · ')}</Text>
        </View>
        {selected ? (
          <Pressable style={styles.addPill} onPress={() => choose(item)} accessibilityRole="button" accessibilityLabel={`Add ${item.title} to story`}>
            <Plus size={16} color="#111" /><Text style={styles.addPillText}>Add to story</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.add} onPress={() => choose(item)} accessibilityRole="button" accessibilityLabel={`Use ${item.title} for your story`}>
            <Plus size={20} color="#fff" />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Close sound picker">
          <ArrowUpRight size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heading}>Music for you</Text>
      </View>
      <Text style={styles.lead}>Share what’s <Text style={styles.gradient}>on repeat</Text> to your story</Text>
      <View style={styles.search}>
        <Search size={18} color="#fff" />
        <TextInput value={query} onChangeText={(value) => setMusic({ query: value })} placeholder="Search songs and artists" placeholderTextColor="#a5aab2" style={styles.searchInput} />
      </View>
      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} style={[styles.tab, tab === key && styles.tabOn]} onPress={() => setMusic({ tab: key, query: '' })} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {busy && !items.length ? <ActivityIndicator style={styles.loading} color="#fff" /> : (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          onScroll={(event) => setMusic({ scrollOffset: event.nativeEvent.contentOffset.y })}
          scrollEventThrottle={250}
          ListEmptyComponent={<Text style={styles.empty}>No sounds found.</Text>}
          ListFooterComponent={paging ? <ActivityIndicator color="#fff" /> : null}
        />
      )}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable style={[styles.shuffle, items.length < 2 && styles.dim]} onPress={() => setMusic({ lists: { ...useAppStore.getState().music.lists, [listKey]: { ...cache, items: shuffled(items) } } })} disabled={items.length < 2} accessibilityRole="button" accessibilityLabel="Shuffle sounds">
          <Shuffle size={20} color="#fff" /><Text style={styles.shuffleText}>Shuffle</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f1115' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 4 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heading: { color: '#fff', fontSize: 18, fontWeight: '600' },
  lead: { color: '#fff', fontSize: 24, lineHeight: 30, fontWeight: '500', textAlign: 'center', marginVertical: 22, paddingHorizontal: 24 },
  gradient: { color: '#ff3b5c' },
  search: { height: 44, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#262b33', flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  tab: { height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: '#3a3f47', justifyContent: 'center' },
  tabOn: { backgroundColor: '#fff', borderColor: '#fff' },
  tabText: { color: '#b5bac1', fontSize: 14, fontWeight: '500' },
  tabTextOn: { color: '#0f1115' },
  loading: { marginTop: 32 },
  list: { paddingBottom: 120 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 8, minHeight: 80 },
  rowOn: { backgroundColor: 'rgba(255,255,255,0.04)' },
  art: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: '#262b33' },
  artImg: { width: '100%', height: '100%' },
  artEmpty: { flex: 1, backgroundColor: '#262b33' },
  badge: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
  info: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  meta: { color: '#9aa0a6', fontSize: 14, marginTop: 4 },
  add: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#6b717b', alignItems: 'center', justifyContent: 'center' },
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#fff' },
  addPillText: { color: '#111', fontSize: 14, fontWeight: '600' },
  empty: { color: '#9aa0a6', fontSize: 15, textAlign: 'center', padding: 32 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingVertical: 14, backgroundColor: 'rgba(15,17,21,0.92)' },
  shuffle: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 20, borderRadius: 23, borderWidth: 1, borderColor: '#3a3f47', backgroundColor: '#262b33' },
  shuffleText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dim: { opacity: 0.5 },
});
