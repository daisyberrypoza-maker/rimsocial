import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function TopBar({ immersive, title }) {
  const location = useLocation();
  const navigate = useNavigate();
  const nested = location.pathname.startsWith('/p/') || location.pathname.startsWith('/creator/live/') || location.pathname === '/creator' || location.pathname === '/upload' || location.pathname === '/friends' || (location.pathname.startsWith('/u/') && location.pathname !== '/u/me');

  if (immersive && !nested) {
    return <header className="topbar overlay reels-top">
      <button className="reels-icon" onClick={() => navigate('/upload')} aria-label="Add post"><Icon name="plus" size={28} /></button>
      <nav className="reels-tabs" aria-label="Reels sections"><NavLink to="/" end>Reels</NavLink><NavLink to="/following">Friends</NavLink></nav>
      <button className="reels-icon" onClick={() => navigate('/explore')} aria-label="Search and filters"><Icon name="sliders" size={26} /></button>
    </header>;
  }
  return <header className={`topbar ${immersive ? 'overlay' : ''}`}>
    {nested ? <><button className="topbar-back" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/'); }} aria-label="Go back"><Icon name="arrow-left" size={22} /></button><div className="topbar-title">{title || 'Back'}</div></> : <div className="brand">{title || 'RimSocial'}</div>}
  </header>;
}
