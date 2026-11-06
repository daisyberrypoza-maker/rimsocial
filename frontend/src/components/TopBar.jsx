import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function TopBar({ immersive, title }) {
  const location = useLocation();
  const navigate = useNavigate();
  const nested = location.pathname.startsWith('/p/') || location.pathname.startsWith('/creator/live/') || location.pathname === '/creator' || location.pathname === '/upload' || (location.pathname.startsWith('/u/') && location.pathname !== '/u/me');

  return <header className={`topbar ${immersive ? 'overlay' : ''}`}>
    {nested ? <><button className="topbar-back" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/'); }} aria-label="Go back"><Icon name="arrow-left" size={22} /></button><div className="topbar-title">{title || 'Back'}</div></> : immersive ? <nav className="segmented"><NavLink to="/" end>For You</NavLink><NavLink to="/following">Following</NavLink></nav> : <div className="brand">{title || 'RimSocial'}</div>}
  </header>;
}
