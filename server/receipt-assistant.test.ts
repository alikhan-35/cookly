import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAssistantRequest, type AssistantEnvironment } from './fridge-assistant';

const origin = 'https://alikhan-35.github.io';
// A real one-pixel PNG; no user receipt, identifiers, prices or other private data.
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/aXioAAAAASUVORK5CYII=';
const receipt = { mimeType: 'image/png', data: png };
const request = (body: unknown = { receipt }, headers = {}, signal?: AbortSignal, path = '/api/fridge/receipt') => new Request(`https://assistant.example${path}`, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal,
});
function environment(allow = true) {
  const first = vi.fn(async () => allow ? { requests: 1 } : null);
  const prepare = vi.fn(() => ({ bind() { return this; }, async first<T>() { return await first() as T | null; } }));
  const env: AssistantEnvironment = { GEMINI_API_KEY: 'test-receipt-server-key', DB: { prepare } };
  return { env, prepare, first };
}
const product = { name: 'Молоко 2,5%', amount: '1', unit: 'л', category: 'Молочные', note: '' };
const geminiOutput = (value: unknown = { products: [product], warnings: [] }) => ({
  candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }],
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('receipt photo extraction gateway', () => {
  it.each([
    ['missing receipt', {}],
    ['text on the receipt route', { text: 'Молоко 1 л' }],
    ['mixed text and receipt', { text: 'Молоко 1 л', receipt }],
    ['additional root option', { receipt, model: 'other-model' }],
    ['null image', { receipt: null }],
    ['array image', { receipt: [receipt] }],
    ['missing image data', { receipt: { mimeType: 'image/png' } }],
    ['additional filename', { receipt: { ...receipt, filename: 'receipt.png' } }],
    ['unsupported SVG', { receipt: { ...receipt, mimeType: 'image/svg+xml' } }],
    ['unsupported PDF', { receipt: { ...receipt, mimeType: 'application/pdf' } }],
    ['unsupported GIF', { receipt: { ...receipt, mimeType: 'image/gif' } }],
    ['MIME and signature mismatch', { receipt: { ...receipt, mimeType: 'image/jpeg' } }],
    ['empty base64', { receipt: { ...receipt, data: '' } }],
    ['data URL', { receipt: { ...receipt, data: `data:image/png;base64,${png}` } }],
    ['remote URL', { receipt: { ...receipt, data: 'https://unrelated.example/image.png' } }],
    ['local file URL', { receipt: { ...receipt, data: 'file:///receipt.png' } }],
    ['invalid base64 characters', { receipt: { ...receipt, data: `!${png.slice(1)}` } }],
    ['base64 whitespace', { receipt: { ...receipt, data: `${png}\n` } }],
    ['non-image binary', { receipt: { ...receipt, data: btoa('not an image'.padEnd(24, '0')) } }],
    ['truncated image header', { receipt: { ...receipt, data: btoa('\x89PNG\r\n\x1a\n' + '\0'.repeat(15)) } }],
  ])('rejects %s before spending counters or calling Gemini', async (_label, body) => {
    const { env, prepare } = environment();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await handleAssistantRequest(request(body), env)).status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a valid-base64 image larger than two million decoded bytes before spending counters', async () => {
    const { env, prepare } = environment();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const oversized = btoa('\x89PNG\r\n\x1a\n' + '\0'.repeat(2_000_001 - 8));
    const response = await handleAssistantRequest(request({ receipt: { ...receipt, data: oversized } }), env);
    expect([400, 413]).toContain(response.status);
    expect(prepare).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the text endpoint strict and does not accept a photo on it', async () => {
    const { env, prepare } = environment();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await handleAssistantRequest(request({ receipt }, {}, undefined, '/api/fridge/parse'), env)).status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts the two-million-byte boundary without overflowing base64 validation', async () => {
    const binary = atob(png);
    const data = btoa(binary + '\0'.repeat(2_000_000 - binary.length));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput())));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request({ receipt: { ...receipt, data } }), environment().env);
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.parse(fetcher.mock.calls[0][1].body).contents[0].parts[1].inlineData).toEqual({ ...receipt, data });
  });

  it('forwards one inline image with receipt instructions and returns only validated product data', async () => {
    const { env, prepare } = environment();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput())));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request(), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    const content = await response.text();
    expect(content).not.toContain('test-receipt-server-key');
    expect(content).not.toContain(png);
    expect(JSON.parse(content)).toMatchObject({ engine: 'ai', products: [{ name: 'Молоко 2,5%', amount: 1, unit: 'л', selected: true }] });
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('test-receipt-server-key');
    expect(init.redirect).toBe('manual');
    expect(Object.hasOwn(init, 'credentials')).toBe(false);
    const body = JSON.parse(init.body);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[0].text).toMatch(/чек/iu);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: receipt });
    expect(body.systemInstruction.parts[0].text).toMatch(/цен|стоим|сумм/iu);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.tools).toBeUndefined();
    expect(init.body).not.toContain('test-receipt-server-key');
  });

  it('keeps ambiguous receipt quantities empty and unchecked for human review', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput({
      products: [{ ...product, amount: '', unit: '', note: 'Количество на чеке неразборчиво; проверьте упаковку.' }], warnings: [],
    }))));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request(), environment().env);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.products[0]).toMatchObject({ name: 'Молоко 2,5%', unit: '', selected: false });
    expect(result.products[0].amount).toBeUndefined();
    expect(result.products[0].note).toContain('Количество');
  });

  it.each([
    { amount: '', unit: '' },
    { amount: '2', unit: '' },
  ])('requires human review of unknown quantity or unit even if the model omitted its note: %j', async quantity => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput({
      products: [{ ...product, ...quantity, note: '' }], warnings: [],
    })))));
    const response = await handleAssistantRequest(request(), environment().env);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.products[0].selected).toBe(false);
    expect(result.products[0].unit).toBe('');
    expect(result.products[0].note).toMatch(/количество|единиц/iu);
    if (!quantity.amount) expect(result.products[0].amount).toBeUndefined();
    else expect(result.products[0].amount).toBe(2);
  });

  it('preserves an empty food result and explanation instead of inventing products', async () => {
    const warning = 'Съедобных продуктов на чеке не найдено.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput({ products: [], warnings: [warning] })))));
    const response = await handleAssistantRequest(request(), environment().env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ engine: 'ai', products: [], warnings: [warning] });
  });

  it('does not accept a provider price field as product or inventory data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput({ products: [{ ...product, price: '450' }], warnings: [] })))));
    const response = await handleAssistantRequest(request(), environment().env);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'assistant_unavailable' });
  });

  it('uses the existing durable quota before starting image inference', async () => {
    const { env, prepare } = environment(false);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request(), env);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(prepare).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a foreign origin and a request cancelled before upload without spending counters', async () => {
    const { env, prepare } = environment();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await handleAssistantRequest(request({ receipt }, { Origin: 'https://unrelated.example' }), env)).status).toBe(403);
    const controller = new AbortController(); controller.abort();
    expect((await handleAssistantRequest(request({ receipt }, {}, controller.signal), env)).status).toBe(504);
    expect(prepare).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
