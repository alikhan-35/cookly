import type { UserProfile } from '../../types';
import { hasDislikedIngredient, isIngredientAllowed } from '../../utils/ingredients';
import { matchRacionIngredients } from './racionMatching';
import type { RacionRecipe } from './racion';

const clean = (value: string) => value.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');

/** Search seeds discover candidates; only the full ingredient list establishes a match. */
export function racionSearchSeeds(stock: readonly string[]): string[] {
  const names = [...new Map(stock.filter(name => /[а-яёa-z]/i.test(name)).map(name => [clean(name), name.trim()])).values()];
  const priority = (name: string) => /куриц|курин|говяд|индей|рыб|фарш|лосос|минтай|свинин/.test(clean(name)) ? 0
    : /рис|греч|макарон|карто|яйц|творог|овсян/.test(clean(name)) ? 1
    : /^(соль|перец|вода|масло|растительное масло|сахар|чеснок)$/u.test(clean(name)) ? 3 : 2;
  return names.filter(name => priority(name) < 3 && name.length <= 120)
    .sort((a, b) => priority(a) - priority(b)).slice(0, 8);
}

export function rankRacionRecipes(recipes: readonly RacionRecipe[], stock: readonly string[], maxTime: number | null, profile: UserProfile) {
  return recipes.filter(recipe => maxTime === null || (recipe.timeMinutes !== null && recipe.timeMinutes <= maxTime))
    .filter(recipe => recipe.ingredients.every(item => isIngredientAllowed(item.name, profile)))
    .map(recipe => ({ recipe, match: matchRacionIngredients(recipe.ingredients, stock), disliked: hasDislikedIngredient(recipe.ingredients.map(item => item.name), profile) }))
    .filter(item => item.match.matchedCount > 0)
    .sort((a, b) => Number(a.disliked) - Number(b.disliked)
      || Number(b.match.fullyMatched) - Number(a.match.fullyMatched)
      || (a.match.totalCount - a.match.matchedCount) - (b.match.totalCount - b.match.matchedCount)
      || b.match.coverage - a.match.coverage
      || (a.recipe.timeMinutes ?? Infinity) - (b.recipe.timeMinutes ?? Infinity)
      || a.recipe.id.localeCompare(b.recipe.id, 'ru'));
}
