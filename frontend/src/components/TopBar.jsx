import { NavLink } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from '../store.js';
import { api } from '../api.js';
import { toast } from '../toast.js';

export default function TopBar({ immersive, title }) {
  const coinBalance = useAppStore((s) => s.coinBalance);
  const isNative = Capacitor.isNativePlatform();

  async function buyCoins() {
    // Store rules: coins sold inside the Android app must use Google Play Billing.
    // Paystack checkout is for the web version only.
    if (isNative) return toast('Coin purchases in the Android app are coming soon.');
    const amount = Number(prompt('Amount to pay, in minor units (e.g. 1000 = 10.00)'));
    if (!amount) return;
    try {
      const data = await api('/v1/wallet/topup', { method: 'POST', body: { amountMinor: amount } });
      window.location.href = data.authorizationUrl;
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <header className={`topbar ${immersive ? 'overlay' : ''}`}>
      {immersive ? (
        <nav className="segmented">
          <NavLink to="/" end>Discover</NavLink>
          <NavLink to="/following">Following</NavLink>
        </nav>
      ) : (
        <div className="brand">{title || 'Clipverse'}</div>
      )}
      <button className="coins" onClick={buyCoins} aria-label="Buy coins">
        <span className="dot" />
        {coinBalance.toLocaleString()}
      </button>
    </header>
  );
}
