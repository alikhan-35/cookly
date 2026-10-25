import { resolveIngredient } from '../../catalog/ingredients';
import type { RacionRecipeIngredient } from './racion';

export interface RacionIngredientMatch {
  available: RacionRecipeIngredient[];
  missing: RacionRecipeIngredient[];
  unknown: RacionRecipeIngredient[];
  matchedCount: number;
  /** Every source position, including unknown and repeated ingredients. */
  totalCount: number;
  coverage: number;
  fullyMatched: boolean;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/gu, ' ');
}

/**
 * Presence only. The provider's IDs, amounts, units and pantry labels remain facts
 * from Racion; they are neither Cookly IDs nor evidence that an item is available.
 * Unrecognized equal Russian labels may match exactly, without fuzzy matching.
 */
export function matchRacionIngredients(
  ingredients: readonly RacionRecipeIngredient[],
  availableNames: readonly string[],
): RacionIngredientMatch {
  const names = new Set(availableNames.map(normalizeName).filter(Boolean));
  const canonicalIds = new Set(availableNames.map(name => resolveIngredient(name)?.id)
    .filter((id): id is string => Boolean(id)));
  const available: RacionRecipeIngredient[] = [];
  const missing: RacionRecipeIngredient[] = [];
  const unknown: RacionRecipeIngredient[] = [];

  for (const ingredient of ingredients) {
    const normalized = normalizeName(ingredient.name);
    const identity = resolveIngredient(ingredient.name);
    if ((/[а-я]/u.test(normalized) && names.has(normalized)) || (identity && canonicalIds.has(identity.id))) {
      available.push(ingredient);
    } else if (identity) {
      missing.push(ingredient);
    } else {
      unknown.push(ingredient);
    }
  }

  const totalCount = ingredients.length;
  return {
    available, missing, unknown,
    matchedCount: available.length,
    totalCount,
    coverage: totalCount ? available.length / totalCount : 0,
    fullyMatched: totalCount > 0 && available.length === totalCount,
  };
}
