import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Remembers each page's scroll position while the app runs. Going Back (or forward) returns to the same
// place; a normal forward navigation starts at the top. Stored in sessionStorage, so it survives a reload.
const KEY = 'rim.scrollByLocation.v1';

function readMap() {
  try { return JSON.parse(window.sessionStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

function saveY(locationKey, y) {
  try {
    const map = readMap();
    map[locationKey] = y;
    window.sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage blocked: scroll is simply not remembered
  }
}

export default function ScrollMemory() {
  const location = useLocation();
  const navigationType = useNavigationType();

  // Restore (Back or forward) or start at the top (a new page)
  useEffect(() => {
    if (navigationType === 'POP') {
      const y = readMap()[location.key];
      if (typeof y === 'number') requestAnimationFrame(() => window.scrollTo(0, y));
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.key, navigationType]);

  // Remember where this page was left
  useEffect(() => {
    const key = location.key;
    return () => saveY(key, window.scrollY);
  }, [location.key]);

  return null;
}
