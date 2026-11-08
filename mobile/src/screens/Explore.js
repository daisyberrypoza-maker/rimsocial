import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { logError } from '../lib/toast';
import { colors } from '../theme';

// Search people and posts. From the Friends button it opens on suggested people.
export default function Explore() {
  const navigation = useNavigation();
  const route = useRoute();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState([]);
  const [suggested, setSuggested] = useState([]);

  useEffect(() => {
    api('/v1/users/suggestions').then((d) => setSuggested(d.items || [])).catch(logError);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setPeople([]); return undefined; }
    const timer = setTimeout(() => {
      api(`/v1/search?type=people&q=${encodeURIComponent(term)}`).then((d) => setPeople(d.people || [])).catch(logError);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const list = q.trim() ? people : suggested;
  return (
    <View style={styles.page}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={24} /></Pressable>
        <TextInput style={styles.input} placeholder="Search" placeholderTextColor={colors.muted} value={q} onChangeText={setQ} autoCapitalize="none" autoFocus={Boolean(route.params?.search)} />
      </View>
      <Text style={styles.section}>{q.trim() ? 'People' : route.params?.friends ? 'Find friends' : 'Suggested'}</Text>
      <FlatList
        data={list}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('Profile', { username: item.username })}>
            <Avatar user={item} size={44} />
            <View style={styles.text}>
              <Text style={styles.name}>{item.displayName || item.username}</Text>
              <Text style={styles.handle}>@{item.username}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.text },
  section: { paddingHorizontal: 16, paddingVertical: 8, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  text: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  handle: { fontSize: 14, color: colors.muted },
});
