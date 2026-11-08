import React, { useEffect, useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import Avatar from './Avatar';
import { api } from '../api';
import { useAppStore } from '../store';
import { playChime } from '../lib/chime';
import { colors } from '../theme';

// Bottom bar: Stories, Chat, Add (centre), Rimlight, Profile. Shown on the tab screens and on the
// profile screens. The bar is dark on Rimlight (white active tab) and light everywhere else (black active tab).
export default function BottomBar({ activeTab, onPress }) {
  const me = useAppStore((s) => s.user);
  // A live story of mine in the saved rail: the profile picture carries the story ring
  const hasStory = useAppStore((s) => (s.storyRail?.items || []).some((g) => g.user?.id === s.user?.id));
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
  const tabs = [
    { name: 'Stories', icon: 'stories', label: 'Stories' },
    { name: 'Chat', icon: 'message-circle', label: 'Chat' },
    { name: 'Add', label: 'Add' },
    { name: 'Rimlight', icon: 'rimlight', label: 'Rimlight' },
    { name: 'ProfileTab', label: 'Profile' },
  ];

  return (
    <View style={[styles.bar, dark && styles.barDark]}>
      {tabs.map((tab) => {
        if (tab.name === 'Add') {
          return (
            <Pressable key="add" style={styles.item} accessibilityLabel="Add post" onPress={() => onPress('Add')}>
              <View style={styles.addFace}><Icon name="plus" size={24} color={colors.text} strokeWidth={2.6} /></View>
            </Pressable>
          );
        }
        const focused = activeTab === tab.name;
        return (
          <Pressable key={tab.name} style={styles.item} accessibilityLabel={tab.label} onPress={() => onPress(tab.name)}>
            {tab.name === 'ProfileTab'
              ? <Avatar user={me || {}} size={26} style={hasStory ? styles.storyBorder : focused ? styles.avatarOn : null} />
              : <Icon name={tab.icon} size={25} color={tint(focused)} filled={focused} strokeWidth={1.8} />}
            {tab.name === 'Chat' && unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>}
            <Text style={[styles.label, { color: tint(focused) }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 64, backgroundColor: colors.bg, borderTopColor: colors.line, borderTopWidth: 1, alignItems: 'center', justifyContent: 'space-around' },
  barDark: { backgroundColor: colors.darkBg, borderTopColor: colors.darkLine },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11 },
  addFace: { width: 44, height: 32, borderRadius: 10, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  avatarOn: { borderWidth: 2, borderColor: colors.text },
  storyBorder: { borderWidth: 2, borderColor: colors.unseen },
  badge: { position: 'absolute', top: 6, left: '56%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
