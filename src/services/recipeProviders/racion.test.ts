import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RACION_REQUEST_TIMEOUT_MS,
  RacionProviderError,
  getRacionRecipeIngredients,
  getRacionRecipe,
  searchRacionRecipes,
  type RacionSearchOptions,
} from './racion';

function card(id = 'omelet', overrides: Record<string, unknown> = {}) {
  return {
    ID: id,
    Title: 'Омлет',
    Slot: 'breakfast',
    TimeMin: 15,
    Kcal: 215.725,
    Href: `/recipe/${id}`,
    Image: '/images/recipes/omelet.webp',
    Desc: 'Provider description is not part of the Cookly card.',
    Cost: 100,
    ...overrides,
  };
}

function page(items: unknown[] = [card()], overrides: Record<string, unknown> = {}) {
  return { items, total: items.length, offset: 0, limit: 12, ...overrides };
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const fetcher = vi.fn<typeof fetch>();

function fullRecipe(id = 'eggs', overrides: Record<string, unknown> = {}) {
  return {
    id, title: 'Омлет', description: 'Оригинальное описание.', slot: 'breakfast', timeMin: 15,
    image: '/images/recipes/eggs.webp', kcal: 215.725, protein: 15.25, fat: 11.5, carb: 8.125,
    ingredients: [{ ingredientId: 'egg', name: 'Яйцо', amount: 1.25, unit: 'pcs', pantry: false }],
    steps: ['  Смешайте яйца.\nНе меняйте исходный текст.  ', 'Готовьте 3 минуты.'], tags: ['eggs'],
    ...overrides,
  };
}

beforeEach(() => {
  fetcher.mockReset();
  vi.stubGlobal('fetch', fetcher);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Racion live short-card search', () => {
  it('requests one official Russian KZ page with short-card facts and a safe remote photo URL', async () => {
    const items = Array.from({ length: 18 }, (_, i) => card(`chicken_${i}`));
    fetcher.mockResolvedValueOnce(json(page(items, { total: 90, offset: 36, limit: 18 })));

    const result = await searchRacionRecipes({ query: '  курица & рис  ', slot: 'dinner', limit: 18, offset: 36 });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [input, init] = fetcher.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe('https://racion.app/api/recipes');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      country: 'KZ', lang: 'ru', q: 'курица & рис', slot: 'dinner', limit: '18', offset: '36',
    });
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({ total: 90, offset: 36, limit: 18, nextOffset: 54 });
    expect(result.items[0]).toEqual({
      id: 'chicken_0', title: 'Омлет', slot: 'breakfast', timeMinutes: 15,
      caloriesPerPortion: 215.725, sourceUrl: 'https://racion.app/recipe/chicken_0',
      imageUrl: 'https://racion.app/images/recipes/omelet.webp',
    });
    expect(result.items[0]).not.toHaveProperty('Image');
    expect(result.items[0]).not.toHaveProperty('description');
    expect(result.items[0]).not.toHaveProperty('ingredients');
    expect(result.items[0]).not.toHaveProperty('steps');
    expect(result.items[0]).not.toHaveProperty('Cost');
  });

  it('uses default limit 12, accepts a genuine empty page and never invents unknown facts', async () => {
    fetcher.mockResolvedValueOnce(json(page([])));
    expect(await searchRacionRecipes()).toEqual({ items: [], total: 0, offset: 0, limit: 12, nextOffset: null });
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.has('q')).toBe(false);

    const source = card();
    delete (source as Record<string, unknown>).Slot;
    delete (source as Record<string, unknown>).TimeMin;
    delete (source as Record<string, unknown>).Kcal;
    fetcher.mockResolvedValueOnce(json(page([source])));
    expect((await searchRacionRecipes()).items[0]).toMatchObject({ slot: null, timeMinutes: null, caloriesPerPortion: null });
  });

  it('preserves explicit numeric facts and supports safe absolute recipe and media-photo links', async () => {
    fetcher.mockResolvedValueOnce(json(page([card('eggs', {
      TimeMin: 0, Kcal: 0, Slot: null, Href: 'https://racion.app/recipe/eggs',
      Image: 'https://racion.app/media/recipe/2026/10/87a3e134c7fdd0ffdf434b04.webp',
    })])));
    expect((await searchRacionRecipes()).items[0]).toMatchObject({
      slot: null, timeMinutes: 0, caloriesPerPortion: 0, sourceUrl: 'https://racion.app/recipe/eggs',
      imageUrl: 'https://racion.app/media/recipe/2026/10/87a3e134c7fdd0ffdf434b04.webp',
    });
  });

  it('returns the next offset without prefetching, including the end of a partial last page', async () => {
    const first = Array.from({ length: 12 }, (_, i) => card(`meal_${i}`));
    fetcher.mockResolvedValueOnce(json(page(first, { total: 13 })));
    const firstPage = await searchRacionRecipes({ query: 'яйца' });
    expect(firstPage.nextOffset).toBe(12);
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockResolvedValueOnce(json(page([card('meal_12')], { total: 13, offset: 12 })));
    const lastPage = await searchRacionRecipes({ query: 'яйца', offset: firstPage.nextOffset! });
    expect(lastPage.nextOffset).toBeNull();
    expect(lastPage.items).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retain completed pages or share cancellation between simultaneous callers', async () => {
    let finishFirst!: (value: Response) => void;
    let finishSecond!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { finishFirst = resolve; }));
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { finishSecond = resolve; }));
    const firstController = new AbortController();
    const first = searchRacionRecipes({ query: 'рис', signal: firstController.signal });
    const firstRejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = searchRacionRecipes({ query: 'рис' });
    firstController.abort();
    await firstRejection;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(false);
    finishFirst(json(page()));
    finishSecond(json(page()));
    expect((await second).items).toHaveLength(1);

    fetcher.mockResolvedValueOnce(json(page()));
    await searchRacionRecipes({ query: 'рис' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    { query: 'a'.repeat(121) }, { query: 'rice\u0000' }, { query: 123 },
    { offset: -1 }, { offset: 1.5 }, { offset: Number.MAX_SAFE_INTEGER + 1 },
    { limit: 200 }, { slot: 'dessert' }, { signal: {} }, null,
  ])('rejects invalid user request %j before making a network call', async value => {
    await expect(searchRacionRecipes(value as RacionSearchOptions)).rejects.toMatchObject({ code: 'invalid_request' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Racion response boundaries', () => {
  it.each([
    'http://racion.app/images/recipes/eggs.webp',
    'javascript:alert(1)',
    'data:image/svg+xml,<svg onload="alert(1)"></svg>',
    'https://racion.app.evil.example/images/recipes/eggs.webp',
    '//evil.example/images/recipes/eggs.webp',
    'https://name:password@racion.app/images/recipes/eggs.webp',
    '/images/recipes/eggs.webp\n',
  ])('drops unsafe photo URL %s without rejecting the recipe page', async image => {
    fetcher.mockResolvedValueOnce(json(page([card('eggs', { Image: image })])));
    const result = await searchRacionRecipes();
    expect(result.items[0].imageUrl).toBeNull();
    expect(result.items[0].id).toBe('eggs');
    expect(result.items[0]).not.toHaveProperty('Image');
    expect(result.items[0]).not.toHaveProperty('Desc');
  });

  it('keeps missing, empty, non-string and unverified photo paths unavailable', async () => {
    for (const image of [undefined, null, '', '   ', 123, '/other/eggs.webp']) {
      fetcher.mockResolvedValueOnce(json(page([card('eggs', { Image: image })])));
      expect((await searchRacionRecipes()).items[0].imageUrl).toBeNull();
    }
  });

  it.each([
    null, {}, page([], { items: null }), page([], { total: -1 }), page([], { total: '0' }),
    page([], { offset: 1 }), page([], { limit: 18 }), page([], { total: 2 }),
    page([card()], { total: 0 }), page([card(), card()]),
    page([card('omelet', { Title: ' ' })]), page([card('omelet', { Kcal: '215' })]),
    page([card('omelet', { TimeMin: -1 })]), page([card('omelet', { TimeMin: 4.5 })]),
    page([card('omelet', { Slot: 'brunch' })]),
  ])('rejects malformed or contradictory page %j', async value => {
    fetcher.mockResolvedValueOnce(json(value));
    await expect(searchRacionRecipes()).rejects.toMatchObject({ code: 'malformed_response' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['../eggs', '/recipe/../eggs'],
    ['eggs%2ffake', '/recipe/eggs%2ffake'],
    ['eggs', 'javascript:alert(1)'],
    ['eggs', 'http://racion.app/recipe/eggs'],
    ['eggs', 'https://racion.app.evil.example/recipe/eggs'],
    ['eggs', '//evil.example/recipe/eggs'],
    ['eggs', 'https://name:password@racion.app/recipe/eggs'],
    ['eggs', '/recipe/different'],
    ['eggs', '/api/recipes/eggs'],
    ['eggs', '/recipe/eggs?redirect=https://evil.example'],
    ['eggs', '/recipe/eggs#extra'],
  ])('rejects unsafe or mismatched source link for %s: %s', async (id, href) => {
    fetcher.mockResolvedValueOnce(json(page([card(id, { Href: href })])));
    await expect(searchRacionRecipes()).rejects.toMatchObject({ code: 'malformed_response' });
  });

  it('handles JSON parse failures as malformed responses and network failures separately', async () => {
    fetcher.mockResolvedValueOnce(new Response('<html>upstream failure</html>'));
    await expect(searchRacionRecipes()).rejects.toMatchObject({ code: 'malformed_response' });
    fetcher.mockRejectedValueOnce(new TypeError('offline'));
    await expect(searchRacionRecipes()).rejects.toMatchObject({ code: 'network' });
    fetcher.mockResolvedValueOnce(json({}, 503));
    await expect(searchRacionRecipes()).rejects.toMatchObject({ code: 'http', status: 503 });
  });

  it('reports 429 with Retry-After seconds and never automatically retries', async () => {
    vi.useFakeTimers();
    fetcher.mockResolvedValueOnce(json({ error: 'rate limit' }, 429, { 'Retry-After': '3600' }));
    const error = await searchRacionRecipes().catch(value => value);
    expect(error).toBeInstanceOf(RacionProviderError);
    expect(error).toMatchObject({ code: 'rate_limit', status: 429, retryAfterSeconds: 3600 });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not invent a retry time when a 429 header is absent or malformed', async () => {
    fetcher.mockResolvedValueOnce(json({}, 429, { 'Retry-After': 'not-seconds' }));
    await expect(searchRacionRecipes()).rejects.toMatchObject({ code: 'rate_limit', retryAfterSeconds: undefined });
  });

  it('honours an already aborted signal without issuing a request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(searchRacionRecipes({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['headers', 'body'])('enforces the 10-second deadline while waiting for %s', async stage => {
    vi.useFakeTimers();
    fetcher.mockImplementationOnce(async () => {
      if (stage === 'headers') return new Promise<Response>(() => {});
      return { ok: true, json: () => new Promise<unknown>(() => {}) } as Response;
    });
    const pending = searchRacionRecipes();
    const rejection = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(RACION_REQUEST_TIMEOUT_MS);
    await rejection;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Racion explicit ingredient facts', () => {
  it('fetches only the selected detail and projects ingredient facts without recipe text or photos', async () => {
    fetcher.mockResolvedValueOnce(json({
      id: 'chicken_baked', title: 'Recipe title', description: 'Never copy this description',
      steps: ['Never copy this instruction'], image: 'https://racion.app/photo.webp',
      ingredients: [
        { ingredientId: 'chicken', name: 'Курица', amount: 125.25, unit: 'g', pantry: false, notes: 'not included' },
        { ingredientId: 'oil', name: 'Масло', amount: null, unit: 'ml', pantry: true },
      ],
    }));
    const result = await getRacionRecipeIngredients('chicken_baked');
    expect(result).toEqual({
      id: 'chicken_baked',
      ingredients: [
        { ingredientId: 'chicken', name: 'Курица', amount: 125.25, unit: 'g', pantry: false },
        { ingredientId: 'oil', name: 'Масло', amount: null, unit: 'ml', pantry: true },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [input, init] = fetcher.mock.calls[0];
    expect(String(input)).toBe('https://racion.app/api/recipes/chicken_baked?country=KZ&lang=ru');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store' });
  });

  it('rejects mismatched IDs and malformed ingredient facts rather than silently inventing values', async () => {
    const ingredient = { ingredientId: 'egg', name: 'Яйцо', amount: 2, unit: 'pcs', pantry: false };
    const invalid = [
      { id: 'different', ingredients: [ingredient] },
      { id: 'eggs', ingredients: [] },
      { id: 'eggs', ingredients: [{ ...ingredient, amount: '2' }] },
      { id: 'eggs', ingredients: [{ ...ingredient, amount: -2 }] },
      { id: 'eggs', ingredients: [{ ...ingredient, unit: null }] },
      { id: 'eggs', ingredients: [{ ...ingredient, pantry: undefined }] },
    ];
    for (const value of invalid) {
      fetcher.mockResolvedValueOnce(json(value));
      await expect(getRacionRecipeIngredients('eggs')).rejects.toMatchObject({ code: 'malformed_response' });
    }
    const count = fetcher.mock.calls.length;
    await expect(getRacionRecipeIngredients('../eggs')).rejects.toMatchObject({ code: 'invalid_request' });
    expect(fetcher).toHaveBeenCalledTimes(count);
  });

  it('forwards cancellation for an explicit ingredient request and does not auto-refetch', async () => {
    fetcher.mockImplementationOnce(async () => ({ ok: true, json: () => new Promise<unknown>(() => {}) }) as Response);
    const controller = new AbortController();
    const pending = getRacionRecipeIngredients('eggs', { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('Racion complete live recipe', () => {
  it('retains original steps and per-one-portion amounts/nutrition without inferred servings', async () => {
    const source = fullRecipe('eggs', { sourceUrl: 'javascript:untrusted' });
    fetcher.mockResolvedValueOnce(json(source));
    const result = await getRacionRecipe('eggs');
    expect(result).toEqual({
      id: 'eggs', title: 'Омлет', slot: 'breakfast', timeMinutes: 15,
      sourceUrl: 'https://racion.app/recipe/eggs', imageUrl: 'https://racion.app/images/recipes/eggs.webp',
      caloriesPerPortion: 215.725, description: source.description,
      ingredients: source.ingredients, steps: source.steps, tags: source.tags,
      nutrition: { calories: 215.725, protein: 15.25, fat: 11.5, carbs: 8.125 },
    });
    expect(result).not.toHaveProperty('servings');
    expect(result.steps[0]).toBe('  Смешайте яйца.\nНе меняйте исходный текст.  ');
    expect(String(fetcher.mock.calls[0][0])).toBe('https://racion.app/api/recipes/eggs?country=KZ&lang=ru');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses null for absent optional facts and keeps missing amounts unknown', async () => {
    const source = fullRecipe() as Record<string, unknown>;
    for (const field of ['description', 'slot', 'timeMin', 'image', 'kcal', 'protein', 'fat', 'carb', 'tags']) delete source[field];
    source.ingredients = [{ ingredientId: 'egg', name: 'Яйцо', unit: 'pcs', pantry: false }];
    fetcher.mockResolvedValueOnce(json(source));
    expect(await getRacionRecipe('eggs')).toMatchObject({
      description: null, slot: null, timeMinutes: null, imageUrl: null, caloriesPerPortion: null,
      ingredients: [{ amount: null }], nutrition: { calories: null, protein: null, fat: null, carbs: null }, tags: [],
    });
  });

  it.each([
    { id: 'different' }, { title: ' ' }, { steps: [] }, { steps: [' '] }, { steps: [123] },
    { ingredients: [] }, { protein: '15' }, { fat: -1 }, { description: 2 }, { tags: [null] },
  ])('rejects invalid complete recipe fields %j', async overrides => {
    fetcher.mockResolvedValueOnce(json(fullRecipe('eggs', overrides)));
    await expect(getRacionRecipe('eggs')).rejects.toMatchObject({ code: 'malformed_response' });
  });

  it('supports cancellation before issuing the full-recipe request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(getRacionRecipe('eggs', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
