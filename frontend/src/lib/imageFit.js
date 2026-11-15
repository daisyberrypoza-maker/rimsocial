// Image pipeline from the blueprint: fit the photo inside 1080 x 1920 and re-encode as JPEG at a set quality
// (0.82 for chat photos, 0.90 for posts and stories). GIFs, videos and anything that fails pass through unchanged.
const MAX_WIDTH = 1080;
const MAX_HEIGHT = 1920;

export async function fitImage(file, quality = 0.9) {
  if (!file || !String(file.type).startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
