import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// "Your algorithm": topics the viewer wants more or less of. Stored on this device only.
const KEY = 'rimsocial.algorithm';

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (value && Array.isArray(value.more) && Array.isArray(value.less)) return value;
  } catch { /* storage unavailable: start empty */ }
  return { more: [], less: [] };
}

function save(value) {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export default function Algorithm() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(load);

  const update = (next) => { setPrefs(next); save(next); };

  const addTopic = (list) => {
    const entered = window.prompt(list === 'more' ? 'Topic you want to see more of' : 'Topic you want to see less of');
    const name = (entered || '').trim().slice(0, 40);
    if (!name || prefs.more.includes(name) || prefs.less.includes(name)) return;
    update({ ...prefs, [list]: [...prefs[list], name] });
  };

  const removeTopic = (list, name) => update({ ...prefs, [list]: prefs[list].filter((item) => item !== name) });

  const resetAll = () => {
    if (window.confirm('Clear all your algorithm choices?')) update({ more: [], less: [] });
  };

  const section = (list, title, hint) => (
    <section className="algo-section">
      <h2>{title}</h2>
      <p className="algo-hint">{hint}</p>
      <div className="algo-chips">
        {prefs[list].map((name) => (
          <button key={name} type="button" className="algo-chip filled" onClick={() => removeTopic(list, name)} aria-label={`Remove ${name}`}>{name}</button>
        ))}
        <button type="button" className="algo-chip outline" onClick={() => addTopic(list)}>
          <span className="algo-plus" aria-hidden="true">+</span>Add
        </button>
      </div>
    </section>
  );

  return (
    <main className="algo-page">
      <header className="algo-head">
        <button type="button" className="algo-icon" onClick={() => navigate(-1)} aria-label="Back">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <h1>Your algorithm</h1>
        <button type="button" className="algo-icon" onClick={resetAll} aria-label="Clear all choices">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
        </button>
      </header>
      <p className="algo-summary">Choose what you want more or less of in Rimlight.</p>
      {section('more', 'What you want to see more of', 'Topics you add here are shown more often in Rimlight.')}
      {section('less', 'What you want to see less of', 'Topics you add here are shown less often in Rimlight.')}
      <p className="algo-build">Build {__APP_BUILD__}</p>
    </main>
  );
}
