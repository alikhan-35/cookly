import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../types';
import fixture from './__fixtures__/racion-user-stock.json';
import { getRacionRecipe, RacionProviderError, type RacionRecipeCard } from './racion';
import { recommendRacionFromFridge } from './racionFridgeSearch';
import { rankRacionRecipes } from './racionRecommendations';

const profile: UserProfile = { familySize: 2, hasChildren: false, dislikes: [], allergies: [], dietary: 'Без ограничений', difficulty: 'Любые' };
const search = { stock: fixture.stock, maxTime: null, profile };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const id = new URL(String(input)).pathname.split('/').at(-1);
    const record = fixture.records.find(item => item.recipe.id === id);
    if (!record) throw new Error(`Unexpected live request: ${id}`);
    return new Response(JSON.stringify(record.recipe), { status: record.status, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('automatic whole-fridge composition checks', () => {
  it('continues beyond eight unusable source records and finds real dishes without another user action', async () => {
    const realRecipes = await Promise.all(fixture.records.map(record => getRacionRecipe(record.recipe.id)));
    // Only the metadata IDs are artificial; no invented full recipe is made eligible.
    const unusableCards: RacionRecipeCard[] = Array.from({ length: 8 }, (_, index) => ({
      ...realRecipes[0], id: `malformed_${index}`, title: 'Некорректный ответ источника', timeMinutes: 1,
    }));
    const candidates = vi.fn(async () => ({ items: [...unusableCards, ...realRecipes], total: 16 }));
    const detail = vi.fn(async (id: string) => {
      if (id.startsWith('malformed_')) throw new RacionProviderError('malformed_response', 'Invalid source record');
      return getRacionRecipe(id);
    });
    const result = await recommendRacionFromFridge(search, { candidates, detail });
    expect(candidates).toHaveBeenCalledTimes(1);
    expect(detail.mock.calls.slice(0, 8).every(([id]) => id.startsWith('malformed_'))).toBe(true);
    expect(detail.mock.calls.length).toBeGreaterThan(8);
    expect(rankRacionRecipes(result.recipes, fixture.stock, null, profile).map(item => item.recipe.id))
      .toEqual(expect.arrayContaining(['side_buckwheat', 'side_rice_butter', 'vr_cloud_eggs']));
    expect(result.error).toBeNull();
  });

  it('preserves already verified dishes when the source rate-limits the next composition', async () => {
    const buckwheat = await getRacionRecipe('side_buckwheat');
    const rice = await getRacionRecipe('side_rice_butter');
    const limit = new RacionProviderError('rate_limit', 'Rate limited', { status: 429, retryAfterSeconds: 60 });
    const result = await recommendRacionFromFridge(search, {
      candidates: async () => ({ items: [buckwheat, rice], total: 2 }),
      detail: async id => { if (id === buckwheat.id) return buckwheat; throw limit; },
    });
    expect(result.recipes.map(recipe => recipe.id)).toContain('side_buckwheat');
    expect(result.error).toBe(limit);
    expect(result.truncated).toBe(true);
  });

  it('propagates cancellation instead of turning it into an empty successful search', async () => {
    const buckwheat = await getRacionRecipe('side_buckwheat');
    const controller = new AbortController();
    const pending = recommendRacionFromFridge({ ...search, signal: controller.signal }, {
      candidates: async () => ({ items: [buckwheat], total: 1 }),
      detail: async () => { controller.abort(); throw new DOMException('Cancelled', 'AbortError'); },
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('retains a candidate-service failure instead of claiming no recipe exists', async () => {
    const failure = new RacionProviderError('http', 'Proxy unavailable', { status: 502 });
    const result = await recommendRacionFromFridge(search, { candidates: async () => { throw failure; } });
    expect(result.error).toBe(failure);
    expect(result.recipes).toEqual([]);
    expect(result.truncated).toBe(true);
  });
});
