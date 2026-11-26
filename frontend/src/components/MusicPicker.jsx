import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Icon from './Icon.jsx';
import { toast, logError } from '../toast.js';
import './MusicPicker.css';

// "Add to story" music screen, full screen, matching the reference: close on the left, the title in the
// middle, settings on the right, a search field, chips (For you, Trending, Saved), and one row per sound.
// Tapping a row previews it; the bookmark button chooses it for the story. Sources: the app library
// (For you) and the Audius catalogue (Trending). Audius sounds are checked and streamed by the server.
// Audius stream links are signed and expire; never reuse one older than this.
const STREAM_TTL_MS = 3 * 60 * 1000;
const CHIPS = [['featured', 'For you'], ['trending', 'Trending'], ['saved', 'Saved'], ['original', 'Original audio']];

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function MusicPicker({ selectedId, onSelect, onClose, onSettings }) {
  const [chip, setChip] = useState('featured');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // One seed per open of the picker: the For You order is shuffled with it and stays stable while paging
  const seedRef = useRef(Math.random().toString(36).slice(2, 10));
  const [playingId, setPlayingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [savedItems, setSavedItems] = useState(() => { try { return JSON.parse(window.localStorage.getItem('rim.savedSounds') || '[]'); } catch { return []; } });
  const audioRef = useRef(null);
  const fileRef = useRef(null);
  const streamUrlsRef = useRef(new Map());
  const streamRequestsRef = useRef(new Map());

  function cachedStreamUrl(id) {
    const hit = streamUrlsRef.current.get(id);
    return hit && Date.now() - hit.at < STREAM_TTL_MS ? hit.url : null;
  }

  // Stop playback when leaving the screen
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // Library search URL for a page of For You / Original (paged, shuffled by seed)
  function searchPath(q, activeChip, offset) {
    return `/v1/audio/search?q=${encodeURIComponent(q)}${activeChip === 'original' ? '&original=1' : ''}&offset=${offset}&limit=30&seed=${seedRef.current}`;
  }

  // Load the next page when the list is scrolled near its end
  async function loadMore() {
    if (!hasMore || loadingMore || chip === 'trending' || chip === 'saved') return;
    setLoadingMore(true);
    try {
      const data = await api(searchPath(query.trim(), chip, nextOffset));
      const more = (data.items || []).map((item) => ({ ...item, source: 'local' }));
      setItems((list) => {
        const seen = new Set(list.map((item) => String(item.id)));
        return [...list, ...more.filter((item) => !seen.has(String(item.id)))];
      });
      setHasMore(Boolean(data.hasMore));
      setNextOffset(data.nextOffset || nextOffset + more.length);
    } catch (error) {
      logError(error);
    } finally {
      setLoadingMore(false);
    }
  }

  // Load the list for the active chip; the search text changes the list after a short pause
  useEffect(() => {
    if (chip === 'saved') { setItems(savedItems); return undefined; }
    let active = true;
    const q = query.trim();
    // Trending: sounds the people you follow use most (stories and posts). Searching it uses Audius.
    const path = chip === 'trending'
      ? (q ? `/v1/audio/audius/search?q=${encodeURIComponent(q)}&limit=30` : '/v1/audio/network-trending')
      : searchPath(q, chip, 0);
    const timer = setTimeout(() => {
      api(path)
        .then((data) => {
          if (!active) return;
          const nextItems = (data.items || []).map((item) => ({ ...item, source: item.source || (chip === 'trending' ? 'audius' : 'local') }));
          setItems(nextItems);
          setHasMore(Boolean(data.hasMore));
          setNextOffset(data.nextOffset || nextItems.length);
          // Warm the first visible Audius rows before a user taps Play. Signed URLs are short-lived,
          // so they stay in memory only and are refreshed when a track is played if necessary.
          nextItems.filter((item) => item.source === 'audius').slice(0, 8).forEach((item) => {
            if (cachedStreamUrl(item.id) || streamRequestsRef.current.has(item.id)) return;
            const request = api(`/v1/audio/audius/${encodeURIComponent(item.id)}/stream`)
              .then((result) => { if (result.url) streamUrlsRef.current.set(item.id, { url: result.url, at: Date.now() }); return result.url; })
              .catch(() => null)
              .finally(() => streamRequestsRef.current.delete(item.id));
            streamRequestsRef.current.set(item.id, request);
          });
        })
        .catch((error) => { if (active) { setItems([]); logError(error); } });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [chip, query]);

  function stopPreview() {
    audioRef.current?.pause();
    setPlayingId(null);
  }

  // Preview one row, or pause it. Audius rows ask the server for a fresh link first.
  async function togglePreview(item) {
    if (playingId === item.id) { stopPreview(); return; }
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      audio.pause();
      const src = item.source === 'audius'
        ? (cachedStreamUrl(item.id) || await streamRequestsRef.current.get(item.id) || (await api(`/v1/audio/audius/${encodeURIComponent(item.id)}/stream`)).url)
        : mediaUrl(item.mediaUrl);
      if (!src) throw new Error('No playable audio URL was returned');
      if (item.source === 'audius') streamUrlsRef.current.set(item.id, { url: src, at: Date.now() });
      audio.preload = 'auto';
      audio.src = src;
      audio.load();
      audio.onended = () => setPlayingId(null);
      await audio.play();
      setPlayingId(item.id);
    } catch (error) {
      logError(error);
      setPlayingId(null);
      toast('This sound could not be played');
    }
  }

  // Upload an audio file as a new sound, then choose it for the story
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
      setChip('featured');
      setItems((list) => [track, ...list]);
      onSelect(track);
    } catch (error) {
      logError(error);
      toast(error?.message || 'Could not add this sound. Use an MP3, M4A, AAC, WAV or OGG file');
    } finally {
      setUploading(false);
    }
  }

  // Bookmark: save or unsave the sound for the Saved tab only. It does not change the story's sound.
  function toggleSave(item) {
    setSavedItems((current) => {
      const exists = current.some((entry) => String(entry.id) === String(item.id));
      const updated = exists ? current.filter((entry) => String(entry.id) !== String(item.id)) : [item, ...current];
      try { window.localStorage.setItem('rim.savedSounds', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  // Use: choose this sound for the story (separate from saving)
  function choose(item) {
    stopPreview();
    // No stored link: the story player fetches a fresh one when it plays
    onSelect(item);
  }

  return (
    <div className="mp-page" role="dialog" aria-label="Add to story">
      <header className="mp-top">
        <button type="button" className="mp-icon" aria-label="Close sound picker" onClick={() => { stopPreview(); onClose(); }}>
          <Icon name="x" size={28} />
        </button>
        <h1 className="mp-title">Add to story</h1>
        <button type="button" className="mp-icon" aria-label="Camera settings" onClick={onSettings}>
          <Icon name="settings" size={26} />
        </button>
      </header>

      <section className="mp-panel">
      <div className="mp-handle" aria-hidden="true"><span /></div>
      <label className="mp-search">
        <Icon name="search" size={19} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." aria-label="Search sounds and artists" />
      </label>

      <nav className="mp-chips" role="tablist" aria-label="Sound sources">
        {CHIPS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={chip === key} className={chip === key ? 'mp-chip on' : 'mp-chip'} onClick={() => setChip(key)}>{label}</button>
        ))}
      </nav>

      <ul className="mp-list" onScroll={(event) => {
        const el = event.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) loadMore();
      }}>
        {chip === 'saved' && items.length === 0 && <li className="mp-empty">No saved sounds yet.</li>}
        {chip !== 'saved' && items.length === 0 && <li className="mp-empty">No sounds found.</li>}
        {items.map((item) => {
          const selected = selectedId === item.id;
          const saved = savedItems.some((entry) => String(entry.id) === String(item.id));
          const playing = playingId === item.id;
          return (
            <li key={item.id} className={selected ? 'mp-row on' : 'mp-row'}>
              <button type="button" className="mp-row-main" onClick={() => togglePreview(item)} aria-label={playing ? `Pause ${item.title}` : `Play ${item.title}`}>
                <span className="mp-art">
                  {item.artwork ? <img src={item.artwork} alt="" loading="lazy" /> : <span className="mp-art-empty"><Icon name="music" size={22} /></span>}
                  {playing && <span className="mp-art-badge" aria-hidden="true"><Icon name="pause" size={16} /></span>}
                </span>
                <span className="mp-info">
                  <span className="mp-name"><strong>{item.title}</strong>{item.royaltyFree && <span className="mp-rf">RF</span>}</span>
                  <span className="mp-meta">{[item.artist, item.duration ? formatDuration(item.duration) : null].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
              <button type="button" className={saved ? 'mp-save on' : 'mp-save'} onClick={() => toggleSave(item)} aria-pressed={saved} aria-label={saved ? `Remove ${item.title} from saved` : `Save ${item.title}`}>
                <Icon name={saved ? 'bookmark-check' : 'bookmark'} size={26} />
              </button>
              <button type="button" className={selected ? 'mp-use on' : 'mp-use'} onClick={() => choose(item)} aria-pressed={selected} aria-label={selected ? `${item.title} is your story sound` : `Use ${item.title} for your story`}>
                {selected ? 'Selected' : 'Use'}
              </button>
            </li>
          );
        })}
        {loadingMore && <li className="mp-empty">Loading more…</li>}
      </ul>

      <footer className="mp-bottom">
        <button type="button" className="mp-shuffle" aria-label="Shuffle sounds" disabled={items.length < 2} onClick={() => setItems((list) => shuffled(list))}>
          <Icon name="shuffle" size={20} /> Shuffle
        </button>
        <button type="button" className="mp-create" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="plus" size={16} /> {uploading ? 'Adding…' : 'Create Sound'}
        </button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={createSound} />
      </footer>
      </section>
    </div>
  );
}
