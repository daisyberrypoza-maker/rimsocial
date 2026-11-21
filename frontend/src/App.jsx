import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from './store.js';
import { refreshMyThumb } from './lib/myThumb.js';
import { ensureIdentity, syncConversation } from './lib/e2ee.js';
import { enablePush } from './lib/push.js';
import { api } from './api.js';
import { loadAccount } from './account.js';
import TopBar from './components/TopBar.jsx';
import BottomNav from './components/BottomNav.jsx';
const MyFriends = lazy(() => import('./pages/MyFriends.jsx'));
const Following = lazy(() => import('./pages/Following.jsx'));
const Algorithm = lazy(() => import('./pages/Algorithm.jsx'));
const Messages = lazy(() => import('./pages/Messages.jsx'));
const Conversation = lazy(() => import('./pages/Conversation.jsx'));
const OrderDetails = lazy(() => import('./pages/OrderDetails.jsx'));
const GroupConversationPage = lazy(() => import('./pages/GroupConversation.jsx'));
import { DirectChatRoute, GroupChatRoute } from './pages/ChatRoutes.jsx';
import LiveChat from './components/LiveChat.jsx';
const NewMessage = lazy(() => import('./pages/NewMessage.jsx'));
import Toast from './components/Toast.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
const Login = lazy(() => import('./pages/Login.jsx'));
const Feed = lazy(() => import('./pages/Feed.jsx'));
const Explore = lazy(() => import('./pages/Explore.jsx'));
const Upload = lazy(() => import('./pages/Upload.jsx'));
const StoryComposer = lazy(() => import('./pages/StoryComposer.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const ProfileFeed = lazy(() => import('./pages/ProfileFeed.jsx'));
const CreatorStudio = lazy(() => import('./pages/CreatorStudio.jsx'));
const PostDetail = lazy(() => import('./pages/PostDetail.jsx'));
const LiveMatchRoom = lazy(() => import('./pages/LiveMatchRoom.jsx'));
const Activity = lazy(() => import('./pages/Activity.jsx'));
const Stories = lazy(() => import('./pages/Stories.jsx'));
const Recommended = lazy(() => import('./pages/Recommended.jsx'));
const LiveBroadcasts = lazy(() => import('./pages/LiveBroadcasts.jsx'));
const LiveCreate = lazy(() => import('./pages/LiveCreate.jsx'));
const AdsSponsors = lazy(() => import('./pages/AdsSponsors.jsx'));
const ExploreWatch = lazy(() => import('./pages/ExploreWatch.jsx'));
const Search = lazy(() => import('./pages/Search.jsx'));
const EditProfile = lazy(() => import('./pages/EditProfile.jsx'));
import { useTabSwipe } from './lib/tabSwipe.js';
import NotFound from './pages/NotFound.jsx';

// Human-readable title per route, so browser tabs and history show what the page is.
const PAGE_TITLES = {
  '/': 'Home', '/stories': 'Stories', '/following': 'Following', '/explore': 'Explore',
  '/live': 'Live', '/search': 'Search', '/upload': 'Create', '/chat': 'Messages',
  '/activity': 'Activity', '/login': 'Log in', '/recommended': 'Recommended', '/algorithm': 'Your algorithm',
  '/creator': 'Creator studio', '/friends': 'Friends', '/my-friends': 'Friends', '/u/me/edit': 'Edit profile',
};
function pageTitleFor(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/u/')) return 'Profile';
  if (pathname.startsWith('/p/')) return 'Post';
  if (pathname.startsWith('/explore/watch/')) return 'Watch';
  if (pathname.startsWith('/orders/')) return 'Order';
  return null;
}

function RequireAuth({ children }) {
  const token = useAppStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

const IMMERSIVE_PATHS = ['/', '/following', '/live'];
// The bottom tab bar and its swipe only appear on these five screens: Stories, Chat, Add post, Search and Rimlight
const TAB_SCREENS = ['/stories', '/chat', '/upload', '/search', '/', '/following', '/live'];
function isTabScreen(pathname, search = '') {
  if (!TAB_SCREENS.includes(pathname)) return false;
  // Story and reel creation share the add-post route but are not the Add post tab
  if (pathname === '/upload' && /(^|[?&])(story|reel)=1/.test(search)) return false;
  return true;
}

// /explore is now Find friends; keeps any search in the address
function ExploreRedirect() {
  const location = useLocation();
  return <Navigate to={`/friends${location.search}`} replace />;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAppStore((s) => s.token);
  const setSession = useAppStore((s) => s.setSession);
  const setLastPath = useAppStore((s) => s.setLastPath);
  useEffect(() => {
    const title = pageTitleFor(location.pathname);
    document.title = title ? `${title} · RimSocial` : 'RimSocial';
    // Canonical and Open Graph URL follow the page, so each route can be shared and indexed on its own.
    if (window.location.protocol.startsWith('http')) {
      const url = `${window.location.origin}${location.pathname}`;
      for (const [selector, make] of [['link[rel=canonical]', () => { const el = document.createElement('link'); el.rel = 'canonical'; return el; }], ['meta[property="og:url"]', () => { const el = document.createElement('meta'); el.setAttribute('property', 'og:url'); return el; }]]) {
        let el = document.querySelector(selector);
        if (!el) { el = make(); document.head.appendChild(el); }
        if (el.tagName === 'LINK') el.href = url; else el.content = url;
      }
    }
  }, [location.pathname]);
  const meId = useAppStore((s) => s.user?.id);
  // Your avatar shows your latest story or post everywhere except the profile page
  useEffect(() => { if (meId) refreshMyThumb(); }, [meId]);
  // Publish this device's encryption key on sign-in, so others can message this person
  useEffect(() => { if (meId) { ensureIdentity().catch(() => {}); enablePush().catch(() => {}); } }, [meId]);
  // New direct messages are decrypted as they arrive from the live stream, not when the chat is opened
  useEffect(() => {
    if (!meId) return undefined;
    const onChange = (e) => {
      if (e.detail?.kind === 'direct' && e.detail.with) syncConversation(e.detail.with, meId).catch(() => {});
    };
    window.addEventListener('rs-chat', onChange);
    return () => window.removeEventListener('rs-chat', onChange);
  }, [meId]);

  // On a fresh load at "/", return to the last screen the user was on
  // Status bar: one rule for web and Android. White by default; black only on
  // Stories, Rimlight, Profile, and the video and image viewers.
  useEffect(() => {
    const path = location.pathname;
    const dark = path === '/stories' || path === '/' || path === '/following' || path === '/live'
      || path.startsWith('/u/') || path.startsWith('/explore/watch/') || path.startsWith('/p/');
    const light = !dark;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = light ? '#ffffff' : '#000000';
    // Android app: sets the status bar colour and icon colour together (see MainActivity)
    window.RimStatus?.setLightBackground?.(light);
    // Full-bleed pages draw behind the status bar; every other page keeps clear of it
    const bleed = location.pathname.startsWith('/u/') || location.pathname === '/' || location.pathname === '/following' || location.pathname === '/live';
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
  useTabSwipe(navigate, location.pathname, showChrome && isTabScreen(location.pathname, location.search));

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
      {showChrome && !location.pathname.startsWith('/p/') && !location.pathname.startsWith('/u/') && !profileWatch && !exploreWatch && location.pathname !== '/upload' && location.pathname !== '/explore' && location.pathname !== '/friends' && location.pathname !== '/my-friends' && location.pathname !== '/following-list' && location.pathname !== '/stories' && location.pathname !== '/recommended' && location.pathname !== '/activity' && location.pathname !== '/algorithm' && !location.pathname.startsWith('/search') && !location.pathname.startsWith('/chat') && <TopBar immersive={immersive} title={titleFor(location.pathname)} />}
      <Suspense fallback={<div className="route-loading" role="status" aria-live="polite">Loading…</div>}>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<RequireAuth><Feed key="discover" tab="discover" /></RequireAuth>} />
        <Route path="/following" element={<RequireAuth><Feed key="following" tab="following" /></RequireAuth>} />
        <Route path="/explore" element={<RequireAuth><ExploreRedirect /></RequireAuth>} />
        <Route path="/search" element={<RequireAuth><Search /></RequireAuth>} />
        <Route path="/search/tag/:tag" element={<RequireAuth><Search /></RequireAuth>} />
        <Route path="/friends" element={<RequireAuth><Explore /></RequireAuth>} />
        <Route path="/my-friends" element={<RequireAuth><MyFriends /></RequireAuth>} />
        <Route path="/following-list" element={<RequireAuth><Following /></RequireAuth>} />
        <Route path="/explore/watch/:postId" element={<RequireAuth><ExploreWatch /></RequireAuth>} />
        <Route path="/activity" element={<RequireAuth><Activity /></RequireAuth>} />
        <Route path="/stories" element={<RequireAuth><Stories /></RequireAuth>} />
        <Route path="/recommended" element={<RequireAuth><Recommended /></RequireAuth>} />
        <Route path="/live" element={<RequireAuth><LiveBroadcasts /></RequireAuth>} />
        <Route path="/live/create" element={<RequireAuth><LiveCreate /></RequireAuth>} />
        <Route path="/algorithm" element={<RequireAuth><Algorithm /></RequireAuth>} />
        <Route path="/chat" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="/message" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="/chat/new" element={<RequireAuth><NewMessage /></RequireAuth>} />
        <Route path="/chat/g/:token" element={<RequireAuth><GroupChatRoute /></RequireAuth>} />
        <Route path="/chat/d/:token" element={<RequireAuth><DirectChatRoute /></RequireAuth>} />
        <Route path="/orders/:orderId" element={<RequireAuth><OrderDetails /></RequireAuth>} />
        <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
        <Route path="/story/text" element={<RequireAuth><StoryComposer /></RequireAuth>} />
        <Route path="/post/text" element={<RequireAuth><StoryComposer /></RequireAuth>} />
        <Route path="/p/:postId" element={<RequireAuth><PostDetail /></RequireAuth>} />
        <Route path="/creator" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/creator/earnings" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/creator/cashout" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/creator/matches" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/creator/grow" element={<RequireAuth><CreatorStudio /></RequireAuth>} />
        <Route path="/ads-sponsors" element={<RequireAuth><AdsSponsors /></RequireAuth>} />
        <Route path="/creator/live/:matchId" element={<RequireAuth><LiveMatchRoom /></RequireAuth>} />
        <Route path="/u/me/edit" element={<RequireAuth><EditProfile /></RequireAuth>} />
        <Route path="/u/:username" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/u/:username/:list" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      {showChrome && isTabScreen(location.pathname, location.search) && !profileWatch && !exploreWatch && <BottomNav />}
      <LiveChat />
      <Toast />
      <ConfirmDialog />
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
  if (path.startsWith('/ads-sponsors')) return 'Ads & Sponsors';
  if (path.startsWith('/u/')) return '';
  return 'RimSocial';
}
