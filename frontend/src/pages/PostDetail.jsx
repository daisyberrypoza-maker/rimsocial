import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';
import ShareOptions from '../components/ShareOptions.jsx';

export default function PostDetail() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api(`/v1/posts/${encodeURIComponent(postId)}`),
      api(`/v1/posts/${encodeURIComponent(postId)}/comments`),
      api(`/v1/posts/${encodeURIComponent(postId)}/engagement`),
    ]).then(([item, commentData, engagement]) => {
      if (!alive) return;
      setPost(item); setComments(commentData.items || []);
      setLiked(Boolean(engagement.liked)); setReposted(Boolean(engagement.reposted));
    }).catch((err) => { if (alive) toast(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [postId]);

  async function toggleLike() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api(`/v1/posts/${postId}/like`, { method: 'POST' });
      setPost((p) => ({ ...p, likeCount: r.likeCount })); setLiked(Boolean(r.liked));
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }

  async function toggleRepost() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api(`/v1/posts/${postId}/repost`, { method: 'POST' });
      setReposted(Boolean(r.reposted)); setPost((p) => ({ ...p, repostCount: r.repostCount }));
      toast(r.reposted ? 'Post reposted' : 'Repost removed');
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }

  function shareExternally() { setShowShare(true); }

  async function submitComment(e) {
    e.preventDefault();
    if (!comment.trim() || commentBusy) return;
    setCommentBusy(true);
    try {
      const item = await api(`/v1/posts/${postId}/comments`, { method: 'POST', body: { body: comment.trim() } });
      setComments((items) => [...items, item]); setComment('');
    } catch (e) { toast(e.message); }
    finally { setCommentBusy(false); }
  }

  if (loading) return <main className="page post-detail-page"><p className="muted center">Loading post…</p></main>;
  if (!post) return <main className="page post-detail-page"><button className="ghost" onClick={() => navigate(-1)}>← Back</button><p className="muted center">This post is unavailable or has been deleted.</p></main>;

  const username = post.author?.username || 'creator';
  const src = mediaUrl(post.mediaUrl);
  return <main className="page post-detail-page">
    <div className="post-detail-toolbar"><button className="icon-button" onClick={() => navigate(-1)} aria-label="Go back"><Icon name="arrow-left" size={21} /></button><strong>Post</strong><div className="post-detail-toolbar-actions"><button className="ghost small" onClick={shareExternally}><Icon name="share" size={18} /> Share</button><button className="ghost small" onClick={toggleRepost} disabled={busy} aria-pressed={reposted}><Icon name="repeat" size={18} /> {reposted ? 'Reposted' : 'Repost'}</button></div></div>
    <article className="post-detail-card">
      <button className="post-detail-author" onClick={() => navigate(`/u/${username}`)}><Avatar user={post.author} size={44} /><span><strong>{post.author?.displayName || username}</strong><small>@{username}</small></span><Icon name="chevron" size={20} /></button>
      <div className="post-detail-media">{post.kind === 'video' ? <video src={src} poster={mediaUrl(post.thumbUrl) || undefined} controls playsInline preload="metadata" /> : <img src={src} alt={post.caption || 'Shared post'} />}</div>
      {post.caption && <p className="post-detail-caption">{post.caption}</p>}
      <div className="post-detail-actions">
        <button className={liked ? 'detail-action liked' : 'detail-action'} onClick={toggleLike} disabled={busy} aria-pressed={liked}><Icon name="heart" size={19} /> {formatCount(post.likeCount)} Like</button>
        <button className="detail-action" onClick={() => document.getElementById('detail-comment-input')?.focus()}><Icon name="message-circle" size={19} /> Comment</button>
        <button className={reposted ? 'detail-action reposted' : 'detail-action'} onClick={toggleRepost} disabled={busy} aria-pressed={reposted}><Icon name="repeat" size={19} /> {reposted ? 'Reposted' : 'Repost'}</button>
      </div>
      <div className="detail-comments"><h3>Comments <span>{comments.length}</span></h3>
        {comments.map((item) => <div className="comment-row" key={item.id}><Avatar user={item.author} size={34} /><div className="comment-copy"><strong>@{item.author?.username || 'user'}</strong><p>{item.body}</p></div></div>)}
        {!comments.length && <p className="muted">Be the first to comment.</p>}
        <form className="comment-compose" onSubmit={submitComment}><input id="detail-comment-input" aria-label="Write a comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Add a comment…" /><button type="submit" disabled={commentBusy || !comment.trim()}>{commentBusy ? '…' : 'Post'}</button></form>
      </div>
      <div className="post-detail-stats"><span>{formatCount(post.viewCount)} views</span><span>{formatCount(post.repostCount || 0)} reposts</span></div>
    </article>
    {showShare && <ShareOptions url={new URL(`/p/${post.id}`, window.location.origin).toString()} title={`Post by @${username} on RimSocial`} text={post.caption || 'View this post on RimSocial'} onClose={() => setShowShare(false)} />}
  </main>;
}
