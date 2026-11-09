import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Search, ChevronRight } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import { api } from '../api';
import { logError } from '../lib/toast';
import { formatCount } from '../lib/format';
import { mediaUrl } from '../config';
import { colors } from '../theme';

// Search tab, as in the reference: search box with Cancel, then Find Friends (with View More),
// Follow a Snap Star (creators to add) and Watch a show (trending videos). Typing shows matching people and hashtags.
export default function SearchHome() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [suggest, setSuggest] = useState({ suggested: [], followBack: [] });
  const [watch, setWatch] = useState([]);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState({});

  useEffect(() => {
    api('/v1/users/suggestions').then(setSuggest).catch(logError);
    api('/v1/feed/explore').then((d) => setWatch((d.items || []).slice(0, 12))).catch(logError);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return undefined; }
    const timer = setTimeout(() => {
      api(`/v1/search?q=${encodeURIComponent(q)}&type=all`).then(setResults).catch(logError);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function toggleFollow(person, update) {
    if (busy[person.id]) return;
    setBusy((b) => ({ ...b, [person.id]: true }));
    try {
      const r = await api(`/v1/users/${person.id}/follow`, { method: person.isFollowing ? 'DELETE' : 'POST' });
      const apply = (p) => (p.id === person.id ? { ...p, isFollowing: r.isFollowing, followerCount: r.followerCount } : p);
      update(apply);
    } catch (e) { logError(e); }
    finally { setBusy((b) => ({ ...b, [person.id]: false })); }
  }

  const followSuggested = (apply) => setSuggest((c) => ({ suggested: c.suggested.map(apply), followBack: c.followBack.map(apply) }));
  const followResults = (apply) => setResults((c) => (c ? { ...c, people: (c.people || []).map(apply) } : c));

  const notFollowing = suggest.suggested.filter((p) => !p.isFollowing);
  const creators = [...suggest.suggested].sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0)).slice(0, 10);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.field}>
          <Search size={20} color={colors.muted} />
          <TextInput style={styles.input} placeholder="Search" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} autoCapitalize="none" returnKeyType="search" />
        </View>
        {query.length > 0 && <Pressable onPress={() => setQuery('')} accessibilityLabel="Cancel search"><Text style={styles.cancel}>Cancel</Text></Pressable>}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }} keyboardShouldPersistTaps="handled">
        {results ? (
          <View style={styles.section}>
            {(results.people || []).map((person) => (
              <View key={`p-${person.id}`} style={styles.row}>
                <Pressable style={styles.main} onPress={() => navigation.navigate('Profile', { username: person.username })}>
                  <Avatar user={person} size={48} />
                  <View style={styles.text}><Text style={styles.name} numberOfLines={1}>{person.displayName || person.username}</Text><Text style={styles.handle} numberOfLines={1}>{person.username} · {formatCount(person.followerCount)} followers</Text></View>
                </Pressable>
                <Pressable style={[styles.add, person.isFollowing && styles.added]} onPress={() => toggleFollow(person, followResults)} disabled={busy[person.id]}>
                  <Text style={styles.addText}>{person.isFollowing ? 'Added' : '+ Add'}</Text>
                </Pressable>
              </View>
            ))}
            {(results.hashtags || []).map((tag) => (
              <Pressable key={`t-${tag.name || tag}`} style={styles.row} onPress={() => navigation.navigate('SearchTag', { tag: tag.name || tag })}>
                <Text style={styles.name}>#{tag.name || tag}</Text>
              </Pressable>
            ))}
            {!(results.people || []).length && !(results.hashtags || []).length && <Text style={styles.empty}>No results. Try another name or hashtag.</Text>}
          </View>
        ) : (
          <>
            <View style={styles.headRow}>
              <Text style={styles.h2}>Find Friends</Text>
              <Pressable onPress={() => navigation.navigate('Explore')} style={styles.viewMore} accessibilityLabel="View more friends"><Text style={styles.viewMoreText}>View More</Text><ChevronRight size={16} color={colors.muted} /></Pressable>
            </View>
            {notFollowing.slice(0, 3).map((person) => (
              <View key={`f-${person.id}`} style={styles.row}>
                <Pressable style={styles.main} onPress={() => navigation.navigate('Profile', { username: person.username })}>
                  <Avatar user={person} size={48} />
                  <View style={styles.text}><Text style={styles.name} numberOfLines={1}>{person.displayName || person.username}</Text><Text style={styles.handle} numberOfLines={1}>{person.username}</Text></View>
                </Pressable>
                <Pressable style={styles.add} onPress={() => toggleFollow(person, followSuggested)} disabled={busy[person.id]}>
                  <Text style={styles.addText}>+ Add</Text>
                </Pressable>
              </View>
            ))}

            {creators.length > 0 && (
              <>
                <Text style={styles.h2}>Follow a Snap Star</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                  {creators.map((person) => (
                    <View key={`c-${person.id}`} style={styles.card}>
                      <Avatar user={person} size={84} />
                      <Text style={styles.cardName} numberOfLines={1}>{person.displayName || person.username}</Text>
                      <Pressable style={[styles.cardAdd, person.isFollowing && styles.added]} onPress={() => toggleFollow(person, followSuggested)} disabled={busy[person.id]}>
                        <Text style={styles.addText}>{person.isFollowing ? 'Added' : '+ Add'}</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            {watch.length > 0 && (
              <>
                <Text style={styles.h2}>Watch a show</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                  {watch.map((post) => (
                    <Pressable key={`w-${post.id}`} style={styles.tile} onPress={() => navigation.navigate('ExploreWatch', { postId: post.id })}>
                      <Image source={{ uri: mediaUrl(post.thumbUrl || post.mediaUrl) }} style={styles.fill} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#efefef' },
  input: { flex: 1, fontSize: 16, color: colors.text, padding: 0 },
  cancel: { fontSize: 16, fontWeight: '600', color: colors.text },
  section: { paddingBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.text, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  viewMore: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewMoreText: { fontSize: 15, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  handle: { fontSize: 13, color: colors.muted, marginTop: 1 },
  add: { minWidth: 88, height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fffc00', alignItems: 'center', justifyContent: 'center' },
  added: { backgroundColor: '#f0f0f2' },
  addText: { fontSize: 15, fontWeight: '700', color: colors.text },
  strip: { paddingHorizontal: 16, gap: 12 },
  card: { width: 140, alignItems: 'center', gap: 6, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e2e2e2' },
  cardName: { fontSize: 15, fontWeight: '600', color: colors.text, maxWidth: 120 },
  cardAdd: { width: '100%', height: 34, borderRadius: 999, backgroundColor: '#fffc00', alignItems: 'center', justifyContent: 'center' },
  tile: { width: 120, height: 180, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f2f2f2' },
  fill: { width: '100%', height: '100%' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, paddingHorizontal: 24 },
});
