import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistantConfigured, assistantEndpoint, FridgeAssistantError, parseFridgeWithAssistant } from './fridgeAssistant';

const valid = { engine: 'ai', warnings: [], products: [{ id: 'egg', name: 'Яйца', amount: 2, unit: 'шт.', category: 'Яйца', selected: true }] };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('fridge assistant client', () => {
  it('only accepts an explicit safe backend endpoint and never needs a provider key', () => {
    expect(assistantEndpoint('https://assistant.example/api/fridge/parse')).toBe('https://assistant.example/api/fridge/parse');
    for (const value of ['', 'javascript:alert(1)', 'https://key:secret@example.com', 'https://example.com?key=secret', '//example.com']) expect(assistantEndpoint(value)).toBeNull();
    vi.stubEnv('VITE_FRIDGE_ASSISTANT_URL', '');
    expect(assistantConfigured()).toBe(false);
  });
  it('sends only the submitted text and validates the returned products before confirmation', async () => {
    vi.stubEnv('VITE_FRIDGE_ASSISTANT_URL', 'https://assistant.example/api/fridge/parse');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid)));
    vi.stubGlobal('fetch', fetcher);
    const parsed = await parseFridgeWithAssistant('  2 яйца  ');
    expect(parsed.products[0]).toMatchObject({ name: 'Яйца', amount: 2 });
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ text: '2 яйца' });
    expect(init.credentials).toBe('omit');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
  it('rejects malformed quantities and rate limits without showing raw upstream errors', async () => {
    vi.stubEnv('VITE_FRIDGE_ASSISTANT_URL', 'https://assistant.example/api/fridge/parse');
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...valid, products: [{ ...valid.products[0], amount: -2 }] })))
      .mockResolvedValueOnce(new Response('sensitive upstream diagnostics', { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(parseFridgeWithAssistant('2 яйца')).rejects.toThrow('некорректный список');
    await expect(parseFridgeWithAssistant('2 яйца')).rejects.toMatchObject({ name: 'FridgeAssistantError', message: expect.stringContaining('Слишком много') });
    expect(new FridgeAssistantError('Безопасное сообщение')).toBeInstanceOf(Error);
  });
  it('does not return a late successful response after the caller cancels', async () => {
    vi.stubEnv('VITE_FRIDGE_ASSISTANT_URL', 'https://assistant.example/api/fridge/parse');
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => { controller.abort(); return new Response(JSON.stringify(valid)); }));
    await expect(parseFridgeWithAssistant('2 яйца', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
