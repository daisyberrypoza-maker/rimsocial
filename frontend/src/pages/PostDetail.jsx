import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl, postShareUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';
import ShareOptions from '../components/ShareOptions.jsx';
import VideoPlayer from '../components/VideoPlayer.jsx';
import { useAppStore } from '../store.js';
import ActionSheet from '../components/ActionSheet.jsx';

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
  const [showComments, setShowComments] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const me = useAppStore((st) => st.user);
  const [menuOpen, setMenuOpen] = useState(false);

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

  function shareExternally() {
    if (!postShareUrl(postId)) return toast('External sharing needs VITE_PUBLIC_APP_URL set to the public RimSocial website.');
    setShowShare(true);
  }

  async function deletePost() {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api(`/v1/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
      toast('Post deleted');
      navigate(-1);
    } catch (e) { toast(e.message); }
  }

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

  if (loading) return <main className="rv-page"><p className="rv-state">Loading…</p></main>;
  if (!post) return <main className="rv-page"><button className="rv-back" onClick={() => navigate(-1)} aria-label="Go back"><Icon name="arrow-left" size={26} /></button><p className="rv-state">This post is unavailable or has been deleted.</p></main>;

  const username = post.author?.username || 'creator';
  const src = mediaUrl(post.mediaUrl);
  const dateText = post.createdAt ? new Date(post.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const caption = post.caption || '';
  const isOwner = Boolean(me?.id) && post.author?.id === me.id;
  const longCaption = caption.length > 90;

  return <main className={`rv-page ${showComments ? 'sheet-open' : ''}`}>
    <header className="rv-top">
      <button className="rv-icon" onClick={() => navigate(-1)} aria-label="Go back"><Icon name="arrow-left" size={26} /></button>
      <strong className="rv-title">Reels</strong>
      <button className="rv-icon" onClick={() => navigate('/upload')} aria-label="Add post"><Icon name="plus" size={28} /></button>
    </header>

    <div className="rv-media">
      {post.kind === 'video'
        ? <VideoPlayer src={src} poster={mediaUrl(post.thumbUrl) || undefined} />
        : <img src={src} alt={caption || 'Shared post'} />}
    </div>

    {!showComments && <aside className="rv-rail" aria-label="Post actions">
      <button className={liked ? 'liked' : ''} onClick={toggleLike} disabled={busy} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}>
        <Icon name="heart" size={30} /><span>{formatCount(post.likeCount)}</span>
      </button>
      <button onClick={() => setShowComments(true)} aria-label="Comments"><Icon name="message-circle" size={30} /><span>{formatCount(comments.length)}</span></button>
      <button className={reposted ? 'reposted' : ''} onClick={toggleRepost} disabled={busy} aria-pressed={reposted} aria-label={reposted ? 'Undo repost' : 'Repost'}>
        <Icon name="repeat" size={30} /><span>{formatCount(post.repostCount || 0)}</span>
      </button>
      <button onClick={shareExternally} aria-label="Share"><Icon name="send" size={28} /></button>
      <button onClick={() => (isOwner ? setMenuOpen(true) : shareExternally())} aria-label="More"><span className="rv-more-dots">•••</span></button>
    </aside>}

    {!showComments && <div className="rv-info">
      <div className="rv-author">
        <button className="rv-avatar" onClick={() => navigate(`/u/${username}`)} aria-label={`Open @${username}`}><Avatar user={post.author} size={34} /></button>
        <strong onClick={() => navigate(`/u/${username}`)}>{username}</strong>
      </div>
      {caption && <p className={`rv-caption ${captionOpen ? 'open' : ''}`}>{caption}{longCaption && !captionOpen && <button className="rv-seemore" onClick={() => setCaptionOpen(true)}> See more</button>}</p>}
    </div>}

    {!showComments && <footer className="rv-bottom">
      <span className="rv-views"><Icon name="eye" size={18} /> {formatCount(post.viewCount)} views</span>
      <button className="rv-share" onClick={shareExternally}>Share</button>
    </footer>}

    {showComments && <section className="rv-sheet" role="dialog" aria-label="Comments">
      <div className="rv-handle" aria-hidden="true" />
      <header className="rv-sheet-head">
        <Avatar user={post.author} size={40} />
        <div><strong>{username}</strong><small>{dateText}</small></div>
        <button className="rv-icon" onClick={() => setShowComments(false)} aria-label="Close comments"><Icon name="x" size={22} /></button>
      </header>
      <div className="rv-comments">
        {comments.map((item) => <div className="rv-comment" key={item.id}><Avatar user={item.author} size={34} /><div><strong>@{item.author?.username || 'user'}</strong><p>{item.body}</p></div></div>)}
        {!comments.length && <p className="rv-empty">No comments yet. Start the conversation.</p>}
      </div>
      <form className="rv-compose" onSubmit={submitComment}>
        <Avatar user={me || {}} size={32} />
        <input id="detail-comment-input" aria-label="Write a comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder={`Comment as ${me?.username || 'you'}…`} />
        {comment.trim() && <button type="submit" disabled={commentBusy}>{commentBusy ? '…' : 'Post'}</button>}
      </form>
    </section>}

    {menuOpen && <ActionSheet
      actions={[
        { label: 'Share', icon: 'send', onClick: shareExternally },
        { label: 'Delete post', icon: 'trash', danger: true, onClick: deletePost },
      ]}
      onClose={() => setMenuOpen(false)}
    />}

    {showShare && <ShareOptions url={postShareUrl(post.id)} title={`Post by @${username} on RimSocial`} text={post.caption || 'View this post on RimSocial'} onClose={() => setShowShare(false)} />}
  </main>;
}
