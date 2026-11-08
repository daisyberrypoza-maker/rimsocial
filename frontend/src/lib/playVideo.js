// Starts a video only once enough of it has loaded for picture and sound to begin together.
// Any pause cancels a start that is still waiting, so an old video cannot start later by itself.
if (typeof HTMLMediaElement !== 'undefined') {
  const nativePause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function pauseAndCancelStart() {
    if (this.dataset) this.dataset.want = '0';
    return nativePause.call(this);
  };
}

export function startWhenReady(video) {
  if (!video) return Promise.resolve();
  video.dataset.want = '1';
  // HAVE_FUTURE_DATA (3) means the picture can play on without stalling
  if (video.readyState >= 3) return video.play();
  video.preload = 'auto';
  return new Promise((resolve, reject) => {
    const ready = () => {
      video.removeEventListener('canplay', ready);
      if (video.dataset.want !== '1') { resolve(); return; }
      video.play().then(resolve, reject);
    };
    video.addEventListener('canplay', ready);
  });
}
