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
  it('keeps product cuts and oil varieties in search labels and prioritizes defining foods', () => {
    expect(racionSearchSeeds(['Лук', 'Соль', 'Куриное филе', 'Рис', 'Оливковое масло', 'Куриное филе']))
      .toEqual(['Куриное филе', 'Рис', 'Лук', 'Оливковое масло']);
    expect(racionSearchSeeds(['Соль', 'Вода', 'Растительное масло'])).toEqual([]);
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
      recipe('unknown', ['Рис', 'Продукт без словаря']),
      recipe('salt_missing', ['Рис', 'Соль']),
      recipe('full', ['Рис']),
    ], ['Рис'], null, profile);
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
});
