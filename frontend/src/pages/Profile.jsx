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
import CoinSheet from '../components/CoinSheet.jsx';

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
  const [showCoins, setShowCoins] = useState(false);
  const [listType, setListType] = useState('');
  const [people, setPeople] = useState([]);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleBusy, setPeopleBusy] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [storyNotifications, setStoryNotifications] = useState(false);
  const [recommended, setRecommended] = useState(true);
  const [compactHeader, setCompactHeader] = useState(false);

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

  async function uploadCover(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Choose a JPG, PNG or WebP image');
    const form = new FormData();
    form.append('media', file);
    setCoverBusy(true);
    try {
      const result = await api('/v1/users/me/cover', { method: 'POST', body: form });
      setProfile(username, { user: { ...profile, coverUrl: result.coverUrl } });
      setDrawerOpen(false);
      toast('Profile cover updated');
    } catch (e) { toast(e.message); }
    finally { setCoverBusy(false); }
  }

  async function blockProfile() {
    if (!window.confirm(`Block @${profile.username}? They will no longer be able to interact with you.`)) return;
    try {
      await api(`/v1/users/${profile.id}/block`, { method: 'POST' });
      setOptionsOpen(false);
      toast(`@${profile.username} blocked`);
      navigate('/explore', { replace: true });
    } catch (e) { toast(e.message); }
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

  async function shareProfile() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: profile.username, url });
      else { await navigator.clipboard.writeText(url); toast('Profile link copied'); }
    } catch { /* share cancelled */ }
  }

  if (!profile) return <div className="page profile-page"><p className="muted center">Loading…</p></div>;

  const hoursLeft = (s) => Math.max(1, Math.round((new Date(s.expiresAt) - Date.now()) / 3.6e6));

  return (
    <div className={`page profile-page sc-profile${profile.isMe ? ' is-me' : ' is-other'}`} onScroll={(e) => setCompactHeader(e.currentTarget.scrollTop > 155)}>
      <div className={`sc-compact-nav${compactHeader ? ' visible' : ''}`} aria-hidden={!compactHeader}>
        <button className="sc-compact-back" aria-label="Back" onClick={() => navigate(-1)} tabIndex={compactHeader ? 0 : -1}><Icon name="arrow-left" size={22} /></button>
        <span className="sc-compact-name">{profile.displayName || profile.username}</span>
      </div>
      <header className="sc-hero">
        <div className="sc-hero-bg" aria-hidden="true" style={{ backgroundImage: (profile.coverUrl || profile.avatarUrl) ? `url(${mediaUrl(profile.coverUrl || profile.avatarUrl)})` : undefined }} />
        <span className="sc-hero-shade" aria-hidden="true" />
        <div className="sc-hero-top">
          <button className="sc-circle" aria-label="Back" onClick={() => navigate(-1)}><Icon name="arrow-left" size={22} /></button>
          <div className="sc-hero-actions">
            {profile.isMe ? (
              <button className="sc-share-pill" onClick={shareProfile}><Icon name="share" size={18} />Share</button>
            ) : (
              <button className="sc-circle" aria-label="Share profile" onClick={shareProfile}><Icon name="share" size={20} /></button>
            )}
            {profile.isMe
              ? <button className="sc-circle" aria-label="Open profile settings" onClick={() => setDrawerOpen(true)}><Icon name="settings" size={21} /></button>
              : <button className="sc-circle" aria-label="More options" onClick={() => setOptionsOpen(true)}><span className="sc-dots" aria-hidden="true">•••</span></button>}
          </div>
        </div>
        <div className="sc-hero-id">
          <div className="sc-hero-avatar">
            <Avatar user={profile} size={96} ring />
            {profile.isMe && <button className="sc-avatar-edit" aria-label="Change profile photo" onClick={() => document.getElementById('profile-avatar-file')?.click()} disabled={avatarBusy}>{avatarBusy ? '…' : <Icon name="camera" size={15} />}</button>}
          </div>
          <div className="sc-hero-text">
            <h2 className="sc-name">{profile.displayName || profile.username}</h2>
            <p className="sc-handle">@{profile.username}{!profile.isMe && <> · {formatCount(profile.followerCount)} Followers</>}</p>
          </div>
        </div>
        {profile.isMe ? (
          <div className="sc-seg-row">
            <button className="sc-seg on">My Account</button>
            <button className="sc-seg" onClick={() => navigate('/u/' + profile.username)}>Public Profile</button>
          </div>
        ) : (
          <div className="sc-add-row">
            <button className={`sc-add${profile.isFollowing ? ' added' : ''}`} onClick={toggleFollow} disabled={busy}><Icon name="user-plus" size={22} />{profile.isFollowing ? 'Added' : 'Add'}</button>
            <button className="sc-circle sc-more-down" aria-label="More options" onClick={shareProfile}><Icon name="chevron-down" size={22} /></button>
          </div>
        )}
      </header>
      <section className="sc-stats" aria-label="Profile stats">
        <button onClick={() => openPeople('followers')}><strong>{formatCount(profile.followerCount)}</strong> Followers</button>
        <button onClick={() => openPeople('following')}><strong>{formatCount(profile.followingCount || 0)}</strong> Following</button>
        <span><strong>{formatCount(profile.postCount || 0)}</strong> Posts</span>
        {profile.country && <span className="sc-country">{profile.country}</span>}
      </section>
      {profile.isMe && (
        <section className="sc-post-to" aria-label="Post to">
          <div className="sc-post-head"><h3>Post to…</h3><button className="sc-pill" onClick={() => navigate('/upload?story=1')}><Icon name="plus" size={16} />New Story</button></div>
          <button className="sc-row" onClick={() => navigate('/upload')}>
            <span className="sc-row-icon sc-row-red"><Icon name="play" size={20} /></span>
            <span className="sc-row-copy"><strong>Rimlight</strong><small>Reach people who follow you and beyond</small></span>
          </button>
          <button className="sc-row" onClick={() => navigate('/upload?story=1')}>
            <span className="sc-row-icon"><Icon name="camera" size={22} /></span>
            <span className="sc-row-copy"><strong>My Story</strong><small>Just for friends · 24 hours</small></span>
            <span className="sc-row-more" aria-hidden="true">•••</span>
          </button>
        </section>
      )}
      {profile.isMe && <><input id="profile-avatar-file" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} /><input id="profile-cover-file" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadCover} /></>}

      {drawerOpen && <div className="profile-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
        <aside className="profile-drawer" role="dialog" aria-label="Profile settings" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head"><h3>Profile & settings</h3><button className="icon-button" onClick={() => setDrawerOpen(false)} aria-label="Close settings"><Icon name="x" size={21} /></button></div>
          <button onClick={() => { setDrawerOpen(false); navigate('/upload'); }}><Icon name="plus" size={21} />Create post or story</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/explore'); }}><Icon name="users" size={21} />Find friends & creators</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/creator'); }}><Icon name="wallet" size={21} />Creator Studio · earnings & cashout</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/ads-sponsors'); }}><Icon name="megaphone" size={21} />Ads & Sponsors</button>
          <button onClick={() => { setDrawerOpen(false); openPeople('followers'); }}><Icon name="user-plus" size={21} />Followers</button>
          <button onClick={() => { setDrawerOpen(false); openPeople('following'); }}><Icon name="users" size={21} />Following</button>
          <button onClick={() => { setDrawerOpen(false); document.getElementById('profile-avatar-file')?.click(); }}>Change profile photo</button>
          <button onClick={() => document.getElementById('profile-cover-file')?.click()} disabled={coverBusy}><Icon name="image" size={21} />{coverBusy ? 'Uploading cover…' : 'Change profile background'}</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/live'); }}><Icon name="video" size={21} />LIVE broadcasts</button>
          <button onClick={() => { setDrawerOpen(false); setShowCoins(true); }}><Icon name="gift" size={21} />Get coins</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/business'); }}><Icon name="briefcase" size={21} />Business hub</button>
          <p className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 12 }} data-build="2026-11-06-f107ec4">Build 2026-11-06 · f107ec4</p>
          <button className="drawer-danger" onClick={() => { logout(); navigate('/login', { replace: true }); }}><Icon name="arrow-right" size={21} />Log out</button>
        </aside>
      </div>}

      {optionsOpen && !profile.isMe && <div className="sc-options-backdrop" onClick={() => setOptionsOpen(false)}>
        <section className="sc-options-sheet" role="dialog" aria-label={`Options for @${profile.username}`} onClick={(e) => e.stopPropagation()}>
          <button className="sc-option danger" onClick={blockProfile}>Block</button>
          <button className="sc-option danger" onClick={() => { setOptionsOpen(false); toast('Profile reporting is not available yet.'); }}>Report</button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); toast('Direct chat is not available yet.'); }}>Chat</button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); toggleFollow(); }} disabled={busy}>{profile.isFollowing ? 'Remove' : 'Add'}</button>
          <button className="sc-option toggle-row" onClick={() => setStoryNotifications((v) => !v)}>Story Notifications <span className={`sc-switch${storyNotifications ? ' on' : ''}`} aria-checked={storyNotifications} role="switch" /></button>
          <button className="sc-option toggle-row" onClick={() => setRecommended((v) => !v)}>Recommended <span className={`sc-switch${recommended ? ' on' : ''}`} aria-checked={recommended} role="switch" /></button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); if (navigator.share) shareProfile(); else { navigator.clipboard?.writeText(window.location.href).then(() => toast('Profile link copied')).catch(() => toast('Unable to copy profile link')); } }}>Send Profile to… <Icon name="share" size={22} /></button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); navigator.clipboard?.writeText(window.location.href).then(() => toast('Profile URL copied')).catch(() => toast('Unable to copy profile URL')); }}>Share Profile URL</button>
        </section>
        <button className="sc-options-done" onClick={() => setOptionsOpen(false)}>Done</button>
      </div>}
            {showCoins && <CoinSheet onClose={() => setShowCoins(false)} />}

      {listType && <div className="sheet-backdrop people-backdrop" onClick={() => setListType('')}>
        <section className="sheet people-sheet" role="dialog" aria-label={listType} onClick={(e) => e.stopPropagation()}>
          <div className="people-sheet-handle" />
          <div className="people-sheet-title"><button className="icon-button" onClick={() => setListType('')} aria-label="Back"><Icon name="arrow-left" size={24} /></button><div><h3>{profile.username}</h3><small>{listType === 'followers' ? `${formatCount(profile.followerCount)} followers` : `${formatCount(profile.followingCount || 0)} following`}</small></div><div className="people-title-actions"><button className="icon-button" onClick={() => { setListType(''); navigate('/explore'); }} aria-label="Discover people"><Icon name="user-plus" size={22} /></button></div></div>
          <div className="people-tabs">
            <button className={listType === 'followers' ? 'active' : ''} onClick={() => { if (listType !== 'followers') openPeople('followers'); }}><span>{formatCount(profile.followerCount)}</span> followers</button>
            <button className={listType === 'following' ? 'active' : ''} onClick={() => { if (listType !== 'following') openPeople('following'); }}><span>{formatCount(profile.followingCount || 0)}</span> following</button>
          </div>
          <label className="people-search"><Icon name="search" size={18} /><input aria-label="Search people" value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} placeholder="Search" /></label>
          <div className="people-sort"><span>Sorted by <strong>Default</strong></span><Icon name="sort" size={22} /></div>
          <div className="people-list">
            {people.filter((person) => `${person.displayName || ''} ${person.username || ''}`.toLowerCase().includes(peopleQuery.trim().toLowerCase())).map((person) =>
              <div className="people-list-row" key={person.id}>
                <button className="people-person" onClick={() => { setListType(''); navigate(`/u/${person.username}`); }}>
                  <Avatar user={person} size={56} />
                  <span><strong>{person.username}</strong><small>{person.displayName || ''}</small></span>
                </button>
                <button className={person.isFollowing ? 'people-follow-btn following' : 'people-follow-btn'} onClick={() => toggleListFollow(person)} disabled={Boolean(peopleBusy[person.id])}>{peopleBusy[person.id] ? '…' : person.isFollowing ? 'Added' : 'Add'}</button>
              </div>
            )}
            {!people.length && <div className="people-empty"><Icon name="users" size={28} /><strong>No {listType} yet</strong><p>People who connect with this account will appear here.</p></div>}
            {people.length > 0 && !people.some((person) => `${person.displayName || ''} ${person.username || ''}`.toLowerCase().includes(peopleQuery.trim().toLowerCase())) && <p className="muted center">No people match that search.</p>}
          </div>
        </section>
      </div>}

      <nav className="sc-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'stories'} className={tab === 'stories' ? 'on' : ''} onClick={() => setTab('stories')}>Stories</button>
        <button role="tab" aria-selected={tab === 'posts'} className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Rimlight</button>
      </nav>

      {tab === 'posts' ? (
        <>
          {posts.length > 0 && <div className="sc-watch"><button className="sc-pill" onClick={() => navigate(`/u/${username}/watch`)}><Icon name="play" size={16} />Watch like For You</button></div>}
          <div className="sc-grid">
            {posts.map((p) => (
              <div key={p.id} className="sc-tile" role="button" tabIndex={0} onClick={() => navigate(`/p/${p.id}`)} onKeyDown={(e) => { if (e.key === "Enter") navigate(`/p/${p.id}`); }}>
                {p.kind === 'video'
                  ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" />
                  : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}
                <span className="sc-tile-count"><Icon name="play" size={11} />{formatCount(p.viewCount)}</span>
                {profile.isMe && <button className="sc-tile-delete" disabled={deleting === p.id} aria-label="Delete post" title="Delete post" onClick={(e) => { e.stopPropagation(); deletePost(p); }}>×</button>}
              </div>
            ))}
          </div>
          {!posts.length && <p className="sc-empty-note">No posts yet.</p>}
          {nextCursor && (
            <div className="sc-more">
              <button className="sc-pill" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="sc-grid">
            {stories.map((s, i) => (
              <button key={s.id} className="sc-tile" onClick={() => setViewing(i)}>
                {s.kind === 'video'
                  ? <video src={mediaUrl(s.mediaUrl)} muted playsInline preload="metadata" />
                  : <img src={mediaUrl(s.mediaUrl)} alt="" loading="lazy" />}
                <span className="sc-tile-count">{hoursLeft(s)}h left</span>
              </button>
            ))}
          </div>
          {!stories.length && <p className="sc-empty-note">No active stories. Stories disappear after 24 hours.</p>}
          {viewing !== false && stories.length > 0 && (
            <StoryViewer groups={[{ user: profile }]} startIndex={viewing} onClose={() => setViewing(false)} />
          )}
        </>
      )}
    </div>
  );
}
