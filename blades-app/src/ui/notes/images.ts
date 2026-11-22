/** Shrinks an image file to at most `max` px on the long side as a WebP (JPEG fallback) data URL. */
export function shrinkImage(file: File, max = 1600): Promise<{ src: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), w = Math.round(im.width * k), h = Math.round(im.height * k);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d')!.drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let src = cv.toDataURL('image/webp', 0.8);
      if (!src.startsWith('data:image/webp')) src = cv.toDataURL('image/jpeg', 0.82);
      resolve({ src, w, h });
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    im.src = url;
  });
}

/** Image files out of a paste / drop / file input, in order. */
export const imageFiles = (list: Iterable<File> | undefined | null) => [...(list ?? [])].filter((f) => /^image\//.test(f.type));
