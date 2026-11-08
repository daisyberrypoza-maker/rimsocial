import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { mediaUrl } from '../config';
import { useAppStore } from '../store';
import { toast, logError } from '../lib/toast';
import { colors } from '../theme';

// Edit name, bio, website and city, and change the profile photo
export default function EditProfile() {
  const navigation = useNavigation();
  const me = useAppStore((s) => s.user);
  const [form, setForm] = useState({ displayName: me?.displayName || '', bio: me?.bio || '', website: me?.website || '', city: me?.city || '' });
  const [avatar, setAvatar] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  async function pickPhoto() {
    const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 }).catch(logError);
    const asset = r?.assets?.[0];
    if (!asset) return;
    setAvatar(asset);
    const fd = new FormData();
    fd.append('media', { uri: asset.uri, name: asset.fileName || 'avatar.jpg', type: asset.type || 'image/jpeg' });
    try {
      // The chosen photo already shows above. The saved one is loaded first, then every screen that shows it is updated at once.
      const { avatarUrl } = await api('/v1/users/me/avatar', { method: 'POST', body: fd });
      await Image.prefetch(mediaUrl(avatarUrl)).catch(() => {});
      const store = useAppStore.getState();
      const updated = { ...(store.user || me), avatarUrl };
      store.setSession(store.token, updated);
      if (updated.username) {
        store.setProfile(updated.username, { user: { ...(store.profiles[updated.username]?.user || {}), avatarUrl }, updatedAt: Date.now() });
      }
      store.setProfile('me', { user: { ...(store.profiles.me?.user || {}), avatarUrl }, updatedAt: Date.now() });
      toast('Profile photo updated');
    } catch (e) { logError(e); toast('Could not update the photo'); }
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api('/v1/users/me/profile', { method: 'PUT', body: form });
      useAppStore.getState().setSession(useAppStore.getState().token, { ...me, ...updated });
      toast('Profile saved');
      navigation.goBack();
    } catch (e) { logError(e); toast(e.message || 'Could not save'); }
    finally { setSaving(false); }
  }

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Close"><Icon name="x" size={24} /></Pressable>
        <Text style={styles.title}>Edit profile</Text>
        <Pressable onPress={save} disabled={saving} accessibilityLabel="Save"><Text style={styles.save}>{saving ? '…' : 'Save'}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable style={styles.photo} onPress={pickPhoto} accessibilityLabel="Change profile photo">
          <Avatar user={avatar ? { avatarUrl: avatar.uri } : me || {}} size={96} />
          <Text style={styles.change}>Change photo</Text>
        </Pressable>
        <Field label="Name" value={form.displayName} onChangeText={set('displayName')} maxLength={64} />
        <Field label="Bio" value={form.bio} onChangeText={set('bio')} maxLength={150} multiline />
        <Field label="Website" value={form.website} onChangeText={set('website')} autoCapitalize="none" />
        <Field label="City" value={form.city} onChangeText={set('city')} />
      </ScrollView>
    </View>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, props.multiline && { minHeight: 70, textAlignVertical: 'top' }]} placeholderTextColor={colors.muted} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  save: { fontSize: 16, fontWeight: '700', color: colors.unseen },
  body: { padding: 16, gap: 14 },
  photo: { alignItems: 'center', gap: 8, marginBottom: 8 },
  change: { color: colors.unseen, fontWeight: '600' },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.text },
});
