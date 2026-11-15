import { useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';
import './BoostSheet.css';

// Promote flow: goal, audience and budget, then review and pay with Paystack.
const GOALS = [
  { id: 'followers', label: 'More Followers', button: 'Follow', icon: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> },
  { id: 'views', label: 'More Views', button: 'Watch', icon: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> },
  { id: 'visits', label: 'More Website Visits', button: 'Visit Site', icon: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></> },
];
const BUTTONS = ['Shop Now', 'Learn More', 'Sign Up', 'Visit Site', 'Follow', 'Watch'];
const MIN_DAILY = 500;
const MAX_DAILY = 50000;
const MAX_DAYS = 14;
const naira = (n) => `NGN ${Math.round(n).toLocaleString()}`;

export default function BoostSheet({ postId, defaultName, onClose }) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState('followers');
  const [daily, setDaily] = useState(1000);
  const [days, setDays] = useState(2);
  const [sponsorName, setSponsorName] = useState(defaultName || '');
  const [sponsorDescription, setSponsorDescription] = useState('');
  const [sponsorCta, setSponsorCta] = useState('Follow');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const total = daily * days;

  function chooseGoal(id) {
    setGoal(id);
    setSponsorCta(GOALS.find((g) => g.id === id)?.button || 'Shop Now');
  }

  async function pay() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api(`/v1/posts/${postId}/boost`, {
        method: 'POST',
        body: { days, dailyNaira: daily, sponsorName: sponsorName.trim(), sponsorDescription: sponsorDescription.trim(), sponsorCta, sponsorUrl: sponsorUrl.trim() },
      });
      window.location.href = data.authorizationUrl;
    } catch (e) {
      toast(e.message || 'Could not start payment');
      setBusy(false);
    }
  }

  const next = () => setStep((s) => Math.min(2, s + 1));
  const back = () => (step === 0 ? onClose() : setStep((s) => s - 1));
  const adReady = sponsorName.trim() && /^https?:\/\//i.test(sponsorUrl.trim());

  return (
    <div className="bs-page" role="dialog" aria-modal="true" aria-label="Promote this post">
      <header className="bs-head">
        <button type="button" className="bs-back" onClick={back} aria-label={step === 0 ? 'Close' : 'Back'} disabled={busy}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      </header>
      <div className="bs-progress" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}
      </div>

      {step === 0 && <section className="bs-step">
        <h1>Select Your Goal</h1>
        <div className="bs-goals" role="radiogroup" aria-label="Goal">
          {GOALS.map((g) => (
            <button type="button" key={g.id} role="radio" aria-checked={goal === g.id} className={goal === g.id ? 'bs-goal on' : 'bs-goal'} onClick={() => chooseGoal(g.id)}>
              <span className="bs-goal-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{g.icon}</svg></span>
              <span className="bs-goal-label">{g.label}</span>
              <span className="bs-radio" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>}

      {step === 1 && <section className="bs-step">
        <h1>Select Your Audience &amp; Budget</h1>
        <div className="bs-block">
          <strong>Audience</strong>
          <small>Best Audience for You</small>
          <div className="bs-audience">
            <span>Best Audience for You</span>
            <span className="bs-radio on" aria-hidden="true" />
          </div>
          <p className="bs-note">Your ad is shared with people more likely to view it.</p>
        </div>
        <div className="bs-block">
          <strong>Budget &amp; Duration</strong>
          <small>{naira(total)} over {days} {days === 1 ? 'day' : 'days'}</small>
          <div className="bs-slider-label">Budget (NGN)</div>
          <div className="bs-value">{naira(daily)} per day</div>
          <input type="range" min={MIN_DAILY} max={MAX_DAILY} step={500} value={daily} onChange={(e) => setDaily(Number(e.target.value))} aria-label="Daily budget" />
          <div className="bs-slider-label">Duration</div>
          <div className="bs-value">{days} {days === 1 ? 'day' : 'days'}</div>
          <input type="range" min={1} max={MAX_DAYS} step={1} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Duration in days" />
        </div>
      </section>}

      {step === 2 && <section className="bs-step">
        <h1>Review Promotion</h1>
        <div className="bs-block">
          <strong>Your ad</strong>
          <label className="bs-field">Name shown on the ad
            <input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} maxLength={100} placeholder="Your business or name" />
          </label>
          <label className="bs-field">Short description
            <input value={sponsorDescription} onChange={(e) => setSponsorDescription(e.target.value)} maxLength={200} placeholder="What are you promoting?" />
          </label>
          <label className="bs-field">Button
            <select value={sponsorCta} onChange={(e) => setSponsorCta(e.target.value)}>{BUTTONS.map((b) => <option key={b}>{b}</option>)}</select>
          </label>
          <label className="bs-field">Link people go to
            <input type="url" value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} maxLength={1024} placeholder="https://example.com" />
          </label>
        </div>
        <div className="bs-block bs-summary">
          <div><span>Goal</span><strong>{GOALS.find((g) => g.id === goal)?.label}</strong></div>
          <div><span>Budget</span><strong>{naira(daily)} per day</strong></div>
          <div><span>Duration</span><strong>{days} {days === 1 ? 'day' : 'days'}</strong></div>
          <div className="bs-total"><span>Total</span><strong>{naira(total)}</strong></div>
        </div>
      </section>}

      <footer className="bs-foot">
        {step < 2
          ? <button type="button" className="bs-cta" onClick={next}>{step === 0 ? 'Next' : 'Review Promotion'}</button>
          : <button type="button" className="bs-cta" onClick={pay} disabled={busy || !adReady}>{busy ? 'Opening payment…' : `Pay ${naira(total)}`}</button>}
      </footer>
    </div>
  );
}
