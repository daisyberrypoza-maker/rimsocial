import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, TextInput, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '../components/Icon';
import { colors } from '../theme';

// Mirrors the web "Your algorithm" page: topics the viewer wants more or less of.
// Stored on this device only (same key as the web app).
const KEY = 'rimsocial.algorithm';
const EMPTY = { more: [], less: [] };
const BRAND = '#4b5cff'; // web --brand

async function loadPrefs() {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    if (value && Array.isArray(value.more) && Array.isArray(value.less)) return value;
  } catch { /* storage unavailable: start empty */ }
  return EMPTY;
}

function savePrefs(value) {
  AsyncStorage.setItem(KEY, JSON.stringify(value)).catch(() => { /* storage unavailable */ });
}

export default function Algorithm() {
  const navigation = useNavigation();
  const [prefs, setPrefs] = useState(EMPTY);
  const [adding, setAdding] = useState(null); // 'more' or 'less' while the topic box is open
  const [draft, setDraft] = useState('');

  useEffect(() => { loadPrefs().then(setPrefs); }, []);

  const update = (next) => { setPrefs(next); savePrefs(next); };

  function submitTopic() {
    const list = adding;
    const name = draft.trim().slice(0, 40);
    setAdding(null);
    setDraft('');
    if (!list || !name || prefs.more.includes(name) || prefs.less.includes(name)) return;
    update({ ...prefs, [list]: [...prefs[list], name] });
  }

  const removeTopic = (list, name) => update({ ...prefs, [list]: prefs[list].filter((item) => item !== name) });

  function resetAll() {
    Alert.alert('Clear all your algorithm choices?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => update(EMPTY) },
    ]);
  }

  function section(list, title, hint) {
    return (
      <View style={styles.section}>
        <Text style={styles.h2}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>
        <View style={styles.chips}>
          {prefs[list].map((name) => (
            <Pressable key={name} style={styles.chipFilled} onPress={() => removeTopic(list, name)} accessibilityLabel={`Remove ${name}`}>
              <Text style={styles.chipFilledText}>{name}</Text>
              <Icon name="x" size={14} color="#fff" />
            </Pressable>
          ))}
          <Pressable style={styles.chipOutline} onPress={() => { setDraft(''); setAdding(list); }}>
            <Text style={styles.plus}>+</Text>
            <Text style={styles.chipOutlineText}>Add</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={10}>
          <Icon name="arrow-left" size={26} />
        </Pressable>
        <Text style={styles.h1}>Your algorithm</Text>
        <Pressable onPress={resetAll} accessibilityLabel="Clear all choices" hitSlop={10}>
          <Icon name="more-vertical" size={24} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.summary}>Choose what you want more or less of in Rimlight.</Text>
        {section('more', 'What you want to see more of', 'Topics you add here are shown more often in Rimlight.')}
        {section('less', 'What you want to see less of', 'Topics you add here are shown less often in Rimlight.')}
      </ScrollView>

      <Modal visible={Boolean(adding)} transparent animationType="fade" onRequestClose={() => setAdding(null)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{adding === 'more' ? 'Topic you want to see more of' : 'Topic you want to see less of'}</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              maxLength={40}
              autoFocus
              onSubmitEditing={submitTopic}
              returnKeyType="done"
              style={styles.input}
              accessibilityLabel="Topic"
            />
            <View style={styles.dialogActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setAdding(null)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={submitTopic}>
                <Text style={styles.primaryText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  h1: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  summary: { color: colors.muted, fontSize: 15, marginBottom: 8 },
  section: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line },
  h2: { fontSize: 17, fontWeight: '800', color: colors.text },
  hint: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipFilled: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  chipFilledText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  chipOutline: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  plus: { fontSize: 16, fontWeight: '700', color: colors.text },
  chipOutlineText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.bg, borderRadius: 16, padding: 18 },
  dialogTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  primaryBtn: { backgroundColor: BRAND, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  primaryText: { color: '#fff', fontWeight: '700' },
  ghostBtn: { backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.line },
  ghostText: { color: colors.text, fontWeight: '700' },
});
