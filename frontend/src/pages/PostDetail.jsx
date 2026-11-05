import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';

export default function PostDetail() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api(`/v1/posts/${encodeURIComponent(postId)}`),
      api(`/v1/posts/${encodeURIComponent(postId)}/engagement`),
      api(`/v1/posts/${encodeURIComponent(postId)}/comments`),
    ]).then(([item, engagement, discussion]) => {
      if (!alive) return;
      setPost(item);
      setLiked(Boolean(engagement.liked));
      setLikes(engagement.likeCount || 0);
      setComments(discussion.items || []);
    }).catch((err) => { if (alive) toast(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [postId]);

  async function toggleLike() {
    try {
      const result = await api(`/v1/posts/${postId}/like`, { method: 'POST' });
      setLiked(Boolean(result.liked));
      setLikes(result.likeCount);
    } catch (e) { toast(e.message); }
  }

  async function reshare() {
    try {
      const result = await api(`/v1/posts/${postId}/reshare`, { method: 'POST', body: {} });
      toast(result.created ? 'Post reshared to your profile' : 'You already reshared this post');
    } catch (e) { toast(e.message); }
  }

  async function addComment(e) {
    e.preventDefault();
    if (!comment.trim() || busy) return;
    setBusy(true);
    try {
      const item = await api(`/v1/posts/${postId}/comments`, { method: 'POST', body: { body: comment.trim() } });
      setComments((items) => [...items, item]);
      setComment('');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  if (loading) return <main className="page post-detail-page"><p className="muted center">Loading post…</p></main>;
  if (!post) return <main className="page post-detail-page"><button className="ghost" onClick={() => navigate(-1)}>← Back</button><p className="muted center">This post is unavailable or has been deleted.</p></main>;

  const username = post.author?.username || 'creator';
  const src = mediaUrl(post.mediaUrl);
  return (
    <main className="page post-detail-page">
      <div className="post-detail-toolbar">
        <button className="ghost" onClick={() => navigate(-1)} aria-label="Go back">← Back</button>
        <strong>Post</strong>
        <button className="ghost" onClick={reshare}><Icon name="share" size={18} /> Reshare</button>
      </div>
      <article className="post-detail-card">
        <button className="post-detail-author" onClick={() => navigate(`/u/${username}`)}>
          <Avatar user={post.author} size={44} />
          <span><strong>{post.author?.displayName || username}</strong><small>@{username}</small></span>
          <Icon name="chevron" size={20} />
        </button>
        <div className="post-detail-media">
          {post.kind === 'video'
            ? <video src={src} poster={mediaUrl(post.thumbUrl) || undefined} controls playsInline preload="metadata" />
            : <img src={src} alt={post.caption || 'Shared post'} />}
        </div>
        {post.caption && <p className="post-detail-caption">{post.caption}</p>}
        <div className="post-detail-stats">
          <button className={`ghost post-detail-like ${liked ? 'liked' : ''}`} onClick={toggleLike}><Icon name="heart" size={18} /> {formatCount(likes)} {liked ? 'Liked' : 'Like'}</button>
          <span>{formatCount(post.viewCount)} views</span>
          <button className="ghost" onClick={reshare}>Reshare post</button>
        </div>
      </article>
      <section className="post-discussion">
        <h2>Comments <span>{comments.length}</span></h2>
        <form className="comment-form" onSubmit={addComment}><input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Add a comment…" aria-label="Add a comment" /><button type="submit" disabled={busy || !comment.trim()}>{busy ? '…' : 'Send'}</button></form>
        <div className="comments-list">{comments.map((item) => <article className="comment-item" key={item.id}><Avatar user={item.author} size={34} /><div><strong>@{item.author?.username || 'user'}</strong><p>{item.body}</p></div></article>)}{!comments.length && <p className="muted">No comments yet. Start the conversation.</p>}</div>
      </section>
    </main>
  );
}
