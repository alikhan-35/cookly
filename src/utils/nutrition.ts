import type { Nutrition, Recipe } from '../types';

/** Recipe nutrition describes the approximate total for its base batch. */
export function getNutrition(recipe: Recipe, servings: number, mode: 'serving' | 'total'): Nutrition {
  const base = Number.isFinite(recipe.baseServings) && recipe.baseServings > 0
    ? recipe.baseServings
    : Number.isFinite(recipe.servings) && recipe.servings > 0 ? recipe.servings : 1;
  const selected = Number.isFinite(servings) && servings > 0 ? servings : base;
  const factor = mode === 'serving' ? 1 / base : selected / base;
  const scale = (value: number, decimals: number): number =>
    Number.isFinite(value) && value >= 0 && Number.isFinite(value * factor)
      ? Number((value * factor).toFixed(decimals)) : 0;
  return {
    calories: scale(recipe.nutrition.calories, 0),
    protein: scale(recipe.nutrition.protein, 1),
    fat: scale(recipe.nutrition.fat, 1),
    carbs: scale(recipe.nutrition.carbs, 1),
  };
}
