// Trims a picked video to the first `maxSeconds` in the browser, so every upload is cut
// even before Cloudinary is configured. Videos already within the limit are returned unchanged.
export const POST_MAX_SECONDS = 20 * 60; // Instagram Reels allow up to 20 minutes
export const STORY_MAX_SECONDS = 15;

export async function trimVideo(file, maxSeconds) {
  if (!file || !String(file.type).startsWith('video/')) return file;
  const src = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  video.src = src;
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('This video could not be read'));
    });
    if (!Number.isFinite(video.duration) || video.duration <= maxSeconds) return file;
    if (typeof video.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      throw new Error(`This browser cannot trim videos. Choose a video under ${maxSeconds} seconds.`);
    }
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('This browser cannot trim videos.');
    video.muted = false;
    try { await video.play(); } catch { video.muted = true; await video.play(); }
    const recorder = new MediaRecorder(video.captureStream(), { mimeType });
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(250);
    await new Promise((resolve) => setTimeout(resolve, maxSeconds * 1000));
    video.pause();
    recorder.stop();
    await stopped;
    const type = mimeType.split(';')[0];
    return new File(chunks, `trimmed-${Date.now()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type });
  } finally {
    URL.revokeObjectURL(src);
  }
}
