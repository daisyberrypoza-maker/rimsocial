import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, ActivityIndicator, TextInput, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Video from 'react-native-video';
import { X, Search, Play, Pause, Plus, Shuffle, Bookmark, BookmarkCheck, Music2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { mediaUrl } from '../config';
import { logError, toast } from '../lib/toast';

const TABS = [
  ['featured', 'For You'],
  ['trending', 'Trending'],
  ['saved', 'Saved'],
  ['original', 'Original Audio'],
];
const SAVED_KEY = 'rim.savedSounds';

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
  const [tab, setTab] = useState('featured');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [previewUri, setPreviewUri] = useState(null);
  const [shuffling, setShuffling] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SAVED_KEY).then((raw) => {
      if (!active || !raw) return;
      try { setSavedItems(JSON.parse(raw)); } catch { setSavedItems([]); }
    }).catch(logError);
    return () => { active = false; };
  }, []);

  const loadItems = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const q = query.trim();
      let next = [];
      if (tab === 'saved') {
        const [created, rawSaved] = await Promise.all([
          api(`/v1/audio/search?original=1&q=${encodeURIComponent(q)}`),
          AsyncStorage.getItem(SAVED_KEY),
        ]);
        let saved = [];
        try { saved = rawSaved ? JSON.parse(rawSaved) : []; } catch { saved = []; }
        setSavedItems(saved);
        const createdItems = (created.items || []).map((item) => ({ ...item, source: 'local', isCreated: true }));
        const merged = [...createdItems, ...saved];
        next = merged.filter((item, index, list) => list.findIndex((entry) => String(entry.id) === String(item.id)) === index);
      } else if (tab === 'trending') {
        const data = q
          ? await api(`/v1/audio/audius/search?q=${encodeURIComponent(q)}&limit=40`)
          : await api('/v1/audio/audius/trending?limit=40');
        next = (data.items || []).map((item) => ({ ...item, source: 'audius' }));
      } else if (tab === 'original') {
        const data = await api(`/v1/audio/search?original=1&q=${encodeURIComponent(q)}`);
        next = (data.items || []).map((item) => ({ ...item, source: 'local', isCreated: true }));
      } else {
        const data = await api(`/v1/audio/search?q=${encodeURIComponent(q)}`);
        next = (data.items || []).map((item) => ({ ...item, source: 'local' }));
      }
      if (request === requestRef.current) setItems(next);
    } catch (error) {
      if (request === requestRef.current) setItems([]);
      logError(error);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    const timer = setTimeout(loadItems, 180);
    return () => clearTimeout(timer);
  }, [loadItems]);

  function stopPreview() {
    setPlayingId(null);
    setPreviewUri(null);
  }

  async function togglePreview(item) {
    if (playingId === item.id) { stopPreview(); return; }
    stopPreview();
    try {
      const uri = item.source === 'audius'
        ? (await api(`/v1/audio/audius/${encodeURIComponent(item.id)}/stream`)).url
        : mediaUrl(item.mediaUrl);
      if (!uri) throw new Error('No playable audio URL');
      setPreviewUri(uri);
      setPlayingId(item.id);
    } catch (error) {
      logError(error);
      toast('This sound could not be played');
    }
  }

  async function toggleSaved(item) {
    const exists = savedItems.some((entry) => String(entry.id) === String(item.id));
    const next = exists
      ? savedItems.filter((entry) => String(entry.id) !== String(item.id))
      : [{ ...item, source: item.source || 'local' }, ...savedItems];
    setSavedItems(next);
    try { await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next)); }
    catch (error) { logError(error); toast('Could not save this sound'); }
  }

  function choose(item) {
    stopPreview();
    if (onSelect) onSelect(item);
    navigation.goBack();
  }

  const shuffledItems = useMemo(() => items, [items]);
  const savedIds = useMemo(() => new Set(savedItems.map((item) => String(item.id))), [savedItems]);

  function renderRow({ item }) {
    const selected = String(selectedId) === String(item.id);
    const playing = String(playingId) === String(item.id);
    const saved = savedIds.has(String(item.id));
    return (
      <View style={[styles.row, selected && styles.rowOn]}>
        <Pressable style={styles.rowMain} onPress={() => togglePreview(item)} accessibilityRole="button" accessibilityLabel={playing ? `Pause ${item.title}` : `Play ${item.title}`}>
          <View style={styles.art}>
            {item.artwork ? <Image source={{ uri: item.artwork }} style={styles.artImg} /> : <View style={styles.artEmpty}><Music2 size={23} color="#fff" /></View>}
            <View style={styles.playBadge}>{playing ? <Pause size={15} color="#fff" /> : <Play size={15} color="#fff" />}</View>
          </View>
          <View style={styles.info}>
            <Text style={styles.trackTitle} numberOfLines={1}>{item.title || 'Original audio'}</Text>
            <Text style={styles.meta} numberOfLines={1}>{[item.artist || item.creatorName || (item.isCreated ? 'Original audio' : 'RimSocial music'), item.duration ? formatDuration(item.duration) : null].filter(Boolean).join(' · ')}</Text>
          </View>
        </Pressable>
        <Pressable style={styles.bookmark} onPress={() => toggleSaved(item)} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved music' : 'Save music'} accessibilityState={{ selected: saved }}>
          {saved ? <BookmarkCheck size={23} color="#fff" /> : <Bookmark size={23} color="#fff" />}
        </Pressable>
        <Pressable style={styles.add} onPress={() => choose(item)} accessibilityRole="button" accessibilityLabel={`Use ${item.title || 'original audio'}`}>
          <Plus size={21} color="#fff" />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.top}>
        <Pressable style={styles.close} onPress={() => { stopPreview(); navigation.goBack(); }} accessibilityRole="button" accessibilityLabel="Close music">
          <X size={25} color="#fff" />
        </Pressable>
        <Text style={styles.heading}>Add to story</Text>
        <View style={styles.close} />
      </View>
      <View style={styles.search}>
        <Search size={19} color="#aeb3bb" />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search music and artists" placeholderTextColor="#9aa0a6" style={styles.searchInput} returnKeyType="search" />
      </View>
      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} style={[styles.tab, tab === key && styles.tabOn]} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? <ActivityIndicator style={styles.loading} color="#fff" /> : (
        <FlatList
          data={shuffledItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>{tab === 'saved' ? 'Your saved and created sounds will appear here.' : 'No music found.'}</Text>}
        />
      )}
      <View style={styles.bottom}>
        <Pressable style={styles.shuffle} onPress={() => setItems((list) => shuffled(list))} disabled={items.length < 2} accessibilityRole="button" accessibilityLabel="Shuffle music">
          <Shuffle size={20} color="#fff" />
          <Text style={styles.shuffleText}>Shuffle</Text>
        </Pressable>
      </View>
      {previewUri ? <Video key={previewUri} source={{ uri: previewUri }} audioOnly paused={false} onEnd={stopPreview} onError={() => { stopPreview(); toast('This sound could not be played'); }} style={styles.hidden} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  top: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heading: { color: '#fff', fontSize: 19, fontWeight: '600', textAlign: 'center' },
  search: { height: 46, marginHorizontal: 16, marginTop: 10, marginBottom: 8, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#2d3138' },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 0, color: '#fff', fontSize: 15 },
  tabs: { flexDirection: 'row', gap: 7, paddingHorizontal: 14, paddingVertical: 12 },
  tab: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#2b2f36', alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: '#e2e4e8', fontSize: 13, fontWeight: '500', textAlign: 'center' },
  tabTextOn: { color: '#111', fontWeight: '600', textAlign: 'center' },
  loading: { marginTop: 36 },
  list: { paddingTop: 4, paddingBottom: 100 },
  row: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  rowOn: { backgroundColor: 'rgba(255,255,255,0.05)' },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  art: { width: 56, height: 56, borderRadius: 9, overflow: 'hidden', backgroundColor: '#30343b' },
  artImg: { width: '100%', height: '100%' },
  artEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playBadge: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
  info: { flex: 1, minWidth: 0 },
  trackTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  meta: { color: '#aeb3bb', fontSize: 13, marginTop: 4 },
  bookmark: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  add: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#aeb3bb', fontSize: 14, textAlign: 'center', padding: 32 },
  bottom: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#34383f', backgroundColor: '#202226' },
  shuffle: { height: 44, borderRadius: 22, backgroundColor: '#30343b', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shuffleText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hidden: { width: 0, height: 0 },
});
