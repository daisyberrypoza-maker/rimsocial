import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePullRefresh } from '../lib/pullRefresh.jsx';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import StoryViewer from '../components/StoryViewer.jsx';
import { defaultCover } from '../lib/cover.js';
import CoinSheet from '../components/CoinSheet.jsx';
import { goBack } from '../lib/goBack.js';
import { logError } from '../toast.js';
import '../settings-menu.css';

const LIST_TYPES = ['followers', 'following', 'blocked', 'activity'];
const PROFILE_TABS = ['posts', 'stories', 'reposts'];

// Settings menu building blocks: grouped sections with aligned rows (see settings-menu.css).
function SettingsSection({ title, children }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function SettingsItem({ icon, title, subtitle, onClick, disabled, danger }) {
  return (
    <button type="button" className="settings-item" onClick={onClick} disabled={disabled}>
      <span className="settings-item-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
      <span className="settings-item-text">
        <span className="settings-item-title">{title}</span>
        {subtitle && <span className="settings-item-sub">{subtitle}</span>}
      </span>
      {!danger && <span className="settings-item-chevron" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>}
    </button>
  );
}

export default function Profile() {
  const { username = 'me', list = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAppStore((s) => s.logout);
  const setProfile = useAppStore((s) => s.setProfile);
  const setFeed = useAppStore((s) => s.setFeed);
  const profile = useAppStore((s) => s.profiles[username]?.user);
  const feedKey = `u:${username}`;
  const feedPosts = useAppStore((s) => s.feeds[feedKey]?.items || []);
  const nextCursor = useAppStore((s) => s.feeds[feedKey]?.nextCursor ?? null);

  // Only posts written by the profile's owner are shown on this profile
  const posts = profile ? feedPosts.filter((p) => (p.author?.id ?? profile.id) === profile.id) : [];
  const tagList = [...new Set(posts.flatMap((post) => (post.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []))];

  const [tab, setTab] = useState('posts');
  const [reposts, setReposts] = useState([]);
  const [repostsLoading, setRepostsLoading] = useState(false);
  const [stories, setStories] = useState([]);
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showCoins, setShowCoins] = useState(false);
  // The list is open when its address is open, so Back returns to it
  const listType = LIST_TYPES.includes(list) ? list : '';
  const [people, setPeople] = useState([]);
  const peopleCache = useRef({});
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleBusy, setPeopleBusy] = useState({});
  const [peopleSort, setPeopleSort] = useState('default');
  const [sortOpen, setSortOpen] = useState(false);
  const [listMenuPerson, setListMenuPerson] = useState(null);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const tabSwipeStart = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverPreview, setCoverPreview] = useState(null);
  const [imageChoiceOpen, setImageChoiceOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  // 0 to 1: how far the scrolled bar has faded in
  const [compactProgress, setCompactProgress] = useState(0);
  const compactHeader = compactProgress > 0.5;

  function backFromProfile(fallback = '/') {
    const returnTo = location.state?.returnTo;
    if (typeof returnTo === 'string' && returnTo.startsWith('/u/')) navigate(returnTo, { replace: true });
    else goBack(navigate, fallback);
  }

  useEffect(() => {
    let current = true;
    api(`/v1/users/${username}`)
      .then((user) => {
        if (!current) return;
        const storyRing = user.storyRing || (user.hasStory ? 'unseen' : null);
        useAppStore.getState().setStoryRings({ [user.id]: storyRing });
        setProfile(username, { user: { ...user, storyRing }, updatedAt: Date.now() });

        // Warm connection lists and the activity count while the profile is visible,
        // so opening Followers, Following, or Activity does not start with an empty panel.
        const preload = [
          api(`/v1/users/${username}/followers`),
          api(`/v1/users/${username}/following`),
          user.isMe ? api('/v1/activity') : Promise.resolve(null),
        ];
        Promise.all(preload).then(([followers, following, activityData]) => {
          if (!current) return;
          peopleCache.current[username] = {
            followers: followers.items || [],
            following: following.items || [],
          };
          if (activityData) setActivity(activityData.items || []);
        }).catch((e) => logError(e));
      })
      .catch((e) => { if (current) logError(e); });
    loadPage(feedKey, `/v1/users/${username}/posts`, true).catch((e) => logError(e));
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (tab !== 'reposts' || !profile) return;
    setRepostsLoading(true);
    api(`/v1/users/${username}/reposts`).then((data) => setReposts(data.items || [])).catch(() => setReposts([])).finally(() => setRepostsLoading(false));
  }, [tab, profile, username]);

  // Switching profiles must never leave the previous person's stories or reposts on screen
  useEffect(() => { setStories([]); setReposts([]); setViewing(false); }, [username]);

  useEffect(() => {
    if (tab !== 'stories' || !profile) return undefined;
    let current = true;
    api(`/v1/stories/users/${profile.id}`)
      .then((d) => { if (current) setStories((d.items || []).filter((s) => (s.author?.id ?? profile.id) === profile.id)); })
      .catch(() => { if (current) setStories([]); });
    return () => { current = false; };
  }, [tab, profile]);

  // Swipe left or right across the profile content to move between Spotlight, Stories and Reposts.
  // The content follows the finger, slides off, and the new tab slides in from the other side.
  const swipeRef = useRef(null);
  const swipeEnterFrom = useRef(null);
  const swipeBusy = useRef(false);
  const SWIPE_MS = 260;
  const SWIPE_EASE = `transform ${SWIPE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;

  function moveSwipe(px, animate) {
    const el = swipeRef.current;
    if (!el) return;
    el.style.transition = animate ? SWIPE_EASE : 'none';
    el.style.transform = `translate3d(${px}px, 0, 0)`;
  }

  // Clear the transform at rest so fixed-position children (such as the story viewer) are not affected
  function clearSwipe() {
    const el = swipeRef.current;
    if (!el) return;
    el.style.transform = '';
    el.style.transition = '';
  }

  function onTabSwipeStart(e) {
    if (swipeBusy.current) return;
    const t = e.touches[0];
    tabSwipeStart.current = { x: t.clientX, y: t.clientY, locked: null };
  }

  function onTabSwipeMove(e) {
    const start = tabSwipeStart.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (start.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Decide once whether this is a sideways swipe or a vertical scroll
      start.locked = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
    }
    if (start.locked !== 'x') return;
    const index = PROFILE_TABS.indexOf(tab);
    // Resist dragging past the first or last tab
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === PROFILE_TABS.length - 1);
    moveSwipe(atEdge ? dx * 0.3 : dx, false);
  }

  function onTabSwipeEnd(e) {
    const start = tabSwipeStart.current;
    tabSwipeStart.current = null;
    if (!start || swipeBusy.current) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const index = PROFILE_TABS.indexOf(tab);
    const next = dx < 0 ? index + 1 : index - 1;
    const canMove = start.locked === 'x' && Math.abs(dx) >= 60 && next >= 0 && next < PROFILE_TABS.length;
    swipeBusy.current = true;
    if (!canMove) {
      // Not a full swipe: spring back to place
      moveSwipe(0, true);
      setTimeout(() => { clearSwipe(); swipeBusy.current = false; }, SWIPE_MS);
      return;
    }
    const width = swipeRef.current?.offsetWidth || window.innerWidth;
    // Slide the current content off in the swipe direction, then switch tabs
    moveSwipe(dx < 0 ? -width : width, true);
    setTimeout(() => {
      swipeEnterFrom.current = dx < 0 ? width : -width;
      setTab(PROFILE_TABS[next]);
    }, SWIPE_MS);
  }

  // After a tab change, place the new content off to the side and slide it into view
  useLayoutEffect(() => {
    const from = swipeEnterFrom.current;
    if (from === null) return;
    swipeEnterFrom.current = null;
    moveSwipe(from, false);
    void swipeRef.current?.offsetWidth;
    moveSwipe(0, true);
    setTimeout(() => { clearSwipe(); swipeBusy.current = false; }, SWIPE_MS);
  }, [tab]);

  function openPeople(type, replace = false) {
    navigate(`/u/${username}/${type}`, { replace });
  }

  function openBlockedPeople() {
    setDrawerOpen(false);
    navigate(`/u/${username}/blocked`);
  }

  // Use preloaded data immediately; refresh it quietly while the panel is open.
  useEffect(() => {
    if (!listType) return undefined;
    let current = true;
    if (listType === 'activity') {
      if (!activity.length) setActivityLoading(true);
      api('/v1/activity')
        .then((data) => { if (current) setActivity(data.items || []); })
        .catch((e) => { if (current) logError(e); })
        .finally(() => { if (current) setActivityLoading(false); });
    } else {
      setPeopleQuery('');
      const path = listType === 'blocked' ? '/v1/users/blocked' : `/v1/users/${username}/${listType}`;
      const cachedPeople = peopleCache.current[username]?.[listType];
      if (cachedPeople) {
        setPeople(cachedPeople);
        setPeopleLoading(false);
      } else {
        setPeople([]);
        setPeopleLoading(true);
      }
      api(path)
        .then((data) => {
          if (!current) return;
          const items = data.items || [];
          if (listType !== 'blocked') {
            peopleCache.current[username] = { ...(peopleCache.current[username] || {}), [listType]: items };
          }
          setPeople(items);
        })
        .catch((e) => { if (current && !cachedPeople) { setPeople([]); logError(e); } })
        .finally(() => { if (current) setPeopleLoading(false); });
    }
    return () => { current = false; };
  }, [listType, username]);

  async function unblockPerson(person) {
    if (peopleBusy[person.id]) return;
    setPeopleBusy((current) => ({ ...current, [person.id]: true }));
    try {
      await api(`/v1/users/${person.id}/block`, { method: 'DELETE' });
      setPeople((current) => current.filter((item) => item.id !== person.id));
      toast(`@${person.username} unblocked`);
    } catch (e) { logError(e); }
    finally { setPeopleBusy((current) => ({ ...current, [person.id]: false })); }
  }

  function openActivity(replace = false) {
    navigate(`/u/${username}/activity`, { replace });
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
      setPeople((current) => {
        const updated = current.map((item) => item.id === person.id
          ? { ...item, isFollowing: response.isFollowing, followerCount: response.followerCount }
          : item);
        if (listType !== 'blocked') peopleCache.current[username] = { ...(peopleCache.current[username] || {}), [listType]: updated };
        return updated;
      });
      // Keep the profile's connection totals in sync with the list immediately.
      const delta = response.isFollowing ? 1 : -1;
      setProfile(username, { user: {
        ...profile,
        followingCount: Math.max(0, Number(profile.followingCount || 0) + delta),
      } });
    } catch (e) { logError(e); }
    finally { setPeopleBusy((current) => ({ ...current, [person.id]: false })); }
  }

  async function togglePersonMute(person) {
    if (peopleBusy[person.id]) return;
    setPeopleBusy((current) => ({ ...current, [person.id]: true }));
    try {
      const response = await api(`/v1/users/${person.id}/mute`, { method: 'PUT', body: { enabled: !person.isMuted } });
      setPeople((current) => {
        const updated = current.map((item) => item.id === person.id ? { ...item, isMuted: Boolean(response.muted) } : item);
        peopleCache.current[username] = { ...(peopleCache.current[username] || {}), [listType]: updated };
        return updated;
      });
      toast(response.muted ? `Muted @${person.username}` : `Unmuted @${person.username}`);
    } catch (e) { toast(e.message || 'Could not update mute setting'); logError(e); }
    finally { setPeopleBusy((current) => ({ ...current, [person.id]: false })); }
  }

  function openPersonSharedActivity(person) {
    setListMenuPerson(null);
    navigate(`/chat/${person.id}`, { state: { openSharedActivity: true } });
  }

  async function removeFollower(person) {
    if (!profile?.isMe || peopleBusy[person.id]) return;
    if (!window.confirm(`Remove @${person.username} as a follower?`)) return;
    setPeopleBusy((current) => ({ ...current, [person.id]: true }));
    try {
      await api(`/v1/users/${person.id}/follower`, { method: 'DELETE' });
      setPeople((current) => {
        const updated = current.filter((item) => item.id !== person.id);
        peopleCache.current[username] = { ...(peopleCache.current[username] || {}), followers: updated };
        return updated;
      });
      setProfile(username, { user: { ...profile, followerCount: Math.max(0, Number(profile.followerCount || 0) - 1) } });
    } catch (error) { logError(error); }
    finally { setPeopleBusy((current) => ({ ...current, [person.id]: false })); }
  }

  async function refreshProfile() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const user = await api(`/v1/users/${username}`);
      const storyRing = user.storyRing || (user.hasStory ? 'unseen' : null);
      useAppStore.getState().setStoryRings({ [user.id]: storyRing });
      setProfile(username, { user: { ...user, storyRing }, updatedAt: Date.now() });
      await loadPage(feedKey, `/v1/users/${username}/posts`, true);
    } catch (e) { logError(e); }
    finally { setRefreshing(false); }
  }

  const { indicator: pullIndicator } = usePullRefresh(refreshProfile);

  function onTouchEnd(e) {
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 90 && e.currentTarget.scrollTop <= 0) refreshProfile();
  }

  // The chosen picture shows at once. The saved one is loaded in the background and then swapped in once,
  // and every place that shows your picture (this screen, the Stories header, the bottom bar) is updated.
  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Choose a JPG, PNG or WebP image');
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    const form = new FormData();
    form.append('media', file);
    try {
      const result = await api('/v1/users/me/avatar', { method: 'POST', body: form });
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = mediaUrl(result.avatarUrl);
      });
      const store = useAppStore.getState();
      const updated = { ...profile, avatarUrl: result.avatarUrl };
      setProfile(username, { user: updated, updatedAt: Date.now() });
      setProfile('me', { user: updated, updatedAt: Date.now() });
      if (store.user) store.setSession(store.token, { ...store.user, avatarUrl: result.avatarUrl });
      toast('Profile photo updated');
    } catch (e) { logError(e); toast('Could not update the photo'); }
    finally { setAvatarPreview(null); URL.revokeObjectURL(preview); }
  }

  async function uploadCover(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Choose a JPG, PNG or WebP image');
    const form = new FormData();
    form.append('media', file);
    // The new cover shows at once; it is kept only if the upload succeeds
    const preview = URL.createObjectURL(file);
    setCoverPreview(preview);
    setCoverBusy(true);
    try {
      const result = await api('/v1/users/me/cover', { method: 'POST', body: form });
      setProfile(username, { user: { ...profile, coverUrl: result.coverUrl } });
      setDrawerOpen(false);
      toast('Profile cover updated');
    } catch (e) { logError(e); toast('Could not update the cover'); }
    finally { setCoverBusy(false); setCoverPreview(null); URL.revokeObjectURL(preview); }
  }

  async function blockProfile() {
    if (!window.confirm(`Block @${profile.username}? They will no longer be able to interact with you.`)) return;
    try {
      await api(`/v1/users/${profile.id}/block`, { method: 'POST' });
      setOptionsOpen(false);
      toast(`@${profile.username} blocked`);
      navigate('/explore', { replace: true });
    } catch (e) { logError(e); }
  }

  async function toggleNotify() {
    if (!profile || profile.isMe) return;
    if (!profile.isFollowing) return toast('Add this creator first to get new post notifications');
    setNotifyBusy(true);
    try {
      const r = await api(`/v1/users/${profile.id}/follow/notify`, { method: 'PUT', body: { enabled: !profile.isNotifying } });
      setProfile(username, { user: { ...profile, isNotifying: r.isNotifying } });
      toast(r.isNotifying ? 'You will be notified when they post' : 'Post notifications off');
    } catch (err) { logError(err); }
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
      logError(err);
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
    } catch (e) { logError(e); }
    finally { setDeleting(null); }
  }

  async function loadMore() {
    setLoadingMore(true);
    try { await loadPage(feedKey, `/v1/users/${username}/posts`); }
    catch (e) { logError(e); }
    finally { setLoadingMore(false); }
  }

  async function shareProfile() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: profile.username, url });
      else { await navigator.clipboard.writeText(url); toast('Profile link copied'); }
    } catch { /* share cancelled */ }
  }

  if (!profile) return <div className="page profile-page" />;

  const compactConnectionCount = (value) => formatCount(Number(value) || 0).toLowerCase();
  const hoursLeft = (s) => Math.max(1, Math.round((new Date(s.expiresAt) - Date.now()) / 3.6e6));

  return (
    <div className={`page profile-page sc-profile${profile.isMe ? ' is-me' : ' is-other'}`} onScroll={(e) => setCompactProgress(Math.min(1, Math.max(0, (e.currentTarget.scrollTop - 40) / 110)))}>
      <div className={`sc-compact-nav${compactProgress > 0 ? ' visible' : ''}`} aria-hidden={!compactHeader} style={{ opacity: compactProgress, transform: 'none', transition: 'none', pointerEvents: compactHeader ? 'auto' : 'none' }}>
        <button className="sc-compact-back" aria-label="Back" onClick={() => backFromProfile()} tabIndex={compactHeader ? 0 : -1}><Icon name="arrow-left" size={22} /></button>
        <div className="sc-compact-name">{profile.displayName || profile.username}</div>
        <div className="sc-compact-actions">
          <button type="button" className="sc-compact-round" aria-label="Share profile" onClick={shareProfile} tabIndex={compactHeader ? 0 : -1}><Icon name="share" size={18} /></button>
          {profile.isMe
            ? <button type="button" className="sc-compact-round" aria-label="Open profile settings" onClick={() => setDrawerOpen(true)} tabIndex={compactHeader ? 0 : -1}><Icon name="settings" size={19} /></button>
            : <button type="button" className="sc-compact-round" aria-label="More options" onClick={() => setOptionsOpen(true)} tabIndex={compactHeader ? 0 : -1}><span aria-hidden="true">•••</span></button>}
        </div>
      </div>
      <header className="pf-hero">
        <div className="pf-cover" aria-hidden="true" style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : profile.coverUrl ? { backgroundImage: `url(${mediaUrl(profile.coverUrl)})` } : { background: defaultCover(profile.username).css }} />
        <span className="pf-shade" aria-hidden="true" />
        <div className="pf-top">
          <button type="button" className="pf-round" aria-label="Back" onClick={() => goBack(navigate)}><Icon name="arrow-left" size={22} /></button>
          <div className="pf-top-right">
            {!profile.isMe && profile.isFollowing && <button type="button" className={`pf-round pf-bell${profile.isNotifying ? ' on' : ''}`} aria-label={profile.isNotifying ? 'Turn off new post notifications' : 'Turn on new post notifications'} aria-pressed={Boolean(profile.isNotifying)} onClick={toggleNotify} disabled={notifyBusy}><Icon name="bell" size={20} /></button>}
            <button type="button" className="pf-round" aria-label="Share profile" onClick={shareProfile}><Icon name="share" size={20} /></button>
            {profile.isMe
              ? <button type="button" className="pf-round" aria-label="Open profile settings" onClick={() => setDrawerOpen(true)}><Icon name="settings" size={21} /></button>
              : <button type="button" className="pf-round" aria-label="More options" onClick={() => setOptionsOpen(true)}><span aria-hidden="true">•••</span></button>}
          </div>
        </div>
        <div className="pf-id">
          <div className="pf-avatar">
            <button type="button" className="pf-avatar-btn" aria-label={profile.avatarUrl ? 'View profile picture' : 'View profile avatar'} onClick={() => setImageViewerOpen(true)}>
              <Avatar user={avatarPreview ? { ...profile, avatarUrl: avatarPreview } : profile} size={84} storyRing={profile.storyRing || (profile.hasStory ? "unseen" : null)} />
            </button>
            {profile.isOnline && <span className="pf-online" aria-label="Online now" />}
            {profile.isMe && <button type="button" className="pf-edit" aria-label="Choose profile or background image" onClick={() => setImageChoiceOpen(true)} disabled={avatarBusy || coverBusy}>{avatarBusy ? '…' : <Icon name="camera" size={15} />}</button>}
          </div>
          <div className="pf-name-block">
            <h2 className="pf-name">
              <span>{profile.displayName || profile.username}</span>
              {profile.isCreator && <span className="pf-star" aria-label="Verified">★</span>}
              {profile.isMe && <button type="button" className="pf-chev" aria-label="Profile options" onClick={() => setDrawerOpen(true)}><Icon name="chevron-down" size={18} /></button>}
            </h2>
            <p className="pf-handle">{profile.username}</p>
            <p className="pf-sub"><button type="button" className="pf-link" onClick={() => openPeople('followers')}>{compactConnectionCount(profile.followerCount)} Followers</button>{profile.isCreator && <> · Creator</>}</p>
          </div>
        </div>
        {profile.isMe ? (
          <div className="pf-actions">
            <button type="button" className="pf-btn pf-btn-on" onClick={() => navigate('/u/me/edit')}>Edit</button>
            <button type="button" className="pf-btn" onClick={shareProfile}>Share</button>
          </div>
        ) : (
          <div className="pf-actions">
            <button type="button" className={`pf-btn pf-add${profile.isFollowing ? ' added' : ''}`} onClick={toggleFollow} disabled={busy}><Icon name="user-plus" size={22} />{profile.isFollowing ? 'Added' : 'Add'}</button>
            <button type="button" className="pf-round pf-more" aria-label="More options" onClick={() => setOptionsOpen(true)}><Icon name="chevron-down" size={22} /></button>
          </div>
        )}
      </header>
      {pullIndicator}
      <div className="pf-body">
        {profile.bio && <p className="pf-bio">{profile.bio}</p>}
        {(profile.city || profile.country || profile.website) && (
          <div className="pf-chips">
            {(profile.city || profile.country) && <span className="pf-chip"><Icon name="map-pin" size={15} />{[profile.city, profile.country].filter(Boolean).join(', ')}</span>}
            {profile.website && <a className="pf-chip" href={profile.website} target="_blank" rel="noopener noreferrer"><Icon name="link" size={15} />{profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>}
          </div>
        )}
      </div>
      <section className="sc-profile-stats" aria-label="Profile statistics">
        <button type="button" onClick={() => openPeople('followers')} aria-label={`${compactConnectionCount(profile.followerCount)} followers`}>
          <strong>{compactConnectionCount(profile.followerCount)}</strong><span>Followers</span>
        </button>
        <button type="button" onClick={() => openPeople('following')} aria-label={`${compactConnectionCount(profile.followingCount)} following`}>
          <strong>{compactConnectionCount(profile.followingCount)}</strong><span>Following</span>
        </button>
        <button type="button" onClick={() => setTab('posts')} aria-label={`${formatCount(Math.max(Number(profile.creationCount) || 0, Number(profile.postCount) || 0, posts.length))} creations`}>
          <strong>{formatCount(Math.max(Number(profile.creationCount) || 0, Number(profile.postCount) || 0, posts.length))}</strong><span>Posts</span>
        </button>
      </section>
            {profile.isMe && <><input id="profile-avatar-file" className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadAvatar} /><input id="profile-cover-file" className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadCover} /></>}

      {drawerOpen && createPortal(<div className="profile-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
        <aside className="settings-menu" role="dialog" aria-modal="true" aria-label="Profile and settings" onClick={(e) => e.stopPropagation()}>
          <header className="settings-head">
            <h2>Profile & settings</h2>
            <button type="button" className="settings-close" onClick={() => setDrawerOpen(false)} aria-label="Close settings"><Icon name="x" size={20} /></button>
          </header>
          <div className="settings-body">
            <SettingsSection title="Account">
              <SettingsItem icon="user-round" title="My profile" onClick={() => { setDrawerOpen(false); navigate('/u/' + profile.username); }} />
              <SettingsItem icon="image" title="Change profile or background" subtitle="Profile picture or cover image" disabled={avatarBusy || coverBusy} onClick={() => { setDrawerOpen(false); setImageChoiceOpen(true); }} />
              <SettingsItem icon="gift" title="Get coins" onClick={() => { setDrawerOpen(false); setShowCoins(true); }} />
              <SettingsItem icon="shield" title="Blocked accounts" onClick={openBlockedPeople} />
            </SettingsSection>
            <SettingsSection title="Create">
              <SettingsItem icon="plus" title="Create post or story" onClick={() => { setDrawerOpen(false); navigate('/upload'); }} />
              <SettingsItem icon="wallet" title="Creator Studio" subtitle="Earnings and cashout" onClick={() => { setDrawerOpen(false); navigate('/creator'); }} />
              <SettingsItem icon="megaphone" title="Ads & sponsors" onClick={() => { setDrawerOpen(false); navigate('/ads-sponsors'); }} />
            </SettingsSection>
            <SettingsSection title="Discover">
              <SettingsItem icon="users" title="Find friends & creators" onClick={() => { setDrawerOpen(false); navigate('/friends'); }} />
              <SettingsItem icon="video" title="LIVE broadcasts" onClick={() => { setDrawerOpen(false); navigate('/live'); }} />
            </SettingsSection>
            <div className="settings-foot">
              <button type="button" className="settings-logout" onClick={() => { logout(); navigate('/login', { replace: true }); }}><Icon name="arrow-right" size={20} />Log out</button>
              <p className="settings-build" data-build="2026-11-06-f107ec4">Build 2026-11-06 · f107ec4</p>
            </div>
          </div>
        </aside>
      </div>, document.body)}

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
          <button className="sc-option" onClick={() => { setOptionsOpen(false); navigate(`/chat/${profile.id}`); }}><span>Contact</span><Icon name="mail" size={18} /></button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); navigate('/recommended'); }}><span>Recommended</span><Icon name="chevron-right" size={18} /></button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); shareProfile(); }}><span>Send Profile to…</span><Icon name="send" size={18} /></button>
          <button className="sc-option" onClick={() => { setOptionsOpen(false); navigator.clipboard?.writeText(window.location.href).then(() => toast('Profile URL copied')).catch(() => toast('Unable to copy profile URL')); }}>Share Profile URL</button>
          <button className="sc-options-done" onClick={() => setOptionsOpen(false)}>Done</button>
        </section>
      </div>}
            {showCoins && <CoinSheet onClose={() => setShowCoins(false)} />}

      {listType && profile && createPortal(<div className="pv-sheet-backdrop" role="presentation">
        <section className="pv-sheet" role="dialog" aria-label={listType} onClick={(e) => e.stopPropagation()}>
          <header className="pv-sheet-top">
            <button type="button" className="pv-icon-btn" aria-label="Back" onClick={() => backFromProfile(`/u/${username}`)}><Icon name="arrow-left" size={22} /></button>
            <h2 className="pv-sheet-title">{listType === 'blocked' ? 'Blocked accounts' : listType === 'activity' ? 'Activity' : profile.username}</h2>
            {profile.isMe && listType !== 'blocked' ? <button type="button" className="pv-icon-btn" aria-label="Find people" onClick={() => navigate('/explore')}><Icon name="user-plus" size={22} /></button> : <span className="pv-icon-spacer" aria-hidden="true" />}
          </header>
          {listType !== 'blocked' && <nav className="pv-sheet-tabs" role="tablist" aria-label="Connections">
            <button type="button" role="tab" aria-selected={listType === 'followers'} className={listType === 'followers' ? 'on' : ''} onClick={() => { if (listType !== 'followers') openPeople('followers', true); }}><strong>{compactConnectionCount(profile.followerCount)}</strong><span>Followers</span></button>
            <button type="button" role="tab" aria-selected={listType === 'following'} className={listType === 'following' ? 'on' : ''} onClick={() => { if (listType !== 'following') openPeople('following', true); }}><strong>{compactConnectionCount(profile.followingCount)}</strong><span>Following</span></button>
            {profile.isMe && <button type="button" role="tab" aria-selected={listType === 'activity'} className={listType === 'activity' ? 'on' : ''} onClick={() => { if (listType !== 'activity') openActivity(true); }}><strong>{activity.length ? formatCount(activity.length) : '0'}</strong><span>Activity</span></button>}
          </nav>}
          {listType === 'activity' ? (
            <ul className="pv-list" aria-label="Activity">
              
              {!activityLoading && !activity.length && <li className="pv-empty-row pv-activity-empty">No activity yet. Likes, comments, follows and new posts from creators you follow will appear here.</li>}
              {activity.map((item) => (
                <li className="pv-row pv-activity-row" key={item.id}>
                  <button type="button" className="pv-person" onClick={() => { if (item.actor?.username) navigate(`/u/${item.actor.username}`); }}>
                    <Avatar user={item.actor || {}} size={44} />
                    <span className="pv-person-text"><strong>{activityText(item)}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <>
            {listType !== 'blocked' && <label className="pv-search"><Icon name="search" size={18} /><input aria-label="Search people" value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} placeholder="Search" /></label>}
            {listType !== 'blocked' && <div className="pv-sort-row">
              <span>Sorted by <strong>{peopleSort === 'default' ? 'Default' : peopleSort === 'newest' ? 'Date followed: Latest' : 'Date followed: Earliest'}</strong></span>
              {profile.isMe && <button type="button" className="pv-sort-trigger" aria-label="Change sort order" onClick={() => setSortOpen((open) => !open)}><Icon name="arrow-down-up" size={22} /></button>}
              {sortOpen && <div className="pv-sort-menu">
                {[['default', 'Default'], ['newest', 'Date followed: Latest'], ['oldest', 'Date followed: Earliest']].map(([value, label]) => <button type="button" key={value} className={peopleSort === value ? 'on' : ''} onClick={() => { setPeopleSort(value); setSortOpen(false); }}>{label}</button>)}
              </div>}
            </div>}
            <ul className="pv-list">
              {[...people].filter((person) => `${person.displayName || ''} ${person.username || ''}`.toLowerCase().includes(peopleQuery.trim().toLowerCase())).sort((a, b) => { if (peopleSort === 'default') return 0; const delta = new Date(a.relationshipCreatedAt || 0).getTime() - new Date(b.relationshipCreatedAt || 0).getTime(); return peopleSort === 'newest' ? -delta : delta; }).map((person) => (
                <li className="pv-row" key={person.id}>
                  <button type="button" className="pv-person" onClick={() => navigate(`/u/${person.username}`, { state: { returnTo: location.pathname } })}>
                    <Avatar user={person} size={52} />
                    <span className="pv-person-text"><strong>{person.username}</strong><small>{person.displayName || ''}</small></span>
                  </button>
                  {listType === 'blocked'
                    ? <button type="button" className="pv-follow" onClick={() => unblockPerson(person)} disabled={Boolean(peopleBusy[person.id])}>{peopleBusy[person.id] ? '…' : 'Unblock'}</button>
                    : listType === 'followers' && !person.isFollowing
                      ? <button type="button" className="pv-follow primary" onClick={() => toggleListFollow(person)} disabled={Boolean(peopleBusy[person.id])}>{peopleBusy[person.id] ? '…' : 'Follow back'}</button>
                      : <button type="button" className="pv-follow added" onClick={() => navigate(`/chat/${person.id}`)}>Message</button>}
                  {listType === 'followers' && profile.isMe && <button type="button" className="pv-remove-follower" aria-label={`Remove ${person.username} as follower`} onClick={() => removeFollower(person)} disabled={Boolean(peopleBusy[person.id])}><Icon name="x" size={20} /></button>}
                  {listType === 'following' && <div className="pv-person-menu-wrap">
                    <button type="button" className="pv-more" aria-label={`Options for ${person.username}`} aria-expanded={listMenuPerson === person.id} onClick={() => setListMenuPerson((current) => current === person.id ? null : person.id)}><Icon name="more-vertical" size={18} /></button>
                    {listMenuPerson === person.id && <div className="pv-person-menu" role="menu">
                      <button type="button" role="menuitem" className={person.isFollowing ? 'danger' : ''} onClick={() => { setListMenuPerson(null); toggleListFollow(person); }} disabled={Boolean(peopleBusy[person.id])}>{person.isFollowing ? 'Unfollow' : 'Follow back'}</button>
                      <button type="button" role="menuitem" onClick={() => togglePersonMute(person)} disabled={Boolean(peopleBusy[person.id])}>{person.isMuted ? 'Unmute' : 'Mute'}</button>
                      <button type="button" role="menuitem" onClick={() => openPersonSharedActivity(person)}>See shared activity</button>
                    </div>}
                  </div>}
                </li>
              ))}
            </ul>
            {peopleLoading
              ? <li className="pv-empty-row">Loading {listType}…</li>
              : !people.length && <div className="pv-empty"><Icon name={listType === 'blocked' ? 'shield' : 'users'} size={28} /><strong>{listType === 'blocked' ? 'No blocked accounts' : `No ${listType} yet`}</strong><p>{listType === 'blocked' ? 'Accounts you block will appear here.' : 'People who connect with this account will appear here.'}</p></div>}
          </>}
        </section>
      </div>, document.body)}

      <nav className="pf-tabs" role="tablist" aria-label="Profile content">
        <button type="button" role="tab" aria-selected={tab === 'posts'} className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Spotlight</button>
        <button type="button" role="tab" aria-selected={tab === 'stories'} className={tab === 'stories' ? 'on' : ''} onClick={() => setTab('stories')}>Stories</button>
        <button type="button" role="tab" aria-selected={tab === 'reposts'} className={tab === 'reposts' ? 'on' : ''} onClick={() => setTab('reposts')}>Reposts</button>
      </nav>

      <div ref={swipeRef} data-local-tab-swipe style={{ width: '100%', overflowX: 'clip' }} onTouchStart={onTabSwipeStart} onTouchMove={onTabSwipeMove} onTouchEnd={onTabSwipeEnd} onTouchCancel={onTabSwipeEnd}>
      {tab === 'posts' ? (
        <>
          {tagList.length > 0 && <div className="sc-tag-row">{tagList.map((tag) => <button key={tag} className="sc-hashtag-chip" onClick={() => navigate(`/explore?search=1&q=${encodeURIComponent(tag)}`)}><Icon name="hash" size={16} />{tag.slice(1)}</button>)}</div>}
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
          {!posts.length && <div className="sc-empty-grid" role="status"><strong>No posts yet</strong></div>}
          {nextCursor && (
            <div className="sc-more">
              <button className="sc-pill" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? '' : 'Load more'}
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
          {!stories.length && <div className="sc-empty-grid" role="status"><strong>No stories yet</strong></div>}
          {viewing !== false && stories.length > 0 && (
            <StoryViewer groups={[{ user: profile }]} startIndex={viewing} onClose={() => setViewing(false)} />
          )}
        </>
      ) : tab === 'reposts' ? (
        <>
          {repostsLoading ? <p className="sc-empty-note"></p> : <div className="sc-grid">{reposts.map((p) => <div key={p.id} className="sc-tile" role="button" tabIndex={0} onClick={() => navigate(`/p/${p.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/p/${p.id}`); }}>{p.kind === 'video' ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" /> : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}<span className="sc-tile-count"><Icon name="repeat-2" size={12} />{formatCount(p.repostCount || 0)}</span></div>)}</div>}
          {!repostsLoading && !reposts.length && <div className="sc-empty-grid" role="status"><strong>No reposts yet</strong></div>}
        </>
      ) : (
        <section className="sc-hashtag-panel" aria-label="Profile hashtags">
          {[...new Set(posts.flatMap((post) => (post.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []))].length ? [...new Set(posts.flatMap((post) => (post.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []))].map((tag) => <button key={tag} className="sc-hashtag-chip" onClick={() => navigate(`/explore?search=1&q=${encodeURIComponent(tag)}`)}><Icon name="hash" size={16} />{tag.slice(1)}</button>) : <div className="sc-empty-grid" role="status"><strong>No hashtags yet</strong></div>}
        </section>
      )}
      </div>
    </div>
  );
}
