import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Only the first PERSIST_ITEMS posts of each list are saved on the device.
// Keeping storage small keeps load times short. Lists longer than that are
// refetched from the server when the app reopens.
const PERSIST_ITEMS = 30;
const EMPTY_STORIES = { items: [], updatedAt: 0 };

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
      storyRail: EMPTY_STORIES,
      uploadDraft: { caption: '' },

      setSession: (token, user) => set({ token, user }),
      logout: () => set({
        token: null, user: null, gifts: [], coinBalance: 0, feeds: {}, profiles: {},
        storyRail: EMPTY_STORIES, lastPath: '/',
      }),
      setGifts: (gifts) => set({ gifts }),
      setCoins: (coinBalance) => set({ coinBalance }),
      setLastPath: (lastPath) => set({ lastPath }),
      setFeed: (key, data) =>
        set((s) => ({ feeds: { ...s.feeds, [key]: { ...s.feeds[key], ...data } } })),
      setProfile: (key, data) =>
        set((s) => ({ profiles: { ...s.profiles, [key]: { ...s.profiles[key], ...data } } })),
      setStoryRail: (storyRail) => set({ storyRail }),
      setUploadDraft: (uploadDraft) => set((s) => ({ uploadDraft: typeof uploadDraft === 'function' ? uploadDraft(s.uploadDraft) : uploadDraft })),
    }),
    {
      name: 'clipverse-app',
      version: 2,
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        gifts: s.gifts,
        coinBalance: s.coinBalance,
        lastPath: s.lastPath,
        profiles: s.profiles,
        storyRail: s.storyRail,
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
