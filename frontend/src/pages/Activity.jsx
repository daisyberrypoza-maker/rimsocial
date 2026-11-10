import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePullRefresh } from '../lib/pullRefresh.jsx';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useSwipeTabs } from '../lib/useSwipeTabs.js';

const READ_KEY = 'rimsocial-activity-read-at';
const ACTIVITY_TABS = ['all', 'mention', 'like', 'comment', 'repost', 'follow'];

function message(item) {
  if (item.type === 'like') return 'liked your post';
  if (item.type === 'story_like') return 'liked your story';
  if (item.type === 'comment') return 'commented on your post';
  if (item.type === 'repost') return 'reposted your post';
  if (item.type === 'follow') return 'started following you';
  if (item.type === 'mention') return 'mentioned you in a post';
  return 'interacted with you';
}

function timeAgo(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd';
  return new Date(value).toLocaleDateString();
}

// Shown inside the Chat page when onBack is given (Back returns to messages)
export default function Activity({ onBack } = {}) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const swipeSurfaceRef = useSwipeTabs(filter, ACTIVITY_TABS, setFilter);
  const [readAt, setReadAt] = useState(() => Number(localStorage.getItem(READ_KEY) || 0));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/v1/activity');
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Could not load activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const { indicator } = usePullRefresh(load);

  const filtered = useMemo(() => filter === 'all' ? items : items.filter((item) => item.type === filter), [items, filter]);
  const unread = items.filter((item) => new Date(item.createdAt).getTime() > readAt).length;

  function markRead() {
    const stamp = Date.now();
    localStorage.setItem(READ_KEY, String(stamp));
    setReadAt(stamp);
  }

  function openItem(item) {
    markRead();
    if (item.type === 'follow') navigate('/u/' + encodeURIComponent(item.actor.username));
    else if (item.post?.id) navigate('/p/' + item.post.id);
    else navigate('/u/' + encodeURIComponent(item.actor.username));
  }

  const content = loading ? <div className="activity-state"></div> :
    error ? <div className="activity-state"><p>{error}</p><button onClick={load}>Try again</button></div> :
    filtered.length === 0 ? <div className="activity-empty"><div className="activity-empty-icon"><Icon name="bell" size={30} /></div><h2>You’re all caught up</h2><p>New notifications will appear here.</p></div> :
    <div className="activity-list">{filtered.map((item) => {
      const isUnread = new Date(item.createdAt).getTime() > readAt;
      return <button className={'activity-item' + (isUnread ? ' unread' : '')} key={item.id} onClick={() => openItem(item)}>
        <Avatar user={item.actor} size={46} />
        <span className={'activity-type-icon ' + item.type}><Icon name={item.type === 'like' || item.type === 'story_like' ? 'heart' : item.type === 'comment' ? 'message-circle' : item.type === 'repost' ? 'repeat' : item.type === 'mention' ? 'at-sign' : 'user-plus'} size={16} /></span>
        <span className="activity-copy"><span><strong>{item.actor.displayName || item.actor.username}</strong> {message(item)}</span>{item.type === 'comment' && item.comment && <span className="activity-comment">“{item.comment}”</span>}<span className="activity-time">{timeAgo(item.createdAt)}</span></span>
        {item.post?.mediaUrl ? <span className="activity-thumb">{item.post.kind === 'video' ? <video src={item.post.mediaUrl} muted preload="metadata" /> : <img src={item.post.mediaUrl} alt="" />}</span> : <Icon name="chevron" size={18} />}
        {isUnread && <span className="activity-unread-dot" />}
      </button>;
    })}</div>;

  const Wrap = onBack ? 'div' : 'main';
  return <Wrap ref={swipeSurfaceRef} data-local-tab-swipe className="page activity-page">
    <div className="activity-heading">
      {onBack && <button className="ghost activity-refresh" onClick={onBack} aria-label="Back to chat"><Icon name="arrow-left" size={22} /></button>}
      <div><h1 className="page-title">Activity</h1><p className="activity-subtitle">What’s happening with your posts and people.</p></div>
      <button className="ghost activity-refresh" onClick={load} aria-label="Refresh activity" title="Refresh"><Icon name="refresh" size={19} /></button>
    </div>
    {indicator}
    <div className="activity-filters" role="tablist" aria-label="Filter activity">
      {[['all','All'],['mention','Mentions'],['like','Likes'],['comment','Comments'],['repost','Reposts'],['follow','Followers']].map(([key,label]) =>
        <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'activity-filter active' : 'activity-filter'} onClick={() => setFilter(key)}>{label}</button>
      )}
    </div>
    {unread > 0 && <div className="activity-read-row"><span>{unread} new {unread === 1 ? 'activity' : 'activities'}</span><button className="ghost small" onClick={markRead}>Mark all read</button></div>}
    {content}
  </Wrap>;
}
