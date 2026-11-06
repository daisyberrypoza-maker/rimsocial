import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Main navigation">
      <NavLink to="/" end aria-label="Home"><Icon name="home" size={24} /><span>Home</span></NavLink>
      <NavLink to="/explore" aria-label="Explore"><Icon name="compass" size={24} /><span>Explore</span></NavLink>
      <NavLink to="/upload" className="create" aria-label="Add post"><span className="plus"><Icon name="plus" size={27} /></span><span>Add Post</span></NavLink>
      <NavLink to="/stories" aria-label="Stories"><Icon name="video" size={24} /><span>Stories</span></NavLink>
      <NavLink to="/u/me" aria-label="Profile"><Icon name="user" size={24} /><span>Profile</span></NavLink>
    </nav>
  );
}
