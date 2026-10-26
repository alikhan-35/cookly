import { useMemo } from 'react';
import { useFridge } from './useFridge';
import { usePantry } from './usePantry';
import { uniquePantryProducts } from '../utils/pantryProducts';

/** On a recipe, replacements may use either saved stock or the current search. */
export function useAvailableIngredients() {
  const { ingredients } = usePantry();
  const { usableNames } = useFridge();
  return useMemo(() => uniquePantryProducts([...ingredients, ...usableNames]), [ingredients, usableNames]);
}
