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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api(`/v1/posts/${encodeURIComponent(postId)}`)
      .then((item) => { if (alive) setPost(item); })
      .catch((err) => { if (alive) toast(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [postId]);

  async function share() {
    const url = `${window.location.origin}/#/p/${encodeURIComponent(postId)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Clipverse post', text: post?.caption || 'Watch this post on Clipverse', url });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast('Post link copied');
      } else {
        window.prompt('Copy this post link', url);
      }
    } catch { /* User cancelled the share sheet. */ }
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
        <button className="ghost" onClick={share}><Icon name="share" size={18} /> Share</button>
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
        <div className="post-detail-stats"><span><Icon name="heart" size={18} /> {formatCount(post.likeCount)} likes</span><span>{formatCount(post.viewCount)} views</span><button className="ghost" onClick={share}>Share post</button></div>
      </article>
    </main>
  );
}
