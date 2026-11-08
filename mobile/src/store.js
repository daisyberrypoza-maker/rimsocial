import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Only the first PERSIST_ITEMS posts of each list are saved on the device (same rule as the web app)
const PERSIST_ITEMS = 30;
const EMPTY_RAIL = { items: [], updatedAt: 0 };
const EMPTY_DISCOVER = { suggested: [], ranking: { friends: {}, discoverOrder: [] }, updatedAt: 0 };

export const useAppStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      gifts: [],
      coinBalance: 0,
      feeds: {},          // { discover, following, 'u:<username>': { items, nextCursor, activeIndex, updatedAt } }
      profiles: {},       // { [username | 'me']: { user, updatedAt } }
      offline: false,     // not saved
      storyRail: EMPTY_RAIL,
      storyRailAt: 0,
      storyDiscover: EMPTY_DISCOVER,
      storyCache: {},     // { [userId]: { items, updatedAt } } so stories open instantly
      pendingUpload: null, // not saved: { kind: 'post' | 'story', thumb, mediaKind } while an upload runs

      setOffline: (offline) => { if (get().offline !== offline) set({ offline }); },
      setSession: (token, user) => set({ token, user }),
      logout: () => set({
        token: null, user: null, gifts: [], coinBalance: 0, feeds: {}, profiles: {},
        storyRail: EMPTY_RAIL, storyRailAt: 0, storyDiscover: EMPTY_DISCOVER, storyCache: {},
      }),
      setGifts: (gifts) => set({ gifts }),
      setCoins: (coinBalance) => set({ coinBalance }),
      setFeed: (key, data) => set((s) => ({ feeds: { ...s.feeds, [key]: { ...s.feeds[key], ...data } } })),
      setProfile: (key, data) => set((s) => ({ profiles: { ...s.profiles, [key]: { ...s.profiles[key], ...data } } })),
      setStoryRail: (storyRail) => set({ storyRail, storyRailAt: Date.now() }),
      setStoryDiscover: (storyDiscover) => set({ storyDiscover }),
      setStoryCache: (userId, entry) => set((s) => ({
        storyCache: { ...s.storyCache, [userId]: { ...entry, items: (entry.items || []).slice(0, 10), updatedAt: Date.now() } },
      })),
      setPendingUpload: (pendingUpload) => set({ pendingUpload }),
    }),
    {
      name: 'rimsocial-app',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        gifts: s.gifts,
        coinBalance: s.coinBalance,
        profiles: s.profiles,
        storyRail: s.storyRail,
        storyRailAt: s.storyRailAt,
        storyDiscover: s.storyDiscover,
        storyCache: s.storyCache,
        feeds: Object.fromEntries(
          Object.entries(s.feeds).map(([key, f]) => {
            const trimmed = (f.items || []).length > PERSIST_ITEMS;
            return [key, { ...f, items: (f.items || []).slice(0, PERSIST_ITEMS), nextCursor: trimmed ? null : f.nextCursor, activeIndex: 0 }];
          })
        ),
      }),
    }
  )
);
