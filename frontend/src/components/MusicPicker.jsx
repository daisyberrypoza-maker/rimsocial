import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Icon from './Icon.jsx';
import { toast, logError } from '../toast.js';
import './MusicPicker.css';

// Full-screen sound picker: Featured (app library), Saved, Trending (Audius catalogue).
// Only app-library sounds can be attached to a story for now; Audius sounds preview only.
// Audius previews use a fresh signed link from the server for each play.
const TABS = [['featured', 'Featured'], ['saved', 'Saved'], ['trending', 'Trending']];

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function MusicPicker({ selectedId, onSelect, onClose }) {
  const [tab, setTab] = useState('featured');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef(null);
  const fileRef = useRef(null);

  // Stop playback when leaving the picker
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // Load the list for the active tab; search changes the list after a short pause
  useEffect(() => {
    if (tab === 'saved') { setItems([]); return undefined; }
    let active = true;
    const q = query.trim();
    const path = tab === 'trending'
      ? (q ? `/v1/audio/audius/search?q=${encodeURIComponent(q)}&limit=30` : '/v1/audio/audius/trending?limit=30')
      : `/v1/audio/search?q=${encodeURIComponent(q)}`;
    const timer = setTimeout(() => {
      api(path)
        .then((data) => { if (active) setItems((data.items || []).map((item) => ({ ...item, source: tab === 'trending' ? 'audius' : 'local' }))); })
        .catch((error) => { if (active) { setItems([]); logError(error); } });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [tab, query]);

  function stopPreview() {
    audioRef.current?.pause();
    setPlayingId(null);
  }

  // Play or pause one row. Audius rows ask the server for a fresh link first.
  async function togglePreview(item) {
    if (playingId === item.id) { stopPreview(); return; }
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      audio.pause();
      const src = item.source === 'audius'
        ? (await api(`/v1/audio/audius/${encodeURIComponent(item.id)}/stream`)).url
        : mediaUrl(item.mediaUrl);
      audio.src = src;
      audio.onended = () => setPlayingId(null);
      await audio.play();
      setPlayingId(item.id);
    } catch (error) {
      logError(error);
      setPlayingId(null);
      toast('This sound could not be played');
    }
  }

  // Create Sound: upload an audio file to the app library and select it
  async function createSound(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('media', file);
      form.append('title', file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'My sound');
      const track = await api('/v1/audio', { method: 'POST', body: form });
      setTab('featured');
      setItems((list) => [track, ...list]);
      onSelect(track);
    } catch (error) {
      logError(error);
      toast('Could not add this sound. Use an MP3, M4A, AAC, WAV or OGG file');
    } finally {
      setUploading(false);
    }
  }

  const trendingList = tab === 'trending';
  return (
    <div className="mp-page" role="dialog" aria-label="Choose sound">
      <header className="mp-top">
        <button type="button" className="mp-back" aria-label="Close sound picker" onClick={() => { stopPreview(); onClose(); }}>
          <Icon name="chevron-down" size={26} />
        </button>
        <label className="mp-search">
          <Icon name="search" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artists and sounds" aria-label="Search artists and sounds" />
        </label>
      </header>

      <nav className="mp-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'mp-tab on' : 'mp-tab'} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      <div className="mp-head">
        <h2>{trendingList ? 'Trending' : tab === 'saved' ? 'Saved' : 'Popular'}</h2>
        <button type="button" className="mp-create" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="plus" size={16} /> {uploading ? 'Adding…' : 'Create Sound'}
        </button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={createSound} />
      </div>

      <ul className="mp-list">
        {tab === 'saved' && <li className="mp-empty">Saved sounds will appear here.</li>}
        {tab !== 'saved' && items.length === 0 && <li className="mp-empty">No sounds found.</li>}
        {items.map((item) => {
          const attachable = item.source !== 'audius';
          const selected = selectedId === item.id;
          return (
            <li key={item.id} className={selected ? 'mp-row on' : 'mp-row'}>
              <button type="button" className="mp-art" aria-label={`Preview ${item.title}`} onClick={() => togglePreview(item)}>
                {item.artwork ? <img src={item.artwork} alt="" loading="lazy" /> : <span className="mp-art-empty"><Icon name="music" size={22} /></span>}
              </button>
              <button type="button" className="mp-info" disabled={!attachable} onClick={() => attachable && onSelect(item)} aria-label={attachable ? `Use ${item.title}` : `${item.title} (preview only)`}>
                <strong>{item.title}</strong>
                <span>{[item.artist, item.duration ? formatDuration(item.duration) : null].filter(Boolean).join(' · ')}</span>
              </button>
              <button type="button" className="mp-play" aria-label={playingId === item.id ? `Pause ${item.title}` : `Play ${item.title}`} onClick={() => togglePreview(item)}>
                <Icon name={playingId === item.id ? 'pause' : 'play'} size={18} />
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" className="mp-fab" aria-label="Create sound" disabled={uploading} onClick={() => fileRef.current?.click()}>
        <Icon name="music" size={26} />
      </button>
    </div>
  );
}
