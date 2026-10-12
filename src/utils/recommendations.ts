import type { Ingredient, Recipe, RecipeFeedback, RecipeMatch, UserProfile } from '../types';
import { hasDislikedIngredient, isIngredientAllowed, isPantryStaple, normalizeIngredient } from './ingredients';
import { getSubstitutionOptions } from './substitutions';

const MAIN_INGREDIENT_WEIGHT = 3;

export function isRecipeAllowed(recipe: Recipe, profile?: UserProfile): boolean {
  // Check optional ingredients too: neither omitted garnish nor an offered replacement
  // makes an originally incompatible recipe safe to recommend or open silently.
  return recipe.ingredients.every((ingredient) => isIngredientAllowed(ingredient.name, profile));
}

function latestFeedback(recipeId: string, feedback: RecipeFeedback[]): RecipeFeedback | undefined {
  return feedback.filter((item) => item.recipeId === recipeId && typeof item.liked === 'boolean')
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0) || Number(a.liked) - Number(b.liked))[0];
}

const staple = (ingredient: Ingredient) => ingredient.isPantryStaple || isPantryStaple(ingredient.name);

/** A duplicate/alias in recipe data must not inflate the match count. */
function uniqueIngredients(ingredients: Ingredient[]): Ingredient[] {
  const result = new Map<string, Ingredient>();
  for (const ingredient of ingredients) {
    const key = normalizeIngredient(ingredient.name);
    if (!key) continue;
    const previous = result.get(key);
    if (!previous) {
      result.set(key, ingredient);
    } else {
      const required = previous.optional && !ingredient.optional ? ingredient : previous;
      result.set(key, { ...required, main: Boolean(previous.main || ingredient.main) });
    }
  }
  return [...result.values()];
}

export function matchRecipe(recipe: Recipe, available: string[], profile?: UserProfile, feedback: RecipeFeedback[] = []): RecipeMatch {
  const pantry = new Set(available.map(normalizeIngredient).filter(Boolean));
  const ingredients = uniqueIngredients(recipe.ingredients);
  const optional = ingredients.filter((ingredient) => ingredient.optional);
  const required = ingredients.filter((ingredient) => !ingredient.optional);
  const meaningful = required.filter((ingredient) => !staple(ingredient));
  const hasIngredient = (ingredient: Ingredient) => pantry.has(normalizeIngredient(ingredient.name));
  const matched = meaningful.filter(hasIngredient);
  const missing = meaningful.filter((ingredient) => !hasIngredient(ingredient));
  const present = required.filter((ingredient) => staple(ingredient) || hasIngredient(ingredient));
  const requiredCount = meaningful.length;
  const matchedCount = matched.length;
  const coverage = requiredCount ? matchedCount / requiredCount : 0;
  const weight = (ingredient: Ingredient) => ingredient.main ? MAIN_INGREDIENT_WEIGHT : 1;
  const totalWeight = meaningful.reduce((sum, ingredient) => sum + weight(ingredient), 0);
  const matchedWeight = matched.reduce((sum, ingredient) => sum + weight(ingredient), 0);
  const weightedCoverage = totalWeight ? matchedWeight / totalWeight : 0;
  const mainIngredients = meaningful.filter((ingredient) => ingredient.main);
  const missingAllMain = mainIngredients.length > 0 && !mainIngredients.some(hasIngredient);
  const substitutions = missing.flatMap((original) => {
    const option = getSubstitutionOptions(recipe, original, available, profile).find((item) => item.available);
    return option ? [{ original: original.name, replacement: option.label }] : [];
  });
  const disliked = hasDislikedIngredient(ingredients.map(({ name }) => name), profile);
  const exactFeedback = latestFeedback(recipe.id, feedback);

  // The 1,000-point tiers guarantee the requested 0 → 1 → 2 → other missing order.
  // Inside each tier, defining ingredients matter more than garnish or supporting items.
  const missingTier = Math.min(missing.length, 3);
  const isSpicy = ingredients.some(({ name }) => /чили|острый перец|аджик/.test(normalizeIngredient(name))) || recipe.tags.some((tag) => /остр/.test(tag.toLocaleLowerCase('ru-RU')));
  const profileBonus = profile?.hasChildren ? (isSpicy ? -55 : recipe.difficulty === 'Легко' ? 18 : 0) : 0;
  const difficultyPenalty = profile?.difficulty === 'Простые блюда' && recipe.difficulty !== 'Легко' ? 65 : 0;
  const score = (4 - missingTier) * 1_000
    + weightedCoverage * 100
    + coverage * 20
    + Math.min(substitutions.length, 3) * 16
    + profileBonus
    + (exactFeedback?.liked ? 45 : 0)
    - (exactFeedback && !exactFeedback.liked ? 180 : 0)
    - (disliked ? 100 : 0)
    - difficultyPenalty
    - (missingAllMain ? 80 : 0)
    - Math.max(0, missing.length - 2) * 5;

  return { recipe, available: present, missing, optional, matchedCount, requiredCount, coverage, score, substitutionCount: substitutions.length, substitutions, profileFit: !disliked && isRecipeAllowed(recipe, profile) && difficultyPenalty === 0 && !(profile?.hasChildren && isSpicy) };
}

export function recommendRecipes(
  recipes: Recipe[],
  available: string[],
  maxTime: number | null,
  limit = 5,
  profile?: UserProfile,
  feedback: RecipeFeedback[] = [],
): RecipeMatch[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const likedCategories = new Set(recipes.filter((recipe) => latestFeedback(recipe.id, feedback)?.liked).map((recipe) => recipe.category));
  const deprioritized = (recipe: Recipe) => Number(latestFeedback(recipe.id, feedback)?.liked === false || hasDislikedIngredient(recipe.ingredients.map(({ name }) => name), profile));
  const missingTier = (match: RecipeMatch) => Math.min(match.missing.length, 3);
  const candidates = recipes
    .filter((recipe) => maxTime === null || recipe.cookingTime <= maxTime)
    .filter((recipe) => isRecipeAllowed(recipe, profile))
    .map((recipe) => { const match = matchRecipe(recipe, available, profile, feedback); if (likedCategories.has(recipe.category)) match.score += 18; return match; })
    .filter((match) => match.matchedCount > 0)
    .sort((a, b) => (
      deprioritized(a.recipe) - deprioritized(b.recipe)
      || missingTier(a) - missingTier(b)
      || b.score - a.score
      || b.matchedCount - a.matchedCount
      || a.recipe.cookingTime - b.recipe.cookingTime
      || a.recipe.id.localeCompare(b.recipe.id, 'ru')
    ));

  // Among similarly relevant dishes diversify category/visual, without crossing a
  // preference group or missing-ingredient tier. No randomness or stale history.
  const result: RecipeMatch[] = [];
  while (candidates.length && result.length < Math.floor(limit)) {
    const best = candidates[0];
    const nearTies = candidates.filter((candidate) => deprioritized(candidate.recipe) === deprioritized(best.recipe)
      && missingTier(candidate) === missingTier(best)
      && best.score - candidate.score <= 35);
    const diversityScore = (candidate: RecipeMatch) => candidate.score
      - result.filter((previous) => previous.recipe.visual === candidate.recipe.visual).length * 18
      - result.filter((previous) => previous.recipe.category === candidate.recipe.category).length * 10;
    const chosen = nearTies.reduce((winner, candidate) => diversityScore(candidate) > diversityScore(winner) ? candidate : winner, best);
    result.push(chosen);
    candidates.splice(candidates.indexOf(chosen), 1);
  }
  return result;
}
