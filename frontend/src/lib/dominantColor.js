// Average colour of a photo, as #rrggbb, from an 8 x 8 copy. Null if the file is not a readable image.
export async function dominantColorOf(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, 8, 8);
    bitmap.close?.();
    const { data } = canvas.getContext('2d').getImageData(0, 0, 8, 8);
    let r = 0; let g = 0; let b = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    const n = data.length / 4;
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}
