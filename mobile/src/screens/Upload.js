import React, { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, Image, Pressable, ScrollView, TextInput, StyleSheet, PermissionsAndroid, Platform, useWindowDimensions, Switch, Modal, PanResponder } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import Video from 'react-native-video';
import { Download } from 'lucide-react-native';
import Icon from '../components/Icon';
import { api } from '../api';
import { mediaUrl } from '../config';
import { startUpload } from '../lib/uploader';
import { toast, logError } from '../lib/toast';
import { colors } from '../theme';

const CTA_OPTIONS = ['Shop Now', 'Learn More', 'Sign Up', 'Contact Us', 'Download'];

// Permission to read the phone's photos and videos (Android 13+ uses the media permissions)
async function requestGalleryPermission() {
  if (Platform.OS !== 'android') return true;
  const perms = Platform.Version >= 33
    ? [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES, PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO]
    : [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
  const result = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

function fromAsset(asset) {
  return { uri: asset.uri, name: asset.fileName || asset.name || 'media', type: asset.type || 'image/jpeg' };
}

// Same flow as the web Upload page: gallery (Memories or Camera Roll), then the editor
// (preview, caption tool, Save, Post or My Story). Story mode comes from route.params.story.
// route.params.remix (a post id) opens the remix flow.
export default function Upload() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const toStory = Boolean(route.params?.story);
  const remixId = route.params?.remix || null;
  const { width } = useWindowDimensions();
  const tileSize = (width - 2) / 3;
  const maxCaption = toStory ? 200 : 500;

  const [view, setView] = useState('gallery');
  const [tab, setTab] = useState('Camera Roll');
  const [recents, setRecents] = useState([]);
  const [memories, setMemories] = useState([]);
  const [file, setFile] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [topic, setTopic] = useState('');
  const [aiLabel, setAiLabel] = useState(false);
  const [shareToStory, setShareToStory] = useState(false);
  const [allowRemix, setAllowRemix] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [isSponsored, setIsSponsored] = useState(false);
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorDescription, setSponsorDescription] = useState('');
  const [sponsorCta, setSponsorCta] = useState('Shop Now');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [sourcePost, setSourcePost] = useState(null);
  const [mention, setMention] = useState(null);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const caretRef = useRef(0);
  const swipeResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 60 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.7,
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < 90) return;
      navigation.navigate('Main', { screen: gesture.dx < 0 ? 'Stories' : 'Chat' });
    },
  })).current;

  const isVideo = Boolean(file && String(file.type).startsWith('video/'));
  const sponsorValid = sponsorName.trim().length > 0 && /^https?:\/\//i.test(sponsorUrl.trim());

  // Camera roll thumbnails
  useEffect(() => {
    (async () => {
      try {
        if (!(await requestGalleryPermission())) return;
        const page = await CameraRoll.getPhotos({ first: 90, assetType: 'All' });
        setRecents(page.edges.map((e) => ({
          uri: e.node.image.uri,
          name: e.node.image.filename || 'media',
          type: e.node.type || 'image/jpeg',
        })));
      } catch (e) { logError(e); }
    })();
  }, []);

  // Memories: the person's own posts
  useEffect(() => {
    if (tab !== 'Memories') return undefined;
    let active = true;
    api('/v1/users/me/posts').then((d) => { if (active) setMemories(d.items || []); }).catch((e) => { if (active) logError(e); });
    return () => { active = false; };
  }, [tab]);

  // Remix: the source post must allow remixing, and the caption starts with the credit
  useEffect(() => {
    if (!remixId) { setSourcePost(null); return undefined; }
    let active = true;
    api(`/v1/posts/${encodeURIComponent(remixId)}`).then((item) => {
      if (!active) return;
      if (!item.allowRemix) { setSourcePost(null); return; }
      setSourcePost(item);
      setCaption(item.caption ? `Remix of @${item.author?.username || 'creator'}: ` : '');
    }).catch((e) => { if (active) logError(e); });
    return () => { active = false; };
  }, [remixId]);

  // People suggestions for an @mention being typed in the caption
  useEffect(() => {
    if (!mention?.query) { setMentionSuggestions([]); return undefined; }
    let active = true;
    api('/v1/search?q=' + encodeURIComponent(mention.query) + '&type=people')
      .then((result) => { if (active) setMentionSuggestions((result.people || []).slice(0, 5)); })
      .catch(() => { if (active) setMentionSuggestions([]); });
    return () => { active = false; };
  }, [mention?.query]);

  // Opened from the camera with a photo or video already taken: go straight to the editor
  useEffect(() => {
    if (route.params?.captured) choose(fromAsset(route.params.captured));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.captured]);

  function choose(item) {
    setFile(item);
    setPlaying(false);
    setView('editor');
  }

  async function openCamera() {
    const r = await launchCamera({ mediaType: 'mixed', quality: 0.9, videoQuality: 'medium' }).catch(logError);
    const asset = r?.assets?.[0];
    if (asset) choose(fromAsset(asset));
  }

  async function pickFromLibrary() {
    const r = await launchImageLibrary({ mediaType: 'mixed', selectionLimit: 1 }).catch(logError);
    const asset = r?.assets?.[0];
    if (asset) choose(fromAsset(asset));
  }

  function onCaptionChange(value) {
    const next = value.slice(0, maxCaption);
    const caret = Math.min(caretRef.current, next.length);
    setCaption(next);
    const match = next.slice(0, caret).match(/(^|\s)@([a-zA-Z0-9_.]{0,30})$/);
    if (match) setMention({ start: caret - match[2].length - 1, end: caret, query: match[2] });
    else setMention(null);
  }

  function insertMention(person) {
    if (!mention) return;
    const next = caption.slice(0, mention.start) + '@' + person.username + ' ' + caption.slice(mention.end);
    setCaption(next.slice(0, maxCaption));
    setMention(null);
    setMentionSuggestions([]);
  }

  async function saveToDevice() {
    if (!file) return;
    try {
      await CameraRoll.saveAsset(file.uri, { type: isVideo ? 'video' : 'photo' });
      toast('Saved to your phone');
    } catch (e) { logError(e); }
  }

  // Post (asStory false) or My Story (asStory true): uploads in the background, then lands on Rimlight or Stories
  function canPublish(asStory) {
    if (!file) return false;
    if (remixId && !sourcePost) return false;
    if (!asStory && isSponsored && !sponsorValid) return false;
    return true;
  }

  function publish(asStory) {
    if (!canPublish(asStory)) return;
    let sponsor = null;
    if (!asStory && isSponsored) {
      sponsor = { name: sponsorName.trim(), description: sponsorDescription.trim(), cta: sponsorCta.trim() || 'Shop Now', url: sponsorUrl.trim() };
    }
    startUpload({
      toStory: asStory, file, caption: caption.trim(), topic: topic.trim(), aiLabel, allowRemix, visibility,
      sourcePostId: sourcePost?.id, sponsor, shareToStory,
    });
    setCaption(''); setTopic(''); setAiLabel(false); setShareToStory(false);
    setFile(null); setSourcePost(null); setSheetOpen(false); setView('gallery');
    navigation.navigate('Main', { screen: asStory ? 'Stories' : 'Rimlight' });
  }

  if (view === 'gallery') {
    return (
      <View style={[styles.gallery, { paddingTop: insets.top }]} {...swipeResponder.panHandlers}>
        <View style={styles.galleryTop}>
          <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Close" hitSlop={10}><Icon name="chevron-down" size={30} color={colors.text} /></Pressable>
          <Text style={styles.title}>{toStory ? 'Post To Story' : 'Post'}</Text>
          <Pressable onPress={openCamera} accessibilityLabel="Take a photo or video" hitSlop={10}><Icon name="camera" size={26} color={colors.text} /></Pressable>
        </View>
        <View style={styles.tabs}>
          {['Memories', 'Camera Roll'].map((name) => (
            <Pressable key={name} onPress={() => setTab(name)} accessibilityRole="tab" accessibilityState={{ selected: tab === name }}>
              <Text style={[styles.tab, tab === name && styles.tabOn]}>{name}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {tab === 'Camera Roll' ? (
            <>
              <Pressable style={[styles.tile, { width: tileSize, height: tileSize }, styles.pickTile]} onPress={pickFromLibrary} accessibilityLabel="Choose from your phone">
                <Icon name="image" size={30} color={colors.text} />
              </Pressable>
              {recents.map((item) => (
                <Pressable key={item.uri} style={[styles.tile, { width: tileSize, height: tileSize }]} onPress={() => choose(item)} accessibilityLabel="Select this media">
                  {String(item.type).startsWith('video/')
                    ? <Video source={{ uri: item.uri }} style={styles.fill} resizeMode="cover" paused muted />
                    : <Image source={{ uri: item.uri }} style={styles.fill} />}
                </Pressable>
              ))}
            </>
          ) : memories.map((item) => (
            <Pressable key={item.id} style={[styles.tile, { width: tileSize, height: tileSize }]} onPress={() => navigation.navigate('PostDetail', { postId: item.id })} accessibilityLabel="Open this post">
              {item.kind === 'video'
                ? <Video source={{ uri: mediaUrl(item.mediaUrl) }} style={styles.fill} resizeMode="cover" paused muted />
                : <Image source={{ uri: mediaUrl(item.mediaUrl) }} style={styles.fill} />}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  const captionText = caption.trim() ? caption.trim().slice(0, 28) : 'Add a caption';
  return (
    <View style={[styles.editor, { paddingTop: insets.top }]} {...swipeResponder.panHandlers}>
      <View style={styles.editorTop}>
        <Pressable onPress={() => setView('gallery')} accessibilityLabel="Back to gallery" hitSlop={10}><Icon name="x" size={28} color="#fff" /></Pressable>
        <Pressable style={styles.captionPill} onPress={() => setSheetOpen(true)}>
          <Text style={styles.captionText} numberOfLines={1}>{captionText}</Text>
          <Icon name="plus" size={16} color="#fff" />
        </Pressable>
        <View style={styles.spacer} />
      </View>

      <View style={styles.media}>
        {file && (isVideo
          ? <Pressable style={styles.fill} onPress={() => setPlaying((p) => !p)} accessibilityLabel="Preview: tap to play or pause">
            <Video source={{ uri: file.uri }} style={styles.fill} resizeMode="cover" repeat paused={!playing} muted={!soundOn} />
          </Pressable>
          : <Image source={{ uri: file.uri }} style={styles.fill} resizeMode="cover" />)}
        <View style={styles.tools}>
          <Pressable onPress={() => setSheetOpen(true)} accessibilityLabel="Caption and options" style={styles.toolBtn}><Text style={styles.toolT}>T</Text></Pressable>
          {isVideo && (
            <Pressable onPress={() => setSoundOn((on) => !on)} accessibilityLabel={soundOn ? 'Mute' : 'Turn sound on'} style={styles.toolBtn}>
              <Icon name={soundOn ? 'volume-2' : 'volume-x'} size={26} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.bottom}>
        <Pressable style={styles.round} onPress={saveToDevice} accessibilityLabel="Save to your phone"><Download size={24} color="#fff" /></Pressable>
        <Pressable style={[styles.pill, styles.postPill, !canPublish(false) && styles.dim]} onPress={() => publish(false)} disabled={!canPublish(false)}>
          <Text style={styles.postText}>+ Post</Text>
        </Pressable>
        <Pressable style={[styles.pill, styles.storyPill, !canPublish(true) && styles.dim]} onPress={() => publish(true)} disabled={!canPublish(true)}>
          <Text style={styles.storyText}>My Story</Text><Icon name="send" size={20} color="#000" />
        </Pressable>
      </View>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropTap} onPress={() => setSheetOpen(false)} accessibilityLabel="Close" />
          <View style={styles.sheet}>
            <View style={styles.sheetTop}>
              <Text style={styles.sheetTitle}>Caption and options</Text>
              <Pressable onPress={() => setSheetOpen(false)} accessibilityLabel="Done"><Text style={styles.done}>Done</Text></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.captionInput}
                placeholder="Write a caption… add #hashtags and @mentions"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Caption"
                maxLength={maxCaption}
                value={caption}
                onChangeText={onCaptionChange}
                onSelectionChange={(e) => { caretRef.current = e.nativeEvent.selection.start; }}
                multiline
              />
              <Text style={styles.count}>{caption.length}/{maxCaption}</Text>
              {mention && mentionSuggestions.length > 0 && (
                <View style={styles.mentions}>
                  {mentionSuggestions.map((person) => (
                    <Pressable key={person.id} style={styles.mention} onPress={() => insertMention(person)}>
                      <View style={styles.mentionAvatar}><Text style={styles.mentionInitial}>{(person.displayName || person.username || '?').slice(0, 1).toUpperCase()}</Text></View>
                      <View style={styles.mentionText}>
                        <Text style={styles.mentionUser}>{person.username}</Text>
                        {!!person.displayName && <Text style={styles.mentionName}>{person.displayName}</Text>}
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}

              <Row label="Topic">
                <TextInput style={styles.rowInput} value={topic} onChangeText={setTopic} maxLength={60} placeholder="Fashion, comedy, tech…" placeholderTextColor={colors.muted} />
              </Row>
              <Row label="Who can see this">
                <View style={styles.choice}>
                  <Pressable style={[styles.choiceBtn, visibility === 'public' && styles.choiceOn]} onPress={() => setVisibility('public')}><Text style={[styles.choiceText, visibility === 'public' && styles.choiceTextOn]}>Public</Text></Pressable>
                  <Pressable style={[styles.choiceBtn, visibility === 'private' && styles.choiceOn]} onPress={() => setVisibility('private')}><Text style={[styles.choiceText, visibility === 'private' && styles.choiceTextOn]}>Only me</Text></Pressable>
                </View>
              </Row>
              <Row label="Share to story"><Switch value={shareToStory} onValueChange={setShareToStory} /></Row>
              <Row label="Allow remixing"><Switch value={allowRemix} onValueChange={setAllowRemix} /></Row>
              <Row label="AI-generated or AI-altered"><Switch value={aiLabel} onValueChange={setAiLabel} /></Row>
              {visibility === 'public' && <Row label="Paid partnership"><Switch value={isSponsored} onValueChange={setIsSponsored} /></Row>}

              {visibility === 'public' && isSponsored && (
                <View style={styles.sponsor}>
                  <Text style={styles.note}>Disclose a business or paid partner. Your post shows an Ad label.</Text>
                  <Field label="Sponsor or business name" value={sponsorName} onChangeText={setSponsorName} maxLength={100} placeholder="Business name" />
                  <Field label="Short description" value={sponsorDescription} onChangeText={setSponsorDescription} maxLength={200} placeholder="What is being promoted?" />
                  <Text style={styles.fieldLabel}>Call-to-action label</Text>
                  <View style={styles.choice}>
                    {CTA_OPTIONS.map((cta) => (
                      <Pressable key={cta} style={[styles.choiceBtn, sponsorCta === cta && styles.choiceOn]} onPress={() => setSponsorCta(cta)}>
                        <Text style={[styles.choiceText, sponsorCta === cta && styles.choiceTextOn]}>{cta}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Field label="Destination URL" value={sponsorUrl} onChangeText={setSponsorUrl} maxLength={300} placeholder="https://example.com" autoCapitalize="none" keyboardType="url" />
                </View>
              )}

              <Text style={styles.note}>{visibility === 'public' ? 'Your post is visible to everyone.' : 'Only you can see this post.'} Stories are public and disappear after 24 hours.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Row({ label, children }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} placeholderTextColor={colors.muted} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: { flex: 1, backgroundColor: colors.bg, paddingTop: 0 },
  galleryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56, paddingHorizontal: 12 },
  title: { fontSize: 19, fontWeight: '600', color: colors.text },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: 36, paddingVertical: 8 },
  tab: { fontSize: 18, fontWeight: '600', color: '#9a9aa1' },
  tabOn: { color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  tile: { backgroundColor: '#e9e9ee', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  pickTile: { backgroundColor: colors.surface },
  fill: { width: '100%', height: '100%' },

  editor: { flex: 1, backgroundColor: '#000', paddingTop: 0 },
  editorTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52 },
  spacer: { width: 28 },
  captionPill: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '62%', height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: 'rgba(30,30,30,0.72)' },
  captionText: { color: '#fff', fontSize: 16, fontWeight: '600', flexShrink: 1 },
  media: { flex: 1, margin: 12, marginTop: 4, borderRadius: 22, overflow: 'hidden', backgroundColor: '#111' },
  tools: { position: 'absolute', right: 10, top: 16, alignItems: 'center', gap: 18 },
  toolBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  toolT: { color: '#fff', fontSize: 24, fontWeight: '700' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 24 },
  round: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#2b2b2e', alignItems: 'center', justifyContent: 'center' },
  pill: { flex: 1, height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  postPill: { backgroundColor: '#2b2b2e' },
  postText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  storyPill: { backgroundColor: '#fff' },
  storyText: { color: '#000', fontSize: 17, fontWeight: '700' },
  dim: { opacity: 0.6 },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdropTap: { flex: 1 },
  sheet: { maxHeight: '88%', backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  done: { fontSize: 16, fontWeight: '600', color: colors.text },
  captionInput: { minHeight: 90, fontSize: 16, color: colors.text, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12 },
  count: { textAlign: 'right', fontSize: 13, color: '#8a8a8e', marginVertical: 8 },
  mentions: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, marginBottom: 8 },
  mention: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  mentionAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  mentionInitial: { color: colors.text, fontWeight: '600' },
  mentionText: { flex: 1 },
  mentionUser: { color: colors.text, fontWeight: '600' },
  mentionName: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eeeef0' },
  rowLabel: { fontSize: 16, color: colors.text, flexShrink: 1 },
  rowInput: { flex: 1, maxWidth: '60%', fontSize: 16, color: colors.text, textAlign: 'right', padding: 0 },
  choice: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  choiceBtn: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#d9d9de', justifyContent: 'center' },
  choiceOn: { backgroundColor: colors.text, borderColor: colors.text },
  choiceText: { fontSize: 14, color: colors.text },
  choiceTextOn: { color: '#fff' },
  sponsor: { paddingVertical: 8, gap: 10 },
  note: { fontSize: 13, color: '#8a8a8e', marginVertical: 8 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 14, color: colors.muted },
  fieldInput: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
});
