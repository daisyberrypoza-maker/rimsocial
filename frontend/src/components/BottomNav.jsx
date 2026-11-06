import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

// TikTok-style bar: Home · Explore · Add (centre) · Inbox · Profile.
// Stories live in the feed's story rail; Business and Ads live in Profile → Settings.
export default function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Main navigation">
      <NavLink to="/" end aria-label="Home"><Icon name="home" size={24} /><span>Home</span></NavLink>
      <NavLink to="/explore" aria-label="Explore"><Icon name="compass" size={24} /><span>Explore</span></NavLink>
      <NavLink to="/upload" className="create" aria-label="Create post"><span className="plus"><Icon name="plus" size={22} /></span></NavLink>
      <NavLink to="/activity" aria-label="Inbox"><Icon name="bell" size={24} /><span>Inbox</span></NavLink>
      <NavLink to="/u/me" aria-label="Profile"><Icon name="user" size={24} /><span>Profile</span></NavLink>
    </nav>
  );
}
