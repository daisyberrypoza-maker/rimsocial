import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Main">
      <NavLink to="/" end><Icon name="home" size={23} /><span>Home</span></NavLink>
      <NavLink to="/explore"><Icon name="compass" size={23} /><span>Explore</span></NavLink>
      <NavLink to="/business"><Icon name="briefcase" size={21} /><span>Business</span></NavLink>
      <NavLink to="/upload" className="create" aria-label="New post"><span className="plus"><Icon name="plus" size={22} /></span></NavLink>
      <NavLink to="/following"><Icon name="users" size={23} /><span>Following</span></NavLink>
      <NavLink to="/u/me"><Icon name="user" size={23} /><span>Profile</span></NavLink>
    </nav>
  );
}
