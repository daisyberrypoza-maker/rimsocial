import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearMediaCache, evictMedia, missingItems } from './lib/prefetch.js';

const STORY_CACHE_LIMIT = 20;
const STORY_CACHE_KEY = 'clipverse-stories';
const STORY_STORE_ITEMS = 10;

// Story lists live under their own key, so scrolling the feed does not re-save them each time
function loadStoryCache() {
  try { return JSON.parse(localStorage.getItem(STORY_CACHE_KEY) || '{}') || {}; } catch { return {}; }
}
let storyCacheTimer = null;
function saveStoryCache(value) {
  clearTimeout(storyCacheTimer);
  storyCacheTimer = setTimeout(() => {
    try { localStorage.setItem(STORY_CACHE_KEY, JSON.stringify(value)); } catch { /* storage full or unavailable */ }
  }, 500);
}

// Only the first PERSIST_ITEMS posts of each list are saved on the device.
// Keeping storage small keeps load times short. Lists longer than that are
// refetched from the server when the app reopens.
const PERSIST_ITEMS = 30;
const EMPTY_STORIES = { items: [], updatedAt: 0 };

// Ring state is shared by every avatar. The owner's active story is always 'mine',
// regardless of whether they have viewed it; absent authors have no active story.
function ringsFromRail(rail, ownId) {
  const out = {};
  for (const g of Array.isArray(rail) ? rail : []) {
    if (!g.user?.id) continue;
    out[g.user.id] = String(g.user.id) === String(ownId) ? 'mine' : g.unseen ? 'unseen' : 'seen';
  }
  return out;
}

export const useAppStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      gifts: [],
      coinBalance: 0,
      lastPath: '/',
      feeds: {},        // { discover, following, explore, 'u:<username>': { items, nextCursor, activeIndex, updatedAt } }
      profiles: {},     // { [username | 'me']: { user, updatedAt } }
      offline: false,   // not saved: set from real network results
      setOffline: (offline) => set((s) => (s.offline === offline ? s : { offline })),
      storyRail: EMPTY_STORIES,
      storyRings: {},
      storyCache: loadStoryCache(),   // { [userId]: { items, isSubscribed, updatedAt } } so stories open instantly
      pendingUpload: null,            // not saved: { kind: 'post' | 'story', thumb, mediaKind } while an upload is running
      setPendingUpload: (pendingUpload) => set({ pendingUpload }),
      storyRailAt: 0,                 // when the saved rail was last loaded from the server
      storyDiscover: { suggested: [], ranking: { friends: {}, discoverOrder: [] }, updatedAt: 0 },
      uploadDraft: { caption: '' },

      setSession: (token, user) => set({ token, user }),
      logout: () => {
        clearMediaCache();
        set({
          token: null, user: null, gifts: [], coinBalance: 0, feeds: {}, profiles: {},
          storyRail: EMPTY_STORIES, storyCache: {}, lastPath: '/',
          storyRailAt: 0, storyDiscover: { suggested: [], ranking: { friends: {}, discoverOrder: [] }, updatedAt: 0 },
        });
        saveStoryCache({});
      },
      setGifts: (gifts) => set({ gifts }),
      setCoins: (coinBalance) => set({ coinBalance }),
      setLastPath: (lastPath) => set({ lastPath }),
      setFeed: (key, data) => {
        if (Array.isArray(data.items)) evictMedia(missingItems(useAppStore.getState().feeds[key]?.items, data.items));
        set((s) => ({ feeds: { ...s.feeds, [key]: { ...s.feeds[key], ...data } } }));
      },
      setProfile: (key, data) =>
        set((s) => ({ profiles: { ...s.profiles, [key]: { ...s.profiles[key], ...data } } })),
      setStoryRail: (incoming) => set((s) => {
        // Always stored as a list of creators, whether the caller passes the list or the server's { items } object
        const storyRail = Array.isArray(incoming) ? incoming : (incoming?.items || []);
        const nextRings = { ...s.storyRings };
        // Remove stale states for people in the previous rail before applying the fresh rail.
        for (const group of Array.isArray(s.storyRail) ? s.storyRail : []) if (group.user?.id) delete nextRings[group.user.id];
        return { storyRail, storyRailAt: Date.now(), storyRings: { ...nextRings, ...ringsFromRail(storyRail, s.user?.id) } };
      }),
      setStoryRings: (rings) => set((s) => {
        const normalized = { ...rings };
        const ownId = s.user?.id;
        if (ownId && normalized[ownId]) normalized[ownId] = 'mine';
        return { storyRings: { ...s.storyRings, ...normalized } };
      }),
      setStoryDiscover: (storyDiscover) => set({ storyDiscover }),
      setStoryCache: (userId, entry) => set((s) => {
        const next = { ...s.storyCache, [userId]: { ...entry, items: (entry.items || []).slice(0, STORY_STORE_ITEMS), updatedAt: Date.now() } };
        const keys = Object.keys(next);
        if (keys.length > STORY_CACHE_LIMIT) keys.slice(0, keys.length - STORY_CACHE_LIMIT).forEach((k) => { delete next[k]; });
        saveStoryCache(next);
        return { storyCache: next };
      }),
      setUploadDraft: (uploadDraft) => set((s) => ({ uploadDraft: typeof uploadDraft === 'function' ? uploadDraft(s.uploadDraft) : uploadDraft })),
    }),
    {
      name: 'clipverse-app',
      version: 3,
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        gifts: s.gifts,
        coinBalance: s.coinBalance,
        lastPath: s.lastPath,
        profiles: s.profiles,
        storyRail: s.storyRail,
        storyRailAt: s.storyRailAt,
        storyDiscover: s.storyDiscover,
        uploadDraft: s.uploadDraft,
        feeds: Object.fromEntries(
          Object.entries(s.feeds).map(([key, f]) => {
            const trimmed = (f.items || []).length > PERSIST_ITEMS;
            return [key, {
              ...f,
              items: (f.items || []).slice(0, PERSIST_ITEMS),
              // A trimmed list has no valid cursor, so the next visit starts fresh
              nextCursor: trimmed ? null : f.nextCursor,
            }];
          })
        ),
      }),
    }
  )
);
// A fresh app start (not a minimize) always opens reels from the top: forget the saved reel index.
// Minimizing keeps this page in memory, so the position is kept there.
{
  const { feeds } = useAppStore.getState();
  if (feeds && Object.keys(feeds).length) {
    useAppStore.setState({
      feeds: Object.fromEntries(Object.entries(feeds).map(([key, value]) => [key, { ...value, activeIndex: 0 }])),
    });
  }
}

