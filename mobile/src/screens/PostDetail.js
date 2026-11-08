import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, TextInput, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import Video from 'react-native-video';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { api } from '../api';
import { mediaUrl, videoStreamUrl } from '../config';
import { timeAgo } from '../lib/format';
import { logError } from '../lib/toast';
import { colors } from '../theme';

// One post with its comments. Opened from a profile, an activity item, or the comment button on Rimlight.
export default function PostDetail() {
  const navigation = useNavigation();
  const { postId } = useRoute().params;
  const { width } = useWindowDimensions();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');

  useEffect(() => {
    api(`/v1/posts/${postId}`).then(setPost).catch(logError);
    api(`/v1/posts/${postId}/comments`).then((d) => setComments(d.items || [])).catch(logError);
  }, [postId]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    try {
      const c = await api(`/v1/posts/${postId}/comments`, { method: 'POST', body: { body: text } });
      setComments((list) => [...list, c]);
      setBody('');
    } catch (e) { logError(e); }
  }

  const isVideo = post?.kind === 'video';
  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Icon name="arrow-left" size={24} /></Pressable>
        <Text style={styles.title}>Post</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={comments}
        keyExtractor={(c) => String(c.id)}
        ListHeaderComponent={post && (
          <View>
            <Pressable style={styles.author} onPress={() => navigation.navigate('Profile', { username: post.author?.username })}>
              <Avatar user={post.author} size={36} />
              <Text style={styles.bold}>{post.author?.username}</Text>
            </Pressable>
            {isVideo
              ? <Video source={{ uri: videoStreamUrl(mediaUrl(post.mediaUrl)) }} style={{ width, height: width * 1.25 }} resizeMode="contain" controls />
              : <Image source={{ uri: mediaUrl(post.mediaUrl) }} style={{ width, height: width * 1.25 }} resizeMode="contain" />}
            {!!post.caption && <Text style={styles.caption}>{post.caption}</Text>}
            <Text style={styles.section}>Comments</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>No comments yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.comment}>
            <Avatar user={item.author} size={34} />
            <View style={{ flex: 1 }}>
              <Text><Text style={styles.bold}>{item.author?.username}</Text> <Text style={styles.muted}>· {timeAgo(item.createdAt)}</Text></Text>
              <Text style={styles.text}>{item.body}</Text>
            </View>
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput style={styles.input} placeholder="Add a comment…" placeholderTextColor={colors.muted} value={body} onChangeText={setBody} maxLength={1000} />
        {!!body.trim() && <Pressable onPress={send}><Text style={styles.post}>Post</Text></Pressable>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  bold: { fontWeight: '700', color: colors.text },
  caption: { padding: 12, fontSize: 15, color: colors.text },
  section: { paddingHorizontal: 12, paddingVertical: 8, fontWeight: '700', color: colors.text },
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  text: { fontSize: 15, color: colors.text },
  muted: { color: colors.muted, fontSize: 13, paddingHorizontal: 12 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.line },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.text },
  post: { color: colors.unseen, fontWeight: '700' },
});
