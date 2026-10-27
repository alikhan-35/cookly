import { MAX_RECEIPT_IMAGE_BYTES, ReceiptImageError, type ReceiptImage } from './receiptPayload';
export { MAX_RECEIPT_IMAGE_BYTES, ReceiptImageError } from './receiptPayload';
export type { ReceiptImage } from './receiptPayload';
export const MAX_RECEIPT_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 60_000_000;
const MAX_SIDE = 3200;
const MAX_PIXELS = 5_000_000;

const cancelled = () => new DOMException('Cancelled', 'AbortError');
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw cancelled(); }

/** Inspect encoded dimensions before asking the browser to allocate decoded pixels. */
export function receiptImageDimensions(bytes: Uint8Array): { width: number; height: number; mimeType: ReceiptImage['mimeType'] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 137 && String.fromCharCode(...bytes.slice(1, 4)) === 'PNG'
    && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10
    && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR') {
    return { width: view.getUint32(16), height: view.getUint32(20), mimeType: 'image/png' };
  }
  if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3), mimeType: 'image/jpeg' };
      }
      offset += length;
    }
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const format = String.fromCharCode(...bytes.slice(12, 16));
    if (format === 'VP8X') return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16), mimeType: 'image/webp' };
    if (format === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, mimeType: 'image/webp' };
    if (format === 'VP8L' && bytes[20] === 47) return { width: 1 + bytes[21] + ((bytes[22] & 63) << 8), height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10), mimeType: 'image/webp' };
  }
  throw new ReceiptImageError('Не удалось прочитать фото. Выберите JPG, PNG или WebP. HEIC и PDF пока не поддерживаются.');
}

export function receiptOutputSize(width: number, height: number): { width: number; height: number } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > 20_000 || height > 20_000 || width * height > MAX_INPUT_PIXELS) throw new ReceiptImageError('У фото слишком большое разрешение. Сохраните уменьшенную копию или снимите чек частями.');
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

async function decode(file: File, signal?: AbortSignal): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (signal?.aborted) { bitmap.close(); throw cancelled(); }
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const abort = () => { image.src = ''; reject(cancelled()); };
      signal?.addEventListener('abort', abort, { once: true });
      image.onload = () => { signal?.removeEventListener('abort', abort); resolve(); };
      image.onerror = () => { signal?.removeEventListener('abort', abort); reject(new ReceiptImageError('Фото повреждено или не поддерживается браузером. Выберите другое фото JPG или PNG.')); };
      image.src = url;
      if (signal?.aborted) abort();
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; } };
  } finally { URL.revokeObjectURL(url); }
}

/** Re-encoding strips EXIF/location metadata; the original File is never uploaded. */
export async function prepareReceiptImage(file: File, signal?: AbortSignal, quarterTurns = 0): Promise<ReceiptImage> {
  checkAbort(signal);
  if (!file.size || file.size > MAX_RECEIPT_UPLOAD_BYTES) throw new ReceiptImageError('Выберите фото размером до 15 МБ. Длинный чек можно снять частями.');
  const header = new Uint8Array(await file.slice(0, 262_144).arrayBuffer());
  checkAbort(signal);
  const encoded = receiptImageDimensions(header);
  receiptOutputSize(encoded.width, encoded.height);
  let decoded: Awaited<ReturnType<typeof decode>>;
  try { decoded = await decode(file, signal); }
  catch (error) { if (signal?.aborted || error instanceof ReceiptImageError) throw error; throw new ReceiptImageError('Не удалось открыть фото. Попробуйте другое фото JPG или PNG.'); }
  try {
    checkAbort(signal);
    const size = receiptOutputSize(decoded.width, decoded.height);
    const turns = ((quarterTurns % 4) + 4) % 4;
    const canvas = document.createElement('canvas');
    canvas.width = turns % 2 ? size.height : size.width;
    canvas.height = turns % 2 ? size.width : size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new ReceiptImageError('Браузер не смог подготовить фото. Можно перечислить продукты текстом.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2); context.rotate(turns * Math.PI / 2);
    context.drawImage(decoded.source, -size.width / 2, -size.height / 2, size.width, size.height);
    for (const quality of [0.88, 0.8, 0.7, 0.6]) {
      checkAbort(signal);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      checkAbort(signal);
      if (!blob || blob.type !== 'image/jpeg') throw new ReceiptImageError('Браузер не смог сохранить фото. Попробуйте другое изображение.');
      if (blob.size <= MAX_RECEIPT_IMAGE_BYTES) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        checkAbort(signal);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        return { mimeType: 'image/jpeg', data: btoa(binary) };
      }
    }
    throw new ReceiptImageError('Фото слишком большое для распознавания. Обрежьте фон или снимите чек несколькими частями.');
  } finally { decoded.close(); }
}
