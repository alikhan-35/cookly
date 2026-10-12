import { substitutionRules, type SubstitutionContext } from '../data/substitutions';
import type { Ingredient, Recipe, SubstitutionOption, SubstitutionSelections, UserProfile } from '../types';
import { isIngredientAllowed, isPantryStaple, normalizeIngredient } from './ingredients';
import { scaleIngredients } from './servings';

function contextsFor(recipe: Recipe): Set<SubstitutionContext> {
  const title = `${recipe.name} ${recipe.category}`.toLocaleLowerCase('ru-RU');
  const instructions = recipe.steps.join(' ').toLocaleLowerCase('ru-RU');
  // Cold salad ingredients must not acquire hot-sauce replacements because its chicken was fried.
  if (recipe.visual === 'salad' || /салат|капрезе/.test(title)) return new Set(['salad']);
  const contexts = new Set<SubstitutionContext>();
  if (/соус|сливочн|подлив/.test(`${title} ${instructions}`) || recipe.visual === 'pasta') contexts.add('sauce');
  if (recipe.visual === 'soup' || /суп/.test(title)) contexts.add('soup');
  if (recipe.visual === 'stew' || /рагу|тушен/.test(title)) contexts.add('stew');
  if (/духовк|запека|запеч|корочк/.test(`${title} ${instructions}`)) contexts.add('bake');
  if (/сковород|обжар/.test(instructions) && !/фритюр/.test(instructions)) contexts.add('pan');
  if (/(рис|греч|булгур)/.test(title) && !/плов|ризотто|тефтел|суши|жареный рис|каша/.test(title)) contexts.add('grain');
  if (/котлет|драник|оладьи из кабач|кабачковые олад/.test(title)) contexts.add('binding');
  if (/паниров|обваляйте.*сухар/.test(instructions)) contexts.add('coating');
  if (/тост|бутерброд|сэндвич/.test(title) && !/сладк|француз/.test(title)) contexts.add('toast');
  if (/каша|овсянк/.test(title)) contexts.add('porridge');
  if (/блин/.test(title)) contexts.add('pancake');
  return contexts;
}

function normalizeUnit(value: string): string {
  const unit = value.trim().toLocaleLowerCase('ru-RU').replace(/\s/g, '');
  if (['г', 'гр', 'гр.', 'грамм', 'граммы'].includes(unit)) return 'г';
  if (['шт', 'шт.', 'штук', 'штука'].includes(unit)) return 'шт.';
  if (unit.startsWith('зуб')) return 'зубчик';
  if (['ст.л.', 'ст.л', 'стл', 'столоваяложка'].includes(unit)) return 'ст. л.';
  if (['ч.л.', 'ч.л', 'чл', 'чайнаяложка'].includes(unit)) return 'ч. л.';
  return unit;
}

function sourceQuantity(ingredient: Ingredient): { amount: number; unit: string } {
  const unit = normalizeUnit(ingredient.unit);
  const name = normalizeIngredient(ingredient.name);
  if (unit === 'кг') return { amount: ingredient.amount * 1_000, unit: 'г' };
  if (unit === 'л') return { amount: ingredient.amount * 1_000, unit: 'мл' };
  if (unit === 'ст. л.' || unit === 'ч. л.') {
    const spoon = unit === 'ст. л.' ? 1 : 1 / 3;
    const gramsPerTablespoon: Record<string, number> = { 'томатная паста': 20, 'сметана': 20, 'йогурт': 15, 'майонез': 15, 'сливочное масло': 14, 'панировочные сухари': 8 };
    if (gramsPerTablespoon[name]) return { amount: ingredient.amount * spoon * gramsPerTablespoon[name], unit: 'г' };
    if (['растительное масло', 'молоко', 'сливки'].includes(name)) return { amount: ingredient.amount * spoon * 15, unit: 'мл' };
  }
  if (name === 'хлеб' && /ломт/.test(unit)) return { amount: ingredient.amount * 30, unit: 'г' };
  if (name === 'зелень' && /пуч/.test(unit)) return { amount: ingredient.amount * 20, unit: 'г' };
  return { amount: ingredient.amount, unit };
}

const roundAmount = (value: number) => Math.round((value + Number.EPSILON) * 1_000) / 1_000;

/** ingredient already includes the currently selected portion multiplier. */
export function getSubstitutionOptions(
  recipe: Recipe,
  ingredient: Ingredient,
  availableNames: string[],
  profile?: UserProfile,
): SubstitutionOption[] {
  if (!Number.isFinite(ingredient.amount) || ingredient.amount <= 0) return [];
  const original = normalizeIngredient(ingredient.name);
  const quantity = sourceQuantity(ingredient);
  const contexts = contextsFor(recipe);
  const pantry = new Set(availableNames.map(normalizeIngredient).filter(Boolean));
  return substitutionRules
    .filter((rule) => rule.original === original && rule.units.includes(quantity.unit) && rule.contexts.some((context) => contexts.has(context)))
    .filter((rule) => rule.id !== 'oil-butter' || !/сильном огне|фритюр/.test(recipe.steps.join(' ').toLocaleLowerCase('ru-RU')))
    .filter((rule) => rule.ingredients.every((part) => isIngredientAllowed(part.name, profile)))
    .map((rule) => {
      const ingredients = rule.ingredients.map((part) => ({
        ...part,
        amount: roundAmount(part.amount * quantity.amount / rule.amount),
        optional: ingredient.optional,
        main: ingredient.main && !isPantryStaple(part.name),
        isPantryStaple: isPantryStaple(part.name),
      }));
      return {
        id: rule.id,
        label: rule.label,
        ingredients,
        note: rule.note,
        available: ingredients.every((part) => isPantryStaple(part.name) || pantry.has(normalizeIngredient(part.name))),
      };
    });
}

function mergeIngredients(ingredients: Ingredient[]): Ingredient[] {
  const merged = new Map<string, Ingredient>();
  for (const item of ingredients) {
    const key = `${normalizeIngredient(item.name)}|${normalizeUnit(item.unit)}`;
    const previous = merged.get(key);
    merged.set(key, previous ? {
      ...previous,
      amount: roundAmount(previous.amount + item.amount),
      optional: Boolean(previous.optional && item.optional),
      main: Boolean(previous.main || item.main),
      isPantryStaple: Boolean(previous.isPantryStaple && item.isPantryStaple),
    } : { ...item });
  }
  return [...merged.values()];
}

export function getEffectiveIngredients(
  recipe: Recipe,
  selections: SubstitutionSelections,
  servings: number,
  availableNames: string[],
  profile?: UserProfile,
): { ingredients: Ingredient[]; replacements: { original: Ingredient; substitution: SubstitutionOption }[] } {
  const base = Number.isFinite(recipe.baseServings) && recipe.baseServings > 0 ? recipe.baseServings : recipe.servings || 1;
  const requested = Number.isFinite(servings) && servings > 0 ? servings : base;
  const scaled = scaleIngredients(recipe.ingredients, requested, base);
  const candidates = new Map<string, SubstitutionOption>();
  for (const original of scaled) {
    const key = normalizeIngredient(original.name);
    const selected = selections && Object.prototype.hasOwnProperty.call(selections, key) ? selections[key] : undefined;
    if (typeof selected !== 'string') continue;
    const option = getSubstitutionOptions(recipe, original, availableNames, profile).find(({ id }) => id === selected);
    if (option) candidates.set(key, option);
  }

  // Reject simultaneous A→B and B→C choices: they otherwise reintroduce a crossed-out ingredient.
  const conflicts = new Set<string>();
  for (const [source, option] of candidates) {
    for (const part of option.ingredients) {
      const target = normalizeIngredient(part.name);
      if (candidates.has(target) && target !== source) {
        conflicts.add(source);
        conflicts.add(target);
      }
    }
  }
  const replacements: { original: Ingredient; substitution: SubstitutionOption }[] = [];
  const ingredients = scaled.flatMap((original) => {
    const key = normalizeIngredient(original.name);
    const substitution = conflicts.has(key) ? undefined : candidates.get(key);
    if (!substitution) return [original];
    replacements.push({ original, substitution });
    return substitution.ingredients;
  });
  return { ingredients: mergeIngredients(ingredients), replacements };
}
