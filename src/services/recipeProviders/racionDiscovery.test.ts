import { describe, expect, it, vi } from 'vitest';
import { discoverRacionRecipes, initialRacionDiscoveryCursor, RACION_DISCOVERY_DETAILS, RACION_DISCOVERY_SEARCHES } from './racionDiscovery';
import { RacionProviderError, type RacionRecipe, type RacionRecipePage } from './racion';

const recipe = (id: string): RacionRecipe => ({
  id, title: id, slot: 'lunch', timeMinutes: 20, caloriesPerPortion: null,
  sourceUrl: `https://racion.app/recipe/${id}`, imageUrl: null, description: null,
  tags: [], ingredients: [{ ingredientId: 'rice', name: 'Рис', amount: 100, unit: 'g', pantry: false }],
  steps: ['Приготовьте.'], nutrition: { calories: null, protein: null, fat: null, carbs: null },
});
const page = (query: string, offset = 0, total = 20): RacionRecipePage => ({
  items: Array.from({ length: Math.min(12, total - offset) }, (_, i) => recipe(`${query}_${offset+i}`)),
  offset, limit: 12, total, nextOffset: offset + 12 < total ? offset + 12 : null,
});

describe('bounded whole-fridge candidate discovery', () => {
  it('spreads an explicit batch across four groups and bounds recipe detail requests', async () => {
    const search = vi.fn(async ({ query = '', offset = 0 } = {}) => page(query, offset));
    const detail = vi.fn(async (id: string) => recipe(id));
    const result = await discoverRacionRecipes({ seeds: ['chicken', 'beef', 'fish', 'rice', 'potato'], cursor: initialRacionDiscoveryCursor(), knownIds: [] }, { search, detail });
    expect(search.mock.calls.map(([request]) => request?.query)).toEqual(['chicken', 'beef', 'fish', 'rice']);
    expect(search).toHaveBeenCalledTimes(RACION_DISCOVERY_SEARCHES);
    expect(detail).toHaveBeenCalledTimes(RACION_DISCOVERY_DETAILS);
    expect(result.recipes.map(item => item.id)).toEqual(['chicken_0', 'chicken_1', 'beef_0', 'beef_1', 'fish_0', 'fish_1', 'rice_0', 'rice_1']);
    expect(result.cursor).toMatchObject({ nextSeed: 4, offsets: { chicken: 2, beef: 2, fish: 2, rice: 2 } });
    expect(result.hasMore).toBe(true);
  });

  it('continues at unvisited rows and rotates to products outside the first batch', async () => {
    const search = vi.fn(async ({ query = '', offset = 0 } = {}) => page(query, offset));
    const detail = vi.fn(async (id: string) => recipe(id));
    const first = await discoverRacionRecipes({ seeds: ['chicken', 'beef', 'fish', 'rice', 'potato'], cursor: initialRacionDiscoveryCursor(), knownIds: [] }, { search, detail });
    const next = await discoverRacionRecipes({ seeds: ['chicken', 'beef', 'fish', 'rice', 'potato'], cursor: first.cursor, knownIds: first.recipes.map(item => item.id) }, { search, detail });
    expect(search.mock.calls.slice(4).map(([request]) => request?.query)).toEqual(['potato', 'chicken', 'beef', 'fish']);
    expect(next.recipes.map(item => item.id)).toContain('chicken_2');
    expect(next.recipes.some(item => first.recipes.some(previous => previous.id === item.id))).toBe(false);
  });

  it('deduplicates overlapping searches and finishes when all source rows are exhausted', async () => {
    const search = vi.fn(async () => ({ ...page('shared', 0, 2) }));
    const detail = vi.fn(async (id: string) => recipe(id));
    const result = await discoverRacionRecipes({ seeds: ['one', 'two'], cursor: initialRacionDiscoveryCursor(), knownIds: [] }, { search, detail });
    expect(detail).toHaveBeenCalledTimes(2);
    expect(result.recipes).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.cursor.exhausted).toEqual(['one', 'two']);
  });

  it('stops immediately on a rate limit, retains partial results and leaves the failed row for retry', async () => {
    const search = vi.fn(async ({ query = '', offset = 0 } = {}) => page(query, offset));
    const limit = new RacionProviderError('rate_limit', 'Wait', { status: 429, retryAfterSeconds: 60 });
    const detail = vi.fn(async (id: string) => { if (id === 'chicken_1') throw limit; return recipe(id); });
    const result = await discoverRacionRecipes({ seeds: ['chicken', 'beef', 'fish'], cursor: initialRacionDiscoveryCursor(), knownIds: [] }, { search, detail });
    expect(result.error).toBe(limit);
    expect(result.recipes.map(item => item.id)).toEqual(['chicken_0']);
    expect(result.cursor.offsets.chicken).toBe(1);
    expect(result.cursor.nextSeed).toBe(0);
    expect(search).toHaveBeenCalledTimes(1);
    expect(detail).toHaveBeenCalledTimes(2);
  });

  it('can skip a malformed source record without exceeding the request budget', async () => {
    const search = vi.fn(async ({ query = '', offset = 0 } = {}) => page(query, offset));
    const detail = vi.fn(async (id: string) => {
      if (id === 'rice_0') throw new RacionProviderError('malformed_response', 'Bad source');
      return recipe(id);
    });
    const result = await discoverRacionRecipes({ seeds: ['rice'], cursor: initialRacionDiscoveryCursor(), knownIds: [] }, { search, detail });
    expect(detail).toHaveBeenCalledTimes(8);
    expect(result.recipes).toHaveLength(7);
    expect(result.cursor.offsets.rice).toBe(8);
  });

  it('aborts without sending requests and reports no work for an empty fridge', async () => {
    const search = vi.fn(async () => page('rice'));
    const detail = vi.fn(async (id: string) => recipe(id));
    const controller = new AbortController();
    controller.abort();
    await expect(discoverRacionRecipes({ seeds: ['rice'], cursor: initialRacionDiscoveryCursor(), knownIds: [], signal: controller.signal }, { search, detail })).rejects.toMatchObject({ name: 'AbortError' });
    const empty = await discoverRacionRecipes({ seeds: [], cursor: initialRacionDiscoveryCursor(), knownIds: [] }, { search, detail });
    expect(empty.hasMore).toBe(false);
    expect(search).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });
});
