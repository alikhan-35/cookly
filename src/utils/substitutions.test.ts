import { describe, expect, it } from 'vitest';
import type { Ingredient, Recipe, UserProfile } from '../types';
import { recipes } from '../data/recipes';
import { getEffectiveIngredients, getSubstitutionOptions } from './substitutions';
import { isIngredientAllowed } from './ingredients';

const cream: Ingredient = { name: 'Сливки', amount: 150, unit: 'мл' };
const sauce: Recipe = {
  source: 'local',
  id: 'test-sauce', name: 'Сливочная паста', description: 'Паста в нежном соусе.', cookingTime: 20,
  difficulty: 'Легко', servings: 2, baseServings: 2, nutrition: { calories: 800, protein: 40, fat: 30, carbs: 70 },
  ingredients: [{ name: 'Макароны', amount: 200, unit: 'г', main: true }, cream],
  steps: ['Отварите пасту и смешайте со сливочным соусом.'], category: 'Быстро', tags: [], visual: 'pasta',
};
const profile: UserProfile = { familySize: 2, hasChildren: false, dislikes: [], allergies: [], dietary: 'Без ограничений', difficulty: 'Любые' };

describe('contextual substitution options', () => {
  it('scales every part of a compound option and requires all non-staple parts at home', () => {
    const get = (available: string[]) => getSubstitutionOptions(sauce, cream, available).find(({ id }) => id === 'cream-milk-butter')!;
    expect(get(['Молоко']).available).toBe(false);
    expect(get(['Сливочное масло']).available).toBe(false);
    const option = get(['Молоко', 'Сливочное масло']);
    expect(option.available).toBe(true);
    expect(option.ingredients.map(({ amount, unit }) => [amount, unit])).toEqual([[120, 'мл'], [30, 'г']]);
  });

  it('accepts scaled input once and applies unit-aware spoon conversions', () => {
    expect(getSubstitutionOptions(sauce, { ...cream, amount: 300 }, ['сметана'])[0].ingredients[0].amount).toBe(300);
    const options = getSubstitutionOptions(sauce, { name: 'Томатная паста', amount: 1.5, unit: 'ст. л.' }, ['Пассата']);
    expect(options[0].ingredients[0].amount).toBe(90);
    expect(options[0].available).toBe(true);
  });

  it('rejects unknown units and invalid amounts instead of inventing quantities', () => {
    expect(getSubstitutionOptions(sauce, { ...cream, unit: 'упаковка' }, [])).toEqual([]);
    expect(getSubstitutionOptions(sauce, { ...cream, amount: Number.NaN }, [])).toEqual([]);
    expect(getSubstitutionOptions(sauce, { ...cream, amount: -1 }, [])).toEqual([]);
  });

  it('does not offer generic rice, potato or egg replacements in unsuitable dishes', () => {
    const pilaf = recipes.find(({ id }) => id === 'chicken-pilaf')!;
    expect(getSubstitutionOptions(pilaf, { name: 'Рис', amount: 200, unit: 'г' }, ['Булгур'])).toEqual([]);
    expect(getSubstitutionOptions(sauce, { name: 'Картофель', amount: 200, unit: 'г' }, ['Макароны'])).toEqual([]);
    const omelet = recipes.find(({ id }) => id === 'cheese-omelet')!;
    expect(getSubstitutionOptions(omelet, { name: 'Яйца', amount: 2, unit: 'шт.' }, ['Молотый лён'])).toEqual([]);
  });

  it('does not suggest canned tomatoes for a cold salad even with fried chicken', () => {
    const salad = { ...sauce, name: 'Салат с курицей', visual: 'salad' as const, steps: ['Обжарьте курицу на сковороде. Нарежьте свежие помидоры.'] };
    expect(getSubstitutionOptions(salad, { name: 'Помидоры', amount: 2, unit: 'шт.' }, ['Томаты в собственном соку'])).toEqual([]);
  });

  it('allows grain replacement only in a suitable side dish and filters wheat allergy', () => {
    const grain = recipes.find(({ id }) => id === 'vegetable-rice')!;
    expect(getSubstitutionOptions(grain, { name: 'Рис', amount: 100, unit: 'г' }, ['Булгур'])).toHaveLength(1);
    expect(getSubstitutionOptions(grain, { name: 'Рис', amount: 100, unit: 'г' }, ['Булгур'], { ...profile, allergies: ['Пшеница'] })).toEqual([]);
  });

  it('filters every component for milk allergy and distinguishes lactose-free milk', () => {
    const allergy = { ...profile, allergies: ['Молоко'] };
    const creamOptions = getSubstitutionOptions(sauce, cream, ['Сметана', 'Молоко', 'Сливочное масло', 'Овсяные сливки'], allergy);
    expect(creamOptions.map(({ id }) => id)).toEqual(['cream-oat']);
    const milk = { name: 'Молоко', amount: 100, unit: 'мл' };
    expect(getSubstitutionOptions(sauce, milk, [], allergy).some(({ id }) => id === 'milk-lactose-free')).toBe(false);
    expect(getSubstitutionOptions(sauce, milk, [], { ...profile, dietary: 'Без лактозы' }).some(({ id }) => id === 'milk-lactose-free')).toBe(true);
    expect(isIngredientAllowed('Сыр с миндалем', allergy)).toBe(false);
  });

  it('excludes poultry alternatives in vegetarian profiles', () => {
    expect(getSubstitutionOptions(sauce, { name: 'Куриное филе', amount: 200, unit: 'г' }, ['Индейка'], { ...profile, dietary: 'Вегетарианское' })).toEqual([]);
  });

  it('does not claim a replacement is available from a different cut or yogurt variety', () => {
    const poultry = getSubstitutionOptions(sauce, { name: 'Индейка', amount: 100, unit: 'г' }, ['Куриное филе']);
    expect(poultry.find(option => option.id === 'turkey-chicken')?.available).toBe(false);
    expect(getSubstitutionOptions(sauce, { name: 'Индейка', amount: 100, unit: 'г' }, ['Курица']).find(option => option.id === 'turkey-chicken')?.available).toBe(true);
    expect(getSubstitutionOptions(sauce, { name: 'Сметана', amount: 100, unit: 'г' }, ['Греческий йогурт']).find(option => option.id === 'sour-cream-yogurt')?.available).toBe(false);
  });

  it('requires every replacement component when pantry assumptions are disabled', () => {
    const binding = { ...sauce, name: 'Котлеты', visual: 'chicken' as const };
    const bread = { name: 'Хлеб', amount: 50, unit: 'г' };
    const stock = ['Панировочные сухари'];
    const get = (assumePantryStaples: boolean, names = stock) => getSubstitutionOptions(binding, bread, names, undefined, { assumePantryStaples }).find(option => option.id === 'bread-crumbs')!;
    expect(get(true).available).toBe(true);
    expect(get(false).available).toBe(false);
    expect(get(false, [...stock, 'Вода']).available).toBe(true);
  });
});

describe('effective ingredients and selected substitutions', () => {
  it('scales original and replacement together, leaves source data intact, and recalculates new portions', () => {
    const before = structuredClone(sauce);
    const effective = getEffectiveIngredients(sauce, { сливки: 'cream-sour-cream' }, 3, ['Сметана']);
    expect(effective.replacements[0].original.amount).toBe(225);
    expect(effective.ingredients.find(({ name }) => name === 'Сметана')?.amount).toBe(225);
    expect(effective.ingredients.some(({ name }) => name === 'Сливки')).toBe(false);
    expect(getEffectiveIngredients(sauce, { сливки: 'cream-sour-cream' }, 4, []).ingredients.find(({ name }) => name === 'Сметана')?.amount).toBe(300);
    expect(sauce).toEqual(before);
  });

  it('merges an existing ingredient with a replacement component without losing amounts', () => {
    const recipe = { ...sauce, ingredients: [...sauce.ingredients, { name: 'Сливочное масло', amount: 10, unit: 'г' }] };
    const result = getEffectiveIngredients(recipe, { сливки: 'cream-milk-butter' }, 2, []);
    expect(result.ingredients.filter(({ name }) => name === 'Сливочное масло')).toHaveLength(1);
    expect(result.ingredients.find(({ name }) => name === 'Сливочное масло')?.amount).toBe(40);
  });

  it('ignores stale, foreign and inherited selection ids and restores originals', () => {
    const unknown = getEffectiveIngredients(sauce, { сливки: 'egg-flax', молоко: 'milk-oat' }, 2, []);
    expect(unknown.replacements).toHaveLength(0);
    expect(unknown.ingredients).toEqual(sauce.ingredients);
    const inherited = Object.create({ сливки: 'cream-sour-cream' });
    expect(getEffectiveIngredients(sauce, inherited, 2, []).replacements).toHaveLength(0);
  });

  it('rejects conflicting reciprocal substitutions and does not recurse', () => {
    const recipe = { ...sauce, ingredients: [{ name: 'Сметана', amount: 100, unit: 'г' }, { name: 'Йогурт', amount: 100, unit: 'г' }] };
    const result = getEffectiveIngredients(recipe, { сметана: 'sour-cream-yogurt', йогурт: 'yogurt-sour-cream' }, 2, []);
    expect(result.replacements).toHaveLength(0);
    expect(result.ingredients).toEqual(recipe.ingredients);
  });

  it('revalidates saved selections when restrictions change and handles invalid servings', () => {
    const result = getEffectiveIngredients(sauce, { сливки: 'cream-sour-cream' }, Number.NaN, ['Сметана'], { ...profile, allergies: ['Молоко'] });
    expect(result.replacements).toHaveLength(0);
    expect(result.ingredients).toEqual(sauce.ingredients);
  });

  it('preserves separate cuts and oil amounts while merging genuine ingredient aliases', () => {
    const dish = { ...sauce, ingredients: [
      { name: 'Курица', amount: 100, unit: 'г' }, { name: 'Куриное филе', amount: 150, unit: 'г' },
      { name: 'Оливковое масло', amount: 10, unit: 'мл' }, { name: 'Подсолнечное масло', amount: 15, unit: 'мл' },
      { name: 'Картошка', amount: 100, unit: 'г' }, { name: 'Картофель', amount: 50, unit: 'г' },
    ] };
    const result = getEffectiveIngredients(dish, {}, 2, []);
    expect(result.ingredients.map(item => [item.name, item.amount])).toEqual([
      ['Курица', 100], ['Куриное филе', 150], ['Оливковое масло', 10], ['Подсолнечное масло', 15], ['Картошка', 150],
    ]);
  });

  it('forwards strict pantry policy when revalidating saved replacement availability', () => {
    const dish = { ...sauce, name: 'Котлеты', visual: 'chicken' as const, ingredients: [{ name: 'Хлеб', amount: 50, unit: 'г' }] };
    const result = getEffectiveIngredients(dish, { хлеб: 'bread-crumbs' }, 2, ['Панировочные сухари'], undefined, { assumePantryStaples: false });
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].substitution.available).toBe(false);
    expect(result.ingredients.map(item => item.name)).toEqual(['Панировочные сухари', 'Вода']);
  });
});
