import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from './store.js';
import { api } from './api.js';
import { loadAccount } from './account.js';
import TopBar from './components/TopBar.jsx';
import BottomNav from './components/BottomNav.jsx';
import Algorithm from './pages/Algorithm.jsx';
import Messages from './pages/Messages.jsx';
import Conversation from './pages/Conversation.jsx';
import NewMessage from './pages/NewMessage.jsx';
import Toast from './components/Toast.jsx';
import Login from './pages/Login.jsx';
import Feed from './pages/Feed.jsx';
import Explore from './pages/Explore.jsx';
import Upload from './pages/Upload.jsx';
import Profile from './pages/Profile.jsx';
import ProfileFeed from './pages/ProfileFeed.jsx';
import CreatorStudio from './pages/CreatorStudio.jsx';
import PostDetail from './pages/PostDetail.jsx';
import LiveMatchRoom from './pages/LiveMatchRoom.jsx';
import BusinessHub from './pages/BusinessHub.jsx';
import Activity from './pages/Activity.jsx';
import Stories from './pages/Stories.jsx';
import Recommended from './pages/Recommended.jsx';
import LiveBroadcasts from './pages/LiveBroadcasts.jsx';
import AdsSponsors from './pages/AdsSponsors.jsx';
import ExploreWatch from './pages/ExploreWatch.jsx';
import EditProfile from './pages/EditProfile.jsx';
import { useTabSwipe } from './lib/tabSwipe.js';

function RequireAuth({ children }) {
  const token = useAppStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

const IMMERSIVE_PATHS = ['/', '/following', '/live'];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAppStore((s) => s.token);
  const setSession = useAppStore((s) => s.setSession);
  const setLastPath = useAppStore((s) => s.setLastPath);

  // On a fresh load at "/", return to the last screen the user was on
  // Status bar: white on Stories and Chat, dark everywhere else
  useEffect(() => {
    const light = location.pathname === '/stories' || location.pathname.startsWith('/chat');
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = light ? '#ffffff' : '#171717';
    // Android app: dark status bar icons on light pages, white on dark ones (see MainActivity)
    window.RimStatus?.setLightBackground?.(light);
    // Full-bleed pages draw behind the status bar; every other page keeps clear of it
    const bleed = location.pathname.startsWith('/u/') || location.pathname === '/' || location.pathname === '/live';
    document.documentElement.classList.toggle('bleed-top', bleed);
  }, [location.pathname]);

  // A fresh open of the app (not a return from minimized) starts on the default screen, Stories
  useEffect(() => {
    if (token && location.pathname === '/') {
      navigate('/stories', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token && location.pathname !== '/login') setLastPath(location.pathname);
  }, [location.pathname, token, setLastPath]);

  useEffect(() => {
    if (!token) return;
    api('/v1/auth/me')
      .then(({ user }) => setSession(token, user))
      .then(loadAccount)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profileWatch = location.pathname.split('/').length === 4 && location.pathname.startsWith('/u/') && location.pathname.endsWith('/watch');
  const immersive = IMMERSIVE_PATHS.includes(location.pathname) || profileWatch;
  const exploreWatch = location.pathname.startsWith('/explore/watch/');
  const showChrome = Boolean(token) && location.pathname !== '/login';
  const setOffline = useAppStore((s) => s.setOffline);
  // Moving between screens never waits on the network: screens draw from saved data
  useTabSwipe(navigate, location.pathname, showChrome);

  // Minimised or closed: stop all playback immediately
  useEffect(() => {
    const pauseAll = () => document.querySelectorAll('video, audio').forEach((media) => media.pause());
    const stopMedia = () => { if (document.hidden) pauseAll(); };
    document.addEventListener('visibilitychange', stopMedia);
    window.addEventListener('pagehide', pauseAll);
    return () => {
      document.removeEventListener('visibilitychange', stopMedia);
      window.removeEventListener('pagehide', pauseAll);
    };
  }, []);

  // Only one video or audio plays at a time: starting one pauses every other
  useEffect(() => {
    const onPlay = (event) => {
      document.querySelectorAll('video, audio').forEach((media) => { if (media !== event.target) media.pause(); });
    };
    document.addEventListener('play', onPlay, true);
    return () => document.removeEventListener('play', onPlay, true);
  }, []);

  // Feed cards manage their own active playback. Do not pause all media on route changes:
  // that can pause a newly mounted Rimlight video immediately after it starts.

  // Device connectivity: the Connection Failed screen replaces the content when the network is gone
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setOffline(true);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [setOffline]);

  return (
    <div className="app">
      {showChrome && !location.pathname.startsWith('/p/') && !location.pathname.startsWith('/u/') && !profileWatch && !exploreWatch && location.pathname !== '/upload' && location.pathname !== '/explore' && location.pathname !== '/friends' && location.pathname !== '/stories' && location.pathname !== '/recommended' && location.pathname !== '/activity' && location.pathname !== '/algorithm' && !location.pathname.startsWith('/chat') && <TopBar immersive={immersive} title={titleFor(location.pathname)} />}
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<RequireAuth><Feed key="discover" tab="discover" /></RequireAuth>} />
        <Route path="/following" element={<RequireAuth><Feed key="following" tab="following" /></RequireAuth>} />
        <Route path="/explore" element={<RequireAuth><Explore /></RequireAuth>} />
        <Route path="/friends" element={<RequireAuth><Explore /></RequireAuth>} />
        <Route path="/explore/watch/:postId" element={<RequireAuth><ExploreWatch /></RequireAuth>} />
        <Route path="/activity" element={<RequireAuth><Activity /></RequireAuth>} />
        <Route path="/stories" element={<RequireAuth><Stories /></RequireAuth>} />
        <Route path="/recommended" element={<RequireAuth><Recommended /></RequireAuth>} />
        <Route path="/live" element={<RequireAuth><LiveBroadcasts /></RequireAuth>} />
        <Route path="/algorithm" element={<RequireAuth><Algorithm /></RequireAuth>} />
        <Route path="/chat" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="/chat/new" element={<RequireAuth><NewMessage /></RequireAuth>} />
        <Route path="/chat/:userId" element={<RequireAuth><Conversation /></RequireAuth>} />
        <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
        <Route path="/p/:postId" element={<RequireAuth><PostDetail /></RequireAuth>} />
        <Route path="/creator" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/creator/earnings" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/creator/cashout" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/creator/matches" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/creator/grow" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/business" element={<RequireAuth><BusinessHub /></RequireAuth>} />
        <Route path="/ads-sponsors" element={<RequireAuth><AdsSponsors /></RequireAuth>} />
        <Route path="/creator/live/:matchId" element={<RequireAuth><LiveMatchRoom /></RequireAuth>} />
        <Route path="/u/me/edit" element={<RequireAuth><EditProfile /></RequireAuth>} />
        <Route path="/u/:username" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/u/:username/:list" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showChrome && !profileWatch && !exploreWatch && !location.pathname.startsWith('/p/') && !location.pathname.startsWith('/u/') && location.pathname !== '/friends' && location.pathname !== '/recommended' && location.pathname !== '/algorithm' && !location.pathname.startsWith('/chat/') && location.pathname !== '/upload' && <BottomNav />}
      <Toast />
    </div>
  );
}

function titleFor(path) {
  if (path.startsWith('/explore')) return 'Explore';
  if (path.startsWith('/activity')) return 'Activity';
  if (path.startsWith('/stories')) return 'Stories';
  if (path.startsWith('/live')) return 'LIVE';
  if (path.startsWith('/upload')) return 'New post';
  if (path.startsWith('/creator')) return 'Creator Studio';
  if (path.startsWith('/business')) return 'Find, Flip & Fix';
  if (path.startsWith('/ads-sponsors')) return 'Ads & Sponsors';
  if (path.startsWith('/u/')) return '';
  return 'RimSocial';
}
