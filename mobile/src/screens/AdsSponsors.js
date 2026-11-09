import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Megaphone, ShieldCheck } from 'lucide-react-native';
import { api } from '../api';
import { useAppStore } from '../store';
import { logError } from '../lib/toast';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import { colors } from '../theme';

// Mirrors the web Ads & Sponsors page: the signed-in creator's posts that carry the paid partnership label.
const BRAND = '#4b5cff'; // web --brand

export default function AdsSponsors() {
  const navigation = useNavigation();
  const user = useAppStore((s) => s.user);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.username) { setLoading(false); setRefreshing(false); return; }
    try {
      const result = await api(`/v1/users/${encodeURIComponent(user.username)}/posts`);
      setPosts((result.items || []).filter((post) => post.isSponsored));
    } catch (e) { logError(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.username]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.hero}>
          <View style={styles.backRow}>
            <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={10}>
              <Icon name="arrow-left" size={21} />
            </Pressable>
            <Text style={styles.eyebrow}>CREATOR TOOLS</Text>
          </View>
          <Text style={styles.h1}>Ads &amp; Sponsors</Text>
          <Text style={styles.lead}>Manage sponsored posts and keep paid partnerships clearly disclosed to your audience.</Text>
          <Pressable style={styles.createBtn} onPress={() => navigation.navigate('Upload')}>
            <Icon name="plus" size={18} color="#fff" />
            <Text style={styles.createText}>Create sponsored post</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.h2}>Your sponsored posts</Text>
          <Text style={styles.lead}>Only posts you published with the paid partnership label appear here.</Text>
          <Pressable style={styles.ghostBtn} onPress={() => { setRefreshing(true); load(); }} disabled={refreshing}>
            <Icon name="refresh" size={16} />
            <Text style={styles.ghostText}>Refresh</Text>
          </Pressable>
        </View>

        {loading ? null : posts.length ? (
          <View style={styles.list}>
            {posts.map((post) => (
              <View style={styles.card} key={post.id}>
                <Avatar user={post.author || user} size={42} />
                <View style={styles.main}>
                  <View style={styles.titleRow}>
                    <Text style={styles.sponsor} numberOfLines={1}>{post.sponsorName || 'Sponsored post'}</Text>
                    <Text style={styles.adLabel}>Ad</Text>
                  </View>
                  <Text style={styles.desc}>{post.sponsorDescription || post.caption || 'Paid partnership'}</Text>
                  <Text style={styles.small} numberOfLines={1}>{post.sponsorCta || 'Shop Now'}{post.sponsorUrl ? ' · ' + post.sponsorUrl : ''}</Text>
                </View>
                <Pressable onPress={() => navigation.navigate('PostDetail', { postId: post.id })} accessibilityLabel="View sponsored post" hitSlop={8}>
                  <Icon name="chevron" size={20} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Megaphone size={28} color={colors.text} /></View>
            <Text style={styles.h3}>No sponsored posts yet</Text>
            <Text style={styles.lead}>When you publish a post with the paid partnership disclosure, it will appear here. RimSocial does not mark a post as sponsored without your explicit choice.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('Upload')}>
              <Text style={styles.primaryText}>Create a sponsored post</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.disclosure}>
          <ShieldCheck size={22} color={colors.text} />
          <View style={styles.disclosureText}>
            <Text style={styles.h3}>Keep partnerships transparent</Text>
            <Text style={styles.lead}>Use the paid partnership option only when a brand or business has sponsored or paid for the promotion. Add an accurate sponsor name and destination, and make sure the link is trustworthy.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 40 },
  hero: { paddingTop: 4, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text },
  h3: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, backgroundColor: BRAND, borderRadius: 999, paddingVertical: 12 },
  createText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionHead: { marginTop: 20, marginBottom: 12 },
  ghostBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  ghostText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  list: { gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 14 },
  main: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sponsor: { flexShrink: 1, fontWeight: '700', color: colors.text, fontSize: 15 },
  adLabel: { fontSize: 11, fontWeight: '800', color: colors.text, borderWidth: 1, borderColor: colors.text, borderRadius: 4, paddingHorizontal: 5 },
  desc: { color: colors.text, fontSize: 14, marginTop: 2 },
  small: { color: colors.muted, fontSize: 12, marginTop: 4 },
  empty: { alignItems: 'center', padding: 20, borderWidth: 1, borderColor: colors.line, borderRadius: 16, marginTop: 4 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  primaryBtn: { marginTop: 14, backgroundColor: BRAND, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  primaryText: { color: '#fff', fontWeight: '700' },
  disclosure: { flexDirection: 'row', gap: 12, marginTop: 20, padding: 16, borderRadius: 14, backgroundColor: colors.surface },
  disclosureText: { flex: 1 },
});
