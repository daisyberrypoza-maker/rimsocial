import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import StoryRing, { StoryFace, railItems } from '../components/StoryRing';
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
  // Badge on the add-friend icon: people who followed you since you last opened it
  const [newFollows, setNewFollows] = useState(0);
  const feedItems = useAppStore((s) => s.feeds.discover?.items || []);
  // Sponsored posts first in the Discover grid, like the reference
  const sponsored = feedItems.filter((p) => p.isSponsored).slice(0, 2);
  useEffect(() => {
    let alive = true;
    (async () => {
      const seen = Number((await AsyncStorage.getItem('rimsocial-follow-seen-at').catch(() => null)) || 0);
      api('/v1/activity')
        .then((d) => { if (alive) setNewFollows((d.items || []).filter((i) => i.type === 'follow' && new Date(i.createdAt).getTime() > seen).length); })
        .catch(() => {});
    })();
    return () => { alive = false; };
  }, []);
  function openFriends() {
    AsyncStorage.setItem('rimsocial-follow-seen-at', String(Date.now())).catch(() => {});
    setNewFollows(0);
    navigation.navigate('Explore', { friends: true });
  }
  const [suggested, setSuggested] = useState(storedDiscover.suggested || []);
  const [ranking, setRanking] = useState(storedDiscover.ranking || { friends: {}, discoverOrder: [] });
  const rail = railItems(storedRail);

  const loadRail = useCallback(() => {
    api('/v1/stories/rail').then((r) => useAppStore.getState().setStoryRail({ items: r.items || [], updatedAt: Date.now() })).catch(logError);
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
          {navigation.canGoBack() ? (
            // Opened from another screen: Back returns to where the user came from
            <Pressable style={styles.round} onPress={() => navigation.goBack()} accessibilityLabel="Back">
              <Icon name="arrow-left" size={22} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable style={styles.round} onPress={() => me?.username && navigation.navigate('Profile', { username: me.username })} accessibilityLabel="Your profile">
              <Avatar user={me || {}} size={40} style={myGroup ? styles.storyBorder : null} />
            </Pressable>
          )}
          <Pressable style={styles.round} onPress={() => navigation.navigate('Explore', { search: true })} accessibilityLabel="Search"><Icon name="search" size={21} color={colors.navIcon} /></Pressable>
        </View>
        <View pointerEvents="none" style={styles.titleWrap}><Text style={styles.title}>Stories</Text></View>
        <View style={styles.right}>
          <Pressable style={styles.round} onPress={() => navigation.navigate('Chat', { view: 'activity' })} accessibilityLabel="Notifications"><Icon name="bell" size={21} color={colors.navIcon} /></Pressable>
          <Pressable style={styles.round} onPress={openFriends} accessibilityLabel={newFollows ? `Find friends, ${newFollows} new` : 'Find friends'}>
            <Icon name="user-plus" size={21} color={colors.navIcon} />
            {newFollows > 0 && <View style={styles.count}><Text style={styles.countText}>{newFollows > 99 ? '99+' : newFollows}</Text></View>}
          </Pressable>
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
            <View style={styles.emptyIcon}><Icon name="users" size={26} color={colors.muted} /></View>
            <Text style={styles.emptyTitle}>No stories yet</Text>
            <Text style={styles.emptyText}>Share a photo or video and your friends can see it for 24 hours.</Text>
          </View>
        )}
      </View>

      {discover.length > 0 && (
        <ScrollView contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: 24 }}>
          <View style={styles.h2Row}><Text style={styles.h2}>Discover</Text><Icon name="chevron-right" size={18} color={colors.text} /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
            {discover.map((person) => (
              <Pressable key={`row-${person.id}`} style={styles.rowCard} onPress={() => openSuggested(person)} accessibilityLabel={`Open ${nameOf(person)}`}>
                {person.avatarUrl
                  ? <Image source={{ uri: mediaUrl(person.avatarUrl) }} style={styles.fill} />
                  : <View style={[styles.fill, styles.cardFallback]}><Text style={styles.cardInitial}>{nameOf(person).slice(0, 1).toUpperCase()}</Text></View>}
                <View style={styles.shade} />
                <Text style={styles.cardName} numberOfLines={1}>{nameOf(person)}{person.isCreator ? ' ★' : ''}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.grid}>
            {sponsored.map((post) => (
              <Pressable key={`sp-${post.id}`} style={styles.big} onPress={() => navigation.navigate('PostDetail', { postId: post.id })} accessibilityLabel={`Sponsored: ${post.sponsorName || 'ad'}`}>
                <Image source={{ uri: mediaUrl(post.thumbUrl || post.mediaUrl) }} style={styles.fill} />
                <View style={styles.shade} />
                <View style={styles.sponsoredTag}><Text style={styles.sponsoredText}>Sponsored</Text></View>
                <Text style={styles.cardName} numberOfLines={2}>{post.sponsorName || post.author?.username}</Text>
                <View style={styles.cta}><Text style={styles.ctaText}>{post.sponsorCta || 'Learn more'}</Text></View>
              </Pressable>
            ))}
            {discover.map((person) => (
              <Pressable key={`big-${person.id}`} style={styles.big} onPress={() => openSuggested(person)} accessibilityLabel={`Open ${nameOf(person)}`}>
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
  title: { fontSize: 14, fontWeight: '500', color: colors.text },
  section: { paddingTop: 12, paddingLeft: SIDE, paddingBottom: 8 },
  friendsHeading: { fontFamily: FONT, fontSize: 14, lineHeight: 18, fontWeight: '700', letterSpacing: -0.3, color: colors.text, marginBottom: 10 },
  h2: { fontFamily: FONT, fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: -0.45, color: colors.text },
  h2Row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pill: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 16, height: 38, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row: { paddingRight: SIDE, gap: 12, alignItems: 'flex-start' },
  friend: { width: 92, alignItems: 'center' },
  plus: { position: 'absolute', right: 0, top: 50, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.myRing, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  // Name 12px, with a little space above it so it does not sit tight against the ring
  name: { fontFamily: FONT, marginTop: 1.5, fontSize: 12, lineHeight: 14, fontWeight: '600', color: colors.text, maxWidth: 92 },
  handle: { fontFamily: FONT, fontSize: 12, lineHeight: 14, fontWeight: '400', color: colors.handle, maxWidth: 92 },
  storyBorder: { borderWidth: 2, borderColor: colors.unseen },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 32 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontWeight: '700', fontSize: 17, color: colors.text, marginBottom: 6 },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  card: { width: '48.5%', aspectRatio: 0.8, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface },
  big: { width: '48.5%', aspectRatio: 0.7, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface },
  cardRow: { gap: 6, marginTop: 8, paddingRight: SIDE },
  rowCard: { width: 120, height: 190, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface },
  sponsoredTag: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  sponsoredText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cta: { position: 'absolute', left: 10, right: 10, bottom: 34, backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 6, alignItems: 'center' },
  ctaText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  count: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  fill: { width: '100%', height: '100%' },
  cardFallback: { alignItems: 'center', justifyContent: 'center' },
  cardInitial: { fontSize: 32, fontWeight: '700', color: colors.muted },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' },
  cardName: { position: 'absolute', left: 8, right: 8, bottom: 8, color: '#fff', fontWeight: '700' },
});
