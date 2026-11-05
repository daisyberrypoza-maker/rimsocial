import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import StoryViewer from '../components/StoryViewer.jsx';

export default function Profile() {
  const { username = 'me' } = useParams();
  const navigate = useNavigate();
  const logout = useAppStore((s) => s.logout);
  const setProfile = useAppStore((s) => s.setProfile);
  const setFeed = useAppStore((s) => s.setFeed);
  const profile = useAppStore((s) => s.profiles[username]?.user);
  const feedKey = `u:${username}`;
  const posts = useAppStore((s) => s.feeds[feedKey]?.items || []);
  const nextCursor = useAppStore((s) => s.feeds[feedKey]?.nextCursor ?? null);

  const [tab, setTab] = useState('posts');
  const [stories, setStories] = useState([]);
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInput = useRef(null);

  useEffect(() => {
    api(`/v1/users/${username}`)
      .then((user) => setProfile(username, { user, updatedAt: Date.now() }))
      .catch((e) => toast(e.message));
    loadPage(feedKey, `/v1/users/${username}/posts`, true).catch((e) => toast(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (tab !== 'stories' || !profile) return;
    api(`/v1/stories/users/${profile.id}`)
      .then((d) => setStories(d.items))
      .catch(() => setStories([]));
  }, [tab, profile]);

  async function toggleFollow() {
    if (!profile) return;
    setBusy(true);
    try {
      const r = profile.isFollowing
        ? await api(`/v1/users/${profile.id}/follow`, { method: 'DELETE' })
        : await api(`/v1/users/${profile.id}/follow`, { method: 'POST' });
      setProfile(username, { user: { ...profile, isFollowing: r.isFollowing, followerCount: r.followerCount } });
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePost(post) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    setDeleting(post.id);
    try {
      await api(`/v1/posts/${post.id}`, { method: 'DELETE' });
      setFeed(feedKey, { items: posts.filter((p) => p.id !== post.id) });
      toast('Post deleted');
    } catch (e) { toast(e.message); }
    finally { setDeleting(null); }
  }

  async function changeAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast('Choose a JPG, PNG or WebP image'); e.target.value = ''; return; }
    const fd = new FormData(); fd.append('avatar', file); setAvatarBusy(true);
    try { const result = await api('/v1/users/me/avatar', { method: 'POST', body: fd }); setProfile(username, { user: { ...profile, avatarUrl: result.avatarUrl } }); toast('Profile picture updated'); }
    catch (err) { toast(err.message); } finally { setAvatarBusy(false); e.target.value = ''; }
  }

  async function loadMore() {
    setLoadingMore(true);
    try { await loadPage(feedKey, `/v1/users/${username}/posts`); }
    catch (e) { toast(e.message); }
    finally { setLoadingMore(false); }
  }

  if (!profile) return <div className="page"><p className="muted center">Loading…</p></div>;

  const hoursLeft = (s) => Math.max(1, Math.round((new Date(s.expiresAt) - Date.now()) / 3.6e6));

  return (
    <div className="page">
      <section className="profile-top">
        {profile.isMe && <button className="profile-menu-trigger" aria-label="Open profile menu" onClick={() => setMenuOpen(true)}>•••</button>}
        <button className="avatar-edit-button" type="button" onClick={() => profile.isMe && avatarInput.current?.click()} disabled={!profile.isMe || avatarBusy} aria-label="Change profile picture"><Avatar user={profile} size={104} ring /><span>{avatarBusy ? 'Uploading…' : profile.isMe ? 'Edit photo' : ''}</span></button>
        <input ref={avatarInput} className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={changeAvatar} />
        <h2 className="profile-name">{profile.displayName}</h2>
        <div className="followers">{formatCount(profile.followerCount)} Followers</div>
        <span className="chip">{profile.country}</span>

        {profile.isMe ? (
          <div className="profile-actions">
            <button className="ghost" onClick={() => navigate('/upload')}>＋ Create</button>
            <button className="ghost" onClick={() => navigate('/creator')}>Creator Studio</button>
          </div>
        ) : (
          <button className={`pill ${profile.isFollowing ? 'ghost' : ''}`} onClick={toggleFollow} disabled={busy}>
            {profile.isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </section>

      {menuOpen && <div className="profile-drawer-backdrop" onClick={() => setMenuOpen(false)}><aside className="profile-drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-head"><div><strong>Profile & settings</strong><small>@{profile.username}</small></div><button className="ghost small" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button></div><button className="drawer-item" onClick={() => { setMenuOpen(false); navigate('/upload'); }}>＋ <span><strong>Create post or story</strong><small>Share a photo, reel or story</small></span></button><button className="drawer-item" onClick={() => { setMenuOpen(false); navigate('/creator'); }}>✦ <span><strong>Creator Studio</strong><small>Gifts, coins, cashout and Creator Match</small></span></button><button className="drawer-item" onClick={() => { setMenuOpen(false); navigate('/explore'); }}>⌕ <span><strong>Find friends</strong><small>Discover people and follow creators</small></span></button><div className="drawer-divider" /><button className="drawer-item" onClick={() => { setMenuOpen(false); avatarInput.current?.click(); }}>◉ <span><strong>Profile picture</strong><small>Upload or change your photo</small></span></button><button className="drawer-item" onClick={() => { setMenuOpen(false); toast('More account settings will be added here.'); }}>⚙ <span><strong>Settings & privacy</strong><small>Profile and privacy controls</small></span></button><button className="drawer-item drawer-logout" onClick={() => { logout(); navigate('/login', { replace: true }); }}>↪ <span><strong>Log out</strong><small>Sign out of ClipVerse</small></span></button></aside></div>}
      <nav className="ptabs">
        <button className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Posts</button>
        <button className={tab === 'stories' ? 'on' : ''} onClick={() => setTab('stories')}>Stories</button>
      </nav>

      {tab === 'posts' ? (
        <>
          <div className="grid">
            {posts.map((p) => (
              <div key={p.id} className="tile">
                {p.kind === 'video'
                  ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" />
                  : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}
                <span className="tile-shade" />
                {p.caption && <span className="tile-title">{p.caption}</span>}
                <span className="tile-count">{formatCount(p.viewCount)}</span>
                {profile.isMe && <button className="tile-delete" disabled={deleting === p.id} aria-label="Delete post" title="Delete post" onClick={(e) => { e.stopPropagation(); deletePost(p); }}>×</button>}
              </div>
            ))}
          </div>
          {!posts.length && <p className="muted center">No posts yet.</p>}
          {nextCursor && (
            <div className="load-more">
              <button className="ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid">
            {stories.map((s, i) => (
              <button key={s.id} className="tile" onClick={() => setViewing(i)}>
                {s.kind === 'video'
                  ? <video src={mediaUrl(s.mediaUrl)} muted playsInline preload="metadata" />
                  : <img src={mediaUrl(s.mediaUrl)} alt="" loading="lazy" />}
                <span className="tile-shade" />
                <span className="tile-count">{hoursLeft(s)}h left</span>
              </button>
            ))}
          </div>
          {!stories.length && <p className="muted center">No active stories. Stories disappear after 24 hours.</p>}
          {viewing !== false && stories.length > 0 && (
            <StoryViewer groups={[{ user: profile }]} startIndex={0} onClose={() => setViewing(false)} />
          )}
        </>
      )}
    </div>
  );
}
