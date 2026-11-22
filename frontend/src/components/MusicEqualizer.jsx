import { useEffect, useRef } from 'react';

// Equalizer bars that follow the loudness of a story's music or voice note.
// The playing <audio> element is never rerouted: a separate copy of the file is decoded to measure
// loudness every 50 ms, and the bars follow the playback position. If the copy cannot load, the bars stay low.
const BARS = 5;
const BUCKET_SEC = 0.05;
const WEIGHTS = [0.6, 0.9, 1, 0.8, 0.55];
const IDLE = 0.15;
const envelopes = new Map(); // url -> Promise<{ envelope, duration }>

function loadEnvelope(url) {
  if (!envelopes.has(url)) {
    envelopes.set(url, (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('audio unavailable');
      const bytes = await res.arrayBuffer();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      try {
        const buffer = await ctx.decodeAudioData(bytes);
        const data = buffer.getChannelData(0);
        const step = Math.max(1, Math.floor(buffer.sampleRate * BUCKET_SEC));
        const envelope = new Float32Array(Math.ceil(data.length / step));
        let max = 0;
        for (let i = 0; i < envelope.length; i += 1) {
          const start = i * step;
          const end = Math.min(data.length, start + step);
          let sum = 0;
          for (let j = start; j < end; j += 1) sum += data[j] * data[j];
          envelope[i] = Math.sqrt(sum / Math.max(1, end - start));
          if (envelope[i] > max) max = envelope[i];
        }
        if (max > 0) for (let i = 0; i < envelope.length; i += 1) envelope[i] /= max;
        return { envelope, duration: buffer.duration };
      } finally {
        ctx.close().catch(() => {});
      }
    })());
  }
  return envelopes.get(url);
}

export default function MusicEqualizer({ audioRef, src }) {
  const barRefs = useRef([]);

  useEffect(() => {
    let alive = true;
    let frame = 0;
    let loaded = null;
    const levels = new Array(BARS).fill(IDLE);
    loadEnvelope(src).then((data) => { if (alive) loaded = data; }).catch(() => {});

    const tick = () => {
      const audio = audioRef.current;
      let level = 0;
      if (loaded && audio && !audio.paused && loaded.duration > 0) {
        const t = audio.currentTime % loaded.duration;
        const index = Math.min(loaded.envelope.length - 1, Math.floor(t / BUCKET_SEC));
        level = loaded.envelope[index] || 0;
      }
      for (let i = 0; i < BARS; i += 1) {
        const target = IDLE + level * WEIGHTS[i] * (0.85 - IDLE);
        levels[i] = levels[i] + (target - levels[i]) * 0.35;
        const bar = barRefs.current[i];
        if (bar) bar.style.transform = `scaleY(${levels[i].toFixed(3)})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [audioRef, src]);

  return (
    <div className="sv-eq" aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => <span key={i} ref={(el) => { barRefs.current[i] = el; }} />)}
    </div>
  );
}
