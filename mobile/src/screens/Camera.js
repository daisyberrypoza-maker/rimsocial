import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, PermissionsAndroid, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { launchCamera } from 'react-native-image-picker';
import Icon from '../components/Icon';
import { logError } from '../lib/toast';

// Add tab. Matches the Snapchat camera layout: top row and a bottom bar with the shutter and the latest photo.
// There is no live preview here (that needs a camera library); the shutter opens the phone's camera and the
// captured photo or video goes straight into the Upload editor.
async function requestGalleryPermission() {
  if (Platform.OS !== 'android') return true;
  const perms = Platform.Version >= 33
    ? [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES, PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO]
    : [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
  const result = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

export default function Camera() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        if (!(await requestGalleryPermission())) return;
        const page = await CameraRoll.getPhotos({ first: 1, assetType: 'All' });
        setLatest(page.edges[0]?.node.image.uri || null);
      } catch (e) { logError(e); }
    })();
  }, []);

  async function shoot() {
    const r = await launchCamera({ mediaType: 'mixed', quality: 0.9, videoQuality: 'medium' }).catch(logError);
    const asset = r?.assets?.[0];
    if (asset) navigation.navigate('Upload', { captured: asset });
  }

  return (
    <View style={styles.page}>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.navigate('Explore')} accessibilityLabel="Search" hitSlop={10} style={styles.topBtn}><Icon name="search" size={24} color="#fff" /></Pressable>
        <Text style={styles.title}>Camera</Text>
        <View style={styles.topRight}>
          <Pressable onPress={() => navigation.navigate('Activity')} accessibilityLabel="Notifications" hitSlop={10} style={styles.topBtn}><Icon name="bell" size={24} color="#fff" /></Pressable>
          <Pressable onPress={() => navigation.navigate('Explore')} accessibilityLabel="Add friends" hitSlop={10} style={styles.topBtn}><Icon name="user-plus" size={24} color="#fff" /></Pressable>
        </View>
      </View>

      <View style={styles.viewfinder} />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.side} />
        <Pressable onPress={shoot} accessibilityLabel="Take a photo or video" style={styles.shutter}><View style={styles.shutterInner} /></Pressable>
        <Pressable onPress={() => navigation.navigate('Upload')} accessibilityLabel="Choose from your gallery" style={styles.side}>
          {latest ? <Image source={{ uri: latest }} style={styles.thumb} /> : <View style={styles.thumb} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  topBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topRight: { flexDirection: 'row', gap: 4 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  viewfinder: { flex: 1, backgroundColor: '#0b0b0b' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 40, paddingTop: 16 },
  side: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 48, height: 48, borderRadius: 10, borderWidth: 2, borderColor: '#fff', backgroundColor: '#222' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
});
