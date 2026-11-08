import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { logError } from '../lib/toast';
import { colors } from '../theme';

// Pick someone to message: search by name or username
export default function NewMessage() {
  const navigation = useNavigation();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState([]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setPeople([]); return undefined; }
    const timer = setTimeout(() => {
      api(`/v1/search?type=people&q=${encodeURIComponent(term)}`)
        .then((d) => setPeople(d.people || []))
        .catch(logError);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <View style={styles.page}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={24} /></Pressable>
        <TextInput style={styles.input} placeholder="Search people" placeholderTextColor={colors.muted} value={q} onChangeText={setQ} autoFocus autoCapitalize="none" />
      </View>
      <FlatList
        data={people}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.replace('Conversation', { userId: item.id, user: item })}>
            <Avatar user={item} size={44} />
            <View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  handle: { fontSize: 14, color: colors.muted },
});
