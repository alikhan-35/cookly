import type { Recipe } from '../types';

/** Quantities live in the scaled ingredient list; times and temperatures stay unchanged. */
export function getRecipeSteps(recipe: Recipe, _servings: number): string[] {
  return [...recipe.steps];
}
