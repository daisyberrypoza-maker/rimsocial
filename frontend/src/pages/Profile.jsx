import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [showCoinSheet, setShowCoinSheet] = useState(false);
  const [coinAmount, setCoinAmount] = useState(1000);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [coinBusy, setCoinBusy] = useState(false);
  const [postNotifications, setPostNotifications] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);

  useEffect(() => {
    api(`/v1/users/${username}`)
      .then((user) => setProfile(username, { user, updatedAt: Date.now() }))
      .catch((e) => toast(e.message));
    loadPage(feedKey, `/v1/users/${username}/posts`, true).catch((e) => toast(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (!profile || profile.isMe || !profile.isFollowing) { setPostNotifications(false); return; }
    let active = true;
    api(`/v1/notifications/preferences/${profile.id}`)
      .then((data) => { if (active) setPostNotifications(Boolean(data.enabled)); })
      .catch(() => { if (active) setPostNotifications(false); });
    return () => { active = false; };
  }, [profile?.id, profile?.isMe, profile?.isFollowing]);

  async function togglePostNotifications() {
    if (!profile || !profile.isFollowing || notificationBusy) return;
    const next = !postNotifications;
    setNotificationBusy(true);
    try {
      const result = await api(`/v1/notifications/preferences/${profile.id}`, { method: 'PUT', body: { enabled: next } });
      setPostNotifications(Boolean(result.enabled));
      toast(result.enabled ? 'Post and story notifications enabled' : 'Post and story notifications turned off');
    } catch (e) { toast(e.message); }
    finally { setNotificationBusy(false); }
  }

  useEffect(() => {
    if (tab !== 'stories' || !profile) return;
    api(`/v1/stories/users/${profile.id}`)
      .then((d) => setStories(d.items))
      .catch(() => setStories([]));
  }, [tab, profile]);

  async function openPeople(type) {
    setListType(type);
    try {
      const data = await api(`/v1/users/${username}/${type}`);
      setPeople(data.items || []);
    } catch (e) { toast(e.message); setListType(''); }
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

  async function checkoutCoins() {
    if (Capacitor.isNativePlatform()) return toast('Android coin purchases require Google Play Billing setup before checkout can be enabled.');
    if (!Number.isSafeInteger(Number(coinAmount)) || Number(coinAmount) < 100) return toast('Choose a valid coin package amount.');
    setCoinBusy(true);
    try {
      const data = await api('/v1/wallet/topup', { method: 'POST', body: { amountMinor: Number(coinAmount) * 100, ...(receiptEmail.trim() ? { email: receiptEmail.trim() } : {}) } });
      window.location.href = data.authorizationUrl;
    } catch (err) { toast(err.message); }
    finally { setCoinBusy(false); }
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
        <div className="profile-hero-toolbar">
          <button className="profile-icon-button" onClick={() => navigate(-1)} aria-label="Go back">‹</button>
          <button className="profile-share-button" onClick={() => { const url = window.location.href; if (navigator.share) navigator.share({ title: profile.displayName, url }).catch(() => {}); else { navigator.clipboard?.writeText(url); toast('Profile link copied'); } }}>↗ <span>Share</span></button>
          {profile.isMe && <button className="profile-icon-button" onClick={() => setDrawerOpen(true)} aria-label="Profile settings">⚙</button>}
        </div>
        <div className="profile-cover-art" aria-hidden="true" />
        <div className="profile-identity-row">
          <div className="profile-cover-tools">
            <Avatar user={profile} size={76} ring />
            {profile.isMe && <button className="avatar-edit" aria-label="Change profile photo" onClick={() => document.getElementById('profile-avatar-file')?.click()} disabled={avatarBusy}>{avatarBusy ? '…' : '✎'}</button>}
          </div>
          <div className="profile-identity-copy">
            <h2 className="profile-name">{profile.displayName}</h2>
            <div className="profile-handle">@{profile.username}</div>
          </div>
        </div>
        <div className="profile-stats-row">
          <button onClick={() => openPeople('followers')}><strong>{formatCount(profile.followerCount)}</strong><span>Followers</span></button>
          <button onClick={() => openPeople('following')}><strong>{formatCount(profile.followingCount || 0)}</strong><span>Following</span></button>
          <div><strong>{formatCount(profile.postCount || 0)}</strong><span>Posts</span></div>
        </div>
        {profile.country && <span className="chip">{profile.country}</span>}
        {profile.isMe ? (
          <div className="profile-actions profile-actions-refresh">
            <button onClick={() => navigate('/upload')}>＋ Create</button>
            <button className="ghost" onClick={() => setDrawerOpen(true)} aria-label="Open profile settings">My Account</button>
          </div>
        ) : (
          <div className="profile-follow-actions">
            <button className={`pill ${profile.isFollowing ? 'ghost' : ''}`} onClick={toggleFollow} disabled={busy}>
              {profile.isFollowing ? 'Following' : '＋ Follow'}
            </button>
            {profile.isFollowing && <button className={`profile-notification-button${postNotifications ? ' is-on' : ''}`} type="button" onClick={togglePostNotifications} disabled={notificationBusy} aria-pressed={postNotifications} aria-label={postNotifications ? 'Turn off post and story notifications' : 'Turn on post and story notifications'} title={postNotifications ? 'Notifications on' : 'Notify me when this creator posts'}><Icon name="bell" size={18} /> <span>{postNotifications ? 'Notifications on' : 'Notify me'}</span></button>}
          </div>
        )}
      </section>
      {profile.isMe && <input id="profile-avatar-file" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} />}

      {drawerOpen && <div className="profile-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
        <aside className="profile-drawer" role="dialog" aria-label="Profile settings" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head"><h3>Profile & settings</h3><button className="ghost small" onClick={() => setDrawerOpen(false)}>✕</button></div>
          <button onClick={() => { setDrawerOpen(false); navigate('/upload'); }}>＋ Create post or story</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/explore'); }}>⌕ Find friends & creators</button>
          <button onClick={() => { setDrawerOpen(false); setShowCoinSheet(true); }}>◉ Get coins</button>
          <button onClick={() => { setDrawerOpen(false); navigate('/creator'); }}>✦ Creator Studio · earnings & cashout</button>
          <button onClick={() => { setDrawerOpen(false); openPeople('followers'); }}>Followers</button>
          <button onClick={() => { setDrawerOpen(false); openPeople('following'); }}>Following</button>
          <button onClick={() => { setDrawerOpen(false); document.getElementById('profile-avatar-file')?.click(); }}>Change profile photo</button>
          <button className="drawer-danger" onClick={() => { logout(); navigate('/login', { replace: true }); }}>Log out</button>
        </aside>
      </div>}

      {showCoinSheet && <div className="sheet-backdrop coin-backdrop" onClick={() => setShowCoinSheet(false)}>
        <section className="sheet coin-sheet" role="dialog" aria-label="Buy coins" onClick={(e) => e.stopPropagation()}>
          <div className="comments-heading"><h3>Get coins</h3><button className="ghost small" onClick={() => setShowCoinSheet(false)} aria-label="Close">✕</button></div>
          <p className="muted">Use coins to send gifts and support your favourite creators.</p>
          <div className="coin-pack-grid">{[{ amount: 500, label: 'Starter', bonus: 'Try gifting' }, { amount: 1000, label: 'Popular', bonus: 'Great for gifts' }, { amount: 2500, label: 'Creator fan', bonus: 'More to share' }, { amount: 5000, label: 'Big supporter', bonus: 'Support creators' }].map((pack) => <button type="button" key={pack.amount} className={Number(coinAmount) === pack.amount ? 'coin-pack selected' : 'coin-pack'} onClick={() => setCoinAmount(pack.amount)}><span className="coin-pack-amount">◉ {pack.amount.toLocaleString()}</span><strong>{pack.label}</strong><small>{pack.bonus}</small><span className="coin-pack-price">₦{pack.amount.toLocaleString()}</span></button>)}</div>
          <label className="coin-email-label">Receipt email (optional)<input type="email" value={receiptEmail} onChange={(e) => setReceiptEmail(e.target.value)} placeholder="you@example.com" /></label>
          <p className="muted">Secure checkout is provided by Paystack. Coins are credited after payment confirmation.</p>
          <button className="coin-checkout" disabled={coinBusy} onClick={checkoutCoins}>{coinBusy ? 'Opening secure checkout…' : `Continue · ₦${Number(coinAmount).toLocaleString()}`}</button>
        </section>
      </div>}

      {listType && <div className="sheet-backdrop people-backdrop" onClick={() => setListType('')}>
        <section className="sheet people-sheet" role="dialog" aria-label={listType} onClick={(e) => e.stopPropagation()}>
          <div className="comments-heading"><h3>{listType === 'followers' ? 'Followers' : 'Following'}</h3><button className="ghost small" onClick={() => setListType('')}>✕</button></div>
          {people.length ? people.map((person) => <button className="person-result" key={person.id} onClick={() => { setListType(''); navigate(`/u/${person.username}`); }}><Avatar user={person} size={42} /><span><strong>{person.displayName}</strong><small>@{person.username}</small></span></button>) : <p className="muted center">No {listType} yet.</p>}
        </section>
      </div>}

      <nav className="ptabs">
        <button className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Posts</button>
        <button className={tab === 'stories' ? 'on' : ''} onClick={() => setTab('stories')}>Stories</button>
      </nav>

      {tab === 'posts' ? (
        <>
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
            <StoryViewer groups={[{ user: profile }]} startIndex={0} onClose={() => setViewing(false)} />
          )}
        </>
      )}
    </div>
  );
}
