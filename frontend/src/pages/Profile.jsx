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

  const [tab, setTab] = useState('stories');
  const [reposts, setReposts] = useState([]);
  const [repostsLoading, setRepostsLoading] = useState(false);
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
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [imageChoiceOpen, setImageChoiceOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);

  useEffect(() => {
    api(`/v1/users/${username}`)
      .then((user) => setProfile(username, { user, updatedAt: Date.now() }))
      .catch((e) => toast(e.message));
    loadPage(feedKey, `/v1/users/${username}/posts`, true).catch((e) => toast(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (tab !== 'reposts' || !profile) return;
    setRepostsLoading(true);
    api(`/v1/users/${username}/reposts`).then((data) => setReposts(data.items || [])).catch(() => setReposts([])).finally(() => setRepostsLoading(false));
  }, [tab, profile, username]);

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

  async function openBlockedPeople() {
    setDrawerOpen(false);
    setListType('blocked');
    setPeopleQuery('');
    try {
      const data = await api('/v1/users/blocked');
      setPeople(data.items || []);
    } catch (e) { toast(e.message); setListType(''); }
  }

  async function unblockPerson(person) {
    if (peopleBusy[person.id]) return;
    setPeopleBusy((current) => ({ ...current, [person.id]: true }));
    try {
      await api(`/v1/users/${person.id}/block`, { method: 'DELETE' });
      setPeople((current) => current.filter((item) => item.id !== person.id));
      toast(`@${person.username} unblocked`);
    } catch (e) { toast(e.message); }
    finally { setPeopleBusy((current) => ({ ...current, [person.id]: false })); }
  }

  async function openActivity() {
    setListType('activity');
    setActivityLoading(true);
    try {
      const data = await api('/v1/activity');
      setActivity(data.items || []);
    } catch (e) { toast(e.message); setListType(''); }
    finally { setActivityLoading(false); }
  }

  function activityText(item) {
    const name = item.actor?.username || 'Someone';
    if (item.type === 'follow') return `${name} started following you`;
    if (item.type === 'like') return `${name} liked your post`;
    if (item.type === 'comment') return `${name} commented${item.comment ? `: ${item.comment}` : ' on your post'}`;
    if (item.type === 'repost') return `${name} reposted your post`;
    if (item.type === 'mention') return `${name} mentioned you`;
    if (item.type === 'post') return `${name} posted a new Rimlight`;
    return `${name} interacted with you`;
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


  async function toggleNotify() {
    if (!profile || profile.isMe) return;
    if (!profile.isFollowing) return toast('Add this creator first to get new post notifications');
    setNotifyBusy(true);
    try {
      const r = await api(`/v1/users/${profile.id}/follow/notify`, { method: 'PUT', body: { enabled: !profile.isNotifying } });
      setProfile(username, { user: { ...profile, isNotifying: r.isNotifying } });
      toast(r.isNotifying ? 'You will be notified when they post' : 'Post notifications off');
    } catch (err) { toast(err.message); }
    finally { setNotifyBusy(false); }
  }

  async function toggleFollow() {
  if (!profile) return;
    setBusy(true);
    try {
      const r = profile.isFollowing
        ? await api(`/v1/users/${profile.id}/follow`, { method: 'DELETE' })
        : await api(`/v1/users/${profile.id}/follow`, { method: 'POST' });
      setProfile(username, { user: { ...profile, isFollowing: r.isFollowing, followerCount: r.followerCount, ...(r.isFollowing ? {} : { isNotifying: false }) } });
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
        <div className="sc-hero-bg" aria-hidden="true" style={{ backgroundImage: profile.coverUrl ? `url(${mediaUrl(profile.coverUrl)})` : 'linear-gradient(180deg, #252525 0%, #181818 70%, #050505 100%)' }} />
        <span className="sc-hero-shade" aria-hidden="true" />
        <div className="sc-hero-top">
          <button className="sc-circle" aria-label="Back" onClick={() => navigate(-1)}><Icon name="arrow-left" size={22} /></button>
          <div className="sc-hero-actions">
            {profile.isMe && <button className="sc-circle" aria-label="Edit profile photo or background" onClick={() => setImageChoiceOpen(true)}><Icon name="pencil" size={20} /></button>}
            {profile.isMe ? (
              <button className="sc-share-pill" onClick={shareProfile}><Icon name="share" size={18} />Share</button>
            ) : (
              <>
                <button className={`sc-circle sc-bell${profile.isNotifying ? ' on' : ''}`} aria-label={profile.isNotifying ? 'Turn off new post notifications' : 'Turn on new post notifications'} aria-pressed={Boolean(profile.isNotifying)} onClick={toggleNotify} disabled={notifyBusy}><Icon name="bell" size={20} /></button>
                <button className="sc-circle" aria-label="Share profile" onClick={shareProfile}><Icon name="share" size={20} /></button>
              </>
            )}
            {profile.isMe
              ? <button className="sc-circle" aria-label="Open profile settings" onClick={() => setDrawerOpen(true)}><Icon name="settings" size={21} /></button>
              : <button className="sc-circle" aria-label="More options" onClick={() => setOptionsOpen(true)}><span className="sc-dots" aria-hidden="true">•••</span></button>}
          </div>
        </div>
        <div className="sc-hero-id">
          <div className="sc-hero-avatar">
            <button type="button" className="sc-avatar-preview" aria-label={profile.avatarUrl ? 'View profile picture' : 'View profile avatar'} onClick={() => setImageViewerOpen(true)}>
              <Avatar user={profile} size={100} ring />
            </button>
            {profile.isMe && <button className="sc-avatar-edit" aria-label="Choose profile or background image" onClick={() => setImageChoiceOpen(true)} disabled={avatarBusy || coverBusy}>{avatarBusy ? '…' : <Icon name="camera" size={15} />}</button>}
          </div>
          <div className="sc-hero-text">
            <h2 className="sc-name">{profile.displayName || profile.username}</h2>
            <p className="sc-handle">@{profile.username}</p>
            <div className="sc-inline-stats" aria-label="Followers">
              <button type="button" onClick={() => openPeople('followers')}><strong>{formatCount(profile.followerCount || 0)}</strong> followers</button>
            </div>
            {profile.isCreator && <span className="sc-creator-status is-creator"><Icon name="badge-check" size={13} />Creator</span>}
            {!profile.isMe && profile.isCreator && profile.country && <p className="sc-profile-country"><Icon name="map-pin" size={14} />{profile.country}</p>}
          </div>
        </div>
        {profile.isMe ? (
          <div className="sc-seg-row">
            <button className="sc-seg on">My Account</button>
            <button className="sc-seg" onClick={() => navigate('/u/' + profile.username)}>Public Profile</button>
          </div>
        ) : (
          <div className="sc-add-row">
            <button className={`sc-add${profile.isFollowing ? ' added' : ''}`} onClick={toggleFollow} disabled={busy}><Icon name="user-plus" size={22} />{profile.isFollowing ? 'Following' : 'Follow'}</button>
            <button className="sc-circle sc-more-down" aria-label="More options" onClick={shareProfile}><Icon name="chevron-down" size={22} /></button>
          </div>
        )}
      </header>
      <section className="sc-profile-stats" aria-label="Profile statistics">
        <button type="button" onClick={() => openPeople('followers')} aria-label={`${formatCount(profile.followerCount || 0)} followers`}>
          <strong>{formatCount(profile.followerCount || 0)}</strong><span>Followers</span>
        </button>
        <button type="button" onClick={() => openPeople('following')} aria-label={`${formatCount(profile.followingCount || 0)} following`}>
          <strong>{formatCount(profile.followingCount || 0)}</strong><span>Following</span>
        </button>
        <button type="button" onClick={() => setTab('posts')} aria-label={`${formatCount(Math.max(Number(profile.creationCount) || 0, Number(profile.postCount) || 0, posts.length))} creations`}>
          <strong>{formatCount(Math.max(Number(profile.creationCount) || 0, Number(profile.postCount) || 0, posts.length))}</strong><span>Posts</span>
        </button>
      </section>
            {profile.isMe && <><input id="profile-avatar-file" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} /><input id="profile-cover-file" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadCover} /></>}

      {drawerOpen && <div className="profile-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
        <aside className="profile-drawer" role="dialog" aria-label="Profile settings" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head"><h3>Profile & settings</h3><button className="icon-button" onClick={() => setDrawerOpen(false)} aria-label="Close settings"><Icon name="x" size={21} /></button></div>
          <div className="profile-drawer-content">
          <button onClick={() => { setDrawerOpen(false); navigate('/upload'); }}><Icon name="plus" size={21} />Create post or story</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/friends'); }}><Icon name="users" size={21} />Find friends & creators</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/creator'); }}><Icon name="wallet" size={21} />Creator Studio · earnings & cashout</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/ads-sponsors'); }}><Icon name="megaphone" size={21} />Ads & Sponsors</button>
          <button onClick={openBlockedPeople}><Icon name="shield" size={21} />Blocked accounts</button>
          <button onClick={() => { setDrawerOpen(false); setImageChoiceOpen(true); }} disabled={avatarBusy || coverBusy}><Icon name="image" size={21} />Change profile or background image</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/live'); }}><Icon name="video" size={21} />LIVE broadcasts</button>
          <button onClick={() => { setDrawerOpen(false); setShowCoins(true); }}><Icon name="gift" size={21} />Get coins</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/business'); }}><Icon name="briefcase" size={21} />Business hub</button>
          <p className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 12 }} data-build="2026-11-06-f107ec4">Build 2026-11-06 · f107ec4</p>
          <button className="drawer-danger" onClick={() => { logout(); navigate('/login', { replace: true }); }}><Icon name="arrow-right" size={21} />Log out</button>
          </div>
        </aside>
      </div>}

      {imageViewerOpen && <div className="profile-image-viewer" role="dialog" aria-modal="true" aria-label={`@${profile.username} profile picture`} onClick={() => setImageViewerOpen(false)}>
        <button type="button" className="profile-image-viewer-close" aria-label="Close profile picture" onClick={() => setImageViewerOpen(false)}><Icon name="x" size={24} /></button>
        {profile.avatarUrl ? <img src={mediaUrl(profile.avatarUrl)} alt={`@${profile.username} profile picture`} onClick={(e) => e.stopPropagation()} /> : <div className="profile-image-viewer-empty" onClick={(e) => e.stopPropagation()}><Avatar user={profile} size={160} ring /><p>No profile picture yet</p></div>}
        <span className="profile-image-viewer-name">@{profile.username}</span>
      </div>}

      {imageChoiceOpen && profile.isMe && <div className="sheet-backdrop image-choice-backdrop" onClick={() => setImageChoiceOpen(false)}>
        <section className="sheet image-choice-sheet" role="dialog" aria-modal="true" aria-label="Choose image type" onClick={(e) => e.stopPropagation()}>
          <div className="people-sheet-handle" />
          <div className="people-sheet-title"><div><h3>Choose an image</h3><small>What would you like to update?</small></div><button className="icon-button" onClick={() => setImageChoiceOpen(false)} aria-label="Close"><Icon name="x" size={21} /></button></div>
          <button className="image-choice-option" onClick={() => { setImageChoiceOpen(false); document.getElementById('profile-avatar-file')?.click(); }} disabled={avatarBusy}><span className="sc-row-icon"><Icon name="user-round" size={22} /></span><span><strong>Profile image</strong><small>Change the photo shown on your profile</small></span><Icon name="chevron-right" size={20} /></button>
          <button className="image-choice-option" onClick={() => { setImageChoiceOpen(false); document.getElementById('profile-cover-file')?.click(); }} disabled={coverBusy}><span className="sc-row-icon"><Icon name="image" size={22} /></span><span><strong>Background image</strong><small>Change the large image behind your profile</small></span><Icon name="chevron-right" size={20} /></button>
        </section>
      </div>}

      {optionsOpen && !profile.isMe && <div className="sc-options-backdrop" onClick={() => setOptionsOpen(false)}>
        <section className="sc-options-sheet" role="dialog" aria-label={`Options for @${profile.username}`} onClick={(e) => e.stopPropagation()}>
          <button className="sc-option danger" onClick={blockProfile}>Block</button>
          <button className="sc-option danger" onClick={() => { setOptionsOpen(false); toast('Profile reporting is not available yet.'); }}>Report</button>
          <button className="sc-option toggle-row" onClick={() => { setOptionsOpen(false); toggleFollow(); }} disabled={busy}><span>Add</span><span className={`sc-switch${profile.isFollowing ? ' on' : ''}`} aria-checked={Boolean(profile.isFollowing)} role="switch" /></button>
          <button className="sc-option toggle-row" onClick={() => { setOptionsOpen(false); toggleNotify(); }} disabled={notifyBusy}><span>Post Notifications</span><span className={`sc-switch${profile.isNotifying ? ' on' : ''}`} aria-checked={Boolean(profile.isNotifying)} role="switch" /></button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); navigate('/recommended'); }}><span>Recommended</span><Icon name="chevron-right" size={18} /></button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); shareProfile(); }}><span>Send Profile to…</span><Icon name="send" size={18} /></button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); navigator.clipboard?.writeText(window.location.href).then(() => toast('Profile URL copied')).catch(() => toast('Unable to copy profile URL')); }}>Share Profile URL</button>
          <button className="sc-options-done" onClick={() => setOptionsOpen(false)}>Done</button>
        </section>
      </div>}
            {showCoins && <CoinSheet onClose={() => setShowCoins(false)} />}

      {listType && <div className="pv-sheet-backdrop" role="presentation">
        <section className="pv-sheet" role="dialog" aria-label={listType} onClick={(e) => e.stopPropagation()}>
          <header className="pv-sheet-top">
            <button type="button" className="pv-icon-btn" aria-label="Back" onClick={() => setListType('')}><Icon name="arrow-left" size={22} /></button>
            <h2 className="pv-sheet-title">{listType === 'blocked' ? 'Blocked accounts' : listType === 'activity' ? 'Activity' : profile.username}</h2>
            {profile.isMe && listType !== 'blocked' ? <button type="button" className="pv-icon-btn" aria-label="Find people" onClick={() => { setListType(''); navigate('/explore'); }}><Icon name="user-plus" size={22} /></button> : <span className="pv-icon-spacer" aria-hidden="true" />}
          </header>
          {listType !== 'blocked' && <nav className="pv-sheet-tabs" role="tablist" aria-label="Connections">
            <button type="button" role="tab" aria-selected={listType === 'followers'} className={listType === 'followers' ? 'on' : ''} onClick={() => { if (listType !== 'followers') openPeople('followers'); }}><strong>{formatCount(profile.followerCount || 0)}</strong><span>Followers</span></button>
            <button type="button" role="tab" aria-selected={listType === 'following'} className={listType === 'following' ? 'on' : ''} onClick={() => { if (listType !== 'following') openPeople('following'); }}><strong>{formatCount(profile.followingCount || 0)}</strong><span>Following</span></button>
            {profile.isMe && <button type="button" role="tab" aria-selected={listType === 'activity'} className={listType === 'activity' ? 'on' : ''} onClick={() => { if (listType !== 'activity') openActivity(); }}><strong>{activity.length ? formatCount(activity.length) : '0'}</strong><span>Activity</span></button>}
          </nav>}
          {listType === 'activity' ? (
            <ul className="pv-list" aria-label="Activity">
              {activityLoading && <li className="pv-empty-row">Loading activity…</li>}
              {!activityLoading && !activity.length && <li className="pv-empty-row">No activity yet. Likes, comments, follows and new posts from creators you follow will appear here.</li>}
              {activity.map((item) => (
                <li className="pv-row pv-activity-row" key={item.id}>
                  <button type="button" className="pv-person" onClick={() => { setListType(''); if (item.actor?.username) navigate(`/u/${item.actor.username}`); }}>
                    <Avatar user={item.actor || {}} size={44} />
                    <span className="pv-person-text"><strong>{activityText(item)}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <>
            {listType !== 'blocked' && <label className="pv-search"><Icon name="search" size={18} /><input aria-label="Search people" value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} placeholder="Search" /></label>}
            {listType !== 'blocked' && <div className="pv-sort">Sorted by <strong>Default</strong></div>}
            <ul className="pv-list">
              {people.filter((person) => `${person.displayName || ''} ${person.username || ''}`.toLowerCase().includes(peopleQuery.trim().toLowerCase())).map((person) => (
                <li className="pv-row" key={person.id}>
                  <button type="button" className="pv-person" onClick={() => { setListType(''); navigate(`/u/${person.username}`); }}>
                    <Avatar user={person} size={52} />
                    <span className="pv-person-text"><strong>{person.username}</strong><small>{person.displayName || ''}</small></span>
                  </button>
                  {listType === 'blocked'
                    ? <button type="button" className="pv-follow" onClick={() => unblockPerson(person)} disabled={Boolean(peopleBusy[person.id])}>{peopleBusy[person.id] ? '…' : 'Unblock'}</button>
                    : <button type="button" className={person.isFollowing ? 'pv-follow added' : 'pv-follow'} onClick={() => toggleListFollow(person)} disabled={Boolean(peopleBusy[person.id])}>{peopleBusy[person.id] ? '…' : person.isFollowing ? 'Following' : 'Add'}</button>}
                </li>
              ))}
            </ul>
            {!people.length && <div className="pv-empty"><Icon name={listType === 'blocked' ? 'shield' : 'users'} size={28} /><strong>{listType === 'blocked' ? 'No blocked accounts' : `No ${listType} yet`}</strong><p>{listType === 'blocked' ? 'Accounts you block will appear here.' : 'People who connect with this account will appear here.'}</p></div>}
          </>}
        </section>
      </div>}

      {profile.isMe && <button className="sc-post-float" onClick={() => navigate('/upload')}><span className="sc-post-float-icon"><Icon name="play" size={18} /></span><span>Post to Rimlight</span><Icon name="chevron-right" size={20} /></button>}
      <nav className="sc-tabs" role="tablist" aria-label="Profile content">
        <button role="tab" aria-selected={tab === 'stories'} className={tab === 'stories' ? 'on' : ''} onClick={() => setTab('stories')}><Icon name="circle-play" size={18} />Stories</button>
        <button role="tab" aria-selected={tab === 'posts'} className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}><Icon name="clapperboard" size={18} />Rimlight</button>
        <button role="tab" aria-selected={tab === 'reposts'} className={tab === 'reposts' ? 'on' : ''} onClick={() => setTab('reposts')}><Icon name="repeat-2" size={18} />Reposts</button>
        <button role="tab" aria-selected={tab === 'tags'} className={tab === 'tags' ? 'on' : ''} onClick={() => setTab('tags')}><Icon name="hash" size={18} />#Tags</button>
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
      ) : tab === 'stories' ? (
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
      ) : tab === 'reposts' ? (
        <>
          {repostsLoading ? <p className="sc-empty-note">Loading reposts…</p> : <div className="sc-grid">{reposts.map((p) => <div key={p.id} className="sc-tile" role="button" tabIndex={0} onClick={() => navigate(`/p/${p.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/p/${p.id}`); }}>{p.kind === 'video' ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" /> : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}<span className="sc-tile-count"><Icon name="repeat-2" size={12} />{formatCount(p.repostCount || 0)}</span></div>)}</div>}
          {!repostsLoading && !reposts.length && <p className="sc-empty-note">No reposts yet.</p>}
        </>
      ) : (
        <section className="sc-hashtag-panel" aria-label="Profile hashtags">
          {[...new Set(posts.flatMap((post) => (post.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []))].length ? [...new Set(posts.flatMap((post) => (post.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []))].map((tag) => <button key={tag} className="sc-hashtag-chip" onClick={() => navigate(`/explore?search=1&q=${encodeURIComponent(tag)}`)}><Icon name="hash" size={16} />{tag.slice(1)}</button>) : <p className="sc-empty-note">Hashtags from your Rimlight captions will appear here.</p>}
        </section>
      )}
    </div>
  );
}
