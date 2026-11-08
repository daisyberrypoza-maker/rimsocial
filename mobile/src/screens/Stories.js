import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import StoryRing, { StoryFace } from '../components/StoryRing';
import { api } from '../api';
import { useAppStore } from '../store';
import { mediaUrl } from '../config';
import { logError } from '../lib/toast';
import { colors, SIDE } from '../theme';

// Snapchat reference: Avenir-style type where the device has it
const FONT = Platform.OS === 'ios' ? 'Avenir Next' : undefined;

const RAIL_FRESH_MS = 30 * 1000;
const DISCOVER_FRESH_MS = 10 * 60 * 1000;

function nameOf(user) { return user?.displayName || user?.username || 'Creator'; }

// Stories screen: opens from saved data at once; the server is asked again only when that data is old.
export default function Stories() {
  const navigation = useNavigation();
  const me = useAppStore((s) => s.user);
  const storedRail = useAppStore((s) => s.storyRail);
  const storedDiscover = useAppStore((s) => s.storyDiscover);
  const pending = useAppStore((s) => s.pendingUpload);
  // Reads "My Stories" until the row is scrolled to the friends, then "Friends"
  const [friendsActive, setFriendsActive] = useState(false);
  const [suggested, setSuggested] = useState(storedDiscover.suggested || []);
  const [ranking, setRanking] = useState(storedDiscover.ranking || { friends: {}, discoverOrder: [] });
  const rail = storedRail.items || [];

  const loadRail = useCallback(() => {
    api('/v1/stories/rail').then((r) => useAppStore.getState().setStoryRail(r.items || [])).catch(logError);
  }, []);

  useEffect(() => {
    if (Date.now() - (useAppStore.getState().storyRailAt || 0) > RAIL_FRESH_MS) loadRail();
  }, [loadRail]);

  // Discover and friend ordering, refreshed only when old
  useEffect(() => {
    const saved = useAppStore.getState().storyDiscover;
    if (Date.now() - (saved?.updatedAt || 0) < DISCOVER_FRESH_MS) return;
    (async () => {
      try {
        const items = (await api('/v1/users/suggestions')).items || [];
        let ranked = saved?.ranking || { friends: {}, discoverOrder: [] };
        const ids = items.map((u) => u.id).slice(0, 60).join(',');
        if (ids) {
          try {
            const r = await api(`/v1/stories/ranking?discover=${encodeURIComponent(ids)}`);
            ranked = { friends: r.friends || {}, discoverOrder: r.discoverOrder || [] };
          } catch (e) { logError(e); }
        }
        setSuggested(items);
        setRanking(ranked);
        useAppStore.getState().setStoryDiscover({ suggested: items, ranking: ranked, updatedAt: Date.now() });
      } catch (e) { logError(e); }
    })();
  }, []);

  const myGroup = rail.find((g) => g.user?.id === me?.id);
  const others = rail.filter((g) => g.user?.id !== me?.id)
    .sort((a, b) => (ranking.friends[b.user.id] || 0) - (ranking.friends[a.user.id] || 0));
  const byId = new Map(suggested.map((u) => [u.id, u]));
  const discover = (ranking.discoverOrder.length ? ranking.discoverOrder.map((id) => byId.get(id)).filter(Boolean) : suggested)
    .filter((u) => u.id !== me?.id);

  function openViewer(userId) { navigation.navigate('StoryViewer', { startUserId: userId }); }
  function openSuggested(person) {
    if (rail.some((g) => g.user?.id === person.id)) openViewer(person.id);
    else navigation.navigate('Profile', { username: person.username });
  }

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <View style={styles.left}>
          <Pressable style={styles.round} onPress={() => me?.username && navigation.navigate('Profile', { username: me.username })} accessibilityLabel="Your profile">
            <Avatar user={me || {}} size={40} style={myGroup ? styles.storyBorder : null} />
          </Pressable>
          <Pressable style={styles.round} onPress={() => navigation.navigate('Explore', { search: true })} accessibilityLabel="Search"><Icon name="search" size={21} color={colors.navIcon} /></Pressable>
        </View>
        <View pointerEvents="none" style={styles.titleWrap}><Text style={styles.title}>Stories</Text></View>
        <View style={styles.right}>
          <Pressable style={styles.round} onPress={() => navigation.navigate('Activity')} accessibilityLabel="Notifications"><Icon name="bell" size={21} color={colors.navIcon} /></Pressable>
          <Pressable style={styles.round} onPress={() => navigation.navigate('Explore', { friends: true })} accessibilityLabel="Find friends"><Icon name="user-plus" size={21} color={colors.navIcon} /></Pressable>
        </View>
      </View>

      <View style={styles.section}>
        {/* Header reads "My Stories" at the start and "Friends" once the row scrolls to the friends */}
        <Text style={styles.friendsHeading}>{friendsActive ? 'Friends' : 'My Stories'} <Icon name="chevron-right" size={22} color="#d9dce1" strokeWidth={3} /></Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          onScroll={(e) => setFriendsActive(e.nativeEvent.contentOffset.x > 60)}
          scrollEventThrottle={16}
        >
          <Pressable style={styles.friend} onPress={() => (myGroup ? openViewer(me.id) : navigation.navigate('Upload', { story: true }))} accessibilityLabel={myGroup ? 'View my story' : 'Create a story'}>
            <StoryRing state={myGroup ? 'mine' : 'none'} uploading={pending?.kind === 'story'}>
              {pending?.kind === 'story'
                ? <Image source={{ uri: pending.thumb }} style={styles.fill} />
                : myGroup ? <StoryFace preview={myGroup.preview} fallbackUser={me} size={72} /> : <Avatar user={me || {}} size={64} />}
            </StoryRing>
            <Pressable style={styles.plus} onPress={() => navigation.navigate('Upload', { story: true })} accessibilityLabel="Add a story">
              <Icon name="plus" size={13} color="#fff" strokeWidth={3} />
            </Pressable>
            <Text style={styles.name}>My Story</Text>
          </Pressable>

          {others.map((group) => (
            <Pressable key={group.user.id} style={styles.friend} onPress={() => openViewer(group.user.id)} accessibilityLabel={`View ${nameOf(group.user)}'s story`}>
              <StoryRing state={group.unseen ? 'unseen' : 'seen'}>
                <StoryFace preview={group.preview} fallbackUser={group.user} size={72} />
              </StoryRing>
              <Text style={styles.name} numberOfLines={1}>{nameOf(group.user)}</Text>
              {!!group.user.username && <Text style={styles.handle} numberOfLines={1}>{group.user.username}</Text>}
            </Pressable>
          ))}
        </ScrollView>
        {others.length === 0 && !myGroup && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No stories yet</Text>
            <Text style={styles.emptyText}>Share a photo or video and your friends can see it for 24 hours.</Text>
          </View>
        )}
      </View>

      {discover.length > 0 && (
        <ScrollView contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: 24 }}>
          <Text style={styles.h2}>Discover</Text>
          <View style={styles.grid}>
            {discover.map((person) => (
              <Pressable key={person.id} style={styles.card} onPress={() => openSuggested(person)} accessibilityLabel={`Open ${nameOf(person)}`}>
                {person.avatarUrl
                  ? <Image source={{ uri: mediaUrl(person.avatarUrl) }} style={styles.fill} />
                  : <View style={[styles.fill, styles.cardFallback]}><Text style={styles.cardInitial}>{nameOf(person).slice(0, 1).toUpperCase()}</Text></View>}
                <View style={styles.shade} />
                <Text style={styles.cardName} numberOfLines={1}>{nameOf(person)}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  left: { flexDirection: 'row', gap: 8 },
  right: { flexDirection: 'row', gap: 8 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  section: { paddingTop: 12, paddingLeft: SIDE, paddingBottom: 8 },
  friendsHeading: { fontFamily: FONT, fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: colors.text, marginBottom: 10 },
  h2: { fontFamily: FONT, fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: -0.45, color: colors.text },
  row: { paddingRight: SIDE, gap: 12, alignItems: 'flex-start' },
  friend: { width: 92, alignItems: 'center' },
  plus: { position: 'absolute', right: 0, top: 50, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.myRing, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  // Name 12px, with a little space above it so it does not sit tight against the ring
  name: { fontFamily: FONT, marginTop: 1.5, fontSize: 12, lineHeight: 14, fontWeight: '600', color: colors.text, maxWidth: 92 },
  handle: { fontFamily: FONT, fontSize: 12, lineHeight: 14, fontWeight: '400', color: colors.handle, maxWidth: 92 },
  storyBorder: { borderWidth: 2, borderColor: colors.unseen },
  empty: { paddingVertical: 16, paddingRight: SIDE },
  emptyTitle: { fontWeight: '700', color: colors.text, marginBottom: 4 },
  emptyText: { color: colors.muted, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  card: { width: '48.5%', aspectRatio: 0.8, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface },
  fill: { width: '100%', height: '100%' },
  cardFallback: { alignItems: 'center', justifyContent: 'center' },
  cardInitial: { fontSize: 32, fontWeight: '700', color: colors.muted },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' },
  cardName: { position: 'absolute', left: 8, right: 8, bottom: 8, color: '#fff', fontWeight: '700' },
});
