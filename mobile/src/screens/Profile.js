import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, Share, StatusBar, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { mediaUrl } from '../config';
import { formatCount } from '../lib/format';
import { loadPage } from '../lib/paged';
import { logError } from '../lib/toast';
import { colors } from '../theme';
import { defaultCover } from '../lib/cover';

const COVER_H = 200;
const COMPACT_AFTER = 150; // scroll distance before the white header with the name appears

// Profile, matched to the reference: green cover with round buttons, the picture and name over it.
// On your own profile the buttons are Edit and Share. On other profiles they stay Follow and Message.
export default function Profile() {
  const navigation = useNavigation();
  const route = useRoute();
  const focused = useIsFocused();
  const username = route.params?.username || 'me';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const me = useAppStore((s) => s.user);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const key = `u:${username}`;
  const posts = useAppStore((s) => s.feeds[key]);

  const load = useCallback(() => {
    api(`/v1/users/${username}`).then((u) => { setUser(u); useAppStore.getState().setProfile(username, { user: u, updatedAt: Date.now() }); }).catch(logError);
    loadPage(key, `/v1/users/${username}/posts`, true).catch(logError);
  }, [key, username]);

  // Show the saved profile at once, then refresh; refresh again when the screen is shown
  useEffect(() => {
    const saved = useAppStore.getState().profiles[username]?.user;
    if (saved) setUser(saved);
    load();
  }, [load]);
  useEffect(() => { if (focused && user) load(); }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleFollow() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const r = await api(`/v1/users/${user.id}/follow`, { method: user.isFollowing ? 'DELETE' : 'POST' });
      setUser((u) => ({ ...u, isFollowing: r.isFollowing ?? !u.isFollowing, followerCount: r.followerCount ?? u.followerCount }));
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  function shareProfile() {
    Share.share({ message: `@${user?.username || username} on RimSocial` }).catch(logError);
  }

  const isMe = user?.isMe || me?.username === username;
  const name = user?.displayName || user?.username || '';
  const avatarRing = user?.hasStory ? styles.storyRing : null;
  // Each person's own generated green cover, unless they have uploaded one
  const cover = defaultCover(user?.username || username);

  // The white header fades in between 60px and 150px of scroll, like the web app
  const compactOpacity = Math.min(1, Math.max(0, (scrollY - 60) / (COMPACT_AFTER - 60)));
  function onScroll(e) {
    setScrollY(e.nativeEvent.contentOffset.y);
  }

  const header = (
    <View>
      <View style={[styles.cover, { backgroundColor: cover.mid, height: COVER_H + insets.top }]}>
        {!!user?.coverUrl && <Image source={{ uri: mediaUrl(user.coverUrl) }} style={StyleSheet.absoluteFill} />}
        <View style={[styles.coverTop, { paddingTop: insets.top + 6 }]}>
          <RoundBtn icon="arrow-left" label="Back" onPress={() => navigation.goBack()} />
          <View style={styles.coverRight}>
            <RoundBtn icon="share" label="Share profile" onPress={shareProfile} />
            {isMe
              ? <RoundBtn icon="settings" label="Profile settings" onPress={() => navigation.navigate('EditProfile')} />
              : <RoundBtn icon="more-vertical" label="More options" onPress={() => {}} />}
          </View>
        </View>
      </View>

      <View style={[styles.idRow, { top: COVER_H + insets.top - 46 }]}>
        <View style={styles.avatarBox}>
          <Pressable style={avatarRing} onPress={() => { if (user?.hasStory) navigation.navigate('StoryViewer', { startUserId: user.id, user }); }} accessibilityLabel={user?.hasStory ? 'View story' : undefined}>
            <Avatar user={user || {}} size={92} />
          </Pressable>
          {user?.isOnline && <View style={styles.online} accessibilityLabel="Online now" />}
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.handle} numberOfLines={1}>{user?.username || username}</Text>
          <Pressable onPress={() => navigation.navigate('ProfileList', { username, list: 'followers' })}>
            <Text style={styles.sub}>{formatCount(user?.followerCount || 0)} Followers</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {!!user?.bio && <Text style={styles.bio}>{user.bio}</Text>}
        <View style={styles.actions}>
          {isMe ? (
            <>
              <Pressable style={[styles.btn, styles.btnOn]} onPress={() => navigation.navigate('EditProfile')}><Text style={styles.btnOnText}>Edit</Text></Pressable>
              <Pressable style={styles.btn} onPress={shareProfile}><Text style={styles.btnText}>Share</Text></Pressable>
            </>
          ) : (
            <>
              <Pressable style={[styles.btn, user?.isFollowing ? styles.btn : styles.btnOn]} onPress={toggleFollow} disabled={busy}>
                <Text style={user?.isFollowing ? styles.btnText : styles.btnOnText}>{user?.isFollowing ? 'Added' : 'Add'}</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={() => navigation.navigate('Conversation', { userId: user?.id, user })}><Text style={styles.btnText}>Message</Text></Pressable>
            </>
          )}
        </View>
        <View style={styles.stats}>
          <Stat n={user?.postCount} label="Posts" />
          <Pressable onPress={() => navigation.navigate('ProfileList', { username, list: 'following' })}><Stat n={user?.followingCount} label="Following" /></Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.page}>
      {/* The cover is drawn behind the status bar; its icons are white on the green */}
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        data={posts?.items || []}
        numColumns={3}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={header}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReached={() => { if (posts?.nextCursor) loadPage(key, `/v1/users/${username}/posts`).catch(logError); }}
        renderItem={({ item }) => (
          <Pressable style={{ width: width / 3, aspectRatio: 1 }} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
            <Image source={{ uri: mediaUrl(item.thumbUrl || item.mediaUrl) }} style={styles.cell} />
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No posts yet.</Text>}
      />

      {/* White header that appears once the cover has scrolled away, with the name centred */}
      {compactOpacity > 0 && (
        <View style={[styles.compactBar, { opacity: compactOpacity, paddingTop: insets.top + 4, height: 56 + insets.top }]} pointerEvents={compactOpacity > 0.5 ? 'auto' : 'none'}>
          <Pressable style={styles.compactBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={22} color={colors.text} /></Pressable>
          <Text style={styles.compactName} numberOfLines={1}>{name}</Text>
          <Pressable style={styles.compactBtn} onPress={shareProfile} accessibilityLabel="Share profile"><Icon name="share" size={20} color={colors.text} /></Pressable>
        </View>
      )}
    </View>
  );
}

function RoundBtn({ icon, label, onPress }) {
  return (
    <Pressable style={styles.round} onPress={onPress} accessibilityLabel={label}>
      <Icon name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

function Stat({ n, label }) {
  return <View style={styles.stat}><Text style={styles.statN}>{formatCount(n || 0)}</Text><Text style={styles.statL}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  cover: { height: COVER_H },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 44 },
  coverRight: { flexDirection: 'row', gap: 10 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(20,40,25,0.55)', alignItems: 'center', justifyContent: 'center' },
  idRow: { position: 'absolute', top: COVER_H - 46, left: 16, right: 16, flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  nameBlock: { flex: 1, paddingBottom: 6, gap: 1 },
  name: { fontSize: 20, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4 },
  handle: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  storyRing: { padding: 3, borderRadius: 999, borderWidth: 3, borderColor: colors.unseen },
  avatarBox: { position: 'relative' },
  online: { position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#22c55e', borderWidth: 3, borderColor: '#fff' },
  body: { paddingTop: 58, paddingHorizontal: 16, gap: 12 },
  bio: { fontSize: 14, color: colors.text },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  btnOn: { backgroundColor: colors.text },
  btnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  btnOnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stats: { flexDirection: 'row', gap: 28 },
  stat: { alignItems: 'flex-start' },
  statN: { fontSize: 16, fontWeight: '700', color: colors.text },
  statL: { fontSize: 12, color: colors.muted },
  cell: { width: '100%', height: '100%', backgroundColor: colors.surface },
  empty: { textAlign: 'center', color: colors.muted, padding: 24 },
  compactBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 96, paddingTop: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line },
  compactBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  compactName: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
});
