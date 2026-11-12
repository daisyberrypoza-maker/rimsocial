import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { useAppStore } from '../store';
import { colors } from '../theme';

const GREY = '#8e8e93';

// New message: search people, then open a conversation with them.
export default function NewMessage() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const me = useAppStore((s) => s.user);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [recents, setRecents] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!me?.username) return undefined;
    let alive = true;
    Promise.allSettled([
      api('/v1/messages/conversations'),
      api(`/v1/users/${encodeURIComponent(me.username)}/following`),
      api(`/v1/users/${encodeURIComponent(me.username)}/followers`),
    ]).then((results) => {
      if (!alive) return;
      const ordered = new Map();
      if (results[0].status === 'fulfilled') (results[0].value.items || []).forEach((row) => { if (row.user) ordered.set(String(row.user.id), row.user); });
      results.slice(1).forEach((result) => { if (result.status === 'fulfilled') (result.value.items || []).forEach((person) => ordered.set(String(person.id), { ...(ordered.get(String(person.id)) || {}), ...person })); });
      const rows = [...ordered.values()].filter((person) => String(person.id) !== String(me.id));
      setRecents(rows);
    }).catch(() => {});
    return () => { alive = false; };
  }, [me?.id, me?.username]);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setPeople(recents); setSearching(false); return undefined; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api(`/v1/search?q=${encodeURIComponent(q)}&type=people`)
        .then((data) => { if (alive) setPeople((data.people || []).filter((person) => String(person.id) !== String(me?.id))); })
        .catch(() => { if (alive) setPeople([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, me?.id, recents]);

  const toggle = (person) => setSelected((current) => current.some((row) => row.id === person.id) ? current.filter((row) => row.id !== person.id) : [...current, person]);
  async function startChat() {
    if (!selected.length || creating) return;
    if (selected.length > 1) {
      setCreating(true);
      try {
        const result = await api('/v1/messages/groups', { method: 'POST', body: { memberIds: selected.map((person) => person.id), name: groupName.trim() } });
        navigation.replace('GroupConversation', { groupId: result.group.id });
      } catch (error) { Alert.alert('RimSocial', error.message || 'Could not create group'); }
      finally { setCreating(false); }
      return;
    }
    navigation.navigate('Conversation', { userId: selected[0].id, user: selected[0] });
  }

  let body;
  if (people.length) {
    body = (
      <FlatList
        data={people}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => toggle(item)}>
            <Avatar user={item} size={48} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>{item.displayName || item.username}</Text>
              <Text style={styles.handle} numberOfLines={1}>@{item.username}</Text>
            </View>
            <View style={[styles.selectDot, selected.some((person) => person.id === item.id) && styles.selectDotOn]}>{selected.some((person) => person.id === item.id) && <Text style={styles.selectTick}>✓</Text>}</View>
          </Pressable>
        )}
      />
    );
  } else if (!searching) body = <Text style={styles.empty}>{query.trim() ? 'No one found.' : 'Search for someone or choose a recent contact.'}</Text>;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={26} /></Pressable>
        <Text style={styles.title}>New message</Text>
        <View style={styles.spacer} />
      </View>
      {!!selected.length && <View style={styles.selected}><Text style={styles.selectedLabel}>{selected.length} selected</Text>{selected.map((person) => <Pressable key={person.id} onPress={() => toggle(person)} style={styles.selectedChip}><Text style={styles.selectedChipText}>{person.displayName || person.username} ×</Text></Pressable>)}</View>}
      {selected.length > 1 && <TextInput style={styles.groupName} value={groupName} onChangeText={setGroupName} placeholder="Group name (optional)" placeholderTextColor={GREY} maxLength={80} />}
      <View style={styles.to}>
        <Text style={styles.toLabel}>To:</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={GREY}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search people"
        />
      </View>
      {body}
      <View style={styles.footer}><Pressable onPress={startChat} disabled={!selected.length || creating} style={[styles.start, (!selected.length || creating) && styles.startDisabled]}><Text style={styles.startText}>{creating ? 'Creating…' : selected.length > 1 ? 'Create group' : 'Chat'}</Text></Pressable></View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 0 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  spacer: { width: 26 },
  to: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#efefef' },
  toLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  handle: { fontSize: 14, color: GREY },
  empty: { textAlign: 'center', color: GREY, fontSize: 15, paddingVertical: 40, paddingHorizontal: 24 },
  selected: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  selectedLabel: { fontSize: 12, color: GREY, marginRight: 4 },
  selectedChip: { backgroundColor: '#e8f3ff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  selectedChipText: { color: '#0878d1', fontSize: 12, fontWeight: '600' },
  groupName: { marginHorizontal: 14, marginVertical: 6, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.text },
  selectDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#bdbdbd', alignItems: 'center', justifyContent: 'center' },
  selectDotOn: { backgroundColor: '#0095f6', borderColor: '#0095f6' },
  selectTick: { color: '#fff', fontWeight: '700', fontSize: 13 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: '#eee' },
  start: { height: 46, borderRadius: 12, backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center' },
  startDisabled: { opacity: 0.4 },
  startText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
