import { useMemo } from 'react';
import { useFridge } from './useFridge';
import { usePantry } from './usePantry';
import { normalizeIngredient } from '../utils/ingredients';

/** On a recipe, replacements may use either saved stock or the current search. */
export function useAvailableIngredients() {
  const { ingredients } = usePantry();
  const { usableNames } = useFridge();
  return useMemo(() => [...new Set([...ingredients, ...usableNames].map(normalizeIngredient))], [ingredients, usableNames]);
}
