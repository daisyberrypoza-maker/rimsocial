import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import Video from 'react-native-video';
import Icon from './Icon';
import Avatar from './Avatar';
import { mediaUrl, videoStreamUrl } from '../config';
import { formatCount } from '../lib/format';
import { registerPlayer, claimPlayback } from '../lib/playback';
import { colors } from '../theme';

let feedSoundOn = true; // one sound setting for every Rimlight video, like the web app

// One full-screen Rimlight post. Only the post on screen plays, and it stops when the screen
// loses focus (another tab or screen) or the app goes to the background.
// height: the visible page height above the tab bar, passed from the Rimlight list
export default function PostCard({ post, active, focused, navigation, height }) {
  const id = `post:${post.id}`;
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(feedSoundOn);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likeCount || 0);
  const videoRef = useRef(null);
  const canPlay = active && focused && post.kind === 'video';

  useEffect(() => registerPlayer(id, () => setPlaying(false)), [id]);

  useEffect(() => {
    if (canPlay) { claimPlayback(id); setPlaying(true); }
    else setPlaying(false);
  }, [canPlay, id]);

  const src = post.kind === 'video' ? videoStreamUrl(mediaUrl(post.mediaUrl)) : mediaUrl(post.mediaUrl);
  const username = post.author?.username || 'unknown';

  function togglePlay() {
    if (playing) { setPlaying(false); flashIcon('pause'); }
    else { claimPlayback(id); setPlaying(true); flashIcon('play'); }
  }
  function toggleSound() { feedSoundOn = !feedSoundOn; setSoundOn(feedSoundOn); }
  function flashIcon(kind) { setFlash({ kind, key: Date.now() }); setTimeout(() => setFlash(null), 500); }
  function like() {
    setLiked((v) => !v);
    setLikes((n) => (liked ? n - 1 : n + 1));
    if (!liked) flashIcon('heart');
  }

  return (
    <View style={[styles.post, { height }]}>
      {post.kind === 'video' ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay}>
          <Video
            ref={videoRef}
            source={{ uri: src }}
            poster={mediaUrl(post.thumbUrl) || undefined}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            paused={!playing}
            muted={!soundOn}
            repeat
            onProgress={({ currentTime, seekableDuration }) => {
              if (seekableDuration > 0) setProgress(currentTime / seekableDuration);
            }}
          />
        </Pressable>
      ) : (
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      {/* Flash icon for play, pause and like (white; heart red) */}
      {flash && <View pointerEvents="none" style={styles.flashWrap}><Icon name={flash.kind === 'heart' ? 'heart' : flash.kind} size={72} color={flash.kind === 'heart' ? colors.heart : '#fff'} filled={flash.kind === 'heart'} /></View>}

      {/* Paused: sound button above the white play button, both centred */}
      {post.kind === 'video' && !playing && (
        <View pointerEvents="box-none" style={styles.pausedWrap}>
          <Pressable style={styles.soundBtn} onPress={toggleSound} accessibilityLabel={soundOn ? 'Mute' : 'Unmute'}>
            <Icon name={soundOn ? 'volume-2' : 'volume-x'} size={32} color="#fff" />
          </Pressable>
          <Pressable onPress={togglePlay} accessibilityLabel="Play"><Icon name="play" size={56} color="#fff" filled /></Pressable>
        </View>
      )}

      {/* Right controls: filled icons */}
      <View style={styles.rail}>
        <Pressable style={styles.railItem} onPress={() => navigation.navigate('PostDetail', { postId: post.id })}>
          <Avatar user={post.author} size={44} />
        </Pressable>
        <Pressable style={styles.railItem} onPress={like} accessibilityLabel="Like">
          <Icon name="heart" size={32} color={liked ? colors.heart : '#fff'} filled={liked} />
          <Text style={styles.count}>{formatCount(likes)}</Text>
        </Pressable>
        <Pressable style={styles.railItem} onPress={() => navigation.navigate('PostDetail', { postId: post.id, comments: true })} accessibilityLabel="Comments">
          <Icon name="message-circle" size={30} color="#fff" filled />
          <Text style={styles.count}>{formatCount(post.commentCount || 0)}</Text>
        </Pressable>
        <Pressable style={styles.railItem} accessibilityLabel="Share"><Icon name="share" size={30} color="#fff" filled /></Pressable>
      </View>

      <View style={styles.caption} pointerEvents="none">
        <Text style={styles.username}>@{username}</Text>
        {!!post.caption && <Text style={styles.text} numberOfLines={2}>{post.caption}</Text>}
      </View>

      {post.kind === 'video' && (
        <View style={styles.progressTrack} pointerEvents="none">
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  post: { backgroundColor: colors.darkBg, overflow: 'hidden' },
  flashWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pausedWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 18 },
  soundBtn: { padding: 6 },
  rail: { position: 'absolute', right: 10, bottom: 96, alignItems: 'center', gap: 18 },
  railItem: { alignItems: 'center', gap: 4 },
  count: { color: '#fff', fontSize: 13, fontWeight: '600' },
  caption: { position: 'absolute', left: 16, right: 80, bottom: 28 },
  username: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 4 },
  text: { color: '#fff', fontSize: 14 },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 10, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill: { height: 3, backgroundColor: '#fff' },
});
