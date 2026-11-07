import { useState } from 'react';

const REASONS = ['Spam or misleading', 'Harassment or bullying', 'Hate or harmful content', 'Violence or dangerous acts', 'Copyright concern', 'Other'];

// Options for a Rimlight post, matching the Snapchat reference: a white card with rows and no Cancel button.
// Tapping outside the card closes it. Destructive actions are red.
export default function PostOptionsSheet({ username, isOwn, reporting, onClose, onRemix, onShare, onCopy, onNotInterested, onBlock, onReport, onDelete }) {
  const [step, setStep] = useState('menu');
  const [reason, setReason] = useState(REASONS[0]);

  return (
    <div className="pos-backdrop" onClick={onClose}>
      <section className="pos-sheet" role="dialog" aria-label="Rim options" onClick={(e) => e.stopPropagation()}>
        {step === 'menu' ? (
          <ul className="pos-list">
            <li><button type="button" className="pos-item" onClick={onRemix}>Remix Rim</button></li>
            {!isOwn && <li><button type="button" className="pos-item danger" onClick={onBlock}>Block @{username}</button></li>}
            {!isOwn && <li><button type="button" className="pos-item danger" onClick={() => setStep('report')}>Report Rim</button></li>}
            {!isOwn && <li><button type="button" className="pos-item" onClick={onNotInterested}>Not Interested</button></li>}
            <li><button type="button" className="pos-item" onClick={onCopy}>Copy Link</button></li>
            <li>
              <button type="button" className="pos-item pos-export" onClick={onShare}>
                <span>Export or Send Rim</span>
                <span className="pos-export-icons" aria-hidden="true">
                  <span className="pos-circle grey"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.3 10.9l7.4-3.8M8.3 13.1l7.4 3.8" /></svg></span>
                  <span className="pos-circle blue"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M3 11.5 21 3l-5 18-4-7.5z" /></svg></span>
                </span>
              </button>
            </li>
            {isOwn && <li><button type="button" className="pos-item danger" onClick={onDelete}>Delete Rim</button></li>}
          </ul>
        ) : (
          <>
            <header className="pos-head">
              <button type="button" className="pos-back" onClick={() => setStep('menu')} aria-label="Back">‹</button>
              <strong>Why are you reporting this Rim?</strong>
            </header>
            <ul className="pos-list">
              {REASONS.map((item) => (
                <li key={item}>
                  <button type="button" className={`pos-item ${reason === item ? 'selected' : ''}`} onClick={() => setReason(item)}>
                    {item}
                    {reason === item && <span className="pos-check" aria-hidden="true">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="pos-submit-wrap">
              <button type="button" className="pos-submit" onClick={() => onReport(reason)} disabled={reporting}>{reporting ? 'Submitting…' : 'Submit report'}</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
