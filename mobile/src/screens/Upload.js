import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, TextInput, StyleSheet, PermissionsAndroid, Platform, useWindowDimensions, Switch } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { launchCamera } from 'react-native-image-picker';
import Video from 'react-native-video';
import Icon from '../components/Icon';
import { startUpload } from '../lib/uploader';
import { toast, logError } from '../lib/toast';
import { colors } from '../theme';

// Permission to read the phone's photos and videos (Android 13+ uses the media permissions)
async function requestGalleryPermission() {
  if (Platform.OS !== 'android') return true;
  const perms = Platform.Version >= 33
    ? [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES, PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO]
    : [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
  const result = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

// Add screen (full-screen): pick from the phone gallery or camera, preview, then caption and post or story.
// Story mode comes from the Stories screen (route.params.story). Upload runs in the background.
export default function Upload() {
  const navigation = useNavigation();
  const route = useRoute();
  const toStory = Boolean(route.params?.story);
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [caption, setCaption] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [shareToStory, setShareToStory] = useState(false);
  const [aiLabel, setAiLabel] = useState(false);
  const [allowRemix, setAllowRemix] = useState(true);
  const [denied, setDenied] = useState(false);
  const [step, setStep] = useState('gallery'); // 'gallery' | 'details'

  useEffect(() => {
    (async () => {
      try {
        if (!(await requestGalleryPermission())) { setDenied(true); return; }
        const page = await CameraRoll.getPhotos({ first: 90, assetType: 'All' });
        const items = page.edges.map((e) => ({
          uri: e.node.image.uri,
          name: e.node.image.filename || 'media',
          type: e.node.type || 'image/jpeg',
        }));
        setPhotos(items);
        if (items[0]) setChosen(items[0]);
      } catch (e) { logError(e); setDenied(true); }
    })();
  }, []);

  async function openCamera() {
    const r = await launchCamera({ mediaType: 'mixed', quality: 0.9, videoQuality: 'medium' }).catch(logError);
    const asset = r?.assets?.[0];
    if (asset) { setChosen({ uri: asset.uri, name: asset.fileName || 'capture', type: asset.type || 'image/jpeg' }); setStep('details'); }
  }

  function publish() {
    if (!chosen) return;
    startUpload({
      toStory,
      file: chosen,
      caption: caption.trim(),
      topic: '',
      aiLabel,
      allowRemix,
      visibility: isPublic ? 'public' : 'private',
      shareToStory: !toStory && shareToStory,
    });
    toast(toStory ? 'Posting your story…' : 'Posting…');
    // Land on the screen the item will appear on, with the spinner showing there
    navigation.navigate('Main', { screen: toStory ? 'Stories' : 'Rimlight' });
  }

  const isVideo = chosen && String(chosen.type).startsWith('video/');

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Pressable onPress={() => (step === 'details' ? setStep('gallery') : navigation.goBack())} accessibilityLabel="Close"><Icon name="x" size={26} color={colors.text} /></Pressable>
        <Text style={styles.title}>{toStory ? 'New story' : 'New post'}</Text>
        {step === 'details'
          ? <Pressable onPress={publish} accessibilityLabel={toStory ? 'Share story' : 'Post'}><Text style={styles.action}>{toStory ? 'Share' : 'Post'}</Text></Pressable>
          : <Pressable onPress={() => chosen && setStep('details')} accessibilityLabel="Next"><Text style={styles.action}>Next</Text></Pressable>}
      </View>

      {step === 'gallery' && (
        <>
          {chosen && (
            <View style={[styles.preview, { width, height: width * 1.1 }]}>
              {String(chosen.type).startsWith('video/')
                ? <Video source={{ uri: chosen.uri }} style={styles.fill} resizeMode="contain" paused muted />
                : <Image source={{ uri: chosen.uri }} style={styles.fill} resizeMode="contain" />}
            </View>
          )}
          <View style={styles.galleryHead}>
            <Text style={styles.sub}>Camera roll</Text>
            <Pressable onPress={openCamera} style={styles.cameraBtn} accessibilityLabel="Open camera"><Icon name="camera" size={20} color={colors.text} /><Text style={styles.cameraText}>Camera</Text></Pressable>
          </View>
          {denied && <Text style={styles.note}>Allow photo and video access in Settings to see your phone gallery.</Text>}
          <ScrollView contentContainerStyle={styles.grid}>
            {photos.map((item) => (
              <Pressable key={item.uri} style={[styles.thumb, { width: (width - 4) / 4 }]} onPress={() => setChosen(item)} accessibilityLabel="Select">
                <Image source={{ uri: item.uri }} style={styles.fill} />
                {String(item.type).startsWith('video/') && <View style={styles.videoBadge}><Icon name="video" size={12} color="#fff" /></View>}
                {chosen?.uri === item.uri && <View style={styles.selected} />}
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {step === 'details' && chosen && (
        <ScrollView contentContainerStyle={styles.details}>
          <Image source={{ uri: chosen.uri }} style={styles.thumbLarge} resizeMode="cover" />
          {isVideo && <Text style={styles.note}>Video is shown as picked. Long clips are trimmed when a native trim module is installed.</Text>}
          <TextInput style={styles.caption} placeholder="Write a caption…" placeholderTextColor={colors.muted} value={caption} onChangeText={setCaption} multiline maxLength={2200} />
          <Row label="Public" value={isPublic} onChange={setIsPublic} />
          {!toStory && <Row label="Share to my story" value={shareToStory} onChange={setShareToStory} />}
          {!toStory && <Row label="Allow remix" value={allowRemix} onChange={setAllowRemix} />}
          <Row label="AI-generated label" value={aiLabel} onChange={setAiLabel} />
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, value, onChange }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  action: { fontSize: 16, fontWeight: '700', color: colors.unseen },
  preview: { backgroundColor: '#000' },
  fill: { width: '100%', height: '100%' },
  galleryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  sub: { fontSize: 15, fontWeight: '600', color: colors.text },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  cameraText: { color: colors.text, fontWeight: '600' },
  note: { paddingHorizontal: 14, color: colors.muted, fontSize: 13, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  thumb: { aspectRatio: 1, backgroundColor: colors.surface },
  videoBadge: { position: 'absolute', right: 4, bottom: 4 },
  selected: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: colors.unseen },
  details: { padding: 14, gap: 14 },
  thumbLarge: { width: 96, height: 128, borderRadius: 10 },
  caption: { minHeight: 90, fontSize: 16, color: colors.text, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
  rowLabel: { fontSize: 16, color: colors.text },
});
