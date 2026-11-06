import { NavLink } from 'react-router-dom';

export default function TopBar({ immersive, title }) {
  return (
    <header className={`topbar ${immersive ? 'overlay' : ''}`}>
      {immersive
        ? <nav className="segmented"><NavLink to="/" end>For You</NavLink><NavLink to="/following">Following</NavLink></nav>
        : <div className="brand">{title || 'Clipverse'}</div>}
      <NavLink className="topbar-notifications" to="/notifications" aria-label="Notifications" title="Notifications">♧</NavLink>
    </header>
  );
}
