// Adds the chosen story music to a form: app-library sounds by musicId, Audius sounds by audiusTrackId.
export function appendStoryMusic(form, track) {
  if (!track || !track.id) return;
  if (track.source === 'audius') form.append('audiusTrackId', track.id);
  else form.append('musicId', track.id);
}
