import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { mediaUrl } from '../config';
import { colors } from '../theme';

// Round avatar. If the picture fails to load, the initial is shown (same as the web Avatar)
export default function Avatar({ user, size = 40, style }) {
  const [failed, setFailed] = useState(null);
  const label = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  const src = mediaUrl(user?.avatarUrl);
  const showImage = Boolean(src) && failed !== src;
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.box, box, style]}>
      {showImage
        ? <Image source={{ uri: src }} style={[styles.fill, box]} onError={() => setFailed(src)} />
        : <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  initial: { color: colors.text, fontWeight: '600' },
});
