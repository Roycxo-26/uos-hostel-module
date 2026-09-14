// A camera photo straight off a phone is typically 2-8MB — far too big to
// queue in IndexedDB and sync over a weak signal, and the backend's own
// photo field (backend/src/app/*/validators.ts's photoDataUrlSchema) caps
// at 500KB specifically because of this. Resizing + re-encoding client-side
// before it ever gets queued keeps a captured photo small enough to sync
// reliably even on a slow connection, and keeps IndexedDB from filling up
// with several multi-megabyte pending photos.
export async function compressImageToDataUrl(file: File, maxDimension = 1280, quality = 0.6): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D canvas context to compress this photo');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', quality);
}
