import { useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';
import './BoostSheet.css';

// Must match the server's BOOST_MINOR_PER_DAY (kobo): NGN 1,000 a day
const NAIRA_PER_DAY = 1000;
const DAY_OPTIONS = [1, 3, 7];

// Promote: the post shows as an ad with your name, description and button. You pay by card through Paystack.
export default function BoostSheet({ postId, defaultName, onClose }) {
  const [days, setDays] = useState(3);
  const [sponsorName, setSponsorName] = useState(defaultName || '');
  const [sponsorDescription, setSponsorDescription] = useState('');
  const [sponsorCta, setSponsorCta] = useState('Shop Now');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function pay(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const data = await api(`/v1/posts/${postId}/boost`, {
        method: 'POST',
        body: { days, sponsorName: sponsorName.trim(), sponsorDescription: sponsorDescription.trim(), sponsorCta, sponsorUrl: sponsorUrl.trim() },
      });
      window.location.href = data.authorizationUrl;
    } catch (e) {
      toast(e.message || 'Could not start payment');
      setBusy(false);
    }
  }

  return (
    <div className="bs-backdrop" role="dialog" aria-modal="true" aria-label="Promote this post">
      <form className="bs-sheet" onSubmit={pay}>
        <div className="bs-top">
          <button type="button" className="bs-close" onClick={onClose} aria-label="Close" disabled={busy}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <strong>Promote</strong>
          <span />
        </div>

        <p className="bs-lead">Show this post to more people as an ad. Your name, description and button appear on it.</p>

        <label className="bs-field">Name shown on the ad
          <input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} maxLength={100} required placeholder="Your business or name" />
        </label>
        <label className="bs-field">Short description
          <input value={sponsorDescription} onChange={(e) => setSponsorDescription(e.target.value)} maxLength={200} placeholder="What are you promoting?" />
        </label>
        <label className="bs-field">Button
          <select value={sponsorCta} onChange={(e) => setSponsorCta(e.target.value)}>
            <option>Shop Now</option><option>Learn More</option><option>Sign Up</option><option>Visit Site</option>
          </select>
        </label>
        <label className="bs-field">Link people go to
          <input type="url" value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} maxLength={1024} required placeholder="https://example.com" />
        </label>

        <div className="bs-days" role="radiogroup" aria-label="How long">
          {DAY_OPTIONS.map((option) => (
            <button type="button" key={option} role="radio" aria-checked={days === option} className={days === option ? 'on' : ''} onClick={() => setDays(option)}>
              <strong>{option} {option === 1 ? 'day' : 'days'}</strong>
              <small>NGN {(option * NAIRA_PER_DAY).toLocaleString()}</small>
            </button>
          ))}
        </div>

        <button type="submit" className="bs-pay" disabled={busy || !sponsorName.trim() || !sponsorUrl.trim()}>
          {busy ? 'Opening payment…' : `Pay NGN ${(days * NAIRA_PER_DAY).toLocaleString()} and promote`}
        </button>
      </form>
    </div>
  );
}
