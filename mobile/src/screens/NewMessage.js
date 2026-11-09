import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
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
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setPeople([]); setSearching(false); return undefined; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api(`/v1/search?q=${encodeURIComponent(q)}&type=people`)
        .then((data) => { if (alive) setPeople((data.people || []).filter((person) => String(person.id) !== String(me?.id))); })
        .catch(() => { if (alive) setPeople([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, me?.id]);

  let body;
  if (!query.trim()) body = <Text style={styles.empty}>Search for someone to message.</Text>;
  else if (people.length) {
    body = (
      <FlatList
        data={people}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('Conversation', { userId: item.id, user: item })}>
            <Avatar user={item} size={48} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>{item.displayName || item.username}</Text>
              <Text style={styles.handle} numberOfLines={1}>@{item.username}</Text>
            </View>
          </Pressable>
        )}
      />
    );
  } else if (!searching) body = <Text style={styles.empty}>No one found.</Text>;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={26} /></Pressable>
        <Text style={styles.title}>New message</Text>
        <View style={styles.spacer} />
      </View>
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
});
