import React, { useEffect, useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { api } from '../api';
import { playChime } from '../lib/chime';
import { colors } from '../theme';

// Bottom bar to match the reference: Explore (map pin), Chat, Add (camera), Stories (friends), Rimlight (play).
// No text labels. The active icon is filled: black on the light bar, white on the dark Rimlight bar.
const TABS = [
  { name: 'Explore', icon: 'map-pin' },
  { name: 'Chat', icon: 'message-circle' },
  { name: 'Add', icon: 'camera' },
  { name: 'Stories', icon: 'users' },
  { name: 'Rimlight', icon: 'play' },
];

export default function BottomBar({ activeTab, onPress }) {
  const [unread, setUnread] = useState(0);
  const dark = activeTab === 'Rimlight';

  // Unread chat count: badge on Chat, and a chime when it goes up
  useEffect(() => {
    let alive = true;
    let last = null;
    const load = () => api('/v1/messages/unread-count')
      .then((data) => {
        if (!alive) return;
        const count = data.count || 0;
        if (last !== null && count > last) playChime();
        last = count;
        setUnread(count);
      })
      .catch(() => {});
    load();
    const timer = setInterval(load, 6000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const tint = (focused) => (dark ? (focused ? '#fff' : colors.darkMuted) : (focused ? colors.activeTab : colors.muted));

  return (
    <View style={[styles.bar, dark && styles.barDark]}>
      {TABS.map((tab) => {
        const focused = activeTab === tab.name;
        return (
          <Pressable key={tab.name} style={styles.item} accessibilityLabel={tab.name} onPress={() => onPress(tab.name)}>
            <Icon name={tab.icon} size={25} color={tint(focused)} filled={focused} strokeWidth={1.8} />
            {tab.name === 'Chat' && unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 60, backgroundColor: colors.bg, borderTopColor: colors.line, borderTopWidth: 1, alignItems: 'center', justifyContent: 'space-around' },
  barDark: { backgroundColor: colors.darkBg, borderTopColor: colors.darkLine },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 8, left: '58%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
