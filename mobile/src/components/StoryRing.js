import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import Icon from './Icon';
import { mediaUrl } from '../config';
import { colors } from '../theme';

// Ring around a story picture. The picture is the latest story (a video shows its first frame),
// the profile picture when there is no story. While uploading, the ring turns.
export function StoryFace({ preview, fallbackUser, size }) {
  if (!preview?.mediaUrl) return <Avatar user={fallbackUser} size={size - 8} />;
  const uri = mediaUrl(preview.thumbUrl || preview.mediaUrl);
  // Same as the web: a video with no saved frame shows the profile picture, not an empty frame
  if (preview.kind === 'video' && !preview.thumbUrl) return <Avatar user={fallbackUser} size={size - 8} />;
  return <Image source={{ uri }} style={{ width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }} />;
}

// state: 'unseen' | 'seen' | 'none' | 'mine' (My Story, blue). badge: draws the purple add-friend pill.
export default function StoryRing({ state = 'seen', size = 72, uploading = false, badge = false, children }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!uploading) return undefined;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [uploading, spin]);
  const ringColor = uploading ? colors.unseen : state === 'mine' ? colors.myRing : state === 'unseen' ? colors.unseen : state === 'none' ? '#d9d9de' : colors.seen;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: ringColor, transform: uploading ? [{ rotate }] : [] }]}>
      <View style={[styles.face, { width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }]}>{children}</View>
      {badge && (
        <View style={styles.badge}>
          <Icon name="user-plus" size={18} color="#fff" />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  face: { overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  // Centred on the bottom of the ring, 44x22 pill with a 2px white border (web .st-friend-badge)
  badge: { position: 'absolute', bottom: -2, alignSelf: 'center', width: 44, height: 22, borderRadius: 11, backgroundColor: colors.friendBadge, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
