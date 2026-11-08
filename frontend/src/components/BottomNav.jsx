import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { playChime } from '../lib/notify.js';
import { useAppStore } from '../store.js';
import Avatar from './Avatar.jsx';

// Icons drawn to match the reference: outline chat, sparkle, two cards, and a filled play shape.
const ICON_PROPS = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

function ChatIcon() {
  return <svg {...ICON_PROPS}><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.5 3.5V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></svg>;
}
function ExploreIcon() {
  return <svg {...ICON_PROPS}><circle cx="12" cy="12" r="9.5" /><path d="M15.8 8.2l-2.2 5.4-5.4 2.2 2.2-5.4z" /></svg>;
}
function StoriesIcon() {
  return <svg {...ICON_PROPS}><rect x="4" y="4" width="6.5" height="16" rx="2" /><rect x="13.5" y="7" width="6.5" height="13" rx="2" /></svg>;
}
function PlusIcon() {
  return <svg {...ICON_PROPS}><path d="M12 5v14M5 12h14" /></svg>;
}
function RimlightIcon() {
  return <svg {...ICON_PROPS} fill="currentColor" stroke="none"><path d="M7 5.6v12.8c0 .9 1 1.4 1.8.9l10-6.4a1 1 0 0 0 0-1.7l-10-6.4C8 4.2 7 4.7 7 5.6z" /></svg>;
}

// Stories, Chat, Add post (centre), Rimlight, Profile.
export default function BottomNav() {
  // Dark on Rimlight and Following; white with dark text on LIVE.
  const { pathname } = useLocation();
  const me = useAppStore((s) => s.user);
  const [unread, setUnread] = useState(0);
  const lastCount = useRef(null);
  // Unread chat messages: badge on the Chat tab, and a chime when the count goes up.
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
  const dark = pathname === '/' || pathname === '/following';
  const light = pathname === '/live';
  const className = dark ? 'bottomnav bottomnav-dark' : light ? 'bottomnav bottomnav-live' : 'bottomnav';
  return (
    <nav className={className} aria-label="Main navigation">
      <NavLink to="/stories" replace aria-label="Stories"><StoriesIcon /><span className="tab-label">Stories</span></NavLink>
      <NavLink to="/chat" replace aria-label={unread ? `Chat, ${unread} unread` : 'Chat'}><ChatIcon />{unread > 0 && <span className="tab-badge">{unread > 99 ? '99+' : unread}</span>}<span className="tab-label">Chat</span></NavLink>
      <NavLink to="/upload" replace aria-label="Add post"><span className="add-btn" aria-hidden="true"><span className="add-face"><PlusIcon /></span></span><span className="tab-label">Add</span></NavLink>
      <NavLink to="/" end replace aria-label="Rimlight"><RimlightIcon /><span className="tab-label">Rimlight</span></NavLink>
      <NavLink to="/u/me" replace aria-label="Profile"><span className="tab-avatar"><Avatar user={me || {}} size={26} /></span><span className="tab-label">Profile</span></NavLink>
    </nav>
  );
}
