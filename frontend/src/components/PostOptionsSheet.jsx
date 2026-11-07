import { useState } from 'react';

const REASONS = ['Spam or misleading', 'Harassment or bullying', 'Hate or harmful content', 'Violence or dangerous acts', 'Copyright concern', 'Other'];

// Options for a Rimlight post, as a white card over the dimmed post.
// Destructive actions are red. Reporting asks for a reason on a second step.
export default function PostOptionsSheet({ username, isOwn, canRemix, reposted, reporting, onClose, onGift, onRemix, onRepost, onShare, onCopy, onNotInterested, onBlock, onReport, onDelete }) {
  const [step, setStep] = useState('menu');
  const [reason, setReason] = useState(REASONS[0]);

  return (
    <div className="pos-backdrop" onClick={onClose}>
      <section className="pos-sheet" role="dialog" aria-label="Post options" onClick={(e) => e.stopPropagation()}>
        {step === 'menu' ? (
          <ul className="pos-list">
            {!isOwn && <li><button type="button" className="pos-item" onClick={onGift}>Send a gift</button></li>}
            {canRemix && <li><button type="button" className="pos-item" onClick={onRemix}>Remix</button></li>}
            <li><button type="button" className="pos-item" onClick={onRepost}>{reposted ? 'Undo repost' : 'Repost'}</button></li>
            <li><button type="button" className="pos-item" onClick={onShare}>Share to other apps</button></li>
            <li><button type="button" className="pos-item" onClick={onCopy}>Copy link</button></li>
            {!isOwn && <li><button type="button" className="pos-item danger" onClick={onNotInterested}>Not interested</button></li>}
            {!isOwn && <li><button type="button" className="pos-item danger" onClick={onBlock}>Block @{username}</button></li>}
            {!isOwn && <li><button type="button" className="pos-item danger" onClick={() => setStep('report')}>Report post</button></li>}
            {isOwn && <li><button type="button" className="pos-item danger" onClick={onDelete}>Delete post</button></li>}
            <li><button type="button" className="pos-item cancel" onClick={onClose}>Cancel</button></li>
          </ul>
        ) : (
          <>
            <header className="pos-head">
              <button type="button" className="pos-back" onClick={() => setStep('menu')} aria-label="Back">‹</button>
              <strong>Why are you reporting this?</strong>
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
