import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Rimlight rating badge for grid and story tiles. Rated 4.0 and above; unrated posts (null) show nothing.
// Same rule as the web app (frontend/src/components/RimlightBadge.jsx).
export const RIMLIGHT_MIN_RATING = 4;

export function rimlightScore(rating) {
  if (rating == null) return null;
  const n = Number(rating);
  return Number.isFinite(n) && n >= RIMLIGHT_MIN_RATING ? n : null;
}

export default function RimlightBadge({ rating }) {
  const score = rimlightScore(rating);
  if (score == null) return null;
  return (
    <View style={styles.badge} accessibilityLabel={`Rimlight rated ${score.toFixed(1)}`}>
      <Text style={styles.text}>✦ {score.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: 6, left: 6, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.55)' },
  text: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
