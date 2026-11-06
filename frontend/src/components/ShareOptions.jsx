import Icon from './Icon.jsx';

const TARGETS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'message-circle', url: (u, t) => `https://wa.me/?text=${encodeURIComponent(t + ' ' + u)}` },
  { id: 'facebook', label: 'Facebook', icon: 'share', url: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: 'x', label: 'X', icon: 'at-sign', url: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: 'telegram', label: 'Telegram', icon: 'send', url: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: 'email', label: 'Email', icon: 'mail', url: (u, t) => `mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(u)}` },
];

export default function ShareOptions({ url, title = 'RimSocial post', text = '', onClose }) {
  const fullText = text ? `${title} — ${text}` : title;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      window.dispatchEvent(new CustomEvent('rimsocial:toast', { detail: 'Post link copied' }));
    } catch {
      window.prompt('Copy this post link', url);
    }
  }
  async function systemShare() {
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else await copy();
    } catch (error) {
      if (error?.name !== 'AbortError') window.dispatchEvent(new CustomEvent('rimsocial:toast', { detail: 'Could not open sharing options' }));
    }
  }
  return <div className="sheet-backdrop share-backdrop" onClick={onClose}>
    <section className="sheet share-sheet" role="dialog" aria-label="Share post" onClick={(e) => e.stopPropagation()}>
      <div className="people-sheet-handle" />
      <div className="comments-heading"><div><h3>Share post</h3><p className="muted">Send this post to people on or off RimSocial.</p></div><button className="icon-button" onClick={onClose} aria-label="Close share options"><Icon name="x" size={20} /></button></div>
      <div className="share-targets">
        {TARGETS.map((target) => <a key={target.id} className="share-target" href={target.url(url, fullText)} target={target.id === 'email' ? undefined : '_blank'} rel="noopener noreferrer" onClick={onClose}>
          <span className={'share-target-icon ' + target.id}><Icon name={target.icon} size={22} /></span><span>{target.label}</span>
        </a>)}
        <button type="button" className="share-target" onClick={async () => { await copy(); onClose(); }}><span className="share-target-icon copy"><Icon name="link" size={22} /></span><span>Copy link</span></button>
        <button type="button" className="share-target" onClick={async () => { await systemShare(); onClose(); }}><span className="share-target-icon more"><Icon name="share-2" size={22} /></span><span>More apps</span></button>
      </div>
      <div className="share-link-preview"><span>{url}</span><button type="button" onClick={async () => { await copy(); onClose(); }}>Copy</button></div>
    </section>
  </div>;
}
