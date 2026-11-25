import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import Video from 'react-native-video';
import { ArrowUpRight, Play, Pause, Plus, Shuffle } from 'lucide-react-native';
import { api } from '../api';
import { mediaUrl } from '../config';
import { logError, toast } from '../lib/toast';

// "Music for you" sound picker, matching the web picker: dark page, a heading, Featured and Trending
// lists, an Add to story pill on the chosen sound, previews, and Shuffle. Sounds are app-library tracks
// (Featured) or Audius tracks (Trending); the chosen one is passed back with onSelect.
const TABS = [['featured', 'Featured'], ['trending', 'Trending']];
const BLUE = '#0095f6';

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
  const [tab, setTab] = useState('featured');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [previewUri, setPreviewUri] = useState(null);
  const requestRef = useRef(0);

  // Load the list for the active tab
  useEffect(() => {
    const request = ++requestRef.current;
    setLoading(true);
    const path = tab === 'trending' ? '/v1/audio/audius/trending?limit=30' : '/v1/audio/search?q=';
    api(path)
      .then((data) => {
        if (request !== requestRef.current) return;
        setItems((data.items || []).map((item) => ({ ...item, source: tab === 'trending' ? 'audius' : 'local' })));
      })
      .catch((error) => { if (request === requestRef.current) { setItems([]); logError(error); } })
      .finally(() => { if (request === requestRef.current) setLoading(false); });
  }, [tab]);

  function stopPreview() {
    setPlayingId(null);
    setPreviewUri(null);
  }

  // Play or pause one row. Audius rows ask the server for a fresh stream link first.
  async function togglePreview(item) {
    if (playingId === item.id) { stopPreview(); return; }
    try {
      const uri = item.source === 'audius'
        ? (await api(`/v1/audio/audius/${encodeURIComponent(item.id)}/stream`)).url
        : mediaUrl(item.mediaUrl);
      setPreviewUri(uri);
      setPlayingId(item.id);
    } catch (error) {
      logError(error);
      stopPreview();
      toast('This sound could not be played');
    }
  }

  function choose(item) {
    if (onSelect) onSelect(item);
    stopPreview();
    navigation.goBack();
  }

  function renderRow({ item }) {
    const selected = selectedId === item.id;
    const playing = playingId === item.id;
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
            <Plus size={16} color="#111" />
            <Text style={styles.addPillText}>Add to story</Text>
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
      <View style={styles.top}>
        <Pressable style={styles.back} onPress={() => { stopPreview(); navigation.goBack(); }} accessibilityRole="button" accessibilityLabel="Close sound picker">
          <ArrowUpRight size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heading}>Music for you</Text>
      </View>
      <Text style={styles.lead}>Share what’s <Text style={styles.gradient}>on repeat</Text> to your story</Text>

      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} style={[styles.tab, tab === key && styles.tabOn]} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? <ActivityIndicator style={styles.loading} color="#fff" /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No sounds found.</Text>}
        />
      )}

      <View style={styles.bottom}>
        <Pressable style={[styles.shuffle, items.length < 2 && styles.dim]} onPress={() => setItems((list) => shuffled(list))} disabled={items.length < 2} accessibilityRole="button" accessibilityLabel="Shuffle sounds">
          <Shuffle size={20} color="#fff" />
          <Text style={styles.shuffleText}>Shuffle</Text>
        </Pressable>
      </View>

      {/* Hidden player for previews: audio only */}
      {previewUri ? <Video source={{ uri: previewUri }} audioOnly paused={false} onEnd={stopPreview} onError={() => { stopPreview(); toast('This sound could not be played'); }} style={styles.hidden} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f1115' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 52, paddingBottom: 4 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heading: { color: '#fff', fontSize: 18, fontWeight: '600' },
  lead: { color: '#fff', fontSize: 24, lineHeight: 30, fontWeight: '500', textAlign: 'center', marginVertical: 22, paddingHorizontal: 24 },
  gradient: { color: '#ff3b5c' },
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
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingVertical: 14, paddingBottom: 30, backgroundColor: 'rgba(15,17,21,0.92)' },
  shuffle: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 20, borderRadius: 23, borderWidth: 1, borderColor: '#3a3f47', backgroundColor: '#262b33' },
  shuffleText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dim: { opacity: 0.5 },
  hidden: { width: 0, height: 0 },
});
