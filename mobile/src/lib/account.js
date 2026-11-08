import { api } from '../api';
import { useAppStore } from '../store';

// Gifts and coin balance after login or on app start
export async function loadAccount() {
  const [g, w] = await Promise.all([api('/v1/gifts'), api('/v1/wallet')]);
  const s = useAppStore.getState();
  s.setGifts(g.items);
  s.setCoins(w.coinBalance);
}
