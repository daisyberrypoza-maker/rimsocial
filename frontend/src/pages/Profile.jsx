import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [listType, setListType] = useState('');
  const [people, setPeople] = useState([]);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleBusy, setPeopleBusy] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const [avatarBusy, setAvatarBusy] = useState(false);

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

  async function openPeople(type) {
    setListType(type);
    setPeopleQuery('');
    try {
      const data = await api(`/v1/users/${username}/${type}`);
      setPeople(data.items || []);
    } catch (e) { toast(e.message); setListType(''); }
  }

  async function toggleListFollow(person) {
    if (peopleBusy[person.id]) return;
    setPeopleBusy((current) => ({ ...current, [person.id]: true }));
    try {
      const response = person.isFollowing
        ? await api(`/v1/users/${person.id}/follow`, { method: 'DELETE' })
        : await api(`/v1/users/${person.id}/follow`, { method: 'POST' });
      setPeople((current) => current.map((item) => item.id === person.id
        ? { ...item, isFollowing: response.isFollowing, followerCount: response.followerCount }
        : item));
    } catch (e) { toast(e.message); }
    finally { setPeopleBusy((current) => ({ ...current, [person.id]: false })); }
  }

  async function refreshProfile() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const user = await api(`/v1/users/${username}`);
      setProfile(username, { user, updatedAt: Date.now() });
      await loadPage(feedKey, `/v1/users/${username}/posts`, true);
    } catch (e) { toast(e.message); }
    finally { setRefreshing(false); }
  }

  function onTouchEnd(e) {
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 90 && e.currentTarget.scrollTop <= 0) refreshProfile();
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Choose a JPG, PNG or WebP image');
    const form = new FormData();
    form.append('media', file);
    setAvatarBusy(true);
    try {
      const result = await api('/v1/users/me/avatar', { method: 'POST', body: form });
      setProfile(username, { user: { ...profile, avatarUrl: result.avatarUrl } });
      toast('Profile photo updated');
    } catch (e) { toast(e.message); }
    finally { setAvatarBusy(false); }
  }

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
      <section className="profile-top profile-top-refresh">
        <div className="profile-cover-tools">
          <Avatar user={profile} size={104} ring />
          {profile.isMe && <button className="avatar-edit" aria-label="Change profile photo" onClick={() => document.getElementById('profile-avatar-file')?.click()} disabled={avatarBusy}>{avatarBusy ? '…' : 'Edit photo'}</button>}
        </div>
        <h2 className="profile-name">{profile.displayName}</h2>
        <div className="profile-handle">@{profile.username}</div>
        <div className="profile-stats-row">
          <button onClick={() => openPeople('followers')}><strong>{formatCount(profile.followerCount)}</strong><span>Followers</span></button>
          <button onClick={() => openPeople('following')}><strong>{formatCount(profile.followingCount || 0)}</strong><span>Following</span></button>
          <div><strong>{formatCount(profile.postCount || 0)}</strong><span>Posts</span></div>
        </div>
        <span className="chip">{profile.country}</span>
        {profile.isMe ? (
          <div className="profile-actions profile-actions-refresh">
            <button onClick={() => navigate('/upload')}>＋ Create</button>
            <button className="ghost" onClick={() => setDrawerOpen(true)} aria-label="Open profile settings">☰ Settings</button>
          </div>
        ) : (
          <button className={`pill ${profile.isFollowing ? 'ghost' : ''}`} onClick={toggleFollow} disabled={busy}>
            {profile.isFollowing ? 'Following' : '＋ Follow'}
          </button>
        )}
      </section>
      {profile.isMe && <input id="profile-avatar-file" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} />}

      {drawerOpen && <div className="profile-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
        <aside className="profile-drawer" role="dialog" aria-label="Profile settings" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head"><h3>Profile & settings</h3><button className="ghost small" onClick={() => setDrawerOpen(false)}>✕</button></div>
          <button onClick={() => { setDrawerOpen(false); navigate('/upload'); }}><Icon name="plus-square" size={21} />Create post or story</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/explore'); }}><Icon name="users" size={21} />Find friends & creators</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/creator'); }}><Icon name="chart-no-axes-combined" size={21} />Creator Studio · earnings & cashout</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/ads-sponsors'); }}><Icon name="megaphone" size={21} />Ads & Sponsors</button>
          <button onClick={() => { setDrawerOpen(false); openPeople('followers'); }}><Icon name="user-round-check" size={21} />Followers</button>
          <button onClick={() => { setDrawerOpen(false); openPeople('following'); }}><Icon name="users-round" size={21} />Following</button>
          <button onClick={() => { setDrawerOpen(false); document.getElementById('profile-avatar-file')?.click(); }}>Change profile photo</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/live'); }}><Icon name="radio-tower" size={21} />LIVE broadcasts</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/business'); }}><Icon name="briefcase-business" size={21} />Business hub</button>
          <button className="drawer-danger" onClick={() => { logout(); navigate('/login', { replace: true }); }}><Icon name="log-out" size={21} />Log out</button>
        </aside>
      </div>}

      {listType && <div className="sheet-backdrop people-backdrop" onClick={() => setListType('')}>
        <section className="sheet people-sheet" role="dialog" aria-label={listType} onClick={(e) => e.stopPropagation()}>
          <div className="people-sheet-handle" />
          <div className="people-sheet-title"><div><h3>{profile.username}</h3><small>{listType === 'followers' ? `${formatCount(profile.followerCount)} followers` : `${formatCount(profile.followingCount || 0)} following`}</small></div><div className="people-title-actions"><button className="icon-button" onClick={() => { setListType(''); navigate('/explore'); }} aria-label="Discover people"><Icon name="user-plus" size={21} /></button><button className="icon-button" onClick={() => setListType('')} aria-label="Close list"><Icon name="x" size={21} /></button></div></div>
          <div className="people-tabs">
            <button className={listType === 'followers' ? 'active' : ''} onClick={() => { if (listType !== 'followers') openPeople('followers'); }}>Followers <span>{formatCount(profile.followerCount)}</span></button>
            <button className={listType === 'following' ? 'active' : ''} onClick={() => { if (listType !== 'following') openPeople('following'); }}>Following <span>{formatCount(profile.followingCount || 0)}</span></button>
          </div>
          <label className="people-search"><Icon name="search" size={18} /><input aria-label="Search people" value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} placeholder="Search" /></label>
          <div className="people-list">
            {people.filter((person) => `${person.displayName || ''} ${person.username || ''}`.toLowerCase().includes(peopleQuery.trim().toLowerCase())).map((person) =>
              <div className="people-list-row" key={person.id}>
                <button className="people-person" onClick={() => { setListType(''); navigate(`/u/${person.username}`); }}>
                  <Avatar user={person} size={46} />
                  <span><strong>{person.displayName || person.username}</strong><small>@{person.username}</small></span>
                </button>
                <button className={person.isFollowing ? 'people-follow-btn following' : 'people-follow-btn'} onClick={() => toggleListFollow(person)} disabled={Boolean(peopleBusy[person.id])}>{peopleBusy[person.id] ? '…' : person.isFollowing ? 'Following' : 'Follow'}</button>
              </div>
            )}
            {!people.length && <div className="people-empty"><Icon name="users" size={28} /><strong>No {listType} yet</strong><p>People who connect with this account will appear here.</p></div>}
            {people.length > 0 && !people.some((person) => `${person.displayName || ''} ${person.username || ''}`.toLowerCase().includes(peopleQuery.trim().toLowerCase())) && <p className="muted center">No people match that search.</p>}
          </div>
        </section>
      </div>}

      <nav className="ptabs">
        <button className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Posts</button>
        <button className={tab === 'stories' ? 'on' : ''} onClick={() => setTab('stories')}>Stories</button>
      </nav>

      {tab === 'posts' ? (
        <>
          {posts.length > 0 && <div className="profile-watch-action"><button className="pill" onClick={() => navigate(`/u/${username}/watch`)}>▶ Watch posts like For You</button></div>}
          <div className="grid">
            {posts.map((p) => (
              <div key={p.id} className="tile profile-post-tile" role="button" tabIndex={0} onClick={() => navigate(`/p/${p.id}`)} onKeyDown={(e) => { if (e.key === "Enter") navigate(`/p/${p.id}`); }}>
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
            <StoryViewer groups={[{ user: profile }]} startIndex={viewing} onClose={() => setViewing(false)} />
          )}
        </>
      )}
    </div>
  );
}
