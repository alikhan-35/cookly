import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../types';
import type { RacionRecipe } from './racion';
import { racionSearchSeeds, rankRacionRecipes } from './racionRecommendations';

const profile: UserProfile = { familySize: 2, hasChildren: false, dislikes: [], allergies: [], dietary: 'Без ограничений', difficulty: 'Любые' };
const recipe = (id: string, names: string[], timeMinutes: number | null = 20): RacionRecipe => ({
  id, title: id, slot: 'lunch', timeMinutes, caloriesPerPortion: null,
  sourceUrl: `https://racion.app/recipe/${id}`, imageUrl: null, description: null, tags: [],
  ingredients: names.map((name, index) => ({ ingredientId: `item_${index}`, name, amount: null, unit: 'g', pantry: false })),
  steps: ['Приготовьте по инструкции.'], nutrition: { calories: null, protein: null, fat: null, carbs: null },
});

describe('Racion discovery and confirmed ingredient ranking', () => {
  it('keeps product cuts in search labels and never searches using only pantry spices or oil', () => {
    expect(racionSearchSeeds(['Лук', 'Соль', 'Куриное филе', 'Рис', 'Оливковое масло', 'Куриное филе']))
      .toEqual(['Куриное филе', 'Рис', 'Лук']);
    expect(racionSearchSeeds(['Соль', 'Вода', 'Растительное масло'])).toEqual([]);
    expect(racionSearchSeeds(['Перец', 'Зира', 'Сушеный базилик', 'Оливковое масло', 'Гарам масала'])).toEqual([]);
    expect(racionSearchSeeds(['Специи', 'Приправа для плова', 'Карри', 'Гарам-масала', 'Масло'])).toEqual([]);
  });
  it('never turns a title search or whole chicken into an available chicken fillet', () => {
    expect(rankRacionRecipes([recipe('fillet', ['Куриное филе'])], ['Курица'], null, profile)).toEqual([]);
  });
  it('recognizes the explicit Russian buckwheat aliases without changing the source ingredient', () => {
    const meal = recipe('buckwheat', ['Гречка']);
    const result = rankRacionRecipes([meal], ['Гречневая крупа'], null, profile);
    expect(result[0].match.fullyMatched).toBe(true);
    expect(meal.ingredients[0].name).toBe('Гречка');
  });
  it('ranks confirmed full stock before incomplete or unknown ingredients without assuming pantry', () => {
    const ranked = rankRacionRecipes([
      recipe('unknown', ['Рис', 'Лук', 'Продукт без словаря']),
      recipe('salt_missing', ['Рис', 'Лук', 'Соль']),
      recipe('full', ['Рис']),
    ], ['Рис', 'Лук'], null, profile, { assumePantryStaples: false });
    expect(ranked[0].recipe.id).toBe('full');
    expect(ranked[0].match.fullyMatched).toBe(true);
    expect(ranked.find(item => item.recipe.id === 'unknown')?.match.unknown).toHaveLength(1);
    expect(ranked.find(item => item.recipe.id === 'salt_missing')?.match.fullyMatched).toBe(false);
  });
  it('applies allergies and dietary exclusions to full original ingredient names', () => {
    const meals = [recipe('milk', ['Рис', 'Молоко']), recipe('meat', ['Рис', 'Говядина']), recipe('plain', ['Рис'])];
    expect(rankRacionRecipes(meals, ['Рис'], null, { ...profile, allergies: ['Молоко'], dietary: 'Вегетарианское' }).map(item => item.recipe.id)).toEqual(['plain']);
  });
  it('does not invent a cooking time to pass a time limit', () => {
    const meals = [recipe('unknown_time', ['Рис'], null), recipe('long', ['Рис'], 60), recipe('quick', ['Рис'], 20)];
    expect(rankRacionRecipes(meals, ['Рис'], 30, profile).map(item => item.recipe.id)).toEqual(['quick']);
    expect(rankRacionRecipes(meals, ['Рис'], null, profile)).toHaveLength(3);
  });

  it.each([true, false])('never recommends food from a salt/spice-only match when assumption=%s', assumePantryStaples => {
    const meals = [recipe('rice', ['Рис', 'Соль']), recipe('spices', ['Перец', 'Вода'])];
    expect(rankRacionRecipes(meals, ['Соль', 'Перец'], null, profile, { assumePantryStaples })).toEqual([]);
  });

  it('does not recommend a meat/rice/potato recipe merely because onion and carrot are present', () => {
    const meals = [
      recipe('meat', ['Куриное филе', 'Лук', 'Морковь']),
      recipe('rice', ['Рис', 'Лук', 'Морковь']),
      recipe('potato', ['Картофель', 'Лук', 'Морковь']),
      recipe('salad', ['Морковь', 'Лук', 'Огурцы']),
    ];
    expect(rankRacionRecipes(meals, ['Лук', 'Морковь'], null, profile).map(item => item.recipe.id)).toEqual(['salad']);
  });

  it('uses the shared pantry policy for full matches while preserving all source ingredient rows', () => {
    const meal = recipe('rice', ['Рис', 'Соль', 'Оливковое масло']);
    const result = rankRacionRecipes([meal], ['Рис'], null, profile);
    expect(result[0].match).toMatchObject({ fullyMatched: true, totalCount: 1, matchedCount: 1 });
    expect(result[0].match.assumedPantry).toHaveLength(2);
    expect(result[0].recipe.ingredients).toBe(meal.ingredients);
    expect(rankRacionRecipes([meal], ['Рис'], null, profile, { assumePantryStaples: false })).toEqual([]);
  });

  it('checks allergies against ignored spices before applying pantry assumptions', () => {
    const meals = [recipe('garlic', ['Рис', 'Сушеный чеснок']), recipe('plain', ['Рис', 'Соль'])];
    expect(rankRacionRecipes(meals, ['Рис'], null, { ...profile, allergies: ['Чеснок'] }).map(item => item.recipe.id)).toEqual(['plain']);
  });

  it('does not let duplicated ingredient positions inflate coverage or ranking', () => {
    const meals = [recipe('duplicate', ['Рис', 'Рис', 'Куриное филе']), recipe('complete', ['Рис'])];
    const result = rankRacionRecipes(meals, ['Рис'], null, profile);
    expect(result.map(item => item.recipe.id)).toEqual(['complete']);
  });

  it('rejects 1/7 and 2/7 matches even when a matched product is substantial', () => {
    const meal = recipe('weak', ['Рис', 'Лук', 'Морковь', 'Сыр', 'Сметана', 'Помидоры', 'Огурцы']);
    expect(rankRacionRecipes([meal], ['Рис'], null, profile)).toEqual([]);
    expect(rankRacionRecipes([meal], ['Рис', 'Лук'], null, profile)).toEqual([]);
  });

  it('requires meat or fish despite adequate side-dish coverage', () => {
    const meals = [recipe('beef', ['Говядина', 'Рис', 'Лук', 'Морковь']), recipe('fish', ['Минтай', 'Картофель', 'Лук', 'Сметана'])];
    expect(rankRacionRecipes(meals, ['Рис', 'Лук', 'Морковь', 'Картофель', 'Сметана'], null, profile)).toEqual([]);
  });

  it('keeps complete and close incomplete recipes in one feed, complete first', () => {
    const meals = [recipe('needs_carrot', ['Рис', 'Лук', 'Морковь']), recipe('full', ['Рис', 'Лук'])];
    expect(rankRacionRecipes(meals, ['Рис', 'Лук'], null, profile).map(item => item.recipe.id)).toEqual(['full', 'needs_carrot']);
  });

  it('rotates discovery seeds across protein groups before another cut of the same protein', () => {
    expect(racionSearchSeeds(['Куриное филе', 'Куриное бедро', 'Говядина', 'Минтай', 'Рис']).slice(0, 4))
      .toEqual(['Куриное филе', 'Говядина', 'Минтай', 'Рис']);
  });

  it('interleaves similarly good proteins without promoting weaker matches', () => {
    const meals = [recipe('chicken1', ['Куриное филе']), recipe('chicken2', ['Куриное филе']), recipe('fish', ['Минтай']), recipe('beef', ['Говядина'])];
    const result = rankRacionRecipes(meals, ['Куриное филе', 'Минтай', 'Говядина'], null, profile);
    expect(result.slice(0, 3).map(item => item.family).sort()).toEqual(['beef', 'chicken', 'fish']);
  });

  it('does not classify chicken eggs as chicken meat', () => {
    const result = rankRacionRecipes([recipe('eggs', ['Яйца куриные', 'Рис', 'Помидоры', 'Лук'])], ['Рис', 'Помидоры', 'Лук'], null, profile);
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe('eggs');
  });
});
