import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Main">
      <NavLink to="/" end><Icon name="home" size={24} /><span>Home</span></NavLink>
      <NavLink to="/explore"><Icon name="compass" size={24} /><span>Explore</span></NavLink>
      <NavLink to="/upload" className="create" aria-label="Create a post"><span className="plus"><Icon name="plus" size={26} /></span><span>Create</span></NavLink>
      <NavLink to="/activity"><Icon name="bell" size={24} /><span>Activity</span></NavLink>
      <NavLink to="/u/me"><Icon name="user" size={24} /><span>Profile</span></NavLink>
    </nav>
  );
}
