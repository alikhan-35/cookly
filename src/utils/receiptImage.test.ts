import { describe, expect, it } from 'vitest';
import { MAX_RECEIPT_UPLOAD_BYTES, prepareReceiptImage, receiptImageDimensions, receiptOutputSize } from './receiptImage';

describe('receipt image preparation limits', () => {
  it('rejects unsupported or malformed bytes before attempting browser decoding', () => {
    for (const bytes of [new Uint8Array(), new TextEncoder().encode('%PDF-1.7'), new TextEncoder().encode('<svg></svg>'), new Uint8Array([255, 216, 255, 192, 0, 1])]) {
      expect(() => receiptImageDimensions(bytes)).toThrow(/JPG, PNG или WebP/);
    }
  });
  it('reads encoded PNG and progressive JPEG dimensions without decoding pixels', () => {
    const png = new Uint8Array(24); png.set([137, 80, 78, 71, 13, 10, 26, 10], 0); png.set([73, 72, 68, 82], 12);
    const view = new DataView(png.buffer); view.setUint32(16, 1200); view.setUint32(20, 4600);
    expect(receiptImageDimensions(png)).toEqual({ width: 1200, height: 4600, mimeType: 'image/png' });
    expect(receiptImageDimensions(new Uint8Array([255, 216, 255, 194, 0, 11, 8, 1, 144, 2, 88, 1, 1, 17, 0]))).toEqual({ width: 600, height: 400, mimeType: 'image/jpeg' });
  });
  it('reads WebP extended dimensions', () => {
    const bytes = new Uint8Array(30); bytes.set(new TextEncoder().encode('RIFF'), 0); bytes.set(new TextEncoder().encode('WEBPVP8X'), 8); bytes.set([31, 3, 0], 24); bytes.set([175, 4, 0], 27);
    expect(receiptImageDimensions(bytes)).toEqual({ width: 800, height: 1200, mimeType: 'image/webp' });
  });
  it.each([[0, 2], [-1, 3], [2, Infinity], [30_000, 1], [10_000, 10_000]])('rejects unsafe encoded dimensions %s × %s', (width, height) => {
    expect(() => receiptOutputSize(width, height)).toThrow(/разрешение/);
  });
  it('preserves aspect ratio and never upsizes readable small receipts', () => {
    expect(receiptOutputSize(600, 1800)).toEqual({ width: 600, height: 1800 });
    expect(receiptOutputSize(1500, 6000)).toEqual({ width: 800, height: 3200 });
    const large = receiptOutputSize(6000, 4000);
    expect(large.width * large.height).toBeLessThanOrEqual(5_000_000);
    expect(large.width / large.height).toBeCloseTo(1.5, 2);
  });
  it('rejects oversized uploads and cancelled work before reading the file or using canvas', async () => {
    await expect(prepareReceiptImage({ size: MAX_RECEIPT_UPLOAD_BYTES + 1 } as File)).rejects.toThrow(/15 МБ/);
    const controller = new AbortController(); controller.abort();
    await expect(prepareReceiptImage({ size: 1 } as File, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
