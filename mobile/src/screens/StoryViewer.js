import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Video from 'react-native-video';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { mediaUrl } from '../config';
import { registerPlayer, claimPlayback } from '../lib/playback';
import { logError } from '../lib/toast';

const PHOTO_MS = 5000;

// Full-screen story viewer: tap right for next, left for previous, the story stops when this screen loses focus.
export default function StoryViewer() {
  const navigation = useNavigation();
  const { startUserId } = useRoute().params;
  const focused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const rail = useAppStore((s) => s.storyRail.items || []);
  const groups = rail.filter((g) => g.user);
  const [groupIndex, setGroupIndex] = useState(() => Math.max(0, groups.findIndex((g) => g.user.id === startUserId)));
  const [stories, setStories] = useState([]);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const group = groups[groupIndex];
  const story = stories[storyIndex];
  const id = 'story-viewer';

  useEffect(() => registerPlayer(id, () => setPaused(true)), []);

  // Load the open person's stories (cached in the store when available)
  useEffect(() => {
    if (!group) { navigation.goBack(); return; }
    setStoryIndex(0);
    const cached = useAppStore.getState().storyCache[group.user.id];
    if (cached?.items?.length) setStories(cached.items);
    api(`/v1/stories/users/${group.user.id}`)
      .then((r) => {
        setStories(r.items || []);
        useAppStore.getState().setStoryCache(group.user.id, { items: r.items || [], isSubscribed: r.isSubscribed });
      })
      .catch(logError);
  }, [group?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isVideo = story?.kind === 'video';
  const playing = focused && !paused;

  useEffect(() => {
    if (!story) return undefined;
    if (isVideo) { if (playing) claimPlayback(id); return undefined; }
    clearTimeout(timer.current);
    if (playing) timer.current = setTimeout(next, PHOTO_MS);
    return () => clearTimeout(timer.current);
  }, [story?.id, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    if (storyIndex < stories.length - 1) setStoryIndex((i) => i + 1);
    else if (groupIndex < groups.length - 1) setGroupIndex((g) => g + 1);
    else navigation.goBack();
  }
  function prev() {
    if (storyIndex > 0) setStoryIndex((i) => i - 1);
    else if (groupIndex > 0) setGroupIndex((g) => g - 1);
  }

  if (!group) return null;
  return (
    <View style={[styles.root, { width, height }]}>
      {story && (isVideo
        ? <Video key={story.id} source={{ uri: mediaUrl(story.mediaUrl) }} style={StyleSheet.absoluteFill} resizeMode="contain" paused={!playing} onEnd={next} onError={next} />
        : <Image key={story.id} source={{ uri: mediaUrl(story.mediaUrl) }} style={StyleSheet.absoluteFill} resizeMode="contain" />)}

      <View style={styles.header}>
        <Avatar user={group.user} size={34} />
        <Text style={styles.name} numberOfLines={1}>{group.user.displayName || group.user.username}</Text>
        <Pressable style={styles.close} onPress={() => navigation.goBack()} accessibilityLabel="Close"><Icon name="x" size={26} color="#fff" /></Pressable>
      </View>

      {!!story?.caption && <Text style={styles.caption}>{story.caption}</Text>}

      <View style={styles.taps} pointerEvents="box-none">
        <Pressable style={styles.half} onPress={prev} accessibilityLabel="Previous story" />
        <Pressable style={styles.half} onPress={next} accessibilityLabel="Next story" />
      </View>

      {isVideo && !paused && <Pressable style={styles.pauseTap} onPress={() => setPaused(true)} />}
      {paused && <Pressable style={styles.center} onPress={() => setPaused(false)}><Icon name="play" size={56} color="#fff" filled /></Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000' },
  header: { position: 'absolute', top: 48, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, color: '#fff', fontWeight: '700' },
  close: { padding: 6 },
  caption: { position: 'absolute', bottom: 40, left: 16, right: 16, color: '#fff', fontSize: 16 },
  taps: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  half: { flex: 1 },
  pauseTap: { ...StyleSheet.absoluteFillObject },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
