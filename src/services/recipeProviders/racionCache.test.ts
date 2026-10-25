import { describe, expect, it, vi } from 'vitest';
import { RacionProviderError, type RacionRecipe, type RacionRecipePage } from './racion';
import {
  createRacionLoaders,
  RACION_CACHE_TTL_MS,
  RACION_DETAIL_CACHE_MAX_ENTRIES,
  RACION_SEARCH_CACHE_MAX_ENTRIES,
} from './racionCache';

function recipe(id = 'eggs', title = 'Омлет'): RacionRecipe {
  return {
    id, title, slot: 'breakfast', timeMinutes: 15, caloriesPerPortion: 200,
    sourceUrl: `https://racion.app/recipe/${id}`, imageUrl: null, description: null,
    ingredients: [{ ingredientId: 'egg', name: 'Яйцо', amount: 1, unit: 'pcs', pantry: false }],
    steps: ['Оригинальный шаг.'], nutrition: { calories: 200, protein: null, fat: null, carbs: null }, tags: [],
  };
}

function page(offset = 0, limit: 12 | 18 = 12): RacionRecipePage {
  return { items: [], offset, limit, total: 0, nextOffset: null };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function setup() {
  let now = 0;
  const getRecipe = vi.fn(async (id: string, _options?: { signal?: AbortSignal }) => recipe(id));
  const searchRecipes = vi.fn(async (options: Parameters<ReturnType<typeof createRacionLoaders>['loadRacionSearch']>[0] = {}) => page(options.offset, options.limit));
  const loaders = createRacionLoaders({ getRecipe, searchRecipes, now: () => now });
  return { ...loaders, getRecipe, searchRecipes, setNow(value: number) { now = value; } };
}

async function microtasks() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('Racion bounded memory cache', () => {
  it('deduplicates identical pending requests and isolates every returned DTO from peers/cache', async () => {
    const loaders = setup();
    const pending = deferred<RacionRecipe>();
    loaders.getRecipe.mockReturnValueOnce(pending.promise);
    const first = loaders.loadRacionRecipe('eggs');
    const second = loaders.loadRacionRecipe('eggs');
    await Promise.resolve();
    expect(loaders.getRecipe).toHaveBeenCalledTimes(1);
    pending.resolve(recipe());
    const [a, b] = await Promise.all([first, second]);
    a.ingredients[0].name = 'Changed';
    a.steps.push('Changed');
    expect(b.ingredients[0].name).toBe('Яйцо');
    expect(b.steps).toEqual(['Оригинальный шаг.']);
    expect((await loaders.loadRacionRecipe('eggs')).ingredients[0].name).toBe('Яйцо');
    expect(loaders.getRecipe).toHaveBeenCalledTimes(1);
  });

  it('expires a completed response at 10 minutes and refetches only on a new explicit load', async () => {
    const loaders = setup();
    await loaders.loadRacionRecipe('eggs');
    loaders.setNow(RACION_CACHE_TTL_MS - 1);
    await loaders.loadRacionRecipe('eggs');
    expect(loaders.getRecipe).toHaveBeenCalledTimes(1);
    loaders.setNow(RACION_CACHE_TTL_MS);
    expect(loaders.getRecipe).toHaveBeenCalledTimes(1);
    await loaders.loadRacionRecipe('eggs');
    expect(loaders.getRecipe).toHaveBeenCalledTimes(2);
  });

  it('bounds full-recipe values at 100 and evicts the least recently used entry', async () => {
    const loaders = setup();
    for (let i = 0; i < RACION_DETAIL_CACHE_MAX_ENTRIES; i++) await loaders.loadRacionRecipe(`meal_${i}`);
    await loaders.loadRacionRecipe('meal_0');
    await loaders.loadRacionRecipe('meal_100');
    await loaders.loadRacionRecipe('meal_0');
    expect(loaders.getRecipe).toHaveBeenCalledTimes(101);
    await loaders.loadRacionRecipe('meal_1');
    expect(loaders.getRecipe).toHaveBeenCalledTimes(102);
  });

  it('bounds search values at 30 and keeps pagination/filter queries separate', async () => {
    const loaders = setup();
    for (let i = 0; i < RACION_SEARCH_CACHE_MAX_ENTRIES; i++) await loaders.loadRacionSearch({ query: `query_${i}` });
    await loaders.loadRacionSearch({ query: 'query_0' });
    await loaders.loadRacionSearch({ query: 'query_30' });
    await loaders.loadRacionSearch({ query: 'query_0' });
    expect(loaders.searchRecipes).toHaveBeenCalledTimes(31);
    await loaders.loadRacionSearch({ query: 'query_1' });
    expect(loaders.searchRecipes).toHaveBeenCalledTimes(32);
    await loaders.loadRacionSearch({ query: ' query_0 ', limit: 12, offset: 0 });
    expect(loaders.searchRecipes).toHaveBeenCalledTimes(32);
    await loaders.loadRacionSearch({ query: 'query_0', offset: 12 });
    await loaders.loadRacionSearch({ query: 'query_0', slot: 'dinner' });
    await loaders.loadRacionSearch({ query: 'query_0', limit: 18 });
    expect(loaders.searchRecipes).toHaveBeenCalledTimes(35);
  });

  it('does not cache failures and permits the next explicit attempt', async () => {
    const loaders = setup();
    loaders.getRecipe.mockRejectedValueOnce(new RacionProviderError('network', 'Offline'));
    await expect(loaders.loadRacionRecipe('eggs')).rejects.toMatchObject({ code: 'network' });
    expect((await loaders.loadRacionRecipe('eggs')).id).toBe('eggs');
    expect(loaders.getRecipe).toHaveBeenCalledTimes(2);
  });

  it('aborts only the cancelled caller while a peer completes and populates the cache', async () => {
    const loaders = setup();
    const pending = deferred<RacionRecipe>();
    loaders.getRecipe.mockReturnValueOnce(pending.promise);
    const controller = new AbortController();
    const first = loaders.loadRacionRecipe('eggs', { signal: controller.signal });
    const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = loaders.loadRacionRecipe('eggs');
    await Promise.resolve();
    controller.abort();
    await rejection;
    expect(loaders.getRecipe.mock.calls[0][1]?.signal?.aborted).toBe(false);
    pending.resolve(recipe());
    expect((await second).id).toBe('eggs');
    await loaders.loadRacionRecipe('eggs');
    expect(loaders.getRecipe).toHaveBeenCalledTimes(1);
  });

  it('cancels abandoned work and prevents late completion from overwriting or deleting a newer request', async () => {
    const loaders = setup();
    const old = deferred<RacionRecipe>();
    const fresh = deferred<RacionRecipe>();
    loaders.getRecipe.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const a = new AbortController();
    const b = new AbortController();
    const first = loaders.loadRacionRecipe('eggs', { signal: a.signal });
    const second = loaders.loadRacionRecipe('eggs', { signal: b.signal });
    const rejections = Promise.all([
      expect(first).rejects.toMatchObject({ name: 'AbortError' }),
      expect(second).rejects.toMatchObject({ name: 'AbortError' }),
    ]);
    await Promise.resolve();
    a.abort(); b.abort();
    await rejections;
    expect(loaders.getRecipe.mock.calls[0][1]?.signal?.aborted).toBe(true);
    const third = loaders.loadRacionRecipe('eggs');
    await Promise.resolve();
    old.resolve(recipe('eggs', 'Abandoned'));
    await microtasks();
    const fourth = loaders.loadRacionRecipe('eggs');
    await Promise.resolve();
    expect(loaders.getRecipe).toHaveBeenCalledTimes(2);
    fresh.resolve(recipe('eggs', 'Fresh'));
    expect((await third).title).toBe('Fresh');
    expect((await fourth).title).toBe('Fresh');
    expect((await loaders.loadRacionRecipe('eggs')).title).toBe('Fresh');
    expect(loaders.getRecipe).toHaveBeenCalledTimes(2);
  });

  it('rejects pre-aborted requests without invoking either reader', async () => {
    const loaders = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(loaders.loadRacionRecipe('eggs', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(loaders.loadRacionSearch({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(loaders.getRecipe).not.toHaveBeenCalled();
    expect(loaders.searchRecipes).not.toHaveBeenCalled();
  });

  it('applies Retry-After globally across search/detail while allowing already cached data', async () => {
    const loaders = setup();
    await loaders.loadRacionRecipe('cached');
    loaders.searchRecipes.mockRejectedValueOnce(new RacionProviderError('rate_limit', 'Wait', { status: 429, retryAfterSeconds: 120 }));
    await expect(loaders.loadRacionSearch({ query: 'rice' })).rejects.toMatchObject({ code: 'rate_limit', retryAfterSeconds: 120 });
    expect((await loaders.loadRacionRecipe('cached')).id).toBe('cached');
    loaders.setNow(30_000);
    await expect(loaders.loadRacionRecipe('new')).rejects.toMatchObject({ code: 'rate_limit', retryAfterSeconds: 90 });
    await expect(loaders.loadRacionSearch({ query: 'other' })).rejects.toMatchObject({ code: 'rate_limit', retryAfterSeconds: 90 });
    expect(loaders.getRecipe).toHaveBeenCalledTimes(1);
    expect(loaders.searchRecipes).toHaveBeenCalledTimes(1);
    loaders.setNow(120_000);
    await loaders.loadRacionRecipe('new');
    expect(loaders.getRecipe).toHaveBeenCalledTimes(2);
  });

  it('defaults a headerless 429 to a 60-second cooldown without scheduling retries', async () => {
    const loaders = setup();
    loaders.getRecipe.mockRejectedValueOnce(new RacionProviderError('rate_limit', 'Wait', { status: 429 }));
    await expect(loaders.loadRacionRecipe('eggs')).rejects.toMatchObject({ code: 'rate_limit' });
    loaders.setNow(59_000);
    await expect(loaders.loadRacionSearch()).rejects.toMatchObject({ code: 'rate_limit', retryAfterSeconds: 1 });
    expect(loaders.searchRecipes).not.toHaveBeenCalled();
    loaders.setNow(60_000);
    await loaders.loadRacionSearch();
    expect(loaders.searchRecipes).toHaveBeenCalledTimes(1);
    expect(loaders.getRecipe).toHaveBeenCalledTimes(1);
  });
});
