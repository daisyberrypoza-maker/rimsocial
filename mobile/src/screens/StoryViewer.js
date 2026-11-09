import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, TextInput, StyleSheet, Animated, PanResponder, Modal, Alert, Share, AppState, Keyboard, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import Video from 'react-native-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookmarkCheck, Flag, Ban, Shield } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { mediaUrl, videoStreamUrl } from '../config';
import { railItems } from '../components/StoryRing';
import { registerPlayer, claimPlayback } from '../lib/playback';
import { logError, toast } from '../lib/toast';
import { colors } from '../theme';

const PLAYER_ID = 'story-viewer';
const PHOTO_MS = 5000;
const DOUBLE_TAP_MS = 260;
const SWIPE_UP_PX = 60;
const CLOSE_DOWN_PX = 120;
const QUICK_REACTIONS = ['❤️', '😂', '😮', '🔥', '👏', '😢'];
const REPORT_REASONS = ['Spam', 'Harassment or bullying', 'Nudity or sexual content', 'Violence or dangerous content', 'Something else'];
const FAVORITES_KEY = 'rimsocial:favoriteStories';

// "14h ago", "3m ago", "now"
function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Full-screen story player, matched to the web viewer.
// Tap the left or right third for the previous or next story; tap the middle to pause or play, and tap it twice to like.
// Swipe up opens the options, swipe down closes. Videos play with sound; photos advance after PHOTO_MS.
export default function StoryViewer() {
  const navigation = useNavigation();
  const { startUserId, user: passedUser } = useRoute().params || {};
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const me = useAppStore((s) => s.user);
  const storyRail = useAppStore((s) => s.storyRail);
  const railGroups = railItems(storyRail).filter((g) => g.user);
  // Opened from a profile: a person outside the rail still plays their own stories
  const groups = passedUser && !railGroups.some((g) => g.user.id === startUserId) ? [{ user: passedUser }] : railGroups;
  const [gi, setGi] = useState(() => Math.max(0, groups.findIndex((g) => g.user.id === startUserId)));
  const [si, setSi] = useState(0);
  const [stories, setStories] = useState(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState(null);
  const [typing, setTyping] = useState(false);
  const [reply, setReply] = useState('');
  const [chat, setChat] = useState('');
  const [reactionsOpen, setReactionsOpen] = useState(false);
  // Which sheet is open: 'owner' (delete), 'share' (options for someone else's story), 'report'
  const [sheet, setSheet] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [resharing, setResharing] = useState(false);

  const group = groups[gi];
  const creatorName = group?.user?.displayName || group?.user?.username || 'Creator';
  const current = stories?.[si];
  const isVideo = current?.kind === 'video';
  const total = stories?.length || 0;
  const isOwner = Boolean(me?.id) && group?.user?.id === me.id;
  // Stops the story while typing or while a sheet is open
  const frozen = paused || typing || sheet !== null;
  const playing = focused && !frozen;

  const progress = useRef(new Animated.Value(0)).current;
  const durationRef = useRef(0);
  const lastMiddleTap = useRef(0);
  const nextRef = useRef(() => {});
  const handlers = useRef({});

  // The viewer's options are open or the story moves on: keep the latest versions for timers and gestures
  handlers.current = { openOptions, close: () => navigation.goBack() };
  nextRef.current = next;

  useEffect(() => registerPlayer(PLAYER_ID, () => setPaused(true)), []);

  // Stop playback as soon as the app is minimised; playback resumes only on a tap
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state !== 'active') setPaused(true); });
    return () => sub.remove();
  }, []);

  // Swipe up on the lower half opens the options, swipe down closes
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.y0 > height / 2 && g.dy < -SWIPE_UP_PX) handlers.current.openOptions();
      else if (g.dy > CLOSE_DOWN_PX) handlers.current.close();
    },
  })).current;

  // Load the open person's stories. The saved copy shows at once; the server is asked for the latest.
  useEffect(() => {
    if (!group) { navigation.goBack(); return undefined; }
    let alive = true;
    const saved = useAppStore.getState().storyCache[group.user.id];
    setSi(0);
    setStories(saved?.items?.length ? saved.items : null);
    setSubscribed(Boolean(saved?.isSubscribed));
    api(`/v1/stories/users/${group.user.id}`)
      .then((r) => {
        if (!alive) return;
        setStories(r.items || []);
        setSubscribed(Boolean(r.isSubscribed));
        useAppStore.getState().setStoryCache(group.user.id, { items: r.items || [], isSubscribed: Boolean(r.isSubscribed) });
      })
      .catch((e) => { logError(e); if (alive) setStories((list) => list || []); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.user?.id]);

  // A creator whose stories have all expired is skipped
  useEffect(() => { if (stories && stories.length === 0) nextRef.current(); }, [stories]);

  // Each story starts fresh and is recorded as viewed
  useEffect(() => {
    setPaused(false);
    setReply('');
    progress.setValue(0);
    if (!current) return;
    api(`/v1/stories/${current.id}/view`, { method: 'POST' }).catch((error) => {
      if (error.status === 404) dropStory(current.id);
    });
    updateCurrent(current.id, { viewed: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // This creator's ring goes grey once every story from them has been watched on this device
  useEffect(() => {
    if (!stories || stories.length === 0 || !stories.every((s) => s.viewed)) return;
    const store = useAppStore.getState();
    store.setStoryRail({
      items: railItems(store.storyRail).map((g) => (g.user?.id === group?.user?.id ? { ...g, unseen: false } : g)),
      updatedAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories, group?.user?.id]);

  // Favorites are kept on this device only
  useEffect(() => {
    let alive = true;
    if (!current) return undefined;
    AsyncStorage.getItem(FAVORITES_KEY)
      .then((raw) => { if (alive) setFavorite(JSON.parse(raw || '[]').includes(String(current.id))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [current?.id]);

  // Photos move on after PHOTO_MS. The bar fills from where it stopped, so pausing keeps the place.
  useEffect(() => {
    if (!current || isVideo) return undefined;
    if (!playing) { progress.stopAnimation(); return undefined; }
    progress.stopAnimation((value) => {
      Animated.timing(progress, { toValue: 1, duration: Math.max(0, (1 - value) * PHOTO_MS), useNativeDriver: false })
        .start(({ finished }) => { if (finished) nextRef.current(); });
    });
    return () => progress.stopAnimation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, isVideo, playing]);

  // Only one video plays at a time
  useEffect(() => {
    if (isVideo && playing) claimPlayback(PLAYER_ID);
  }, [current?.id, isVideo, playing]);

  function updateCurrent(id, patch) {
    setStories((list) => (list ? list.map((s) => (s.id === id ? { ...s, ...patch } : s)) : list));
  }

  function dropStory(id) {
    setStories((list) => (list ? list.filter((item) => item.id !== id) : list));
  }

  function next() {
    if (!stories) return;
    if (si < stories.length - 1) return setSi(si + 1);
    if (gi < groups.length - 1) return setGi(gi + 1);
    navigation.goBack();
  }

  function prev() {
    if (si > 0) return setSi(si - 1);
    if (gi > 0) return setGi(gi - 1);
  }

  function flashIcon(icon) {
    const key = Date.now();
    setFlash({ icon, key });
    setTimeout(() => setFlash((c) => (c && c.key === key ? null : c)), 600);
  }

  // Like or unlike the current story. A double tap only likes, it never unlikes.
  async function toggleLike(onlyLike = false) {
    if (!current || isOwner) return;
    const { id, liked, likeCount } = current;
    if (onlyLike && liked) return;
    const nextLiked = !liked;
    updateCurrent(id, { liked: nextLiked, likeCount: Math.max(0, (likeCount || 0) + (nextLiked ? 1 : -1)) });
    try {
      const r = await api(`/v1/stories/${id}/like`, { method: 'POST' });
      updateCurrent(id, { liked: r.liked, likeCount: r.likeCount });
    } catch (e) {
      updateCurrent(id, { liked, likeCount });
      logError(e);
    }
  }

  async function toggleSubscribe() {
    const wanted = !subscribed;
    setSubscribed(wanted);
    try {
      const r = await api(`/v1/stories/users/${group.user.id}/subscribe`, { method: 'PUT', body: { enabled: wanted } });
      setSubscribed(Boolean(r.isSubscribed));
      toast(wanted ? `Subscribed to ${creatorName}` : `Unsubscribed from ${creatorName}`);
    } catch (e) {
      setSubscribed(!wanted);
      logError(e);
    }
  }

  // A reply is a chat message to the creator. Quick reactions send their emoji the same way.
  async function sendReply(text) {
    const body = String(text || '').trim();
    if (!body || isOwner) return;
    try {
      await api(`/v1/messages/with/${group.user.id}`, { method: 'POST', body: { body } });
      toast('Sent');
    } catch (e) { logError(e); }
  }

  function submitReply() {
    const body = reply;
    setReply('');
    setTyping(false);
    Keyboard.dismiss();
    sendReply(body);
  }

  function onQuickReaction(emoji) {
    if (emoji === '❤️') toggleLike(false);
    else sendReply(emoji);
  }

  function openOptions() {
    if (!current) return;
    setSheet(isOwner ? 'owner' : 'share');
  }

  function onStageTap(event) {
    const x = event.nativeEvent.locationX / width;
    if (typing) { Keyboard.dismiss(); return; }
    if (x < 0.33) return prev();
    if (x > 0.67) return next();
    // Middle tap: pause or play right away. A second middle tap within the window likes the story.
    const now = Date.now();
    if (lastMiddleTap.current && now - lastMiddleTap.current < DOUBLE_TAP_MS) {
      lastMiddleTap.current = 0;
      setPaused((p) => !p); // undo the pause the first tap caused
      flashIcon('heart');
      toggleLike(true);
      return;
    }
    lastMiddleTap.current = now;
    setPaused((p) => !p);
    flashIcon(paused ? 'play' : 'pause');
  }

  function onVideoLoad({ duration }) { durationRef.current = duration || 0; }
  function onVideoProgress({ currentTime }) {
    const d = durationRef.current;
    if (d > 0) progress.setValue(Math.min(1, currentTime / d));
  }

  async function reshare() {
    if (!current || resharing) return;
    setResharing(true);
    try {
      await api(`/v1/stories/${current.id}/repost`, { method: 'POST' });
      toast('Story remixed to your public story for 24 hours');
    } catch (e) { logError(e); }
    finally { setResharing(false); }
  }

  async function reportStory(reason) {
    if (!current) return;
    setSheet(null);
    try {
      await api(`/v1/stories/${current.id}/report`, { method: 'POST', body: { reason } });
      toast('Thanks. We will review this story');
    } catch (e) { logError(e); }
  }

  async function toggleFavorite() {
    if (!current) return;
    setSheet(null);
    const id = String(current.id);
    try {
      const saved = JSON.parse((await AsyncStorage.getItem(FAVORITES_KEY)) || '[]');
      const nextSaved = favorite ? saved.filter((value) => value !== id) : [...new Set([...saved, id])];
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(nextSaved));
      setFavorite(!favorite);
      toast(favorite ? 'Removed from Favorites on this device' : 'Added to Favorites on this device');
    } catch {
      toast('Could not update Favorites');
    }
  }

  function confirmBlock() {
    setSheet(null);
    Alert.alert(`Block @${group.user.username}?`, 'You will no longer see their content.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          api(`/v1/users/${group.user.id}/block`, { method: 'POST' })
            .then(() => { toast(`@${group.user.username} blocked`); navigation.goBack(); })
            .catch(logError);
        },
      },
    ]);
  }

  function confirmDelete() {
    setSheet(null);
    Alert.alert('Delete this story?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteCurrent },
    ]);
  }

  async function deleteCurrent() {
    if (!current) return;
    try {
      await api(`/v1/stories/${current.id}`, { method: 'DELETE' });
      const rest = (stories || []).filter((item) => item.id !== current.id);
      setStories(rest);
      setSi((i) => Math.min(i, Math.max(0, rest.length - 1)));
      useAppStore.getState().setStoryCache(group.user.id, { items: rest, isSubscribed: subscribed });
      toast('Story deleted');
    } catch (e) { logError(e); }
  }

  function shareStory() {
    setSheet(null);
    Share.share({ title: 'RimSocial Story', message: `View ${creatorName}'s story on RimSocial` }).catch(logError);
  }

  function sendChat() {
    const value = chat;
    setChat('');
    setSheet(null);
    sendReply(value);
  }

  if (!group) return null;

  const barFill = (i) => {
    if (i < si) return '100%';
    if (i > si) return '0%';
    return progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { width, height }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        {current && (isVideo
          ? (
            <Video
              key={current.id}
              source={{ uri: videoStreamUrl(mediaUrl(current.mediaUrl)) }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              paused={!playing}
              muted={muted}
              onLoad={onVideoLoad}
              onProgress={onVideoProgress}
              onEnd={() => nextRef.current()}
              onError={() => nextRef.current()}
            />
          )
          : <Image key={current.id} source={{ uri: mediaUrl(current.mediaUrl) }} style={StyleSheet.absoluteFill} resizeMode="contain" onError={() => nextRef.current()} />)}

        {/* Tapping the picture: left third back, right third forward, middle pauses or likes */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onStageTap} accessibilityLabel="Story" />

        {!!current?.caption && <Text style={[styles.caption, { bottom: insets.bottom + 130 }]} pointerEvents="none">{current.caption}</Text>}
        {!!flash && (
          <View key={flash.key} style={styles.flash} pointerEvents="none">
            <Icon name={flash.icon} size={34} color="#fff" filled={flash.icon !== 'play' && flash.icon !== 'pause'} />
          </View>
        )}
        {!!current?.liked && !flash && <View style={[styles.likedMark, { bottom: insets.bottom + 128 }]} pointerEvents="none"><Icon name="heart" size={16} color="#fff" filled /></View>}
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={styles.bar}>
              <Animated.View style={[styles.barFill, { width: barFill(i) }]} />
            </View>
          ))}
        </View>
        <View style={styles.headRow}>
          <Pressable style={styles.who} onPress={() => navigation.navigate('Profile', { username: group.user.username })} accessibilityLabel={`Open ${group.user.username}'s profile`}>
            <Avatar user={group.user} size={36} />
            <View style={styles.meta}>
              <Text style={styles.name} numberOfLines={1}>{group.user.displayName || group.user.username}</Text>
              <Text style={styles.time}>{timeAgo(current?.createdAt)}</Text>
            </View>
          </Pressable>
          <View style={styles.actions}>
            {isVideo && (
              <Pressable style={styles.iconBtn} onPress={() => setMuted((m) => !m)} accessibilityLabel={muted ? 'Turn sound on' : 'Mute'}>
                <Icon name={muted ? 'volume-x' : 'volume-2'} size={22} color="#fff" />
              </Pressable>
            )}
            {!isOwner && (
              <Pressable style={styles.iconBtn} onPress={toggleSubscribe} accessibilityLabel={subscribed ? 'Unsubscribe' : 'Subscribe'} accessibilityState={{ checked: subscribed }}>
                <Icon name="bell" size={22} color="#fff" filled={subscribed} />
              </Pressable>
            )}
            <Pressable style={styles.iconBtn} onPress={openOptions} disabled={!current} accessibilityLabel="Story options">
              <Icon name="more-vertical" size={26} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>

      {!!current && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
          <View style={styles.sound}>
            <Avatar user={group.user} size={22} />
            <Text style={styles.soundText}>Original sound</Text>
          </View>
          {reactionsOpen && (
            <View style={styles.reactionRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <Pressable key={emoji} style={styles.reactBtn} onPress={() => { setReactionsOpen(false); onQuickReaction(emoji); }}>
                  <Text style={styles.reactText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.replyRow}>
            {!isOwner && (
              <Pressable style={styles.cam} onPress={() => navigation.navigate('Upload')} accessibilityLabel="Open camera">
                <Avatar user={me || {}} size={46} />
              </Pressable>
            )}
            {isOwner ? (
              <View style={[styles.reply, styles.views]}>
                <Icon name="eye" size={18} color="#fff" />
                <Text style={styles.viewsText}>{current.viewCount || 0} views</Text>
              </View>
            ) : (
              <View style={styles.reply}>
                <TextInput
                  style={styles.input}
                  value={reply}
                  placeholder={`Reply to ${creatorName}...`}
                  placeholderTextColor="rgba(255,255,255,0.8)"
                  accessibilityLabel={`Reply to ${group.user.username}`}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  onChangeText={setReply}
                  onSubmitEditing={() => { if (reply.trim()) submitReply(); }}
                  maxLength={2000}
                  returnKeyType="send"
                />
                {!reply.trim() && QUICK_REACTIONS.slice(0, 2).map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={styles.react}
                    onPress={() => onQuickReaction(emoji)}
                    accessibilityLabel={emoji === '❤️' ? (current.liked ? 'Unlike story' : 'Like story') : `React ${emoji}`}
                  >
                    <Text style={styles.reactText}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {!isOwner && (
              <Pressable style={styles.iconPlain} onPress={() => setReactionsOpen((open) => !open)} accessibilityLabel="Open stickers and reactions">
                <Icon name="image" size={24} color="#fff" />
              </Pressable>
            )}
            <Pressable style={styles.iconPlain} onPress={reply.trim() ? submitReply : openOptions} accessibilityLabel={reply.trim() ? 'Send reply' : 'More options'}>
              <Icon name="send" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      {/* Your story: delete it */}
      <Sheet visible={sheet === 'owner'} onClose={() => setSheet(null)}>
        <SheetRow icon={<Icon name="trash" size={22} color="#e0245e" />} label="Delete story" danger onPress={confirmDelete} />
      </Sheet>

      {/* Someone else's story: reply with a reaction or chat, then the options (web share sheet) */}
      <Modal visible={sheet === 'share'} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <View style={styles.shareRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} />
          <View style={[styles.shareTop, { paddingTop: insets.top + 40 }]}>
            <Text style={styles.shareNote}>{creatorName} can share your reply to their public Story.</Text>
            <View style={styles.shareReacts}>
              {QUICK_REACTIONS.map((emoji) => (
                <Pressable key={emoji} style={styles.reactBtn} onPress={() => { setSheet(null); onQuickReaction(emoji); }} accessibilityLabel={emoji === '❤️' ? (current?.liked ? 'Unlike story' : 'Like story') : `React ${emoji}`}>
                  <Text style={styles.reactTextLarge}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.shareChat}>
              <Pressable style={styles.shareCam} onPress={() => { setSheet(null); navigation.navigate('Upload'); }} accessibilityLabel="Open camera">
                <Icon name="camera" size={24} color="#fff" />
              </Pressable>
              <TextInput
                style={styles.shareInput}
                value={chat}
                onChangeText={setChat}
                onSubmitEditing={sendChat}
                placeholder="Send a chat"
                placeholderTextColor="rgba(255,255,255,0.8)"
                accessibilityLabel="Send a chat"
                maxLength={2000}
                returnKeyType="send"
              />
            </View>
          </View>
          <View style={[styles.sheetBody, { paddingBottom: insets.bottom + 12 }]}>
            <SheetRow icon={<Icon name="repeat-2" size={22} color={colors.text} />} label="Remix Snap" disabled={resharing} onPress={() => { setSheet(null); reshare(); }} />
            <SheetRow icon={favorite ? <BookmarkCheck size={22} color={colors.text} /> : <Icon name="bookmark" size={22} color={colors.text} />} label={favorite ? 'Remove from Favorites' : 'Add to Favorites'} onPress={toggleFavorite} />
            <SheetRow icon={<Flag size={22} color="#e0245e" />} label="Report Snap" danger onPress={() => setSheet('report')} />
            <SheetRow icon={<Ban size={22} color="#e0245e" />} label={`Block ${creatorName}`} danger onPress={confirmBlock} />
            <SheetRow icon={<Icon name="send" size={22} color={colors.text} />} label="Share Story" onPress={shareStory} />
          </View>
        </View>
      </Modal>

      {/* Report reasons (web "Report story") */}
      <Sheet visible={sheet === 'report'} title="Report story" onClose={() => setSheet(null)}>
        {REPORT_REASONS.map((reason) => (
          <SheetRow key={reason} icon={<Shield size={22} color={colors.text} />} label={reason} onPress={() => reportStory(reason)} />
        ))}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

// Bottom sheet for the owner and report lists
function Sheet({ visible, title, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grip} />
          {!!title && <Text style={styles.sheetTitle}>{title}</Text>}
          {children}
        </View>
      </View>
    </Modal>
  );
}

function SheetRow({ icon, label, onPress, danger = false, disabled = false }) {
  return (
    <Pressable style={[styles.row, disabled && styles.rowDisabled]} onPress={onPress} disabled={disabled}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={[styles.rowLabel, danger && styles.rowDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000' },
  caption: { position: 'absolute', left: 16, right: 16, color: '#fff', fontSize: 16, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  flash: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  likedMark: { position: 'absolute', left: 18 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 10 },
  bars: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  bar: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#fff' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  meta: { flex: 1 },
  name: { color: '#fff', fontWeight: '700', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 3 },
  time: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  sound: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, alignSelf: 'flex-start' },
  soundText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cam: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' },
  reply: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', paddingLeft: 14, paddingRight: 4, gap: 4 },
  input: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 8 },
  views: { borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  viewsText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  react: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  reactText: { fontSize: 20 },
  reactTextLarge: { fontSize: 28 },
  reactionRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingVertical: 6, marginBottom: 8 },
  reactBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconPlain: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8 },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text, paddingHorizontal: 16, paddingVertical: 8 },
  sheetBody: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
  rowDisabled: { opacity: 0.5 },
  rowIcon: { width: 26, alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '500' },
  rowDanger: { color: '#e0245e' },
  shareRoot: { flex: 1, justifyContent: 'flex-end' },
  shareTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, alignItems: 'center' },
  shareNote: { color: '#fff', fontSize: 14, textAlign: 'center', marginBottom: 12, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  shareReacts: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', marginBottom: 14 },
  shareChat: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareCam: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  shareInput: { flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 16, color: '#fff', fontSize: 15 },
});
