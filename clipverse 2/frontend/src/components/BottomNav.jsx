import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Main">
      <NavLink to="/" end><Icon name="home" size={24} /><span>Home</span></NavLink>
      <NavLink to="/explore"><Icon name="search" size={24} /><span>Explore</span></NavLink>
      <NavLink to="/upload" className="create" aria-label="New post">
        <span className="plus"><Icon name="plus" size={22} /></span>
      </NavLink>
      <NavLink to="/following"><Icon name="people" size={24} /><span>Following</span></NavLink>
      <NavLink to="/creator"><Icon name="wallet" size={24} /><span>Creator</span></NavLink>
      <NavLink to="/u/me"><Icon name="user" size={24} /><span>Profile</span></NavLink>
    </nav>
  );
}
