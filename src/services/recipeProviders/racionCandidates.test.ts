import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const endpoint = 'https://cookly-fridge-assistant.cherrygrass1025.chatgpt.site/api/fridge/parse';
const card = { ID: 'side_buckwheat', Title: 'Гречка с маслом', Slot: 'dinner', TimeMin: 20, Kcal: 279, Href: '/recipe/side_buckwheat', Image: '/images/recipes/side_buckwheat.webp' };

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_FRIDGE_ASSISTANT_URL', endpoint);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('native fridge candidate client', () => {
  it('sends the complete mapped fridge once to the existing server without raw text or credentials', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [card], total: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const { loadRacionCandidates } = await import('./racionCandidates');
    const result = await loadRacionCandidates({ stock: ['Рис', 'Картофель', 'Яйца', 'Говядина', 'Баранина', 'Сёмга', 'Капуста', 'Мандарины', 'Масло сливочное', 'Сельдь', 'Сыр', 'Гречка'] });
    expect(result.items[0].id).toBe('side_buckwheat');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cookly-fridge-assistant.cherrygrass1025.chatgpt.site/api/recipes/candidates');
    expect(options.credentials).toBe('omit');
    expect(JSON.parse(String(options.body)).have).toEqual(expect.arrayContaining(['rice', 'potato', 'eggs', 'beef_stew', 'lamb', 'salmon_fillet', 'cabbage', 'butter', 'cheese_hard', 'buckwheat']));
    expect(String(options.body)).not.toContain('Сёмга');
  });

  it('surfaces an unavailable server rather than returning an empty catalogue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })));
    const { loadRacionCandidates } = await import('./racionCandidates');
    await expect(loadRacionCandidates({ stock: ['Рис'] })).rejects.toMatchObject({ code: 'http', status: 502 });
  });

  it('preserves the source retry interval on rate-limit errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '120' } })));
    const { loadRacionCandidates } = await import('./racionCandidates');
    await expect(loadRacionCandidates({ stock: ['Рис'] })).rejects.toMatchObject({ code: 'rate_limit', retryAfterSeconds: 120 });
  });

  it('rejects malformed candidate records instead of displaying unverified external URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [{ ...card, Href: 'https://example.org/recipe/side_buckwheat' }] }), { status: 200 })));
    const { loadRacionCandidates } = await import('./racionCandidates');
    await expect(loadRacionCandidates({ stock: ['Рис'] })).rejects.toMatchObject({ code: 'malformed_response' });
  });

  it('cancels before a network request when the page has already changed', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController(); controller.abort();
    const { loadRacionCandidates } = await import('./racionCandidates');
    await expect(loadRacionCandidates({ stock: ['Рис'], signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
