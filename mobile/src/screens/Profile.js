import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, ScrollView, Share, StatusBar, StyleSheet, useWindowDimensions, Modal, Alert, Switch, RefreshControl, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Hash, Megaphone, Shield, Ban, Flag } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import StoryRing, { railItems } from '../components/StoryRing';
import { api } from '../api';
import { useAppStore } from '../store';
import { mediaUrl } from '../config';
import { formatCount } from '../lib/format';
import { loadPage } from '../lib/paged';
import { logError, toast } from '../lib/toast';
import { colors } from '../theme';
import { defaultCover } from '../lib/cover';

const COVER_H = 200;
const COMPACT_FROM = 40;   // scroll distance where the white header starts to fade in (web)
const COMPACT_TO = 150;    // and where it is fully shown
const TAG_RE = /#[\p{L}\p{N}_]+/gu;
const TABS = [['posts', 'Spotlight'], ['stories', 'Stories'], ['reposts', 'Reposts']];

function hoursLeft(story) {
  return Math.max(1, Math.round((new Date(story.expiresAt) - Date.now()) / 3.6e6));
}

// Profile, matched to the web page: green cover with round buttons, the picture and name over it,
// then the buttons, bio, place and website, the Followers / Following / Posts counts and the Spotlight, Stories and Reposts tabs.
// On your own profile the buttons are Edit and Share. On other profiles they are Add and Message.
export default function Profile() {
  const navigation = useNavigation();
  const route = useRoute();
  const focused = useIsFocused();
  const username = route.params?.username || 'me';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The chosen picture or cover shows at once; it is kept only if the upload succeeds
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const me = useAppStore((s) => s.user);
  const storyRail = useAppStore((s) => s.storyRail);
  const key = `u:${username}`;
  const feed = useAppStore((s) => s.feeds[key]);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('posts');
  const [stories, setStories] = useState(null);
  const [reposts, setReposts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  const [picture, setPicture] = useState(false);
  // Which sheet is open: 'settings' (your profile), 'images' (choose picture), 'options' (someone else's profile)
  const [sheet, setSheet] = useState(null);

  const isMe = Boolean(user?.isMe || (me && me.username === username));
  const profileId = user?.id;
  const posts = user ? (feed?.items || []).filter((p) => (p.author?.id ?? profileId) === profileId) : [];
  const tags = [...new Set(posts.flatMap((post) => (post.caption || '').match(TAG_RE) || []))];
  const postTotal = Math.max(Number(user?.creationCount) || 0, Number(user?.postCount) || 0, posts.length);
  const name = user?.displayName || user?.username || '';
  // Story ring on the picture: mine is blue, unseen purple, seen grey (same as the Stories row)
  const railGroup = railItems(storyRail).find((g) => g.user?.id === profileId);
  const ringState = !user?.hasStory ? null : isMe ? 'mine' : railGroup?.unseen === false ? 'seen' : 'unseen';
  // Each person's own generated green cover, unless they have uploaded one
  const cover = defaultCover(user?.username || username);

  const load = useCallback(() => {
    api(`/v1/users/${username}`).then((u) => setUserAndStore(u)).catch(logError);
    loadPage(key, `/v1/users/${username}/posts`, true).catch(logError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, username]);

  // Show the saved profile at once, then refresh; refresh again when the screen is shown
  useEffect(() => {
    const saved = useAppStore.getState().profiles[username]?.user;
    if (saved) setUser(saved);
    setStories(null);
    setReposts(null);
    setTab('posts');
    load();
  }, [load, username]);
  useEffect(() => { if (focused && user) load(); }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stories and reposts load when their tab is opened
  useEffect(() => {
    if (tab !== 'stories' || !profileId) return undefined;
    let current = true;
    api(`/v1/stories/users/${profileId}`)
      .then((d) => { if (current) setStories((d.items || []).filter((s) => (s.author?.id ?? profileId) === profileId)); })
      .catch(() => { if (current) setStories([]); });
    return () => { current = false; };
  }, [tab, profileId]);

  useEffect(() => {
    if (tab !== 'reposts' || !profileId) return undefined;
    let current = true;
    api(`/v1/users/${username}/reposts`)
      .then((d) => { if (current) setReposts(d.items || []); })
      .catch(() => { if (current) setReposts([]); });
    return () => { current = false; };
  }, [tab, profileId, username]);

  function setUserAndStore(next) {
    setUser(next);
    useAppStore.getState().setProfile(username, { user: next, updatedAt: Date.now() });
  }

  async function toggleFollow() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const r = user.isFollowing
        ? await api(`/v1/users/${user.id}/follow`, { method: 'DELETE' })
        : await api(`/v1/users/${user.id}/follow`, { method: 'POST' });
      setUserAndStore({ ...user, isFollowing: r.isFollowing ?? !user.isFollowing, followerCount: r.followerCount ?? user.followerCount, ...(r.isFollowing ? {} : { isNotifying: false }) });
    } catch (e) { logError(e); }
    finally { setBusy(false); }
  }

  async function toggleNotify() {
    if (!user || isMe || notifyBusy) return;
    if (!user.isFollowing) return toast('Add this creator first to get new post notifications');
    setNotifyBusy(true);
    try {
      const r = await api(`/v1/users/${user.id}/follow/notify`, { method: 'PUT', body: { enabled: !user.isNotifying } });
      setUserAndStore({ ...user, isNotifying: r.isNotifying });
      toast(r.isNotifying ? 'You will be notified when they post' : 'Post notifications off');
    } catch (e) { logError(e); }
    finally { setNotifyBusy(false); }
  }

  function shareProfile() {
    Share.share({ message: `@${user?.username || username} on RimSocial` }).catch(logError);
  }

  function refreshProfile() {
    setRefreshing(true);
    Promise.all([
      api(`/v1/users/${username}`).then((u) => setUserAndStore(u)),
      loadPage(key, `/v1/users/${username}/posts`, true),
    ]).catch(logError).finally(() => setRefreshing(false));
  }

  function go(routeName, params) {
    setSheet(null);
    navigation.navigate(routeName, params);
  }

  // Your picture or background: the chosen photo is saved, then every place that shows it is updated
  async function pickAndUpload(kind) {
    setSheet(null);
    const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 }).catch(logError);
    const asset = r?.assets?.[0];
    if (!asset) return;
    if (kind === 'avatar') setAvatarPreview(asset.uri); else setCoverPreview(asset.uri);
    const fd = new FormData();
    fd.append('media', { uri: asset.uri, name: asset.fileName || `${kind}.jpg`, type: asset.type || 'image/jpeg' });
    try {
      if (kind === 'avatar') {
        const { avatarUrl } = await api('/v1/users/me/avatar', { method: 'POST', body: fd });
        await Image.prefetch(mediaUrl(avatarUrl)).catch(() => {});
        const store = useAppStore.getState();
        if (user) setUserAndStore({ ...user, avatarUrl });
        if (isMe && store.user) {
          store.setSession(store.token, { ...store.user, avatarUrl });
          store.setProfile('me', { user: { ...(store.profiles.me?.user || {}), avatarUrl }, updatedAt: Date.now() });
        }
        toast('Profile photo updated');
      } else {
        const { coverUrl } = await api('/v1/users/me/cover', { method: 'POST', body: fd });
        if (user) setUserAndStore({ ...user, coverUrl });
        toast('Profile cover updated');
      }
    } catch (e) {
      logError(e);
      toast(kind === 'avatar' ? 'Could not update the photo' : 'Could not update the cover');
    } finally {
      if (kind === 'avatar') setAvatarPreview(null); else setCoverPreview(null);
    }
  }

  function confirmBlock() {
    setSheet(null);
    Alert.alert(`Block @${user?.username}?`, 'They will no longer be able to interact with you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          api(`/v1/users/${user.id}/block`, { method: 'POST' })
            .then(() => { toast(`@${user.username} blocked`); navigation.goBack(); })
            .catch(logError);
        },
      },
    ]);
  }

  function confirmDelete(post) {
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removePost(post) },
    ]);
  }

  async function removePost(post) {
    setDeleting(post.id);
    try {
      await api(`/v1/posts/${post.id}`, { method: 'DELETE' });
      const items = useAppStore.getState().feeds[key]?.items || [];
      useAppStore.getState().setFeed(key, { items: items.filter((p) => p.id !== post.id) });
      toast('Post deleted');
    } catch (e) { logError(e); }
    finally { setDeleting(null); }
  }

  // The white header fades in between COMPACT_FROM and COMPACT_TO of scroll, like the web app
  const compactProgress = Math.min(1, Math.max(0, (scrollY - COMPACT_FROM) / (COMPACT_TO - COMPACT_FROM)));

  const header = (
    <View>
      <View style={[styles.cover, { backgroundColor: cover.mid, height: COVER_H + insets.top }]}>
        {(!!coverPreview || !!user?.coverUrl) && <Image source={{ uri: coverPreview || mediaUrl(user.coverUrl) }} style={StyleSheet.absoluteFill} />}
        <View style={[styles.coverTop, { paddingTop: insets.top + 6 }]}>
          <RoundBtn icon="arrow-left" label="Back" onPress={() => navigation.goBack()} />
          <View style={styles.coverRight}>
            {!isMe && !!user?.isFollowing && (
              <RoundBtn
                icon="bell"
                filled={!!user.isNotifying}
                label={user.isNotifying ? 'Turn off new post notifications' : 'Turn on new post notifications'}
                onPress={toggleNotify}
              />
            )}
            <RoundBtn icon="share" label="Share profile" onPress={shareProfile} />
            {isMe
              ? <RoundBtn icon="settings" label="Open profile settings" onPress={() => setSheet('settings')} />
              : <RoundBtn icon="more-vertical" label="More options" onPress={() => setSheet('options')} />}
          </View>
        </View>
      </View>

      <View style={[styles.idRow, { top: COVER_H + insets.top - 46 }]}>
        <View style={styles.avatarBox}>
          {/* A story shows a ring around the picture. Tapping the picture opens it full size (web). */}
          <Pressable style={styles.avatarSlot} onPress={() => setPicture(true)} accessibilityLabel={user?.avatarUrl ? 'View profile picture' : 'View profile avatar'}>
            {ringState
              ? <StoryRing state={ringState} size={102}><Avatar user={avatarPreview ? { ...(user || {}), avatarUrl: avatarPreview } : (user || {})} size={88} /></StoryRing>
              : <Avatar user={avatarPreview ? { ...(user || {}), avatarUrl: avatarPreview } : (user || {})} size={92} />}
          </Pressable>
          {!!user?.isOnline && <View style={styles.online} accessibilityLabel="Online now" />}
          {isMe && (
            <Pressable style={styles.editPhoto} onPress={() => setSheet('images')} accessibilityLabel="Choose profile or background image">
              <Icon name="camera" size={15} color="#fff" />
            </Pressable>
          )}
        </View>
        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {!!user?.isCreator && <Text style={styles.star} accessibilityLabel="Verified">★</Text>}
            {isMe && (
              <Pressable onPress={() => setSheet('settings')} accessibilityLabel="Profile options" hitSlop={8}>
                <Icon name="chevron-down" size={18} color="#fff" />
              </Pressable>
            )}
          </View>
          <Text style={styles.handle} numberOfLines={1}>{user?.username || username}</Text>
          <Pressable onPress={() => navigation.navigate('ProfileList', { username, list: 'followers' })}>
            <Text style={styles.sub}>{formatCount(user?.followerCount || 0)} Followers{user?.isCreator ? ' · Creator' : ''}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
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

        {!!user?.bio && <Text style={styles.bio}>{user.bio}</Text>}
        {!!(user?.city || user?.country || user?.website) && (
          <View style={styles.chips}>
            {!!(user.city || user.country) && (
              <View style={styles.chip}>
                <Icon name="map-pin" size={15} color={colors.text} />
                <Text style={styles.chipText}>{[user.city, user.country].filter(Boolean).join(', ')}</Text>
              </View>
            )}
            {!!user.website && (
              <Pressable style={styles.chip} onPress={() => Linking.openURL(user.website).catch(logError)}>
                <Icon name="link" size={15} color={colors.text} />
                <Text style={styles.chipText} numberOfLines={1}>{user.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.stats}>
          <Pressable onPress={() => navigation.navigate('ProfileList', { username, list: 'followers' })} accessibilityLabel={`${formatCount(user?.followerCount || 0)} followers`}>
            <Stat n={user?.followerCount} label="Followers" />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('ProfileList', { username, list: 'following' })} accessibilityLabel={`${formatCount(user?.followingCount || 0)} following`}>
            <Stat n={user?.followingCount} label="Following" />
          </Pressable>
          <Pressable onPress={() => setTab('posts')} accessibilityLabel={`${formatCount(postTotal)} creations`}>
            <Stat n={postTotal} label="Posts" />
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map(([id, label]) => (
          <Pressable key={id} style={styles.tab} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}>
            <Text style={[styles.tabText, tab === id && styles.tabOn]}>{label}</Text>
            {tab === id && <View style={styles.underline} />}
          </Pressable>
        ))}
      </View>

      {tab === 'posts' && tags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
          {tags.map((tag) => (
            <Pressable key={tag} style={styles.tagChip} onPress={() => navigation.navigate('Explore', { search: true, q: tag })}>
              <Hash size={16} color={colors.text} />
              <Text style={styles.tagText}>{tag.slice(1)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const cellWidth = width / 3;
  const data = tab === 'posts' ? posts : tab === 'stories' ? (stories || []) : (reposts || []);
  const emptyText = tab === 'posts' ? (feed ? 'No posts yet' : '')
    : tab === 'stories' ? (stories ? 'No stories yet' : '')
      : (reposts ? 'No reposts yet' : '');

  function renderCell({ item }) {
    if (tab === 'stories') {
      return (
        <Pressable style={{ width: cellWidth, aspectRatio: 1 }} onPress={() => navigation.navigate('StoryViewer', { startUserId: user.id, user })}>
          <Image source={{ uri: mediaUrl(item.thumbUrl || item.mediaUrl) }} style={styles.cell} />
          <View style={styles.cellCount}><Text style={styles.cellCountText}>{hoursLeft(item)}h left</Text></View>
        </Pressable>
      );
    }
    if (tab === 'reposts') {
      return (
        <Pressable style={{ width: cellWidth, aspectRatio: 1 }} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
          <Image source={{ uri: mediaUrl(item.thumbUrl || item.mediaUrl) }} style={styles.cell} />
          <View style={styles.cellCount}><Icon name="repeat-2" size={12} color="#fff" /><Text style={styles.cellCountText}>{formatCount(item.repostCount || 0)}</Text></View>
        </Pressable>
      );
    }
    return (
      <Pressable style={{ width: cellWidth, aspectRatio: 1 }} onPress={() => navigation.navigate('PostDetail', { postId: item.id })}>
        <Image source={{ uri: mediaUrl(item.thumbUrl || item.mediaUrl) }} style={styles.cell} />
        <View style={styles.cellCount}><Icon name="play" size={11} color="#fff" filled /><Text style={styles.cellCountText}>{formatCount(item.viewCount || 0)}</Text></View>
        {isMe && (
          <Pressable style={styles.cellDelete} disabled={deleting === item.id} onPress={() => confirmDelete(item)} accessibilityLabel="Delete post" hitSlop={6}>
            <Text style={styles.cellDeleteText}>×</Text>
          </Pressable>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.page}>
      {/* The cover is drawn behind the status bar; its icons are white on the green */}
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        data={data}
        numColumns={3}
        keyExtractor={(item) => `${tab}-${item.id}`}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyText ? <View style={styles.emptyWrap}><Text style={styles.emptyTitle}>{emptyText}</Text></View> : null}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshProfile} tintColor={colors.muted} />}
        onEndReached={() => { if (tab === 'posts' && feed?.nextCursor) loadPage(key, `/v1/users/${username}/posts`).catch(logError); }}
        renderItem={renderCell}
      />

      {/* White header that appears once the cover has scrolled away, with the name centred */}
      {compactProgress > 0 && (
        <View style={[styles.compactBar, { opacity: compactProgress, paddingTop: insets.top + 4, height: 56 + insets.top }]} pointerEvents={compactProgress > 0.5 ? 'auto' : 'none'}>
          <Pressable style={styles.compactBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={22} color={colors.text} /></Pressable>
          <Text style={styles.compactName} numberOfLines={1}>{name}</Text>
          <View style={styles.compactRight}>
            <Pressable style={styles.compactBtn} onPress={shareProfile} accessibilityLabel="Share profile"><Icon name="share" size={20} color={colors.text} /></Pressable>
            {isMe
              ? <Pressable style={styles.compactBtn} onPress={() => setSheet('settings')} accessibilityLabel="Open profile settings"><Icon name="settings" size={20} color={colors.text} /></Pressable>
              : <Pressable style={styles.compactBtn} onPress={() => setSheet('options')} accessibilityLabel="More options"><Icon name="more-vertical" size={20} color={colors.text} /></Pressable>}
          </View>
        </View>
      )}

      {/* Your profile: settings list (web drawer "Profile & settings") */}
      <Sheet visible={sheet === 'settings'} title="Profile & settings" onClose={() => setSheet(null)}>
        <SheetRow icon={<Icon name="user-round" size={22} color={colors.text} />} label="My Profile" onPress={() => go('Profile', { username: me?.username || username })} />
        <SheetRow icon={<Icon name="plus" size={22} color={colors.text} />} label="Create post or story" onPress={() => go('Upload')} />
        <SheetRow icon={<Icon name="users" size={22} color={colors.text} />} label="Find friends & creators" onPress={() => go('Explore', { friends: true })} />
        <SheetRow icon={<Icon name="wallet" size={22} color={colors.text} />} label="Creator Studio · earnings & cashout" onPress={() => go('Creator')} />
        <SheetRow icon={<Megaphone size={22} color={colors.text} />} label="Ads & Sponsors" onPress={() => go('Ads')} />
        <SheetRow icon={<Shield size={22} color={colors.text} />} label="Blocked accounts" onPress={() => go('ProfileList', { username: me?.username || username, list: 'blocked' })} />
        <SheetRow icon={<Icon name="image" size={22} color={colors.text} />} label="Change profile or background image" onPress={() => setSheet('images')} />
        <SheetRow icon={<Icon name="video" size={22} color={colors.text} />} label="LIVE broadcasts" onPress={() => go('Live')} />
        <SheetRow icon={<Icon name="gift" size={22} color={colors.text} />} label="Get coins" onPress={() => go('Coins')} />
        <SheetRow icon={<Icon name="arrow-right" size={22} color="#e0245e" />} label="Log out" danger onPress={() => { setSheet(null); useAppStore.getState().logout(); }} />
      </Sheet>

      {/* Your profile: choose which picture to change (web "Choose an image") */}
      <Sheet visible={sheet === 'images'} title="Choose an image" subtitle="What would you like to update?" onClose={() => setSheet(null)}>
        <SheetRow icon={<Icon name="user-round" size={22} color={colors.text} />} label="Profile image" detail="Change the photo shown on your profile" onPress={() => pickAndUpload('avatar')} />
        <SheetRow icon={<Icon name="image" size={22} color={colors.text} />} label="Background image" detail="Change the large image behind your profile" onPress={() => pickAndUpload('cover')} />
      </Sheet>

      {/* Someone else's profile: options (web "Options for @username") */}
      <Sheet visible={sheet === 'options' && !isMe} title={`Options for @${user?.username || username}`} onClose={() => setSheet(null)}>
        <SheetRow icon={<Ban size={22} color="#e0245e" />} label="Block" danger onPress={confirmBlock} />
        <SheetRow icon={<Flag size={22} color="#e0245e" />} label="Report" danger onPress={() => { setSheet(null); toast('Profile reporting is not available yet.'); }} />
        <SheetRow label="Add" trailing={<Switch value={Boolean(user?.isFollowing)} onValueChange={() => { setSheet(null); toggleFollow(); }} disabled={busy} />} />
        <SheetRow label="Post Notifications" trailing={<Switch value={Boolean(user?.isNotifying)} onValueChange={() => { setSheet(null); toggleNotify(); }} disabled={notifyBusy} />} />
        <SheetRow icon={<Icon name="mail" size={22} color={colors.text} />} label="Contact" onPress={() => go('Conversation', { userId: user?.id, user })} />
        <SheetRow label="Recommended" chevron onPress={() => go('Recommended')} />
        <SheetRow icon={<Icon name="send" size={22} color={colors.text} />} label="Send Profile to…" onPress={() => { setSheet(null); shareProfile(); }} />
        <SheetRow icon={<Icon name="link" size={22} color={colors.text} />} label="Share Profile URL" onPress={() => { setSheet(null); shareProfile(); }} />
      </Sheet>

      {/* Full-size profile picture (web profile picture viewer) */}
      <Modal visible={picture} transparent={false} animationType="fade" onRequestClose={() => setPicture(false)}>
        <View style={styles.viewer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicture(false)} />
          {!!user?.avatarUrl
            ? <Image source={{ uri: mediaUrl(user.avatarUrl) }} style={styles.viewerImage} resizeMode="contain" />
            : (
              <View style={styles.viewerEmpty} pointerEvents="none">
                <Avatar user={avatarPreview ? { ...(user || {}), avatarUrl: avatarPreview } : (user || {})} size={160} />
                <Text style={styles.viewerEmptyText}>No profile picture yet</Text>
              </View>
            )}
          <Pressable style={[styles.viewerClose, { top: insets.top + 8 }]} onPress={() => setPicture(false)} accessibilityLabel="Close profile picture">
            <Icon name="x" size={24} color="#fff" />
          </Pressable>
          <Text style={[styles.viewerName, { bottom: insets.bottom + 24 }]} pointerEvents="none">@{user?.username || username}</Text>
        </View>
      </Modal>
    </View>
  );
}

function RoundBtn({ icon, label, onPress, filled = false }) {
  return (
    <Pressable style={styles.round} onPress={onPress} accessibilityLabel={label}>
      <Icon name={icon} size={20} color="#fff" filled={filled} />
    </Pressable>
  );
}

function Stat({ n, label }) {
  return <View style={styles.stat}><Text style={styles.statN}>{formatCount(n || 0)}</Text><Text style={styles.statL}>{label}</Text></View>;
}

// Bottom sheet used for the settings list, the picture choice and the options for another person
function Sheet({ visible, title, subtitle, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grip} />
          {!!title && (
            <View style={styles.sheetTop}>
              <View style={styles.sheetTitleBlock}>
                <Text style={styles.sheetTitle}>{title}</Text>
                {!!subtitle && <Text style={styles.sheetSub}>{subtitle}</Text>}
              </View>
              <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={8}><Icon name="x" size={21} color={colors.text} /></Pressable>
            </View>
          )}
          <ScrollView>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SheetRow({ icon, label, detail, onPress, danger = false, trailing = null, chevron = false }) {
  const content = (
    <>
      {!!icon && <View style={styles.rowIcon}>{icon}</View>}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowDanger]}>{label}</Text>
        {!!detail && <Text style={styles.rowDetail}>{detail}</Text>}
      </View>
      {trailing}
      {chevron && <Icon name="chevron-right" size={18} color={colors.muted} />}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return <Pressable style={styles.row} onPress={onPress}>{content}</Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  cover: { height: COVER_H },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 44 },
  coverRight: { flexDirection: 'row', gap: 10 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(20,40,25,0.55)', alignItems: 'center', justifyContent: 'center' },
  idRow: { position: 'absolute', top: COVER_H - 46, left: 16, right: 16, flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  avatarBox: { position: 'relative', width: 102, height: 102 },
  avatarSlot: { width: 102, height: 102, alignItems: 'center', justifyContent: 'center' },
  online: { position: 'absolute', right: 6, bottom: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#22c55e', borderWidth: 3, borderColor: '#fff' },
  editPhoto: { position: 'absolute', right: 2, top: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(20,40,25,0.7)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  nameBlock: { flex: 1, paddingBottom: 6, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 20, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4 },
  star: { fontSize: 14, color: '#fff' },
  handle: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  body: { paddingTop: 64, paddingHorizontal: 16, gap: 12 },
  bio: { fontSize: 14, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: colors.surface, maxWidth: '100%' },
  chipText: { fontSize: 13, color: colors.text, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  btnOn: { backgroundColor: colors.text },
  btnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  btnOnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stats: { flexDirection: 'row', gap: 28 },
  stat: { alignItems: 'flex-start' },
  statN: { fontSize: 16, fontWeight: '700', color: colors.text },
  statL: { fontSize: 12, color: colors.muted },
  tabs: { flexDirection: 'row', marginTop: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', height: 46, justifyContent: 'center' },
  tabText: { fontSize: 15, color: colors.muted, fontWeight: '500' },
  tabOn: { color: colors.text, fontWeight: '700' },
  underline: { position: 'absolute', bottom: -1, left: '12%', right: '12%', height: 2, backgroundColor: colors.text },
  tagRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.surface },
  tagText: { fontSize: 14, fontWeight: '600', color: colors.text },
  cell: { width: '100%', height: '100%', backgroundColor: colors.surface },
  cellCount: { position: 'absolute', left: 6, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  cellCountText: { color: '#fff', fontSize: 13, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4 },
  cellDelete: { position: 'absolute', right: 4, top: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  cellDeleteText: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: -2 },
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  compactBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line },
  compactBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  compactRight: { flexDirection: 'row' },
  compactName: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '80%', paddingTop: 8 },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 8 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  sheetTitleBlock: { flex: 1 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sheetSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
  rowIcon: { width: 26, alignItems: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, color: colors.text, fontWeight: '500' },
  rowDanger: { color: '#e0245e' },
  rowDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerEmpty: { alignItems: 'center', gap: 16 },
  viewerEmptyText: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  viewerClose: { position: 'absolute', right: 14, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  viewerName: { position: 'absolute', alignSelf: 'center', color: '#fff', fontSize: 15, fontWeight: '600' },
});
