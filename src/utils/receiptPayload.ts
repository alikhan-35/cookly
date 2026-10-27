export const MAX_RECEIPT_IMAGE_BYTES = 2_000_000;
export const MAX_RECEIPT_REQUEST_BYTES = Math.ceil(MAX_RECEIPT_IMAGE_BYTES / 3) * 4 + 1024;
export type ReceiptImage = { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };

export class ReceiptImageError extends Error { name = 'ReceiptImageError'; }

/** Validate independently on the client and Worker, before spending the shared quota. */
export function validateReceiptImage(value: unknown): ReceiptImage {
  const invalid = () => new ReceiptImageError('Не удалось прочитать фото. Выберите изображение JPG, PNG или WebP.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const image = value as Record<string, unknown>;
  if (Object.keys(image).length !== 2 || !['image/jpeg', 'image/png', 'image/webp'].includes(String(image.mimeType))
    || typeof image.data !== 'string' || !image.data.length) throw invalid();
  if (image.data.length > Math.ceil(MAX_RECEIPT_IMAGE_BYTES / 3) * 4) throw new ReceiptImageError('Фото слишком большое. Снимите чек ближе или разделите его на части.');
  if (image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(image.data)) throw invalid();
  let bytes: string;
  try { bytes = atob(image.data); } catch { throw invalid(); }
  if (bytes.length < 24 || bytes.length > MAX_RECEIPT_IMAGE_BYTES || btoa(bytes) !== image.data) throw invalid();
  const prefix = [...bytes.slice(0, 12)].map(byte => byte.charCodeAt(0));
  const matches = image.mimeType === 'image/jpeg' ? prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255
    : image.mimeType === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => prefix[index] === byte)
      : bytes.slice(0, 4) === 'RIFF' && bytes.slice(8, 12) === 'WEBP';
  if (!matches) throw invalid();
  return { mimeType: image.mimeType as ReceiptImage['mimeType'], data: image.data };
}
