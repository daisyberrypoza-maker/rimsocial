import { useState } from 'react';
import Icon from './Icon.jsx';
import { TEXT_COLORS, TEXT_FONTS, TEXT_ALIGNS } from '../lib/textLayers.js';
import './TextEditor.css';

// Full-screen text tool: type, pick a colour, font, alignment and background, then Done.
export default function TextEditor({ initial, onDone, onCancel, onDelete }) {
  const [text, setText] = useState(initial?.text || '');
  const [color, setColor] = useState(initial?.color || '#ffffff');
  const [font, setFont] = useState(initial?.font || 'sans');
  const [align, setAlign] = useState(initial?.align || 'center');
  const [bg, setBg] = useState(initial?.bg || 'none');
  const [x] = useState(initial?.x ?? 0.5);
  const [y] = useState(initial?.y ?? 0.5);
  const fontDef = TEXT_FONTS[font];
  const nextAlign = () => setAlign((a) => TEXT_ALIGNS[(TEXT_ALIGNS.indexOf(a) + 1) % TEXT_ALIGNS.length]);
  const done = () => {
    if (!text.trim()) return onCancel();
    onDone({ text: text.trimEnd(), color, font, align, bg, x, y });
  };

  return <div className="te-root" role="dialog" aria-modal="true" aria-label="Text">
    <header className="te-top">
      <button type="button" className="te-icon" onClick={onCancel} aria-label="Close text"><Icon name="x" size={28} /></button>
      <div className="te-top-right">
        <button type="button" className={`te-chip${bg === 'box' ? ' on' : ''}`} onClick={() => setBg((b) => (b === 'box' ? 'none' : 'box'))} aria-pressed={bg === 'box'}>Background</button>
        <button type="button" className="te-icon te-aa" onClick={() => setFont((f) => Object.keys(TEXT_FONTS)[(Object.keys(TEXT_FONTS).indexOf(f) + 1) % 3])} aria-label={`Font: ${fontDef.label}`}>Aa</button>
        <button type="button" className="te-icon" onClick={nextAlign} aria-label={`Align ${align}`}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {align === 'left' ? <path d="M4 6h16M4 12h10M4 18h14" /> : align === 'right' ? <path d="M4 6h16M10 12h10M6 18h14" /> : <path d="M4 6h16M7 12h10M5 18h14" />}
          </svg>
        </button>
      </div>
    </header>
    <div className="te-stage">
      <textarea
        className={`te-input te-font-${font}${bg === 'box' ? ' te-box' : ''}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type something"
        autoFocus
        rows={Math.max(1, text.split('\n').length)}
        style={{ color, textAlign: align, fontWeight: fontDef.weight, fontFamily: fontDef.family }}
        aria-label="Text to add"
      />
    </div>
    <footer className="te-bottom">
      <div className="te-colors" role="radiogroup" aria-label="Text colour">
        {TEXT_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Colour ${c}`} className={`te-swatch${color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
        <label className="te-swatch te-custom" aria-label="Pick any colour">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>
      <div className="te-actions">
        {initial && onDelete && <button type="button" className="te-delete" onClick={onDelete}>Delete</button>}
        <button type="button" className="te-done" onClick={done}>Done</button>
      </div>
    </footer>
  </div>;
}
