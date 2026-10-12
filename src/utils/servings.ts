import type { Ingredient } from '../types';
import { normalizeIngredient } from './ingredients';

function validServings(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function roundedAmount(amount: number, unit: string): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  // Keep small seasoning amounts positive and vegetables divisible into fractions.
  if (amount < 0.01) return Number(amount.toPrecision(2));
  const decimals = /^(г|мл)$/.test(unit.trim()) && amount >= 10 ? 0 : 2;
  return Number(amount.toFixed(decimals));
}

export function scaleIngredient(ingredient: Ingredient, fromServings: number, toServings: number): Ingredient {
  const base = validServings(fromServings, 1);
  const requested = validServings(toServings, base);
  const ratio = requested / base;
  const factor = Number.isFinite(ratio) ? ratio : 1;
  const scaled = ingredient.amount * factor;
  const unit = ingredient.unit.toLocaleLowerCase('ru-RU');
  const wholeEggs = (normalizeIngredient(ingredient.name) === 'яйца' && unit.includes('шт'))
    || /яйц|яиц/.test(unit);
  const amount = wholeEggs && Number.isFinite(scaled) && scaled > 0
    ? Math.ceil(scaled)
    : roundedAmount(scaled, unit);
  return { ...ingredient, amount };
}

export function scaledIngredients(ingredients: Ingredient[], fromServings: number, toServings: number): Ingredient[] {
  return ingredients.map(item => scaleIngredient(item, fromServings, toServings));
}

/** Public API uses selected servings first, followed by the recipe's base servings. */
export function scaleIngredients(ingredients: Ingredient[], servings: number, baseServings: number): Ingredient[] {
  return scaledIngredients(ingredients, baseServings, servings);
}

export function servingsLabel(value: number): string {
  const count = Math.abs(value);
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = !Number.isInteger(count) ? 'порции'
    : lastTwo >= 11 && lastTwo <= 14 ? 'порций'
      : last === 1 ? 'порция' : last >= 2 && last <= 4 ? 'порции' : 'порций';
  return `${value} ${noun}`;
}
export function servingsKey(recipeId: string) { return `cookly:servings:${recipeId}`; }
