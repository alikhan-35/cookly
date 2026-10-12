import { describe, expect, it } from 'vitest';
import type { Ingredient, Recipe } from '../types';
import { getNutrition } from './nutrition';
import { getRecipeSteps } from './recipeSteps';
import { scaleIngredient, scaleIngredients, scaledIngredients, servingsKey, servingsLabel } from './servings';

const onion: Ingredient = { name: 'Лук', amount: 1, unit: 'шт.', main: true };
const dish: Recipe = {
  id: 'test', name: 'Тест', description: 'Блюдо для проверки порций',
  cookingTime: 20, difficulty: 'Легко', servings: 2, baseServings: 2,
  nutrition: { calories: 600, protein: 40, fat: 20, carbs: 65 },
  ingredients: [onion], category: 'На ужин', tags: [], visual: 'stew',
  steps: ['Разогрейте духовку до 200 °C.', 'Запекайте 15–20 минут, до готовности.'],
};

describe('ingredient scaling', () => {
  it('preserves half vegetables and accepts fractional servings', () => {
    expect(scaleIngredient(onion, 2, 1).amount).toBe(0.5);
    expect(scaleIngredient({ ...onion, amount: 0.5 }, 2, 2).amount).toBe(0.5);
    expect(scaleIngredient(onion, 2, 1.5).amount).toBe(0.75);
    expect(onion.amount).toBe(1);
  });

  it('rounds whole eggs up without applying that rule to eggs weighed in grams', () => {
    const eggs = { name: 'Куриные яйца', amount: 3, unit: 'шт.' };
    expect(scaleIngredient(eggs, 2, 1).amount).toBe(2);
    expect(scaleIngredient({ ...eggs, amount: 1 }, 2, 1).amount).toBe(1);
    expect(scaleIngredient({ ...eggs, amount: 15, unit: 'г' }, 2, 1).amount).toBe(7.5);
  });

  it('retains small seasoning quantities and rounds ordinary weights sensibly', () => {
    expect(scaleIngredient({ name: 'Соль', amount: 0.01, unit: 'ч. л.' }, 6, 1).amount).toBe(0.0017);
    expect(scaleIngredient({ name: 'Мука', amount: 100, unit: 'г' }, 3, 1).amount).toBe(33);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('defaults invalid selected servings %s to the base batch', value => {
    expect(scaleIngredient(onion, 2, value).amount).toBe(1);
    expect(scaleIngredient(onion, value, 2).amount).toBe(2);
    expect(scaleIngredient(onion, value, value).amount).toBe(1);
  });

  it('keeps both array APIs compatible without mutating ingredients', () => {
    const original = [onion];
    expect(scaleIngredients(original, 3, 2)).toEqual(scaledIngredients(original, 2, 3));
    expect(scaleIngredients(original, 3, 2)[0]).not.toBe(onion);
    expect(original).toEqual([onion]);
    expect(servingsKey('test')).toBe('cookly:servings:test');
  });

  it.each([[1, 'порция'], [2, 'порции'], [5, 'порций'], [11, 'порций'], [21, 'порция'], [22, 'порции']])('formats %s servings', (value, label) => {
    expect(servingsLabel(Number(value))).toBe(`${value} ${label}`);
  });
});

describe('nutrition scaling', () => {
  it('keeps per-person nutrition stable when the batch size changes', () => {
    const expected = { calories: 300, protein: 20, fat: 10, carbs: 32.5 };
    for (const servings of [1, 2, 3, 6]) expect(getNutrition(dish, servings, 'serving')).toEqual(expected);
  });

  it('scales total nutrition relative to base servings, independent of the display default', () => {
    expect(getNutrition({ ...dish, servings: 6 }, 3, 'total')).toEqual({ calories: 900, protein: 60, fat: 30, carbs: 97.5 });
    expect(getNutrition(dish, 1, 'total')).toEqual(getNutrition(dish, 6, 'serving'));
    expect(getNutrition(dish, 2, 'total')).toEqual(dish.nutrition);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('uses defaults for invalid servings %s', value => {
    expect(getNutrition(dish, value, 'total')).toEqual(dish.nutrition);
    expect(getNutrition({ ...dish, baseServings: value }, 2, 'total')).toEqual(dish.nutrition);
    expect(getNutrition({ ...dish, baseServings: value, servings: value }, value, 'total')).toEqual(dish.nutrition);
  });
});

describe('cooking steps', () => {
  it('keeps instructions, times, and temperatures consistent for every serving count', () => {
    for (const servings of [1, 2, 6, 0, Number.NaN]) expect(getRecipeSteps(dish, servings)).toEqual(dish.steps);
    const steps = getRecipeSteps(dish, 6);
    expect(steps).not.toBe(dish.steps);
    steps[0] = 'Изменённый шаг';
    expect(dish.steps[0]).toBe('Разогрейте духовку до 200 °C.');
  });
});
