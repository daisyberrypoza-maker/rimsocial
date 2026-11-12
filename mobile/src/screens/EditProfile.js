import React, { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { ArrowLeft } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import { api } from '../api';
import { mediaUrl } from '../config';
import { useAppStore } from '../store';
import { toast, logError } from '../lib/toast';
import { colors } from '../theme';

// Edit profile, the same fields as the web page: name, bio, website and city.
// The picture can be changed from the link under the avatar.
export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const me = useAppStore((s) => s.user);
  const [form, setForm] = useState({ displayName: '', dateOfBirth: '', bio: '', website: '', city: '', gender: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const websiteRef = useRef(null);

  // Current details from the server, so the form always starts from what is saved
  useEffect(() => {
    let active = true;
    api('/v1/users/me')
      .then((u) => {
        if (!active) return;
        setForm({ displayName: u.displayName || '', dateOfBirth: u.dateOfBirth ? String(u.dateOfBirth).slice(0, 10) : '', bio: u.bio || '', website: u.website || '', city: u.city || '', gender: u.gender || '' });
        setLoaded(true);
      })
      .catch((e) => logError(e));
    return () => { active = false; };
  }, []);

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
    } catch (e) { logError(e); }
  }

  const dob = form.dateOfBirth.trim();
  const validDob = !dob || (/^\\d{4}-\\d{2}-\\d{2}$/.test(dob) && !Number.isNaN(Date.parse(dob)) && new Date(dob).toISOString().slice(0, 10) === dob && dob <= new Date().toISOString().slice(0, 10));
  const canSave = loaded && !saving && form.displayName.trim().length > 0 && validDob;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await api('/v1/users/me/profile', { method: 'PUT', body: form });
      const store = useAppStore.getState();
      const updated = { ...(store.user || me), displayName: form.displayName.trim(), dateOfBirth: form.dateOfBirth || null, bio: form.bio.trim(), website: form.website.trim(), city: form.city.trim(), gender: form.gender };
      store.setSession(store.token, updated);
      store.setProfile('me', { user: { ...(store.profiles.me?.user || {}), ...updated }, updatedAt: Date.now() });
      if (updated.username) {
        store.setProfile(updated.username, { user: { ...(store.profiles[updated.username]?.user || {}), ...updated }, updatedAt: Date.now() });
      }
      toast('Profile updated');
      navigation.goBack();
    } catch (e) { logError(e); toast('Could not save. Try again.'); }
    finally { setSaving(false); }
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
        <Text style={styles.title}>Edit profile</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <View style={styles.photo}>
          <Avatar user={avatar ? { avatarUrl: avatar.uri } : me || {}} size={88} />
          <Pressable onPress={pickPhoto} accessibilityLabel="Edit picture or avatar"><Text style={styles.link}>Edit picture or avatar</Text></Pressable>
        </View>
        <Field label="Name" value={form.displayName} onChangeText={set('displayName')} maxLength={64} />
        <Field label="Username" value={me?.username ? `@${me.username}` : ''} editable={false} />
        <Field label="Date of birth" value={form.dateOfBirth} onChangeText={set('dateOfBirth')} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation" counter={dob && !validDob ? "Use a valid date (YYYY-MM-DD)" : undefined} />
        <Field label="Bio" value={form.bio} onChangeText={set('bio')} maxLength={150} multiline counter={`${form.bio.length}/150`} />
        <Pressable style={styles.linksRow} onPress={() => websiteRef.current?.focus()} accessibilityLabel="Links">
          <Text style={styles.linksText}>Links</Text>
          <Text style={styles.linksValue}>{form.website ? 1 : 0}  ›</Text>
        </Pressable>
        <Field inputRef={websiteRef} label="Website" value={form.website} onChangeText={set('website')} maxLength={200} placeholder="yourwebsite.com" autoCapitalize="none" keyboardType="url" />
        <Field label="City" value={form.city} onChangeText={set('city')} maxLength={80} />
        <View style={styles.field}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderRow}>
            {[['', 'Prefer not to say'], ['Female', 'Female'], ['Male', 'Male'], ['Custom', 'Custom']].map(([value, label]) => (
              <Pressable key={label} onPress={() => set('gender')(value)} style={[styles.genderChip, form.gender === value && styles.genderChipOn]} accessibilityState={{ selected: form.gender === value }}>
                <Text style={[styles.genderText, form.gender === value && styles.genderTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Pressable style={[styles.save, !canSave && styles.dim]} onPress={save} disabled={!canSave} accessibilityLabel="Save">
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// Label sits inside the box above the value, as in the reference
function Field({ label, counter, editable = true, inputRef, ...props }) {
  return (
    <View style={[styles.field, !editable && styles.fieldLocked]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={[styles.input, props.multiline && styles.multiline, !editable && styles.lockedText]}
        placeholderTextColor={colors.muted}
        editable={editable}
        {...props}
      />
      {!!counter && <Text style={styles.counter}>{counter}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  spacer: { width: 22 },
  title: { flex: 1, fontSize: 24, fontWeight: '700', color: colors.text },
  form: { paddingHorizontal: 16, paddingVertical: 18, gap: 12 },
  photo: { alignItems: 'center', gap: 10, marginBottom: 8 },
  link: { color: '#0095f6', fontWeight: '600', fontSize: 15 },
  field: { borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 16, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, minHeight: 60 },
  fieldLocked: { backgroundColor: '#fff' },
  label: { fontSize: 14, color: '#737373', fontWeight: '400' },
  input: { fontSize: 17, color: colors.text, padding: 0, marginTop: 2 },
  lockedText: { color: colors.text },
  multiline: { minHeight: 44, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: '#8a8a94' },
  save: { height: 48, borderRadius: 12, backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dim: { opacity: 0.5 },
  linksRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2 },
  linksText: { fontSize: 17, color: colors.text },
  linksValue: { fontSize: 17, color: colors.muted },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  genderChip: { borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  genderChipOn: { backgroundColor: '#e8eefc', borderColor: '#0095f6' },
  genderText: { fontSize: 14, color: colors.text },
  genderTextOn: { color: '#0095f6', fontWeight: '600' },
});
