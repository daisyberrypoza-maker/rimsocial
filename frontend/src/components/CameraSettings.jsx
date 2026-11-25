import { useState } from 'react';
import Icon from './Icon.jsx';
import './CameraSettings.css';

// Camera preferences are per device (localStorage). Reads and writes are wrapped because storage can be blocked.
const KEYS = { startFront: 'rim.camera.startFront', tools: 'rim.camera.tools' };

export function readCameraPref(key, fallback) {
  try {
    const value = window.localStorage.getItem(KEYS[key]);
    if (value === null) return fallback;
    return key === 'startFront' ? value === '1' : value;
  } catch {
    return fallback;
  }
}

function writeCameraPref(key, value) {
  try {
    window.localStorage.setItem(KEYS[key], key === 'startFront' ? (value ? '1' : '0') : value);
  } catch {
    // Storage blocked: the choice still applies for this visit
  }
}

// Gallery settings screen, opened from the gear: Done, Story / Reels / Live rows, Controls, Camera tools.
export default function CameraSettings({ onDone, onStory, onReel }) {
  const [startFront, setStartFront] = useState(() => readCameraPref('startFront', true));
  const [tools, setTools] = useState(() => readCameraPref('tools', 'left'));

  function toggleFront() {
    const next = !startFront;
    setStartFront(next);
    writeCameraPref('startFront', next);
  }

  function chooseTools(side) {
    setTools(side);
    writeCameraPref('tools', side);
  }

  return (
    <main className="cs-page" aria-label="Camera settings">
      <header className="cs-top">
        <button type="button" className="cs-done" onClick={onDone}>Done</button>
        <h1 className="cs-title">Settings</h1>
        <span className="cs-spacer" aria-hidden="true" />
      </header>

      <section className="cs-group">
        <button type="button" className="cs-row" onClick={onStory}><span>Story</span><Icon name="chevron-right" size={20} /></button>
        <button type="button" className="cs-row" onClick={onReel}><span>Reels</span><Icon name="chevron-right" size={20} /></button>
        <button type="button" className="cs-row" disabled aria-disabled="true"><span>Live</span><small>Coming soon</small></button>
      </section>

      <h2 className="cs-heading">Controls</h2>
      <section className="cs-group">
        <div className="cs-row cs-row-toggle">
          <span>Always start on front camera</span>
          <button type="button" role="switch" aria-checked={startFront} aria-label="Always start on front camera" className={startFront ? 'cs-switch on' : 'cs-switch'} onClick={toggleFront}>
            <span className="cs-knob" />
          </button>
        </div>
      </section>

      <h2 className="cs-heading">Camera tools</h2>
      <section className="cs-group">
        <label className="cs-row cs-row-radio">
          <span>Left side</span>
          <input type="radio" name="cs-tools" value="left" checked={tools === 'left'} onChange={() => chooseTools('left')} />
        </label>
        <label className="cs-row cs-row-radio">
          <span>Right side</span>
          <input type="radio" name="cs-tools" value="right" checked={tools === 'right'} onChange={() => chooseTools('right')} />
        </label>
      </section>
    </main>
  );
}
