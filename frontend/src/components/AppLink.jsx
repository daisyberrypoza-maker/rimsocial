import { useEffect, useState } from 'react';
import './AppLink.css';

// Opens an outside link inside the app. Opening it in the phone browser stays an explicit choice ("Open in browser").
export default function AppLink({ href, className, children, ...rest }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a href={href} className={className} {...rest} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); setOpen(true); }}>
        {children}
      </a>
      {open && <InAppBrowser url={href} onClose={() => setOpen(false)} />}
    </>
  );
}

export function InAppBrowser({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
  return (
    <div className="app-browser" role="dialog" aria-modal="true" aria-label={`Browser: ${host}`}>
      <div className="app-browser-top">
        <button type="button" className="app-browser-close" onClick={onClose} aria-label="Close">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <strong>{host}</strong>
        <a href={url} target="_blank" rel="noopener noreferrer">Open in browser</a>
      </div>
      <iframe src={url} title={host} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
      <p className="app-browser-note">If the page does not load here, tap Open in browser.</p>
    </div>
  );
}
