import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const initial = {
  tab: 'featured',
  query: '',
  lists: {},
  scrollTop: 0,
  activeTrack: null,
  playing: false,
};

export const useMusicStore = create(persist(
  (set) => ({
    ...initial,
    patchMusic: (patch) => set((state) => ({ ...state, ...patch })),
    resetMusic: () => set(initial),
  }),
  {
    name: 'rimsocial-music-picker',
    version: 1,
    partialize: (state) => ({
      tab: state.tab,
      query: state.query,
      lists: state.lists,
      scrollTop: state.scrollTop,
      activeTrack: state.activeTrack,
      playing: false,
    }),
  }
));
