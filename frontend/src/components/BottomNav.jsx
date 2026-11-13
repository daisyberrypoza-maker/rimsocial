import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { playChime } from '../lib/notify.js';
import Icon from './Icon.jsx';

// Bottom bar, in this order: Stories, Chat (Instagram direct icon), Upload (+), Rimlight. Swipe between these pages follows the same order (see lib/tabSwipe.js).
// No text labels. The active icon is filled. Profile opens from the Stories header avatar.
export default function BottomNav() {
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);
  const lastCount = useRef(null);

  // Unread chat messages: badge on Chat, and a chime when the count goes up
  useEffect(() => {
    let alive = true;
    const load = () => api('/v1/messages/unread-count')
      .then((data) => {
        if (!alive) return;
        const count = data.count || 0;
        if (lastCount.current !== null && count > lastCount.current) playChime();
        lastCount.current = count;
        setUnread(count);
      })
      .catch(() => {});
    load();
    const timer = setInterval(load, 6000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  // Dark on Rimlight and Following; white on LIVE
  const dark = pathname === '/';
  const light = pathname === '/live';
  const className = dark ? 'bottomnav bottomnav-dark' : light ? 'bottomnav bottomnav-live' : 'bottomnav';
  return (
    <nav className={className} aria-label="Main navigation">
      <NavLink to="/stories" replace aria-label="Stories"><Icon name="users" /></NavLink>
      <NavLink to="/chat" replace aria-label={unread ? `Chat, ${unread} unread` : 'Chat'}>
        <Icon name="send" />
        {unread > 0 && <span className="tab-badge">{unread > 99 ? '99+' : unread}</span>}
      </NavLink>
      <NavLink to="/upload" replace aria-label="Create post"><Icon name="plus" size={28} /></NavLink>
      <NavLink to="/" end replace aria-label="Rimlight"><Icon name="play" /></NavLink>
    </nav>
  );
}
