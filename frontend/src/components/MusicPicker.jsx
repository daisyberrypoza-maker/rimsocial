import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import { useMusicStore } from '../lib/musicStore.js';
import { playMusicTrack, pauseMusic, unlockMusicAudio } from '../lib/musicPlayer.js';
import Icon from './Icon.jsx';
import { toast, logError } from '../toast.js';
import './MusicPicker.css';

const PAGE_SIZE = 30;
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
  const tab = useMusicStore((state) => state.tab);
  const query = useMusicStore((state) => state.query);
  const lists = useMusicStore((state) => state.lists);
  const scrollTop = useMusicStore((state) => state.scrollTop);
  const activeTrack = useMusicStore((state) => state.activeTrack);
  const playing = useMusicStore((state) => state.playing);
  const patchMusic = useMusicStore((state) => state.patchMusic);
  const key = `${tab}::${query.trim().toLowerCase()}`;
  const list = lists[key] || { items: [], nextOffset: 0, hasMore: true, loaded: false, source: 'local' };
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedItems, setSavedItems] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('rim.savedSounds') || '[]'); } catch { return []; }
  });
  const fileRef = useRef(null);
  const listRef = useRef(null);
  const streamCache = useRef(new Map());
  const streamRequests = useRef(new Map());
  const seedRef = useRef(Math.random().toString(36).slice(2, 10));

  async function fetchPage(activeTab, search, offset, fallback = false) {
    const q = String(search || '').trim();
    if (activeTab === 'saved') return { items: savedItems, nextOffset: 0, hasMore: false, source: 'saved' };
    if (activeTab === 'trending') {
      if (q) {
        const data = await api(`/v1/audio/audius/search?q=${encodeURIComponent(q)}&offset=${offset}&limit=${PAGE_SIZE}`);
        return { ...data, source: 'audius' };
      }
      if (!fallback) {
        const network = await api(`/v1/audio/network-trending?offset=${offset}&limit=${PAGE_SIZE}`);
        if ((network.items || []).length || offset > 0) return { ...network, source: 'network' };
      }
      const general = await api(`/v1/audio/audius/trending?offset=${offset}&limit=${PAGE_SIZE}`);
      return { ...general, source: 'audius' };
    }
    const params = new URLSearchParams({ q, offset: String(offset), limit: String(PAGE_SIZE), seed: seedRef.current });
    if (activeTab === 'original') params.set('original', '1');
    return { ...(await api(`/v1/audio/search?${params.toString()}`)), source: 'local' };
  }

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = scrollTop || 0;
  }, []);

  useEffect(() => {
    if (list.loaded) return undefined;
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await fetchPage(tab, query, 0);
        if (!active) return;
        const items = (data.items || []).map((item) => ({ ...item, source: item.source || data.source }));
        patchMusic({ lists: { ...useMusicStore.getState().lists, [key]: {
          items, nextOffset: data.nextOffset ?? items.length, hasMore: Boolean(data.hasMore),
          source: data.source, loaded: true,
        } } });
      } catch (error) {
        if (active) { logError(error); toast('Music could not be loaded'); }
      } finally { if (active) setLoading(false); }
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [key, list.loaded, patchMusic, query, tab]);

  async function loadMore() {
    const current = useMusicStore.getState().lists[key] || list;
    if (!current.hasMore || loadingMore || loading || tab === 'saved') return;
    setLoadingMore(true);
    try {
      const fallback = current.source === 'audius';
      const data = await fetchPage(tab, query, current.nextOffset || 0, fallback);
      const more = (data.items || []).map((item) => ({ ...item, source: item.source || data.source }));
      const seen = new Set((current.items || []).map((item) => String(item.id)));
      patchMusic({ lists: { ...useMusicStore.getState().lists, [key]: {
        ...current,
        items: [...(current.items || []), ...more.filter((item) => !seen.has(String(item.id)))],
        nextOffset: data.nextOffset ?? ((current.nextOffset || 0) + more.length),
        hasMore: Boolean(data.hasMore),
        source: data.source || current.source,
      } } });
    } catch (error) { logError(error); }
    finally { setLoadingMore(false); }
  }

  function cachedStreams(id) {
    const hit = streamCache.current.get(String(id));
    return hit && Date.now() - hit.at < STREAM_TTL_MS ? hit.urls : null;
  }

  async function togglePreview(item) {
    unlockMusicAudio();
    if (String(activeTrack?.id) === String(item.id) && playing) {
      pauseMusic();
      patchMusic({ playing: false });
      return;
    }
    try {
      let urls;
      if (item.source === 'audius') {
        urls = cachedStreams(item.id);
        if (!urls) {
          let request = streamRequests.current.get(String(item.id));
          if (!request) {
            request = api(`/v1/audio/audius/${encodeURIComponent(item.id)}/stream`)
              .then((data) => data.urls?.length ? data.urls : (data.url ? [data.url] : []))
              .finally(() => streamRequests.current.delete(String(item.id)));
            streamRequests.current.set(String(item.id), request);
          }
          urls = await request;
          streamCache.current.set(String(item.id), { urls, at: Date.now() });
        }
      } else {
        urls = [mediaUrl(item.mediaUrl)];
      }
      await playMusicTrack(urls, {
        onEnded: () => patchMusic({ playing: false }),
        onPlayingChange: (isPlaying) => patchMusic({ playing: isPlaying }),
      });
      patchMusic({ activeTrack: item, playing: true });
    } catch (error) {
      logError(error);
      patchMusic({ playing: false });
      toast('This sound could not be played');
    }
  }

  function toggleSave(item) {
    setSavedItems((current) => {
      const exists = current.some((entry) => String(entry.id) === String(item.id));
      const updated = exists ? current.filter((entry) => String(entry.id) !== String(item.id)) : [item, ...current];
      try { window.localStorage.setItem('rim.savedSounds', JSON.stringify(updated)); } catch {}
      if (tab === 'saved') patchMusic({ lists: { ...useMusicStore.getState().lists, [key]: { items: updated, loaded: true, source: 'saved', hasMore: false, nextOffset: 0 } } });
      return updated;
    });
  }

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
      const targetKey = 'featured::';
      const existing = useMusicStore.getState().lists[targetKey] || { items: [] };
      patchMusic({ tab: 'featured', query: '', lists: { ...useMusicStore.getState().lists, [targetKey]: { ...existing, items: [track, ...(existing.items || [])], loaded: true } } });
      onSelect(track);
    } catch (error) {
      logError(error);
      toast(error?.message || 'Could not add this sound');
    } finally { setUploading(false); }
  }

  function choose(item) {
    onSelect(item);
  }

  const visibleItems = tab === 'saved' ? savedItems : list.items;
  return (
    <div className="mp-page" role="dialog" aria-label="Add to story">
      <header className="mp-top">
        <button type="button" className="mp-icon" aria-label="Close sound picker" onClick={onClose}><Icon name="x" size={28} /></button>
        <h1 className="mp-title">Add to story</h1>
        <button type="button" className="mp-icon" aria-label="Camera settings" onClick={onSettings}><Icon name="settings" size={26} /></button>
      </header>
      <section className="mp-panel">
        <div className="mp-handle" aria-hidden="true"><span /></div>
        <label className="mp-search">
          <Icon name="search" size={19} />
          <input value={query} onChange={(event) => patchMusic({ query: event.target.value })} placeholder="Search..." aria-label="Search sounds and artists" />
        </label>
        <nav className="mp-chips" role="tablist" aria-label="Sound sources">
          {CHIPS.map(([name, label]) => <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'mp-chip on' : 'mp-chip'} onClick={() => patchMusic({ tab: name, query: '' })}>{label}</button>)}
        </nav>
        <ul ref={listRef} className="mp-list" onScroll={(event) => {
          const el = event.currentTarget;
          patchMusic({ scrollTop: el.scrollTop });
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) loadMore();
        }}>
          {loading && visibleItems.length === 0 && <li className="mp-empty">Loading sounds…</li>}
          {!loading && visibleItems.length === 0 && <li className="mp-empty">No sounds found.</li>}
          {visibleItems.map((item) => {
            const selected = String(selectedId) === String(item.id);
            const saved = savedItems.some((entry) => String(entry.id) === String(item.id));
            const isPlaying = String(activeTrack?.id) === String(item.id) && playing;
            return (
              <li key={item.id} className={selected ? 'mp-row on' : 'mp-row'}>
                <button type="button" className="mp-row-main" onClick={() => togglePreview(item)} aria-label={isPlaying ? `Pause ${item.title}` : `Play ${item.title}`}>
                  <span className="mp-art">
                    {item.artwork ? <img src={item.artwork} alt="" loading="lazy" /> : <span className="mp-art-empty"><Icon name="music" size={22} /></span>}
                    {isPlaying && <span className="mp-art-badge" aria-hidden="true"><Icon name="pause" size={16} /></span>}
                  </span>
                  <span className="mp-info"><span className="mp-name"><strong>{item.title}</strong>{item.royaltyFree && <span className="mp-rf">RF</span>}</span><span className="mp-meta">{[item.artist, item.duration ? formatDuration(item.duration) : null].filter(Boolean).join(' · ')}</span></span>
                </button>
                <button type="button" className={saved ? 'mp-save on' : 'mp-save'} onClick={() => toggleSave(item)} aria-pressed={saved} aria-label={saved ? `Remove ${item.title} from saved` : `Save ${item.title}`}><Icon name={saved ? 'bookmark-check' : 'bookmark'} size={26} /></button>
                <button type="button" className={selected ? 'mp-use on' : 'mp-use'} onClick={() => choose(item)} aria-pressed={selected}>{selected ? 'Selected' : 'Use'}</button>
              </li>
            );
          })}
          {loadingMore && <li className="mp-empty">Loading more…</li>}
        </ul>
        <footer className="mp-bottom">
          <button type="button" className="mp-shuffle" aria-label="Shuffle sounds" disabled={visibleItems.length < 2} onClick={() => patchMusic({ lists: { ...useMusicStore.getState().lists, [key]: { ...list, items: shuffled(visibleItems) } } })}><Icon name="shuffle" size={20} /> Shuffle</button>
          <button type="button" className="mp-create" disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="plus" size={16} /> {uploading ? 'Adding…' : 'Create Sound'}</button>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={createSound} />
        </footer>
      </section>
    </div>
  );
}
