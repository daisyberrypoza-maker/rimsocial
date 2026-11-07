import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import { useAppStore } from '../store.js';

export default function TopBar({ immersive, title }) {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useAppStore((st) => st.user);
  const nested = location.pathname.startsWith('/p/') || location.pathname.startsWith('/creator/live/') || location.pathname === '/creator' || location.pathname === '/upload' || location.pathname === '/friends' || (location.pathname.startsWith('/u/') && location.pathname !== '/u/me');

  // Rimlight header: hidden while the page is scrolling, shown again once scrolling stops.
  const reelsHeader = immersive && !nested && location.pathname !== '/live';
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    if (!reelsHeader) return undefined;
    let timer;
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setScrolling(false), 200);
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll, { capture: true });
      setScrolling(false);
    };
  }, [reelsHeader]);

  // LIVE header, matched to the reference: menu, Follow / LIVE tabs, search.
  if (location.pathname === '/live') {
    return <header className="topbar overlay live-top">
      <span className="live-top-spacer" aria-hidden="true" />
      <nav className="live-tabs" aria-label="LIVE sections"><NavLink to="/" end>Rimlight<span className="live-tab-badge">LIVE</span></NavLink><NavLink to="/live">LIVE</NavLink></nav>
      <button className="live-top-icon" onClick={() => navigate('/live?search=1')} aria-label="Search who is live">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
      </button>
    </header>;
  }

  if (reelsHeader) {
    return <header className={`topbar overlay reels-top${scrolling ? ' is-hidden' : ''}`}>
      <button className="snap-circle" onClick={() => navigate('/u/me')} aria-label="Your profile"><Avatar user={me} size={34} /></button>
      <nav className="reels-tabs" aria-label="Rimlight sections"><NavLink to="/" end>Rimlight</NavLink><NavLink to="/following">Following</NavLink><NavLink to="/live">LIVE</NavLink></nav>
      <div className="snap-right">
        <button className="snap-circle" onClick={() => navigate('/algorithm')} aria-label="Your algorithm"><Icon name="sliders" size={20} /></button>
        <button className="snap-square" onClick={() => navigate('/upload')} aria-label="Add post"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4h11a2 2 0 0 1 2 2v7" /><rect x="3" y="7" width="14" height="14" rx="2.5" /><path d="M10 11v6M7 14h6" /></svg></button>
      </div>
    </header>;
  }
  return <header className={`topbar ${immersive ? 'overlay' : ''}`}>
    {nested ? <><button className="topbar-back" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/'); }} aria-label="Go back"><Icon name="arrow-left" size={22} /></button><div className="topbar-title">{title || 'Back'}</div></> : <div className="brand">{title || 'RimSocial'}</div>}
  </header>;
}
