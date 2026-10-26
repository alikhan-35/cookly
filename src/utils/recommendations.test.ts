import { describe, expect, it } from 'vitest';
import type { Ingredient, Recipe, UserProfile } from '../types';
import { recipes } from '../data/recipes';
import { displayIngredient, isPantryStaple, normalizeIngredient } from './ingredients';
import { isRecipeAllowed, matchRecipe, recommendRecipes } from './recommendations';

const ingredient = (name: string, options: Partial<Ingredient> = {}): Ingredient => ({
  name, amount: 1, unit: 'шт.', ...options,
});

function recipe(id: string, ingredients: Ingredient[], cookingTime = 20): Recipe {
  return {
    source: 'local',
    id, name: id, description: 'Тестовый рецепт', cookingTime, difficulty: 'Легко',
    servings: 2, baseServings: 2, nutrition: { calories: 800, protein: 50, fat: 30, carbs: 70 }, ingredients, steps: ['Приготовьте ингредиенты.'], category: 'Обед', tags: [], visual: 'chicken',
  };
}

describe('ingredient normalization', () => {
  it.each([
    ['  КУРИНОЕ   ФИЛЕ  ', 'курица'],
    ['Яйцо', 'яйца'],
    ['Картошка', 'картофель'],
    ['Томат', 'помидоры'],
    ['ТЁРТЫЙ СЫР.', 'сыр'],
    ['Спагетти', 'макароны'],
    ['Свежая   руккола', 'свежая руккола'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeIngredient(input)).toBe(expected);
  });

  it('formats display labels and preserves meaningful distinctions', () => {
    expect(displayIngredient(' картошка ')).toBe('Картофель');
    expect(normalizeIngredient('томатная паста')).not.toBe(normalizeIngredient('помидоры'));
    expect(normalizeIngredient('зеленый лук')).not.toBe(normalizeIngredient('лук'));
    expect(isPantryStaple('Оливковое масло')).toBe(true);
    expect(isPantryStaple('Сливочное масло')).toBe(false);
  });
});

const familyProfile: UserProfile = { familySize: 3, hasChildren: true, dislikes: ['Грибы'], allergies: [], dietary: 'Без ограничений', difficulty: 'Любые' };

describe('personalized recommendations', () => {
  it('keeps original counts when an available safe replacement exists', () => {
    const dish = recipe('cream-sauce', [ingredient('Макароны', { main: true, amount: 200, unit: 'г' }), ingredient('Сливки', { amount: 100, unit: 'мл' })]);
    dish.steps = ['Смешайте макароны со сливочным соусом.'];
    const match = matchRecipe(dish, ['Макароны', 'Сметана']);
    expect(match.requiredCount).toBe(2);
    expect(match.matchedCount).toBe(1);
    expect(match.missing.map(({ name }) => name)).toEqual(['Сливки']);
    expect(match.substitutions).toEqual([{ original: 'Сливки', replacement: 'Сметана' }]);
  });

  it('never recommends an incompatible original even when a safe substitute is available', () => {
    const dish = recipe('butter-pasta', [ingredient('Макароны', { main: true }), ingredient('Сливочное масло')]);
    const profile = { ...familyProfile, allergies: ['Молоко'] };
    expect(isRecipeAllowed(dish, profile)).toBe(false);
    expect(recommendRecipes([dish], ['Макароны', 'Растительное масло'], null, 5, profile)).toEqual([]);
    const optionalAllergen = recipe('optional-cheese', [ingredient('Помидоры', { main: true }), ingredient('Сыр', { optional: true })]);
    expect(isRecipeAllowed(optionalAllergen, profile)).toBe(false);
  });

  it('applies vegetarian, lactose and ambiguous pork exclusions consistently', () => {
    const dish = (name: string) => recipe(name, [ingredient(name, { main: true })]);
    expect(isRecipeAllowed(dish('Индейка'), { ...familyProfile, dietary: 'Вегетарианское' })).toBe(false);
    expect(isRecipeAllowed(dish('Сливочное масло'), { ...familyProfile, dietary: 'Без лактозы' })).toBe(false);
    expect(isRecipeAllowed(dish('Безлактозное молоко'), { ...familyProfile, dietary: 'Без лактозы' })).toBe(true);
    expect(isRecipeAllowed(dish('Фарш'), { ...familyProfile, dietary: 'Без свинины' })).toBe(false);
    expect(isRecipeAllowed(dish('Свино-говяжий фарш'), { ...familyProfile, dietary: 'Без свинины' })).toBe(false);
    expect(isRecipeAllowed(dish('Говяжий фарш'), { ...familyProfile, dietary: 'Без свинины' })).toBe(true);
  });

  it('moves a disliked all-present dish behind an alternative and uses the latest feedback', () => {
    const disliked = recipe('disliked', [ingredient('Яйца', { main: true })]);
    const alternative = recipe('alternative', [ingredient('Яйца', { main: true }), ingredient('Лук')]);
    const feedback = [
      { recipeId: 'disliked', liked: true, timestamp: '2026-10-06T12:00:00Z' },
      { recipeId: 'disliked', liked: false, timestamp: '2026-10-07T12:00:00Z' },
    ];
    expect(recommendRecipes([disliked, alternative], ['Яйца'], null, 2, undefined, feedback)[0].recipe.id).toBe('alternative');
    expect(recommendRecipes([disliked, alternative], ['Яйца'], null, 2, undefined, [...feedback].reverse())[0].recipe.id).toBe('alternative');
  });

  it('does not let a negative taste preference override an allergy restriction', () => {
    const mushroom = recipe('mushroom', [ingredient('Грибы', { main: true })]);
    const dairy = recipe('cheese', [ingredient('Сыр', { main: true })]);
    const matches = recommendRecipes([mushroom, dairy], ['Грибы', 'Сыр'], null, 5, { ...familyProfile, allergies: ['Молоко'] });
    expect(matches.map(({ recipe: dish }) => dish.id)).toEqual(['mushroom']);
    expect(matches[0].profileFit).toBe(false);
  });

  it('diversifies near ties deterministically without crossing missing tiers', () => {
    const options = ['a', 'b', 'c'].map((id) => recipe(id, [ingredient('Яйца', { main: true })]));
    options[2].visual = 'salad';
    options[2].category = 'Салаты';
    expect(recommendRecipes(options, ['Яйца'], null).map(({ recipe: dish }) => dish.id)).toEqual(['a', 'c', 'b']);
    expect(recommendRecipes([...options].reverse(), ['Яйца'], null)).toEqual(recommendRecipes(options, ['Яйца'], null));
  });

  it('offers at least three choices for the family fridge within 30 minutes', () => {
    const available = ['Курица', 'Картофель', 'Лук', 'Сметана', 'Сыр', 'Помидоры'];
    const matches = recommendRecipes(recipes, available, 30, 5, familyProfile);
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(matches.every(({ recipe: dish }) => dish.cookingTime <= 30)).toBe(true);
    expect(matches.every(({ recipe: dish }) => !dish.ingredients.some(({ name }) => normalizeIngredient(name) === 'грибы'))).toBe(true);
  });
});

describe('recipe matching', () => {
  it('counts unique meaningful ingredients and assumes staples while separating optional ingredients', () => {
    const dish = recipe('pasta', [
      ingredient('Курица', { main: true }), ingredient('Макароны', { main: true }),
      ingredient('Соль'), ingredient('Растительное масло'), ingredient('Базилик', { optional: true }),
    ]);
    const match = matchRecipe(dish, ['куриное филе', 'КУРИЦА', 'курица', 'соль']);
    expect(match.matchedCount).toBe(1);
    expect(match.requiredCount).toBe(2);
    expect(match.coverage).toBe(0.5);
    expect(match.available.map(({ name }) => name)).toEqual(['Курица', 'Соль']);
    expect(match.assumedPantry.map(({ name }) => name)).toEqual(['Растительное масло']);
    expect(match.missing.map(({ name }) => name)).toEqual(['Макароны']);
    expect(match.optional.map(({ name }) => name)).toEqual(['Базилик']);
  });

  it('deduplicates true aliases without dropping distinct cuts in recipe data', () => {
    const dish = recipe('duplicates', [ingredient('Курица'), ingredient('Куриное филе'), ingredient('Филе курицы'), ingredient('Лук')]);
    const match = matchRecipe(dish, ['куриная грудка']);
    expect(match.matchedCount).toBe(1);
    expect(match.requiredCount).toBe(3);
    expect(match.missing.map(item => item.name)).toEqual(['Курица', 'Лук']);
  });

  it('excludes all staple positions from default counters even when actually present', () => {
    const dish = recipe('salted-rice', [ingredient('Рис', { main: true }), ingredient('Соль'), ingredient('Вода')]);
    const match = matchRecipe(dish, ['Рис', 'Соль']);
    expect(match.matchedCount).toBe(1);
    expect(match.requiredCount).toBe(1);
    expect(match.coverage).toBe(1);
    expect(match.available.map(item => item.name)).toEqual(['Рис', 'Соль']);
    expect(match.assumedPantry.map(item => item.name)).toEqual(['Вода']);
    expect(match.missing).toEqual([]);
  });

  it('requires actual pantry stock with assumptions disabled and does not duplicate aliases', () => {
    const dish = recipe('strict-rice', [ingredient('Рис', { main: true }), ingredient('Соль'), ingredient('Поваренная соль'), ingredient('Вода')]);
    const match = matchRecipe(dish, ['Риса', 'Рис', 'Соль'], undefined, [], { assumePantryStaples: false });
    expect(match.requiredCount).toBe(3);
    expect(match.matchedCount).toBe(2);
    expect(match.coverage).toBeCloseTo(2 / 3);
    expect(match.available.map(item => item.name)).toEqual(['Рис', 'Соль']);
    expect(match.assumedPantry).toEqual([]);
    expect(match.missing.map(item => item.name)).toEqual(['Вода']);
  });

  it('never treats arbitrary recipe flags as assumed pantry products', () => {
    const dish = recipe('flagged-sauce', [ingredient('Яйца', { main: true }), ingredient('Трюфельное масло', { isPantryStaple: true }), ingredient('Молоко', { isPantryStaple: true })]);
    const match = matchRecipe(dish, ['Яйца']);
    expect(match.requiredCount).toBe(3);
    expect(match.missing.map(item => item.name)).toEqual(['Трюфельное масло', 'Молоко']);
    expect(match.assumedPantry).toEqual([]);
  });

  it('matches unknown labels exactly but does not infer meat, oil or dairy substitutions', () => {
    const dish = recipe('distinct-products', [ingredient('Курица', { main: true }), ingredient('Оливковое масло'), ingredient('Сливки'), ingredient('Паста мисо')]);
    const match = matchRecipe(dish, ['Куриное филе', 'Подсолнечное масло', 'Сметана', '  паста   мисо '], undefined, [], { assumePantryStaples: false });
    expect(match.available.map(item => item.name)).toEqual(['Паста мисо']);
    expect(match.missing.map(item => item.name)).toEqual(['Курица', 'Оливковое масло', 'Сливки']);
    expect(match.matchedCount).toBe(1);
  });

  it('keeps optional aliases optional unless a required source position exists', () => {
    const dish = recipe('mixed-aliases', [ingredient('Картошка', { optional: true }), ingredient('Картофель', { main: true }), ingredient('Яйцо')]);
    const match = matchRecipe(dish, ['Картофель']);
    expect(match.requiredCount).toBe(2);
    expect(match.available).toHaveLength(1);
    expect(match.optional).toEqual([]);
    expect(match.available[0].optional).not.toBe(true);
  });

  it('optional ingredients never make a recipe incomplete', () => {
    const dish = recipe('eggs', [ingredient('Яйца', { main: true }), ingredient('Сыр', { optional: true })]);
    expect(matchRecipe(dish, ['яйцо']).missing).toHaveLength(0);
    expect(matchRecipe(dish, ['яйцо']).coverage).toBe(1);
  });
});

describe('recommendation ranking', () => {
  it('strictly honors the time limit including its exact boundary', () => {
    const options = [19, 20, 21].map((time) => recipe(`dish-${time}`, [ingredient('Яйца')], time));
    expect(recommendRecipes(options, ['яйца'], 20).map(({ recipe: dish }) => dish.cookingTime)).toEqual([19, 20]);
    expect(recommendRecipes(options, ['яйца'], null)).toHaveLength(3);
    expect(recommendRecipes(options, ['яйца'], 0)).toHaveLength(0);
  });

  it('prioritizes zero, one and two missing ingredients before other recipes', () => {
    const options = [3, 1, 2, 0].map((missing) => recipe(`missing-${missing}`, [
      ingredient('Яйца', { main: true }),
      ...['Сыр', 'Молоко', 'Мука'].slice(0, missing).map((name) => ingredient(name)),
    ]));
    expect(recommendRecipes(options, ['яйцо'], null).map(({ missing }) => missing.length)).toEqual([0, 1, 2, 3]);
  });

  it('requires an actual main-food match instead of recommending from supporting products alone', () => {
    const options = [
      recipe('onion-main', [ingredient('Лук', { main: true }), ingredient('Курица'), ingredient('Сыр')]),
      recipe('chicken-main', [ingredient('Курица', { main: true }), ingredient('Лук'), ingredient('Сыр')]),
    ];
    const matches = recommendRecipes(options, ['Курица', 'Сыр'], null);
    expect(matches.map(match => match.recipe.id)).toEqual(['chicken-main']);
    expect(recommendRecipes([recipe('meat-and-onion', [ingredient('Курица', { main: true }), ingredient('Лук'), ingredient('Сыр')])], ['Лук', 'Сыр'], null)).toEqual([]);
    const noMain = recipe('unmarked-food', [ingredient('Лук'), ingredient('Сыр')]);
    expect(recommendRecipes([noMain], ['Лук'], null).map(match => match.recipe.id)).toEqual(['unmarked-food']);
  });

  it('does not suggest recipes based only on pantry staples or optional ingredients', () => {
    const options = [recipe('chicken', [ingredient('Курица', { main: true }), ingredient('Соль'), ingredient('Сыр', { optional: true })])];
    expect(recommendRecipes(options, ['соль', 'сыр', 'масло'], null)).toEqual([]);
    expect(recommendRecipes(options, ['банан'], null)).toEqual([]);
    expect(recommendRecipes(options, [], null)).toEqual([]);
    expect(recommendRecipes(options, ['Соль', 'Сыр'], null, 5, undefined, [], { assumePantryStaples: false })).toEqual([]);
    const spicesOnly = recipe('spice-water', [ingredient('Соль', { main: true }), ingredient('Чёрный перец'), ingredient('Вода')]);
    for (const assumePantryStaples of [true, false]) {
      expect(recommendRecipes([spicesOnly], ['Соль', 'Чёрный перец', 'Вода'], null, 5, undefined, [], { assumePantryStaples })).toEqual([]);
    }
  });

  it('forwards the pantry policy into ranking and replacement availability', () => {
    const dish = recipe('butter-rice', [ingredient('Рис', { main: true }), ingredient('Сливочное масло', { amount: 20, unit: 'г' }), ingredient('Соль')]);
    dish.name = 'Рис со сливочным соусом';
    dish.steps = ['Смешайте рис со сливочным соусом.'];
    const assumed = recommendRecipes([dish], ['Рис'], null)[0];
    const strict = recommendRecipes([dish], ['Рис'], null, 5, undefined, [], { assumePantryStaples: false })[0];
    expect(assumed.substitutionCount).toBe(1);
    expect(strict.substitutionCount).toBe(0);
    expect(assumed.missing.map(item => item.name)).toEqual(['Сливочное масло']);
    expect(strict.missing.map(item => item.name)).toEqual(['Сливочное масло', 'Соль']);
  });

  it('uses deterministic tie-breaking and respects the requested limit', () => {
    const options = ['c', 'a', 'b'].map((id) => recipe(id, [ingredient('Яйца')]));
    expect(recommendRecipes(options, ['Яйца'], null, 2).map(({ recipe: dish }) => dish.id)).toEqual(['a', 'b']);
    expect(recommendRecipes([...options].reverse(), ['Яйца'], null, 2)).toEqual(recommendRecipes(options, ['Яйца'], null, 2));
    expect(recommendRecipes(options, ['Яйца'], null, 0)).toEqual([]);
  });
});

describe('production recipe collection', () => {
  it('contains at least 30 distinct recipes with usable cooking instructions', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(30);
    expect(new Set(recipes.map(({ id }) => id)).size).toBe(recipes.length);
    for (const dish of recipes) {
      expect(dish.name.trim().length, dish.id).toBeGreaterThan(3);
      expect(dish.description.trim().length, dish.id).toBeGreaterThan(15);
      expect(dish.cookingTime, dish.id).toBeGreaterThan(0);
      expect(dish.servings, dish.id).toBeGreaterThan(0);
      expect(dish.steps.length, dish.id).toBeGreaterThanOrEqual(3);
      expect(dish.steps.every((step) => step.trim().length > 15), dish.id).toBe(true);
      expect(dish.ingredients.some((item) => item.main && !item.optional && !isPantryStaple(item.name)), dish.id).toBe(true);
    }
  });

  it('offers at least three relevant dishes for the requested end-to-end pantry', () => {
    const pantry = ['Курица', 'Картофель', 'Лук', 'Помидоры', 'Сыр'];
    const matches = recommendRecipes(recipes, pantry, null);
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(matches.length).toBeLessThanOrEqual(5);
    for (const match of matches) {
      expect(match.matchedCount).toBeGreaterThan(0);
      expect(match.missing.length).toBeLessThanOrEqual(2);
      expect(match.available.some((item) => item.main)).toBe(true);
    }
    expect(recommendRecipes(recipes, pantry, 20).every(({ recipe: dish }) => dish.cookingTime <= 20)).toBe(true);
  });

  it('does not substitute dry ingredients for already cooked ingredients', () => {
    expect(normalizeIngredient('Вареный рис')).not.toBe(normalizeIngredient('Рис'));
    expect(normalizeIngredient('Консервированная фасоль')).not.toBe(normalizeIngredient('Фасоль'));
  });
});
