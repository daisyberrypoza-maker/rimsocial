import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from './store.js';
import { api } from './api.js';
import { loadAccount } from './account.js';
import TopBar from './components/TopBar.jsx';
import BottomNav from './components/BottomNav.jsx';
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
import LiveBroadcasts from './pages/LiveBroadcasts.jsx';
import AdsSponsors from './pages/AdsSponsors.jsx';
import ExploreWatch from './pages/ExploreWatch.jsx';

function RequireAuth({ children }) {
  const token = useAppStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

const IMMERSIVE_PATHS = ['/', '/following'];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAppStore((s) => s.token);
  const lastPath = useAppStore((s) => s.lastPath);
  const setSession = useAppStore((s) => s.setSession);
  const setLastPath = useAppStore((s) => s.setLastPath);

  // On a fresh load at "/", return to the last screen the user was on
  useEffect(() => {
    if (token && location.pathname === '/' && lastPath && lastPath !== '/') {
      navigate(lastPath, { replace: true });
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

  return (
    <div className="app">
      {showChrome && !location.pathname.startsWith('/p/') && !profileWatch && !exploreWatch && location.pathname !== '/upload' && location.pathname !== '/explore' && <TopBar immersive={immersive} title={titleFor(location.pathname)} />}
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<RequireAuth><Feed key="discover" tab="discover" /></RequireAuth>} />
        <Route path="/following" element={<RequireAuth><Feed key="following" tab="following" /></RequireAuth>} />
        <Route path="/explore" element={<RequireAuth><Explore /></RequireAuth>} />
        <Route path="/explore/watch/:postId" element={<RequireAuth><ExploreWatch /></RequireAuth>} />
        <Route path="/activity" element={<RequireAuth><Activity /></RequireAuth>} />
        <Route path="/stories" element={<RequireAuth><Stories /></RequireAuth>} />
        <Route path="/live" element={<RequireAuth><LiveBroadcasts /></RequireAuth>} />
        <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
        <Route path="/p/:postId" element={<RequireAuth><PostDetail /></RequireAuth>} />
        <Route path="/creator" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/business" element={<RequireAuth><BusinessHub /></RequireAuth>} />
        <Route path="/ads-sponsors" element={<RequireAuth><AdsSponsors /></RequireAuth>} />
        <Route path="/creator/live/:matchId" element={<RequireAuth><LiveMatchRoom /></RequireAuth>} />
        <Route path="/u/:username" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showChrome && !profileWatch && !exploreWatch && <BottomNav />}
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
