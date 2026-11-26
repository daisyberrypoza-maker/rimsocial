import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { ArrowLeft, Play, Pause, Plus, Shuffle, Search, Bookmark } from 'lucide-react-native';
import { api } from '../api';
import { mediaUrl } from '../config';
import { logError, toast } from '../lib/toast';
import { useAppStore } from '../store';

const TABS = [['featured', 'For You'], ['trending', 'Trending'], ['saved', 'Saved'], ['original', 'Original']];
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
  const selectedId = route.params?.selectedId || null;
  const onSelect = route.params?.onSelect;
  const music = useAppStore((s) => s.music);
  const setMusic = useAppStore((s) => s.setMusic);
  const [busy, setBusy] = useState(false);
  const [paging, setPaging] = useState(false);
  const listRef = useRef(null);
  const [saved, setSaved] = useState([]);
  const tab = music?.tab || 'featured';
  const query = music?.query || '';
  const cache = music?.lists?.[tab] || { items: [], nextOffset: 0, hasMore: true };
  const items = cache.items || [];

  useEffect(() => {
    if (listRef.current && music?.scrollOffset > 0) listRef.current.scrollToOffset({ offset: music.scrollOffset, animated: false });
  }, []);

  useEffect(() => {
    let live = true;
    if (tab === 'saved') return undefined;
    if (items.length && !query) return undefined;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const data = await fetchPage(tab, query, 0);
        if (live) setMusic({ lists: { ...useAppStore.getState().music.lists, [tab]: data } });
      } catch (error) {
        if (live) { logError(error); toast('Music could not be loaded'); }
      } finally { if (live) setBusy(false); }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [tab, query]);

  async function fetchPage(activeTab, search, offset) {
    const q = String(search || '').trim();
    if (activeTab === 'trending') {
      if (q) {
        const result = await api(`/v1/audio/audius/search?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}`);
        return { items: result.items || [], nextOffset: PAGE_SIZE, hasMore: false };
      }
      const network = await api(`/v1/audio/network-trending?offset=${offset}&limit=${PAGE_SIZE}`);
      if ((network.items || []).length) return { items: network.items, nextOffset: network.nextOffset || offset + network.items.length, hasMore: Boolean(network.hasMore) };
      if (offset > 0) return { items: [], nextOffset: offset, hasMore: false };
      const general = await api(`/v1/audio/audius/trending?limit=${PAGE_SIZE}&offset=${offset}`);
      return { items: (general.items || []).map((item) => ({ ...item, source: 'audius' })), nextOffset: general.nextOffset || offset + (general.items || []).length, hasMore: Boolean(general.hasMore) };
    }
    const params = new URLSearchParams({ q, offset: String(offset), limit: String(PAGE_SIZE) });
    if (activeTab === 'original') params.set('original', '1');
    const result = await api(`/v1/audio/search?${params.toString()}`);
    return { items: (result.items || []).map((item) => ({ ...item, source: 'local' })), nextOffset: result.nextOffset || offset + (result.items || []).length, hasMore: Boolean(result.hasMore) };
  }

  async function loadMore() {
    if (paging || busy || !cache.hasMore || tab === 'saved') return;
    setPaging(true);
    try {
      const next = await fetchPage(tab, query, cache.nextOffset || 0);
      const current = useAppStore.getState().music.lists?.[tab] || cache;
      const seen = new Set((current.items || []).map((item) => String(item.id)));
      setMusic({ lists: { ...useAppStore.getState().music.lists, [tab]: { ...next, items: [...(current.items || []), ...next.items.filter((item) => !seen.has(String(item.id)))] } } });
    } catch (error) { logError(error); }
    finally { setPaging(false); }
  }

  async function togglePreview(item) {
    const active = music?.activeTrack;
    if (String(active?.id) === String(item.id) && music?.playing) {
      setMusic({ playing: false });
      return;
    }
    if (String(active?.id) === String(item.id) && music?.playbackUri) {
      setMusic({ playing: true });
      return;
    }
    try {
      const uri = item.source === 'audius'
        ? (item.previewUrl || (await api(`/v1/audio/audius/${encodeURIComponent(item.id)}/stream`)).url)
        : mediaUrl(item.mediaUrl);
      if (!uri) throw new Error('No playable audio URL');
      setMusic({ activeTrack: item, playbackUri: uri, playing: true });
    } catch (error) {
      logError(error);
      toast('This sound could not be played');
    }
  }

  function choose(item) {
    if (onSelect) onSelect(item);
    navigation.goBack();
  }

  function renderRow({ item }) {
    const selected = String(selectedId) === String(item.id);
    const playing = String(music?.activeTrack?.id) === String(item.id) && Boolean(music?.playing);
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
        <Pressable style={styles.add} onPress={() => choose(item)} accessibilityRole="button" accessibilityLabel={`Use ${item.title} for your story`}>
          {selected ? <Text style={styles.selected}>Selected</Text> : <Plus size={20} color="#fff" />}
        </Pressable>
      </View>
    );
  }

  const visibleItems = tab === 'saved' ? saved : items;
  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Close sound picker">
          <ArrowLeft size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.heading}>Music for you</Text>
      </View>
      <Text style={styles.lead}>Share what’s <Text style={styles.gradient}>on repeat</Text> to your story</Text>
      <View style={styles.search}><Search size={18} color="#FFFFFF" /><TextInput value={query} onChangeText={(value) => setMusic({ query: value, lists: { ...music.lists, [tab]: { items: [], nextOffset: 0, hasMore: true } } })} placeholder="Search songs and artists" placeholderTextColor="#a5aab2" style={styles.searchInput} /></View>
      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} style={[styles.tab, tab === key && styles.tabOn]} onPress={() => setMusic({ tab: key, query: '' })} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {busy && !visibleItems.length ? <ActivityIndicator style={styles.loading} color="#fff" /> : (
        <FlatList
          ref={listRef}
          data={visibleItems}
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
      <View style={styles.bottom}>
        <Pressable style={[styles.shuffle, visibleItems.length < 2 && styles.dim]} onPress={() => setMusic({ lists: { ...music.lists, [tab]: { ...cache, items: shuffled(items) } } })} disabled={visibleItems.length < 2} accessibilityRole="button" accessibilityLabel="Shuffle sounds">
          <Shuffle size={20} color="#fff" /><Text style={styles.shuffleText}>Shuffle</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000000' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 52, paddingBottom: 4 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heading: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  lead: { color: '#FFFFFF', fontSize: 24, lineHeight: 30, fontWeight: '500', textAlign: 'center', marginVertical: 22, paddingHorizontal: 24 },
  gradient: { color: '#ff3b5c' },
  search: { height: 44, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#262b33', flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' },
  tab: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#3a3f47', justifyContent: 'center' },
  tabOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  tabText: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  tabTextOn: { color: '#000000' },
  loading: { marginTop: 32 },
  list: { paddingBottom: 120 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 8, minHeight: 80 },
  rowOn: { backgroundColor: 'rgba(255,255,255,0.04)' },
  art: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: '#262b33' },
  artImg: { width: '100%', height: '100%' },
  artEmpty: { flex: 1, backgroundColor: '#262b33' },
  badge: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
  info: { flex: 1, minWidth: 0 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  meta: { color: '#FFFFFF', opacity: 0.72, fontSize: 14, marginTop: 4 },
  add: { minWidth: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#6b717b', alignItems: 'center', justifyContent: 'center' },
  selected: { color: '#FFFFFF', fontSize: 12, paddingHorizontal: 6 },
  empty: { color: '#FFFFFF', opacity: 0.7, fontSize: 15, textAlign: 'center', padding: 32 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingVertical: 14, paddingBottom: 30, backgroundColor: 'rgba(0,0,0,0.92)' },
  shuffle: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 20, borderRadius: 23, borderWidth: 1, borderColor: '#3a3f47', backgroundColor: '#262b33' },
  shuffleText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  dim: { opacity: 0.5 },
});
