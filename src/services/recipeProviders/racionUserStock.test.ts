import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../types';
import userStockFixture from './__fixtures__/racion-user-stock.json';
import { getRacionRecipe, type RacionRecipe } from './racion';
import { matchRacionIngredients } from './racionMatching';
import { rankRacionRecipes } from './racionRecommendations';
import { recommendRacionFromFridge } from './racionFridgeSearch';

const stock = userStockFixture.stock;
const profile: UserProfile = {
  familySize: 2, hasChildren: false, dislikes: [], allergies: [],
  dietary: 'Без ограничений', difficulty: 'Любые',
};

/** Actual API records, including the source's overbroad pantry flags. */
async function loadSourceRecipes(): Promise<RacionRecipe[]> {
  return Promise.all(userStockFixture.records.map(record => getRacionRecipe(record.recipe.id)));
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const id = url.pathname.split('/').at(-1);
    const record = userStockFixture.records.find(item => item.recipe.id === id);
    if (!record) throw new Error(`Unexpected live request in regression: ${url.pathname}`);
    return new Response(JSON.stringify(record.recipe), {
      status: record.status, headers: { 'Content-Type': 'application/json' },
    });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('real Racion recipes for the reported Cookly fridge', () => {
  it('finds dishes in one automatic whole-fridge search without asking the user to continue a batch', async () => {
    const sourceRecipes = await loadSourceRecipes();
    const candidates = vi.fn(async (_options: { stock: readonly string[]; signal?: AbortSignal }) => ({
      items: sourceRecipes, total: sourceRecipes.length,
    }));
    const detail = vi.fn(getRacionRecipe);
    const progress = vi.fn();
    const result = await recommendRacionFromFridge({ stock, maxTime: null, profile, onProgress: progress }, { candidates, detail });
    const ranked = rankRacionRecipes(result.recipes, stock, null, profile);
    expect(candidates).toHaveBeenCalledTimes(1);
    expect(candidates.mock.calls[0][0].stock).toEqual(stock);
    expect(ranked.map(item => item.recipe.id)).toEqual(expect.arrayContaining([
      'side_buckwheat', 'side_rice_butter', 'vr_cloud_eggs', 'buckwheat_egg_breakfast', 'salmon_rice',
    ]));
    expect(result.error).toBeNull();
    expect(result.totalCandidates).toBe(8);
    expect(result.checked).toBeGreaterThanOrEqual(5);
    expect(progress).toHaveBeenCalled();
  });

  it('finds real dishes from the exact user stock through the real API adapter and matcher', async () => {
    const recipes = await loadSourceRecipes();
    const ranked = rankRacionRecipes(recipes, stock, null, profile);
    expect(ranked.map(item => item.recipe.id)).toEqual(expect.arrayContaining([
      'side_buckwheat', 'side_rice_butter', 'buckwheat_egg_breakfast',
    ]));
    expect(ranked.length).toBeGreaterThanOrEqual(3);
    expect(ranked.find(item => item.recipe.id === 'side_buckwheat')?.match.fullyMatched).toBe(true);
  });

  it('keeps the missing fresh green onion visible rather than assuming it is a spice', async () => {
    const recipe = await getRacionRecipe('buckwheat_egg_breakfast');
    const match = matchRacionIngredients(recipe.ingredients, stock);
    expect(match.fullyMatched).toBe(false);
    expect([...match.missing, ...match.unknown].map(item => item.name)).toEqual(['Лук зелёный']);
    expect(match.assumedPantry.map(item => item.name)).toContain('Соль');
    expect(rankRacionRecipes([recipe], stock, null, profile)).toHaveLength(1);
  });

  it('offers the real egg-and-cheese dish with a cheese-type check instead of silently claiming the exact cheese is present', async () => {
    const recipe = await getRacionRecipe('vr_cloud_eggs');
    const match = matchRacionIngredients(recipe.ingredients, stock);
    expect(match.compatible.map(item => item.name)).toContain('Сыр твёрдый');
    expect(match.available.map(item => item.name)).not.toContain('Сыр твёрдый');
    expect(match.compatibleCount).toBeGreaterThanOrEqual(1);
    expect(match.fullyMatched).toBe(false);
    expect(rankRacionRecipes([recipe], stock, null, profile)).toHaveLength(1);
  });

  it('offers the real salmon dish while requiring fish-part confirmation and showing broccoli and lemon as absent', async () => {
    const recipe = await getRacionRecipe('salmon_rice');
    const match = matchRacionIngredients(recipe.ingredients, stock);
    expect(match.compatible.map(item => item.name)).toContain('Филе лосося');
    expect(match.available.map(item => item.name)).not.toContain('Филе лосося');
    expect(new Set([...match.missing, ...match.unknown].map(item => item.name))).toEqual(new Set(['Брокколи (заморозка)', 'Лимон']));
    expect(match.fullyMatched).toBe(false);
    expect(rankRacionRecipes([recipe], stock, null, profile)).toHaveLength(1);
  });

  it('does not turn flour, starch or breadcrumbs into available products because the source calls them pantry', async () => {
    const recipe = await getRacionRecipe('ok_potato_dumplings');
    expect(recipe.ingredients.find(item => item.ingredientId === 'flour')?.pantry).toBe(true);
    expect(recipe.ingredients.find(item => item.ingredientId === 'starch')?.pantry).toBe(true);
    const match = matchRacionIngredients(recipe.ingredients, stock);
    const missingNames = [...match.missing, ...match.unknown].map(item => item.name);
    expect(missingNames).toEqual(expect.arrayContaining(['Крахмал', 'Мука пшеничная', 'Сухари панировочные']));
    expect(match.assumedPantry.map(item => item.name)).not.toEqual(expect.arrayContaining(['Крахмал', 'Мука пшеничная']));
    expect(match.fullyMatched).toBe(false);
  });

  it('shows a missing starch requirement in the real oven-fries recipe', async () => {
    const recipe = await getRacionRecipe('fries_oven');
    const match = matchRacionIngredients(recipe.ingredients, stock);
    expect(match.fullyMatched).toBe(false);
    expect([...match.missing, ...match.unknown].map(item => item.name)).toEqual(['Крахмал']);
    expect(match.assumedPantry.map(item => item.name)).toEqual(expect.arrayContaining(['Масло подсолнечное', 'Соль', 'Паприка']));
  });

  it('keeps salt required when the user switches off pantry assumptions', async () => {
    const recipe = await getRacionRecipe('side_buckwheat');
    const match = matchRacionIngredients(recipe.ingredients, stock, { assumePantryStaples: false });
    expect(match.fullyMatched).toBe(false);
    expect(match.missing.map(item => item.name)).toEqual(['Соль']);
    expect(match.assumedPantry).toEqual([]);
  });

  it('still filters egg allergies against the complete real ingredient lists', async () => {
    const recipes = await loadSourceRecipes();
    const ranked = rankRacionRecipes(recipes, stock, null, { ...profile, allergies: ['Яйца'] });
    const ids = ranked.map(item => item.recipe.id);
    expect(ids).not.toContain('vr_cloud_eggs');
    expect(ids).not.toContain('buckwheat_egg_breakfast');
    expect(ids).not.toContain('kd_potato_smiles');
    expect(ids).toContain('side_buckwheat');
  });

  it('preserves source quantities, names and instructions instead of manufacturing an easy recipe', async () => {
    const recipe = await getRacionRecipe('salmon_rice');
    const source = userStockFixture.records.find(item => item.recipe.id === 'salmon_rice')!.recipe;
    expect(recipe.ingredients.map(({ ingredientId, name, amount, unit, pantry }) => ({ ingredientId, name, amount, unit, pantry })))
      .toEqual(source.ingredients.map(({ ingredientId, name, amount, unit, pantry }) => ({ ingredientId, name, amount, unit, pantry })));
    expect(recipe.steps).toEqual(source.steps);
    expect(recipe.title).toBe(source.title);
    expect(recipe.sourceUrl).toBe('https://racion.app/recipe/salmon_rice');
  });
});
