import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, Modal, Share, Alert, Linking, ScrollView, TextInput, PanResponder, AppState, StyleSheet } from 'react-native';
import Video from 'react-native-video';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { BadgeCheck, MoreHorizontal, SkipBack, SkipForward } from 'lucide-react-native';
import Icon from './Icon';
import Avatar from './Avatar';
import { api } from '../api';
import { useAppStore } from '../store';
import { mediaUrl, videoStreamUrl } from '../config';
import { formatCount, timeAgo } from '../lib/format';
import { registerPlayer, claimPlayback } from '../lib/playback';
import { logError, toast } from '../lib/toast';
import { colors } from '../theme';

// Website Rimlight colours that the theme does not define
const SNAP_YELLOW = '#FFFC00';  // repost tint, follow badge, repost pill
const SPONSOR_BLUE = '#4c5cff'; // sponsor button
const EMOJIS = ['❤️', '😍', '😂', '😭', '🔥', '🙏', '😊'];
const REASONS = ['Spam or misleading', 'Harassment or bullying', 'Hate or harmful content', 'Violence or dangerous acts', 'Copyright concern', 'Other'];

let feedSoundOn = true; // one sound setting for every Rimlight video, like the web app
const countedViews = new Set();

// True while the app is in the foreground. Videos stop when the app is minimised.
export function useAppActive() {
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return appActive;
}

// Left and right of the screen skip 10 seconds; the middle plays or pauses
function zoneOf(x, width) {
  const r = (x || 0) / Math.max(1, width);
  return r < 0.35 ? 'back' : r > 0.65 ? 'forward' : 'middle';
}

// Hashtags and @mentions in the caption are tappable, like the web app
function Caption({ text, onHashtag, onMention }) {
  return (
    <Text style={styles.text} numberOfLines={2}>
      {String(text || '').split(/(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_.]+)/g).map((part, i) => {
        if (/^#[a-zA-Z0-9_]+$/.test(part)) return <Text key={i} style={styles.link} onPress={() => onHashtag(part.slice(1))}>{part}</Text>;
        if (/^@[a-zA-Z0-9_.]+$/.test(part)) return <Text key={i} style={styles.link} onPress={() => onMention(part.slice(1))}>{part}</Text>;
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

function FlashIcon({ kind }) {
  if (kind === 'back') return <SkipBack size={34} color="#fff" />;
  if (kind === 'forward') return <SkipForward size={34} color="#fff" />;
  if (kind === 'heart') return <Icon name="heart" size={34} color={colors.heart} filled />;
  return <Icon name={kind} size={34} color="#fff" filled />;
}

function MenuRow({ label, danger, onPress }) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <Text style={[styles.menuText, danger && styles.menuDanger]}>{label}</Text>
    </Pressable>
  );
}

// Rim options: the same items as the web menu. Report opens a reason list first.
function OptionsSheet({ username, isOwn, reporting, onClose, onRemix, onShare, onReport, onNotInterested, onBlock, onDelete }) {
  const [step, setStep] = useState('menu');
  const [reason, setReason] = useState(REASONS[0]);
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.menuSheet} onStartShouldSetResponder={() => true}>
          {step === 'menu' ? (
            <>
              <MenuRow label="Remix Rim" onPress={onRemix} />
              {!isOwn && <MenuRow danger label={`Block @${username}`} onPress={onBlock} />}
              {!isOwn && <MenuRow danger label="Report Rim" onPress={() => setStep('report')} />}
              {!isOwn && <MenuRow label="Not Interested" onPress={onNotInterested} />}
              <MenuRow label="Export or Send Rim" onPress={onShare} />
              {isOwn && <MenuRow danger label="Delete Rim" onPress={onDelete} />}
            </>
          ) : (
            <>
              <View style={styles.reportHead}>
                <Pressable onPress={() => setStep('menu')} accessibilityLabel="Back"><Text style={styles.reportBack}>‹</Text></Pressable>
                <Text style={styles.reportTitle}>Why are you reporting this Rim?</Text>
              </View>
              {REASONS.map((item) => (
                <Pressable key={item} style={styles.menuRow} onPress={() => setReason(item)}>
                  <View style={styles.reasonLine}>
                    <Text style={styles.menuText}>{item}</Text>
                    {reason === item && <Text style={styles.check}>✓</Text>}
                  </View>
                </Pressable>
              ))}
              <Pressable style={styles.submit} onPress={() => onReport(reason)} disabled={reporting}>
                <Text style={styles.submitText}>Submit report</Text>
              </Pressable>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

// Comments for a Rimlight post, opened from the comment button
function CommentsSheet({ post, me, onClose }) {
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    api(`/v1/posts/${post.id}/comments`).then((r) => { if (alive) setItems(r.items || []); }).catch(logError);
    return () => { alive = false; };
  }, [post.id]);

  async function submit() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const comment = await api(`/v1/posts/${post.id}/comments`, { method: 'POST', body: { body: text } });
      setItems((current) => [...current, comment]);
      setBody('');
    } catch (e) { logError(e); }
    finally { setSending(false); }
  }

  async function remove(comment) {
    try {
      await api(`/v1/posts/${post.id}/comments/${comment.id}`, { method: 'DELETE' });
      setItems((current) => current.filter((item) => item.id !== comment.id));
    } catch (e) { logError(e); }
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.commentSheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Comments</Text>
          <ScrollView style={styles.flex} contentContainerStyle={styles.commentList}>
            {items.map((item) => (
              <View key={item.id} style={styles.comment}>
                <Avatar user={item.author} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.commentName}>{item.author?.username || 'user'} <Text style={styles.commentTime}>· {timeAgo(item.createdAt)}</Text></Text>
                  <Text style={styles.commentBody}>{item.body}</Text>
                  {item.isMine && <Pressable onPress={() => remove(item)}><Text style={styles.deleteText}>Delete</Text></Pressable>}
                </View>
              </View>
            ))}
            {!items.length && <Text style={styles.empty}>{'No comments yet.\nStart the conversation.'}</Text>}
          </ScrollView>
          <View style={styles.emojiRow}>
            {EMOJIS.map((emoji) => (
              <Pressable key={emoji} onPress={() => setBody((current) => current + emoji)} accessibilityLabel={`Add ${emoji}`}>
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.compose}>
            <Avatar user={me || {}} size={36} />
            <TextInput style={styles.composeInput} placeholder="Add a comment…" placeholderTextColor={colors.darkMuted} value={body} onChangeText={setBody} maxLength={1000} />
            {!!body.trim() && <Pressable onPress={submit} disabled={sending}><Text style={styles.postBtn}>Post</Text></Pressable>}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

// One full-screen Rimlight post, like the web feed. Only the post on screen plays, and it stops when the
// screen loses focus (another tab or screen), when the app is minimised, or when another video starts.
// height: the visible page height above the tab bar, passed from the Rimlight list
// scrolling: true while the list moves, so the rail, caption and shade step aside (as on the web)
export default function PostCard({ post, active, focused, navigation, height, scrolling = false }) {
  const id = `post:${post.id}`;
  const isVideo = post.kind === 'video';
  const viewerId = useAppStore((s) => s.user?.id);
  const me = useAppStore((s) => s.user);
  const appActive = useAppActive();
  const isOwn = viewerId != null && post.author?.id != null && String(viewerId) === String(post.author.id);
  const username = post.author?.username || 'unknown';
  const src = isVideo ? videoStreamUrl(mediaUrl(post.mediaUrl)) : mediaUrl(post.mediaUrl);
  const poster = mediaUrl(post.thumbUrl) || undefined;
  const canPlay = Boolean(active && focused && appActive && isVideo);

  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [soundOn, setSoundOn] = useState(feedSoundOn);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likeCount || 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(post.repostCount || 0);
  const [repostBusy, setRepostBusy] = useState(false);
  const [following, setFollowing] = useState(Boolean(post.author?.isFollowing));
  const [followBusy, setFollowBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const videoRef = useRef(null);
  const widthRef = useRef(0);
  const time = useRef({ current: 0, duration: 0 });
  const lastTap = useRef({ t: 0, side: null });
  const tapTimer = useRef(null);
  const flashTimer = useRef(null);

  // Only one video plays at a time: starting one stops the others through the playback registry
  useEffect(() => registerPlayer(id, () => { playingRef.current = false; setPlaying(false); }), [id]);
  useEffect(() => () => { clearTimeout(tapTimer.current); clearTimeout(flashTimer.current); }, []);

  useEffect(() => {
    if (canPlay) { claimPlayback(id); playingRef.current = true; setPlaying(true); }
    else { playingRef.current = false; setPlaying(false); }
  }, [canPlay, id]);

  useEffect(() => {
    let alive = true;
    api(`/v1/posts/${post.id}/engagement`).then((r) => {
      if (alive) { setLiked(Boolean(r.liked)); setReposted(Boolean(r.reposted)); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [post.id]);

  // Count one view per post, and send one watch-time sample when the viewer leaves an active post
  useEffect(() => {
    if (!active) return undefined;
    if (!countedViews.has(post.id)) {
      countedViews.add(post.id);
      api(`/v1/posts/${post.id}/view`, { method: 'POST' }).catch(() => {});
    }
    return () => {
      if (!isVideo) return;
      const { current, duration } = time.current;
      if (!(duration > 0) || !Number.isFinite(current)) return;
      api('/v1/feed/feedback', {
        method: 'POST',
        body: current < 2
          ? { postId: post.id, event: 'skipped' }
          : { postId: post.id, event: 'watch', watchMs: Math.min(current, duration) * 1000, durationMs: duration * 1000 },
      }).catch(() => {});
    };
  }, [active, post.id, isVideo]);

  function setPlay(next) {
    if (next) claimPlayback(id);
    playingRef.current = next;
    setPlaying(next);
  }

  function flashIcon(kind) {
    setFlash({ kind, key: Date.now() });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 600);
  }

  function onProgress({ currentTime, seekableDuration }) {
    time.current = { current: currentTime, duration: seekableDuration };
    if (seekableDuration > 0) setProgress(currentTime / seekableDuration);
  }

  function seekTo(seconds) {
    const { duration } = time.current;
    const target = duration > 0 ? Math.min(duration, Math.max(0, seconds)) : Math.max(0, seconds);
    videoRef.current?.seek(target);
    time.current = { ...time.current, current: target };
    if (duration > 0) setProgress(target / duration);
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
    seekTo((Math.min(1, Math.max(0, x / w))) * duration);
  }

  // Single tap plays or pauses. Double tap a side to go back or forward 10 seconds.
  // Double tap the middle to like (never unlike); the like button still toggles.
  function onMediaPress(event) {
    if (!isVideo) return;
    const side = zoneOf(event.nativeEvent.locationX, widthRef.current);
    const now = Date.now();
    const last = lastTap.current;
    if (side === 'middle' && last.side === 'middle' && now - last.t < 320) {
      clearTimeout(tapTimer.current);
      lastTap.current = { t: 0, side: null };
      if (!liked) like();
      flashIcon('heart');
      return;
    }
    if (side !== 'middle' && side === last.side && now - last.t < 320) {
      clearTimeout(tapTimer.current);
      lastTap.current = { t: 0, side: null };
      seekTo(time.current.current + (side === 'back' ? -10 : 10));
      flashIcon(side);
      return;
    }
    lastTap.current = { t: now, side };
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      if (playingRef.current) { setPlay(false); flashIcon('pause'); }
      else { setPlay(true); flashIcon('play'); }
    }, 260);
  }

  function toggleSound() {
    feedSoundOn = !feedSoundOn;
    setSoundOn(feedSoundOn);
  }

  async function like() {
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      const r = await api(`/v1/posts/${post.id}/like`, { method: 'POST' });
      setLikes(r.likeCount);
      setLiked(Boolean(r.liked));
    } catch (e) { logError(e); }
    finally { setLikeBusy(false); }
  }

  async function repost() {
    if (repostBusy) return;
    setRepostBusy(true);
    try {
      const r = await api(`/v1/posts/${post.id}/repost`, { method: 'POST' });
      setReposted(Boolean(r.reposted));
      setRepostCount(r.repostCount);
      toast(r.reposted ? 'Post reposted to your profile' : 'Repost removed');
    } catch (e) { logError(e); }
    finally { setRepostBusy(false); }
  }

  async function follow() {
    if (followBusy || !post.author?.id) return;
    setFollowBusy(true);
    try {
      const r = await api(`/v1/users/${post.author.id}/follow`, { method: 'POST' });
      setFollowing(Boolean(r.isFollowing ?? true));
    } catch (e) { logError(e); }
    finally { setFollowBusy(false); }
  }

  function share() {
    setShowMenu(false);
    Share.share({ message: post.caption || 'View this post on RimSocial' }).catch(logError);
  }

  async function notInterested() {
    setHidden(true);
    setShowMenu(false);
    try {
      await api('/v1/feed/feedback', { method: 'POST', body: { postId: post.id, event: 'not_interested' } });
      toast('You will see fewer posts like this');
    } catch (e) { logError(e); }
  }

  async function block() {
    if (!post.author?.id) return;
    try {
      await api(`/v1/users/${post.author.id}/block`, { method: 'POST' });
      setHidden(true);
      setShowMenu(false);
      toast(`@${username} blocked`);
    } catch (e) { logError(e); }
  }

  async function report(reason) {
    if (reporting) return;
    setReporting(true);
    try {
      await api(`/v1/posts/${post.id}/report`, { method: 'POST', body: { reason } });
      toast('Report submitted for review');
      setShowMenu(false);
    } catch (e) { logError(e); }
    finally { setReporting(false); }
  }

  async function deletePost() {
    try {
      await api(`/v1/posts/${post.id}`, { method: 'DELETE' });
      setHidden(true);
      toast('Post deleted');
    } catch (e) { logError(e); }
  }

  function confirmDelete() {
    setShowMenu(false);
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deletePost },
    ]);
  }

  if (hidden) return null;

  const overlayHidden = scrolling ? styles.hidden : null;
  const overlayEvents = scrolling ? 'none' : 'box-none';
  const showFollow = !isOwn && !post.isSponsored && !following;

  return (
    <View style={[styles.post, { height }]} onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}>
      {isVideo ? (
        <Video
          ref={videoRef}
          source={{ uri: src }}
          poster={poster}
          style={styles.fill}
          resizeMode="cover"
          paused={!playing}
          muted={!soundOn}
          repeat
          onProgress={onProgress}
        />
      ) : (
        <Image source={{ uri: src }} style={styles.fill} resizeMode="cover" />
      )}

      {/* Tap layer: play, pause, skip, like. Long press opens the Rim options. */}
      <Pressable style={styles.fill} onPress={onMediaPress} onLongPress={() => setShowMenu(true)} delayLongPress={450} />

      {flash && flash.kind !== 'pause' && (
        <View key={flash.key} pointerEvents="none" style={styles.flashWrap}>
          <View style={styles.flashCircle}><FlashIcon kind={flash.kind} /></View>
        </View>
      )}

      {/* Paused: sound button above the white play button, both centred */}
      {isVideo && !playing && (
        <View pointerEvents="box-none" style={styles.pausedWrap}>
          <Pressable style={styles.soundBtn} onPress={toggleSound} accessibilityLabel={soundOn ? 'Mute video' : 'Turn sound on'}>
            <Icon name={soundOn ? 'volume-2' : 'volume-x'} size={32} color="#fff" />
          </Pressable>
          <View pointerEvents="none"><Icon name="play" size={56} color="#fff" filled /></View>
        </View>
      )}

      <View pointerEvents="none" style={[styles.fill, overlayHidden]}>
        <Svg width="100%" height="100%">
          <Defs>
            <SvgLinearGradient id="postShade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.55" stopColor="#000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000" stopOpacity="0.85" />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#postShade)" />
        </Svg>
      </View>

      {post.aiLabel && <View pointerEvents="none" style={[styles.aiLabel, overlayHidden]}><Text style={styles.labelText}>AI-generated</Text></View>}
      {post.isSponsored && <View pointerEvents="none" style={[styles.adLabel, overlayHidden]}><Text style={styles.labelText}>Ad</Text></View>}

      {/* Right rail: filled icons, like the web */}
      <View style={[styles.rail, overlayHidden]} pointerEvents={overlayEvents}>
        <View style={styles.avatarWrap}>
          <Pressable onPress={() => navigation.navigate('Profile', { username })} accessibilityLabel={`Open @${username}`}>
            <Avatar user={post.author} size={44} />
          </Pressable>
          {showFollow && (
            <Pressable style={styles.followBadge} onPress={follow} disabled={followBusy} accessibilityLabel={`Follow @${username}`}>
              <Text style={styles.followPlus}>+</Text>
            </Pressable>
          )}
        </View>
        <Pressable style={styles.railBtn} onPress={like} disabled={likeBusy} accessibilityLabel={liked ? 'Unlike post' : 'Like post'}>
          <Icon name="heart" size={30} color={liked ? colors.heart : '#fff'} filled />
          <Text style={styles.railCount}>{formatCount(likes)}</Text>
        </Pressable>
        <Pressable style={styles.railBtn} onPress={() => setShowComments(true)} accessibilityLabel="Open comments">
          <Icon name="message-circle" size={30} color="#fff" filled />
          {post.commentCount > 0 && <Text style={styles.railCount}>{formatCount(post.commentCount)}</Text>}
        </Pressable>
        <Pressable style={styles.railBtn} onPress={repost} disabled={repostBusy} accessibilityLabel={reposted ? 'Undo repost' : 'Repost'}>
          <Icon name="repeat" size={30} color={reposted ? SNAP_YELLOW : '#fff'} filled />
          {repostCount > 0 && <Text style={styles.railCount}>{formatCount(repostCount)}</Text>}
        </Pressable>
        <Pressable style={styles.railBtn} onPress={share} accessibilityLabel="Share post">
          <Icon name="send" size={30} color="#fff" filled />
        </Pressable>
        <Pressable style={styles.railBtn} onPress={() => setShowMenu(true)} accessibilityLabel="More post controls">
          <MoreHorizontal size={30} color="#fff" fill="#fff" strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={[styles.info, overlayHidden]} pointerEvents={overlayEvents}>
        {reposted && (
          <View style={styles.repostPill}>
            <Icon name="repeat" size={14} color="#fff" filled />
            <Text style={styles.pillText}>You reposted</Text>
          </View>
        )}
        <View style={styles.titleRow}>
          <Text style={styles.title}>{post.author?.displayName || username}</Text>
          {post.author?.isCreator && <BadgeCheck size={16} color="#fff" />}
        </View>
        <Text style={styles.sound}>♫ Original sound · @{username}</Text>
        {!!post.caption && (
          <Caption
            text={post.caption}
            onHashtag={(tag) => navigation.navigate('Explore', { q: `#${tag}` })}
            onMention={(name) => navigation.navigate('Profile', { username: name })}
          />
        )}
        {post.isSponsored && (
          <>
            <View style={styles.sponsorCopy}>
              <Text style={styles.sponsorName}>{post.sponsorName}</Text>
              {!!post.sponsorDescription && <Text style={styles.sponsorDesc}>{post.sponsorDescription}</Text>}
            </View>
            {!!post.sponsorUrl && (
              <Pressable style={styles.sponsorCta} onPress={() => Linking.openURL(post.sponsorUrl).catch(logError)}>
                <Text style={styles.sponsorCtaText}>{`${post.sponsorCta || 'Shop Now'} ›`}</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {isVideo && <View pointerEvents="none" style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} /></View>}
      {isVideo && <View style={styles.seekHit} {...seekPan.panHandlers} />}

      {showMenu && (
        <OptionsSheet
          username={username}
          isOwn={isOwn}
          reporting={reporting}
          onClose={() => setShowMenu(false)}
          onRemix={() => { setShowMenu(false); navigation.navigate('Upload', { remix: post.id }); }}
          onShare={share}
          onReport={report}
          onNotInterested={notInterested}
          onBlock={block}
          onDelete={confirmDelete}
        />
      )}
      {showComments && <CommentsSheet post={post} me={me} onClose={() => setShowComments(false)} />}
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 };

const styles = StyleSheet.create({
  post: { backgroundColor: colors.darkBg, overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFillObject },
  hidden: { opacity: 0 },
  flashWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  flashCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  pausedWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 14 },
  soundBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  rail: { position: 'absolute', right: 10, bottom: 150, alignItems: 'center', gap: 20 },
  avatarWrap: { width: 48, height: 48, marginBottom: 6, alignItems: 'center' },
  followBadge: { position: 'absolute', bottom: -9, width: 24, height: 24, borderRadius: 12, backgroundColor: SNAP_YELLOW, alignItems: 'center', justifyContent: 'center' },
  followPlus: { color: '#000', fontSize: 18, fontWeight: '800', lineHeight: 22 },
  railBtn: { alignItems: 'center', gap: 4 },
  railCount: { color: '#fff', fontSize: 14, fontWeight: '700', ...shadow },
  info: { position: 'absolute', left: 14, right: 84, bottom: 86 },
  repostPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(30,30,30,0.85)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', ...shadow },
  sound: { color: '#fff', fontSize: 15, fontWeight: '500', marginVertical: 6, ...shadow },
  text: { color: '#fff', fontSize: 15, lineHeight: 20, ...shadow },
  link: { fontWeight: '700' },
  sponsorCopy: { marginTop: 10, marginBottom: 14, gap: 3 },
  sponsorName: { color: '#fff', fontSize: 17, fontWeight: '700' },
  sponsorDesc: { color: 'rgba(255,255,255,0.82)', fontSize: 14 },
  sponsorCta: { height: 46, borderRadius: 10, backgroundColor: SPONSOR_BLUE, alignItems: 'center', justifyContent: 'center' },
  sponsorCtaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  aiLabel: { position: 'absolute', left: 14, top: 100, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(20,20,20,0.68)' },
  adLabel: { position: 'absolute', left: 16, bottom: 250, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(20,20,20,0.68)' },
  labelText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  progressFill: { height: 3, backgroundColor: '#fff' },
  seekHit: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 22 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 24 },
  menuRow: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#efeff3' },
  menuText: { color: '#111', fontSize: 16, fontWeight: '600' },
  menuDanger: { color: colors.heart },
  reportHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10 },
  reportBack: { fontSize: 26, color: '#111', paddingHorizontal: 4 },
  reportTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  reasonLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  check: { color: '#111', fontSize: 16, fontWeight: '700' },
  submit: { margin: 16, height: 46, borderRadius: 12, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  commentSheet: { height: '62%', backgroundColor: colors.darkBg, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', paddingVertical: 8 },
  flex: { flex: 1 },
  commentList: { paddingHorizontal: 16, paddingBottom: 8 },
  comment: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  commentName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  commentTime: { color: colors.darkMuted, fontWeight: '400' },
  commentBody: { color: '#fff', fontSize: 15, lineHeight: 20, marginTop: 4 },
  deleteText: { color: colors.darkMuted, fontSize: 13, fontWeight: '600', marginTop: 6 },
  empty: { color: colors.darkMuted, fontSize: 14, textAlign: 'center', marginVertical: 40 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.darkLine },
  emoji: { fontSize: 28 },
  compose: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 14 },
  composeInput: { flex: 1, backgroundColor: '#1c1c1e', color: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  postBtn: { color: SNAP_YELLOW, fontSize: 15, fontWeight: '800' },
});
