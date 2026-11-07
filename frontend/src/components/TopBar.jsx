import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function TopBar({ immersive, title }) {
  const location = useLocation();
  const navigate = useNavigate();
  const nested = location.pathname.startsWith('/p/') || location.pathname.startsWith('/creator/live/') || location.pathname === '/creator' || location.pathname === '/upload' || location.pathname === '/friends' || (location.pathname.startsWith('/u/') && location.pathname !== '/u/me');

  // Reels header: hidden while the page is scrolling, shown again once scrolling stops.
  const reelsHeader = immersive && !nested;
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

  if (reelsHeader) {
    return <header className={`topbar overlay reels-top${scrolling ? ' is-hidden' : ''}`}>
      <button className="reels-icon" onClick={() => navigate('/upload')} aria-label="Add post"><Icon name="plus" size={34} /></button>
      <nav className="reels-tabs" aria-label="Rimlight sections"><NavLink to="/" end>Rimlight</NavLink><NavLink to="/following">Following</NavLink><NavLink to="/live">LIVE</NavLink></nav>
      <button className="reels-icon" onClick={() => navigate('/explore')} aria-label="Search and filters"><Icon name="sliders" size={32} /></button>
    </header>;
  }
  return <header className={`topbar ${immersive ? 'overlay' : ''}`}>
    {nested ? <><button className="topbar-back" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/'); }} aria-label="Go back"><Icon name="arrow-left" size={22} /></button><div className="topbar-title">{title || 'Back'}</div></> : <div className="brand">{title || 'RimSocial'}</div>}
  </header>;
}
