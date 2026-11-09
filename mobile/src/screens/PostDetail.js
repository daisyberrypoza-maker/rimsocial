import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, TextInput, ScrollView, Modal, Share, Alert, PanResponder, StyleSheet, useWindowDimensions } from 'react-native';
import Video from 'react-native-video';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { MoreHorizontal } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { useAppActive } from '../components/PostCard';
import { api } from '../api';
import { useAppStore } from '../store';
import { mediaUrl, videoStreamUrl } from '../config';
import { formatCount } from '../lib/format';
import { logError, toast } from '../lib/toast';
import { registerPlayer, claimPlayback } from '../lib/playback';
import { colors } from '../theme';

// Website Reels colours that the theme does not define
const SNAP_YELLOW = '#FFFC00'; // reposted icon
const REPLY_BLUE = '#3b82f6';  // Post button under the video
const INPUT_GREY = '#1c1c1e';  // comment box on black
const LONG_CAPTION = 90;

// One post as a full-screen Reels page, like the web /p/:postId page: video, actions, caption,
// views and Share, with the comments in a sheet over the lower part of the screen.
export default function PostDetail() {
  const navigation = useNavigation();
  const route = useRoute();
  const postId = route.params?.postId;
  const focused = useIsFocused();
  const appActive = useAppActive();
  const me = useAppStore((s) => s.user);
  const { height: winHeight } = useWindowDimensions();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostBusy, setRepostBusy] = useState(false);
  const [showComments, setShowComments] = useState(Boolean(route.params?.comments));
  const [showMenu, setShowMenu] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(null);
  const videoRef = useRef(null);
  const widthRef = useRef(0);
  const time = useRef({ current: 0, duration: 0 });
  const flashTimer = useRef(null);
  const playerId = `detail:${postId}`;
  const isVideo = post?.kind === 'video';
  const canPlay = Boolean(isVideo && focused && appActive);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api(`/v1/posts/${postId}`),
      api(`/v1/posts/${postId}/comments`),
      api(`/v1/posts/${postId}/engagement`),
    ]).then(([item, commentData, engagement]) => {
      if (!alive) return;
      setPost(item);
      setComments(commentData.items || []);
      setLiked(Boolean(engagement.liked));
      setReposted(Boolean(engagement.reposted));
    }).catch(logError);
    return () => { alive = false; };
  }, [postId]);

  // Only one video plays at a time, and this one stops when the screen loses focus or the app is minimised
  useEffect(() => registerPlayer(playerId, () => { playingRef.current = false; setPlaying(false); }), [playerId]);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  useEffect(() => {
    if (canPlay) { claimPlayback(playerId); playingRef.current = true; setPlaying(true); }
    else { playingRef.current = false; setPlaying(false); }
  }, [canPlay, playerId]);

  function setPlay(next) {
    if (next) claimPlayback(playerId);
    playingRef.current = next;
    setPlaying(next);
  }

  function flashIcon(kind) {
    setFlash({ kind, key: Date.now() });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 600);
  }

  function togglePlay() {
    if (playingRef.current) { setPlay(false); flashIcon('pause'); }
    else { setPlay(true); flashIcon('play'); }
  }

  function onProgress({ currentTime, seekableDuration }) {
    time.current = { current: currentTime, duration: seekableDuration };
    if (seekableDuration > 0) setProgress(currentTime / seekableDuration);
  }

  // Drag or tap the bottom strip to seek
  const seekPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => seekAt(e.nativeEvent.locationX),
    onPanResponderMove: (e) => seekAt(e.nativeEvent.locationX),
  })).current;

  function seekAt(x) {
    const { duration } = time.current;
    const w = widthRef.current;
    if (!(duration > 0) || !w) return;
    const target = Math.min(1, Math.max(0, x / w)) * duration;
    videoRef.current?.seek(target);
    time.current = { ...time.current, current: target };
    setProgress(target / duration);
  }

  async function toggleLike() {
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      const r = await api(`/v1/posts/${postId}/like`, { method: 'POST' });
      setPost((p) => ({ ...p, likeCount: r.likeCount }));
      setLiked(Boolean(r.liked));
    } catch (e) { logError(e); }
    finally { setLikeBusy(false); }
  }

  async function toggleRepost() {
    if (repostBusy) return;
    setRepostBusy(true);
    try {
      const r = await api(`/v1/posts/${postId}/repost`, { method: 'POST' });
      setReposted(Boolean(r.reposted));
      setPost((p) => ({ ...p, repostCount: r.repostCount }));
      toast(r.reposted ? 'Post reposted' : 'Repost removed');
    } catch (e) { logError(e); }
    finally { setRepostBusy(false); }
  }

  function share() {
    Share.share({ message: post?.caption || 'View this post on RimSocial' }).catch(logError);
  }

  async function submitComment() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const item = await api(`/v1/posts/${postId}/comments`, { method: 'POST', body: { body: text } });
      setComments((items) => [...items, item]);
      setDraft('');
    } catch (e) { logError(e); }
    finally { setSending(false); }
  }

  async function deletePost() {
    try {
      await api(`/v1/posts/${postId}`, { method: 'DELETE' });
      toast('Post deleted');
      navigation.goBack();
    } catch (e) { logError(e); }
  }

  function confirmDelete() {
    setShowMenu(false);
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deletePost },
    ]);
  }

  const username = post?.author?.username || 'creator';
  const isOwner = Boolean(me?.id) && post?.author?.id === me.id;
  const caption = post?.caption || '';
  const src = post ? (isVideo ? videoStreamUrl(mediaUrl(post.mediaUrl)) : mediaUrl(post.mediaUrl)) : undefined;
  const poster = post ? mediaUrl(post.thumbUrl) || undefined : undefined;
  const dateText = post?.createdAt ? new Date(post.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const mediaStyle = showComments ? { top: 100, height: winHeight * 0.3 } : { top: 0, bottom: 52 };

  const topBar = (
    <View style={styles.top}>
      <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={8}><Icon name="arrow-left" size={26} color="#fff" /></Pressable>
      <Text style={styles.topTitle}>Reels</Text>
      <Pressable onPress={() => navigation.navigate('Upload')} accessibilityLabel="Add post" hitSlop={8}><Icon name="plus" size={28} color="#fff" /></Pressable>
    </View>
  );

  if (!post) return <View style={styles.page}>{topBar}</View>;

  return (
    <View style={styles.page}>
      <View style={[styles.media, mediaStyle]} onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}>
        {isVideo ? (
          <>
            <Video
              ref={videoRef}
              source={{ uri: src }}
              poster={poster}
              style={styles.fill}
              resizeMode="cover"
              paused={!playing}
              muted={muted}
              repeat
              onProgress={onProgress}
            />
            <Pressable style={styles.fill} onPress={togglePlay} accessibilityLabel={playing ? 'Pause video' : 'Play video'} />
            <Pressable style={styles.soundBtn} onPress={() => setMuted((m) => !m)} accessibilityLabel={muted ? 'Turn sound on' : 'Mute'}>
              <Icon name={muted ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
            </Pressable>
            {flash && (
              <View key={flash.key} pointerEvents="none" style={styles.flashWrap}>
                <View style={styles.flashCircle}><Icon name={flash.kind} size={34} color="#fff" filled /></View>
              </View>
            )}
            <View style={styles.seekHit} {...seekPan.panHandlers} />
            <View pointerEvents="none" style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          </>
        ) : (
          <Image source={{ uri: src }} style={styles.fill} resizeMode="cover" />
        )}
      </View>

      {topBar}

      {!showComments && (
        <View style={styles.rail}>
          <Pressable style={styles.railBtn} onPress={toggleLike} disabled={likeBusy} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
            <Icon name="heart" size={30} color={liked ? colors.heart : '#fff'} filled />
            <Text style={styles.railText}>{formatCount(post.likeCount)}</Text>
          </Pressable>
          <Pressable style={styles.railBtn} onPress={() => setShowComments(true)} accessibilityLabel="Comments">
            <Icon name="message-circle" size={30} color="#fff" filled />
            <Text style={styles.railText}>{formatCount(comments.length)}</Text>
          </Pressable>
          <Pressable style={styles.railBtn} onPress={toggleRepost} disabled={repostBusy} accessibilityLabel={reposted ? 'Undo repost' : 'Repost'}>
            <Icon name="repeat" size={30} color={reposted ? SNAP_YELLOW : '#fff'} filled />
            <Text style={styles.railText}>{formatCount(post.repostCount || 0)}</Text>
          </Pressable>
          <Pressable style={styles.railBtn} onPress={share} accessibilityLabel="Share">
            <Icon name="send" size={30} color="#fff" filled />
          </Pressable>
          <Pressable style={styles.railBtn} onPress={() => (isOwner ? setShowMenu(true) : share())} accessibilityLabel="More">
            <MoreHorizontal size={30} color="#fff" fill="#fff" strokeWidth={2.2} />
          </Pressable>
        </View>
      )}

      {!showComments && (
        <View style={styles.info}>
          <View style={styles.author}>
            <Pressable style={styles.avatarRing} onPress={() => navigation.navigate('Profile', { username })} accessibilityLabel={`Open @${username}`}>
              <Avatar user={post.author} size={34} />
            </Pressable>
            <Text style={styles.username} onPress={() => navigation.navigate('Profile', { username })}>{username}</Text>
          </View>
          {!!caption && <Text style={styles.caption} numberOfLines={captionOpen ? undefined : 2}>{caption}</Text>}
          {caption.length > LONG_CAPTION && !captionOpen && (
            <Pressable onPress={() => setCaptionOpen(true)}><Text style={styles.seeMore}>See more</Text></Pressable>
          )}
        </View>
      )}

      {!showComments && (
        <View style={styles.bottom}>
          <View style={styles.views}>
            <Icon name="eye" size={18} color="rgba(255,255,255,0.85)" />
            <Text style={styles.viewsText}>{formatCount(post.viewCount)} views</Text>
          </View>
          <Pressable style={styles.shareBtn} onPress={share} accessibilityLabel="Share">
            <Text style={styles.shareText}>Share</Text>
          </Pressable>
        </View>
      )}

      {showComments && (
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Avatar user={post.author} size={40} />
            <View style={styles.flex}>
              <Text style={styles.sheetName}>{username}</Text>
              <Text style={styles.sheetDate}>{dateText}</Text>
            </View>
            <Pressable onPress={() => setShowComments(false)} accessibilityLabel="Close comments" hitSlop={8}>
              <Icon name="x" size={22} color="#fff" />
            </Pressable>
          </View>
          <ScrollView style={styles.flex} contentContainerStyle={styles.commentList}>
            {comments.map((item) => (
              <View key={item.id} style={styles.comment}>
                <Avatar user={item.author} size={34} />
                <View style={styles.flex}>
                  <Text style={styles.commentName}>@{item.author?.username || 'user'}</Text>
                  <Text style={styles.commentBody}>{item.body}</Text>
                </View>
              </View>
            ))}
            {!comments.length && <Text style={styles.empty}>No comments yet. Start the conversation.</Text>}
          </ScrollView>
          <View style={styles.compose}>
            <Avatar user={me || {}} size={32} />
            <TextInput
              style={styles.composeInput}
              placeholder={`Comment as ${me?.username || 'you'}…`}
              placeholderTextColor="rgba(255,255,255,0.55)"
              value={draft}
              onChangeText={setDraft}
              maxLength={1000}
            />
            {!!draft.trim() && (
              <Pressable onPress={submitComment} disabled={sending}><Text style={styles.postBtn}>Post</Text></Pressable>
            )}
          </View>
        </View>
      )}

      {showMenu && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setShowMenu(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShowMenu(false)}>
            <View style={styles.menuSheet} onStartShouldSetResponder={() => true}>
              <Pressable style={styles.menuRow} onPress={() => { setShowMenu(false); share(); }}><Text style={styles.menuText}>Share</Text></Pressable>
              <Pressable style={styles.menuRow} onPress={confirmDelete}><Text style={[styles.menuText, styles.menuDanger]}>Delete post</Text></Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 };

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.darkBg, overflow: 'hidden' },
  flex: { flex: 1 },
  fill: { ...StyleSheet.absoluteFillObject },
  media: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.darkBg, overflow: 'hidden' },
  soundBtn: { position: 'absolute', right: 10, bottom: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  flashWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  flashCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  seekHit: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 22 },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  progressFill: { height: 3, backgroundColor: '#fff' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6, height: 100, paddingTop: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: '700', ...shadow },
  rail: { position: 'absolute', right: 10, bottom: 76, zIndex: 5, alignItems: 'center', gap: 18 },
  railBtn: { alignItems: 'center', gap: 4 },
  railText: { color: '#fff', fontSize: 13, fontWeight: '700', ...shadow },
  info: { position: 'absolute', left: 14, right: 80, bottom: 64, zIndex: 5 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatarRing: { borderWidth: 2, borderColor: '#fff', borderRadius: 19 },
  username: { color: '#fff', fontSize: 15, fontWeight: '700', ...shadow },
  caption: { color: '#fff', fontSize: 14, lineHeight: 20, ...shadow },
  seeMore: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500', marginTop: 2 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 52, zIndex: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: '#000' },
  views: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewsText: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  shareBtn: { height: 32, paddingHorizontal: 14, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  shareText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%', zIndex: 20, backgroundColor: colors.darkBg, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  sheetName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sheetDate: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  commentList: { paddingHorizontal: 14, paddingBottom: 8 },
  comment: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  commentName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  commentBody: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 2 },
  empty: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginVertical: 24 },
  compose: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.darkLine },
  composeInput: { flex: 1, minWidth: 0, height: 44, borderRadius: 999, backgroundColor: INPUT_GREY, color: '#fff', paddingHorizontal: 16, fontSize: 15 },
  postBtn: { color: REPLY_BLUE, fontSize: 15, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 24 },
  menuRow: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#efeff3' },
  menuText: { color: '#111', fontSize: 16, fontWeight: '600' },
  menuDanger: { color: colors.heart },
});
