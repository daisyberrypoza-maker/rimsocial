import { NavLink, useLocation } from 'react-router-dom';

// Icons drawn to match the reference: outline chat, sparkle, two cards, and a filled play shape.
const ICON_PROPS = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

function ChatIcon() {
  return <svg {...ICON_PROPS}><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.5 3.5V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></svg>;
}
function ExploreIcon() {
  return <svg {...ICON_PROPS}><circle cx="12" cy="12" r="5.5" /><path d="M3 14.5c2.6 2.6 13 1.2 16.5-3.4" /></svg>;
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

// Stories, Chat, Add post, Explore, Rimlight: Add post stays in the centre.
export default function BottomNav() {
  // Dark on Rimlight and Following; white with dark text on LIVE.
  const { pathname } = useLocation();
  const dark = pathname === '/' || pathname === '/following';
  const light = pathname === '/live';
  const className = dark ? 'bottomnav bottomnav-dark' : light ? 'bottomnav bottomnav-live' : 'bottomnav';
  return (
    <nav className={className} aria-label="Main navigation">
      <NavLink to="/stories" aria-label="Stories"><StoriesIcon /><span>Stories</span></NavLink>
      <NavLink to="/activity" aria-label="Chat"><ChatIcon /><span>Chat</span></NavLink>
      <NavLink to="/upload" aria-label="Add post"><span className="add-btn" aria-hidden="true"><span className="add-face"><PlusIcon /></span></span><span>Add post</span></NavLink>
      <NavLink to="/explore" aria-label="Explore"><ExploreIcon /><span>Explore</span></NavLink>
      <NavLink to="/" end aria-label="Rimlight"><RimlightIcon /><span>Rimlight</span></NavLink>
    </nav>
  );
}
