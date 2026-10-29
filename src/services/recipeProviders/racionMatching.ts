import { classifyRacionIngredient } from './racionCompatibility';
import { resolveIngredient } from '../../catalog/ingredients';
import { isPantryStaple, type MatchingOptions } from '../../utils/matchingPolicy';
import { matchingProductKey } from '../../utils/pantryProducts';
import type { RacionRecipeIngredient } from './racion';

export interface RacionIngredientMatch {
  /** Original source rows, including repeated positions; only actual stock. */
  available: RacionRecipeIngredient[];
  /** Absent whitelist staples ignored by the current policy, never labelled present. */
  assumedPantry: RacionRecipeIngredient[];
  compatible: RacionRecipeIngredient[];
  compatibleCount: number;
  missing: RacionRecipeIngredient[];
  unknown: RacionRecipeIngredient[];
  /** Unique actual matches among requirements counted by the current policy. */
  matchedCount: number;
  totalCount: number;
  missingCount: number;
  unknownCount: number;
  /** Unique actual non-pantry matches, independent of the current policy. */
  meaningfulMatchedCount: number;
  coverage: number;
  fullyMatched: boolean;
}

/** Presence only: source IDs, amounts and pantry flags never prove availability. */
export function matchRacionIngredients(
  ingredients: readonly RacionRecipeIngredient[],
  availableNames: readonly string[],
  options: MatchingOptions = {},
): RacionIngredientMatch {
  const assumePantryStaples = options.assumePantryStaples !== false;
  const compatible: RacionRecipeIngredient[] = [];
  const compatibleKeys = new Set<string>();
  const available: RacionRecipeIngredient[] = [];
  const assumedPantry: RacionRecipeIngredient[] = [];
  const missing: RacionRecipeIngredient[] = [];
  const unknown: RacionRecipeIngredient[] = [];
  const countedKeys = new Set<string>();
  const matchedKeys = new Set<string>();
  const missingKeys = new Set<string>();
  const unknownKeys = new Set<string>();
  const meaningfulKeys = new Set<string>();

  for (const ingredient of ingredients) {
    const key = matchingProductKey(ingredient.name);
    const pantry = isPantryStaple(ingredient.name);
    const classification = classifyRacionIngredient(ingredient, availableNames);
    const present = classification === 'exact';
    const possible = classification === 'compatible';
    const counted = !assumePantryStaples || !pantry;
    if (counted) countedKeys.add(key);
    if (present || possible) {
      if (present) available.push(ingredient);
      else { compatible.push(ingredient); compatibleKeys.add(key); }
      if (counted) matchedKeys.add(key);
      if (!pantry) meaningfulKeys.add(key);
    } else if (assumePantryStaples && pantry) {
      assumedPantry.push(ingredient);
    } else if (resolveIngredient(ingredient.name) || pantry) {
      missing.push(ingredient);
      missingKeys.add(key);
    } else {
      unknown.push(ingredient);
      unknownKeys.add(key);
    }
  }

  const totalCount = countedKeys.size;
  const matchedCount = matchedKeys.size;
  const meaningfulMatchedCount = meaningfulKeys.size;
  return {
    available, assumedPantry, compatible, compatibleCount: compatibleKeys.size, missing, unknown,
    matchedCount, totalCount, missingCount: missingKeys.size, unknownCount: unknownKeys.size,
    meaningfulMatchedCount,
    coverage: totalCount ? matchedCount / totalCount : 0,
    fullyMatched: compatibleKeys.size === 0 && meaningfulMatchedCount > 0 && totalCount > 0 && matchedCount === totalCount,
  };
}
