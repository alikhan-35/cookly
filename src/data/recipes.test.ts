import { describe, expect, it } from 'vitest';
import { recipes } from './recipes';
import { getNutrition } from '../utils/nutrition';
import { getRecipeSteps } from '../utils/recipeSteps';
import { scaleIngredients } from '../utils/servings';

const originalIds = [
  'chicken-potato-skillet', 'chicken-tomato-cheese', 'potato-cheese-bake',
  'creamy-chicken-pasta', 'tomato-pasta', 'cheese-pasta', 'vegetable-rice',
  'chicken-pilaf', 'egg-fried-rice', 'cheese-omelet', 'shakshuka', 'syrniki',
  'chicken-soup', 'chicken-buckwheat', 'fried-potatoes-onion', 'vegetable-stew',
  'tomato-cucumber-salad', 'cabbage-carrot-salad', 'mince-tomato-pasta',
  'rice-meatballs', 'potato-egg-skillet', 'milk-pancakes', 'lentil-soup',
  'mushroom-buckwheat', 'zucchini-fritters', 'bean-tomato-salad', 'tuna-pasta',
  'fish-tomato-bake', 'cabbage-mince-stew', 'egg-cucumber-rice-salad',
];

describe('48-recipe collection', () => {
  it('adds exactly 18 distinct dishes while preserving every existing recipe link', () => {
    const ids = recipes.map(recipe => recipe.id);
    expect(ids).toHaveLength(48);
    expect(new Set(ids).size).toBe(48);
    expect(new Set(recipes.map(recipe => recipe.name)).size).toBe(48);
    for (const id of originalIds) expect(ids).toContain(id);
    expect(ids.filter(id => !originalIds.includes(id))).toHaveLength(18);
  });

  it('provides complete usable ingredients, steps and total base nutrition for every dish', () => {
    for (const recipe of recipes) {
      expect(recipe.servings, recipe.id).toBe(recipe.baseServings);
      expect(recipe.baseServings, recipe.id).toBeGreaterThan(0);
      expect(recipe.ingredients.length, recipe.id).toBeGreaterThanOrEqual(3);
      expect(recipe.ingredients.some(item => item.main), recipe.id).toBe(true);
      for (const item of recipe.ingredients) {
        expect(Number.isFinite(item.amount) && item.amount > 0, `${recipe.id}: ${item.name}`).toBe(true);
        if (['Соль', 'Перец', 'Растительное масло', 'Вода'].includes(item.name)) {
          expect(item.isPantryStaple, `${recipe.id}: ${item.name}`).toBe(true);
        }
      }
      expect(recipe.steps.length, recipe.id).toBeGreaterThanOrEqual(5);
      expect(recipe.steps.every(step => step.length > 40), recipe.id).toBe(true);
      expect(recipe.cookingTime, recipe.id).toBeGreaterThan(0);
      for (const value of Object.values(recipe.nutrition)) {
        expect(Number.isFinite(value) && value >= 0, recipe.id).toBe(true);
      }
      const person = getNutrition(recipe, recipe.baseServings, 'serving');
      expect(person.calories, recipe.id).toBeGreaterThan(70);
      expect(person.calories, recipe.id).toBeLessThan(1200);
      expect(getNutrition(recipe, recipe.baseServings, 'total'), recipe.id).toEqual(recipe.nutrition);
      // Estimates can differ slightly because carbohydrate includes fiber and labels round.
      const macroEnergy = recipe.nutrition.protein * 4 + recipe.nutrition.fat * 9 + recipe.nutrition.carbs * 4;
      expect(recipe.nutrition.calories / macroEnergy, recipe.id).toBeGreaterThan(0.75);
      expect(recipe.nutrition.calories / macroEnergy, recipe.id).toBeLessThan(1.25);
    }
  });

  it('keeps recipe instructions valid when portions change instead of repeating fixed quantities', () => {
    const fixedAmount = /\d+(?:[,.]\d+)?\s*(?:мл|кг|г|литр\w*|л|столов\w*\s+лож\w*|чайн\w*\s+лож\w*)(?=\s|[,.;])/u;
    for (const recipe of recipes) {
      expect(recipe.steps.some(step => fixedAmount.test(step)), recipe.id).toBe(false);
      for (const servings of [1, 2, 3, 4, 6]) {
        const scaled = scaleIngredients(recipe.ingredients, servings, recipe.baseServings);
        expect(scaled.every(item => item.amount > 0 && Number.isFinite(item.amount)), recipe.id).toBe(true);
        const eggs = scaled.find(item => item.name === 'Яйца');
        if (eggs) expect(Number.isInteger(eggs.amount), recipe.id).toBe(true);
        expect(getRecipeSteps(recipe, servings), recipe.id).toEqual(recipe.steps);
        expect(getNutrition(recipe, servings, 'serving'), recipe.id)
          .toEqual(getNutrition(recipe, recipe.baseServings, 'serving'));
      }
    }
  });

  it('preserves explicit doneness checks for raw chicken and turkey at every serving count', () => {
    for (const recipe of recipes.filter(item => item.ingredients.some(ingredient => ['Курица', 'Индейка'].includes(ingredient.name)))) {
      expect(getRecipeSteps(recipe, 6).some(step => step.includes('74 °C')), recipe.id).toBe(true);
    }
  });
});
