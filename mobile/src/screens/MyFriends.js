import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, SectionList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronDown, Search } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import { api } from '../api';
import { useAppStore } from '../store';
import { logError } from '../lib/toast';
import { colors } from '../theme';

// My Friends, as in the reference: close arrow and title, a "Find friends" search box, and the people you follow
// grouped by their first letter. Opened from the ⋯ button on Add Friends.
function letterOf(person) {
  const name = (person.displayName || person.username || '#').trim();
  const first = name.charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

export default function MyFriends() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const me = useAppStore((s) => s.user);
  const [people, setPeople] = useState(null);
  const [query, setQuery] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!me?.username) return;
    api(`/v1/users/${me.username}/following`)
      .then((d) => setPeople(d.items || []))
      .catch((e) => { logError(e); setPeople([]); });
  }, [me?.username]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = (people || []).filter((p) => `${p.displayName || ''} ${p.username || ''}`.toLowerCase().includes(q));
    const groups = {};
    shown.forEach((p) => { const k = letterOf(p); (groups[k] = groups[k] || []).push(p); });
    return Object.keys(groups).sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))).map((k) => ({ title: k, data: groups[k] }));
  }, [people, query]);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={10} style={styles.icon}><ChevronDown size={26} color={colors.text} /></Pressable>
        <Text style={styles.title}>My Friends</Text>
        <View style={styles.icon} />
      </View>
      <View style={styles.searchBox}>
        <Search size={20} color={colors.muted} />
        <TextInput style={styles.input} placeholder="Find friends" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} autoCapitalize="none" />
      </View>
      <View style={styles.body}>
      <SectionList
        ref={listRef}
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={(p) => String(p.id)}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={styles.letter}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('Profile', { username: item.username })}>
            <Avatar user={item} size={48} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>{item.displayName || item.username}</Text>
              <Text style={styles.handle} numberOfLines={1}>{item.username}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{people === null ? '' : 'No friends yet. Find people on Add Friends.'}</Text>}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />
      <View style={styles.index} pointerEvents="box-none">
        {sections.map((section, sectionIndex) => (
          <Pressable key={section.title} onPress={() => listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, animated: false, viewOffset: 0 })} hitSlop={4}>
            <Text style={styles.indexLetter}>{section.title}</Text>
          </Pressable>
        ))}
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#efefef' },
  input: { flex: 1, fontSize: 16, color: colors.text, padding: 0 },
  letter: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, fontSize: 16, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  handle: { fontSize: 13, color: colors.muted, marginTop: 1 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, paddingHorizontal: 24 },
  body: { flex: 1, flexDirection: 'row' },
  index: { position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  indexLetter: { fontSize: 12, color: colors.text, paddingVertical: 1.5, fontWeight: '600' },
});
