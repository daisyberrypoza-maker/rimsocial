import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, StyleSheet } from 'react-native';
import Video from 'react-native-video';
import Avatar from './Avatar';
import { mediaUrl } from '../config';
import { colors } from '../theme';

// Ring around a story picture. The picture is the latest story (a video shows its first frame),
// the profile picture when there is no story. While uploading, the ring turns.
export function StoryFace({ preview, fallbackUser, size }) {
  if (!preview?.mediaUrl) return <Avatar user={fallbackUser} size={size - 8} />;
  const uri = mediaUrl(preview.thumbUrl || preview.mediaUrl);
  if (preview.kind === 'video' && !preview.thumbUrl) {
    return <Video source={{ uri: mediaUrl(preview.mediaUrl) }} style={{ width: size - 8, height: size - 8 }} paused muted resizeMode="cover" />;
  }
  return <Image source={{ uri }} style={{ width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }} />;
}

export default function StoryRing({ state = 'seen', size = 72, uploading = false, children }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!uploading) return undefined;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [uploading, spin]);
  const ringColor = uploading || state === 'unseen' ? colors.unseen : state === 'none' ? '#d9d9de' : colors.seen;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: ringColor, transform: uploading ? [{ rotate }] : [] }]}>
      <View style={[styles.face, { width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }]}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  face: { overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
});
