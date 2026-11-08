import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
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

// Profile. username 'me' is the signed-in user. Followers, Following and Blocked open as pushed screens,
// so Back returns here.
export default function Profile() {
  const navigation = useNavigation();
  const route = useRoute();
  const focused = useIsFocused();
  const username = route.params?.username || 'me';
  const { width } = useWindowDimensions();
  const me = useAppStore((s) => s.user);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
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

  const isMe = user?.isMe || me?.username === username;
  const name = user?.displayName || user?.username || '';

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        {!isMe && <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={24} /></Pressable>}
        <Text style={styles.handle}>@{user?.username || username}</Text>
        {isMe
          ? <Pressable onPress={() => navigation.navigate('EditProfile')} accessibilityLabel="Edit profile"><Icon name="pencil" size={22} /></Pressable>
          : <View style={{ width: 24 }} />}
      </View>

      <FlatList
        data={posts?.items || []}
        numColumns={3}
        keyExtractor={(p) => String(p.id)}
        onEndReached={() => { if (posts?.nextCursor) loadPage(key, `/v1/users/${username}/posts`).catch(logError); }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Avatar user={user || {}} size={84} />
            <Text style={styles.name}>{name}</Text>
            {!!user?.bio && <Text style={styles.bio}>{user.bio}</Text>}
            <View style={styles.stats}>
              <Stat n={user?.postCount} label="Posts" />
              <Pressable onPress={() => navigation.navigate('ProfileList', { username, list: 'followers' })}><Stat n={user?.followerCount} label="Followers" /></Pressable>
              <Pressable onPress={() => navigation.navigate('ProfileList', { username, list: 'following' })}><Stat n={user?.followingCount} label="Following" /></Pressable>
            </View>
            <View style={styles.actions}>
              {isMe
                ? <Pressable style={styles.btn} onPress={() => navigation.navigate('EditProfile')}><Text style={styles.btnText}>Edit profile</Text></Pressable>
                : <>
                    <Pressable style={[styles.btn, user?.isFollowing ? styles.btnGhost : styles.btnDark]} onPress={toggleFollow} disabled={busy}>
                      <Text style={[styles.btnText, user?.isFollowing && styles.btnTextGhost]}>{user?.isFollowing ? 'Following' : 'Follow'}</Text>
                    </Pressable>
                    <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => navigation.navigate('Conversation', { userId: user?.id, user })}>
                      <Text style={styles.btnTextGhost}>Message</Text>
                    </Pressable>
                  </>}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={{ width: width / 3, aspectRatio: 1 }} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
            <Image source={{ uri: mediaUrl(item.thumbUrl || item.mediaUrl) }} style={styles.cell} />
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No posts yet.</Text>}
      />
    </View>
  );
}

function Stat({ n, label }) {
  return <View style={styles.stat}><Text style={styles.statN}>{formatCount(n || 0)}</Text><Text style={styles.statL}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  handle: { fontSize: 17, fontWeight: '700', color: colors.text },
  header: { alignItems: 'center', paddingHorizontal: 16, gap: 8, paddingBottom: 16 },
  name: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 6 },
  bio: { fontSize: 14, color: colors.text, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 28, marginTop: 8 },
  stat: { alignItems: 'center' },
  statN: { fontSize: 17, fontWeight: '700', color: colors.text },
  statL: { fontSize: 12, color: colors.muted },
  actions: { flexDirection: 'row', gap: 8, width: '100%', marginTop: 8 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.surface },
  btnDark: { backgroundColor: colors.text },
  btnGhost: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  btnText: { color: '#fff', fontWeight: '700' },
  btnTextGhost: { color: colors.text, fontWeight: '700' },
  cell: { width: '100%', height: '100%', backgroundColor: colors.surface },
  empty: { textAlign: 'center', color: colors.muted, padding: 24 },
});
