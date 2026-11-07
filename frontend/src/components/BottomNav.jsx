import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

// Icon-only bar, same order as the Reels reference: Home, Reels, Stories, Search, Profile.
export default function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Main navigation">
      <NavLink to="/" end aria-label="Home"><Icon name="house" size={28} /></NavLink>
      <NavLink to="/explore" aria-label="Reels"><Icon name="circle-play" size={28} /></NavLink>
      <NavLink to="/stories" aria-label="Stories"><Icon name="clapperboard" size={28} /></NavLink>
      <NavLink to="/explore?search=1" aria-label="Search"><Icon name="search" size={28} /></NavLink>
      <NavLink to="/u/me" aria-label="Profile"><Icon name="user-round" size={28} /></NavLink>
    </nav>
  );
}
