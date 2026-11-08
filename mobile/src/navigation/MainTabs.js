import React, { useEffect, useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import Stories from '../screens/Stories';
import Chat from '../screens/Chat';
import Rimlight from '../screens/Rimlight';
import Profile from '../screens/Profile';
import { api } from '../api';
import { useAppStore } from '../store';
import { playChime } from '../lib/chime';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();

// Bottom bar: Stories, Chat, Add (centre, opens the full-screen Upload), Rimlight, Profile.
// The bar is dark on Rimlight, like the web app. The active icon is always filled.
function TabBar({ state, navigation }) {
  const me = useAppStore((s) => s.user);
  const [unread, setUnread] = useState(0);
  const dark = state.routes[state.index]?.name === 'Rimlight';

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

  const tint = (focused) => (dark ? (focused ? '#fff' : colors.darkMuted) : (focused ? colors.text : colors.muted));
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
        const route = state.routes.find((r) => r.name === tab.name);
        const focused = route && state.routes[state.index].key === route.key;
        if (tab.name === 'Add') {
          return (
            <Pressable key="add" style={styles.item} accessibilityLabel="Add post" onPress={() => navigation.navigate('Upload')}>
              <View style={styles.addFace}><Icon name="plus" size={24} color={colors.text} strokeWidth={2.6} /></View>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={tab.name}
            style={styles.item}
            accessibilityLabel={tab.label}
            onPress={() => { if (route) navigation.navigate(route.name); }}
          >
            {tab.name === 'ProfileTab'
              ? <Avatar user={me || {}} size={26} style={focused ? styles.avatarOn : null} />
              : <Icon name={tab.icon} size={26} color={tint(focused)} filled={focused} strokeWidth={1.8} />}
            {tab.name === 'Chat' && unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>}
            <Text style={[styles.label, { color: tint(focused) }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Stories"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Stories" component={Stories} />
      <Tab.Screen name="Chat" component={Chat} />
      <Tab.Screen name="Rimlight" component={Rimlight} />
      <Tab.Screen name="ProfileTab" component={Profile} initialParams={{ username: 'me' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 64, backgroundColor: colors.bg, borderTopColor: colors.line, borderTopWidth: 1, alignItems: 'center', justifyContent: 'space-around' },
  barDark: { backgroundColor: colors.darkBg, borderTopColor: colors.darkLine },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11 },
  addFace: { width: 44, height: 32, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  avatarOn: { borderWidth: 2, borderColor: colors.text },
  badge: { position: 'absolute', top: 6, left: '56%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
