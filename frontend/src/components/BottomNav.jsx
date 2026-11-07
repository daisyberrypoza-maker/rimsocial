import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Main navigation">
      <NavLink to="/" end aria-label="Home"><Icon name="house" size={27} /><span>Home</span></NavLink>
      <NavLink to="/explore" aria-label="Explore"><Icon name="compass" size={27} /><span>Explore</span></NavLink>
      <NavLink to="/upload" className="create" aria-label="Add post"><span className="plus"><Icon name="plus" size={28} /></span><span>Add Post</span></NavLink>
      <NavLink to="/stories" aria-label="Stories"><Icon name="clapperboard" size={27} /><span>Stories</span></NavLink>
      <NavLink to="/u/me" aria-label="Profile"><Icon name="user-round" size={27} /><span>Profile</span></NavLink>
    </nav>
  );
}
