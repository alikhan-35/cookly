import type { FridgeItem } from '../types';
import { convertFridgeAmount, localDateString } from './fridge';
import { matchingProductKey } from './pantryProducts';

export interface ConsumptionChange {
  itemId: string;
  amount?: number;
  unit?: string;
  useAll?: boolean;
  expected: { name: string; amount?: number; unit: string };
}

export interface ConsumptionIngredient {
  name: string;
  amount: number | null;
  unit: string;
  optional?: boolean;
}

export interface ConsumptionSuggestion {
  item: FridgeItem;
  recipeQuantity: string;
  suggestedAmount: number | null;
  canEnterAmount: boolean;
  note: string | null;
}

const unitLabels: Record<string, string> = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт.' };
const displayNumber = new Intl.NumberFormat('ru', { maximumFractionDigits: 6 });
export function consumptionQuantity(amount: number, unit: string): string {
  return `${displayNumber.format(amount)} ${unitLabels[unit] ?? unit}`.trim();
}

/** Suggestions are a preview only; matching by a generic protein must never deduct a different cut. */
export function buildConsumptionSuggestions(
  items: FridgeItem[], ingredients: ConsumptionIngredient[], servings: number,
  today = localDateString(),
): ConsumptionSuggestion[] {
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) return [];
  const result: ConsumptionSuggestion[] = [];
  for (const item of items) {
    if (item.expiresOn && item.expiresOn < today) continue;
    const matching = ingredients.filter(ingredient => matchingProductKey(ingredient.name) === matchingProductKey(item.name));
    if (!matching.length) continue;
    let total = 0;
    let complete = true;
    const quantities: string[] = [];
    for (const ingredient of matching) {
      const amount = ingredient.amount === null ? null : ingredient.amount * servings;
      if (amount === null || !Number.isFinite(amount) || amount <= 0) {
        complete = false;
        quantities.push('количество не указано');
        continue;
      }
      quantities.push(consumptionQuantity(amount, ingredient.unit));
      const converted = convertFridgeAmount(amount, unitLabels[ingredient.unit] ?? ingredient.unit, item.unit);
      if (converted === null || ingredient.optional) complete = false;
      else total += converted;
    }
    const canEnterAmount = item.amount !== undefined && convertFridgeAmount(1, item.unit, item.unit) !== null;
    const withinStock = item.amount !== undefined && total <= item.amount + 1e-9;
    const suggestedAmount = canEnterAmount && complete && withinStock && total > 0
      ? Math.min(item.amount!, Math.round(total * 1e9) / 1e9) : null;
    let note: string | null = null;
    if (item.amount === undefined) note = 'Остаток не указан. Оставьте продукт или отметьте, что он закончился.';
    else if (!complete || !canEnterAmount) note = 'Уточните, сколько использовали. Автоматически количество не списываем.';
    else if (!withinStock) note = 'По рецепту нужно больше, чем записано в холодильнике. Уточните фактический расход.';
    result.push({ item: { ...item }, recipeQuantity: quantities.join(' + '), suggestedAmount, canEnterAmount, note });
  }
  return result;
}

/** All-or-nothing change against the latest inventory; no inference for unknown amounts or units. */
export function applyConsumption(items: FridgeItem[], changes: ConsumptionChange[]): { items: FridgeItem[]; error: string | null } {
  const fail = (error: string) => ({ items, error });
  if (!Array.isArray(changes) || changes.length > 100) return fail('Не удалось прочитать список использованных продуктов.');
  const next = new Map(items.map(item => [item.id, { ...item }]));
  const seen = new Set<string>();
  for (const change of changes) {
    if (!change || typeof change !== 'object' || typeof change.itemId !== 'string' || seen.has(change.itemId)) {
      return fail('Один продукт указан несколько раз. Обновите список списания.');
    }
    seen.add(change.itemId);
    const item = next.get(change.itemId);
    const expected = change.expected;
    if (!item || !expected || item.name !== expected.name || item.amount !== expected.amount || item.unit !== expected.unit) {
      return fail('Запасы изменились. Обновите список и подтвердите расход ещё раз.');
    }
    if (change.useAll === true) {
      if (change.amount !== undefined || change.unit !== undefined) return fail('Выберите количество или отметку «Продукт закончился».');
      next.delete(item.id);
      continue;
    }
    if (typeof change.amount !== 'number' || !Number.isFinite(change.amount) || change.amount <= 0
      || change.amount > 1_000_000 || typeof change.unit !== 'string' || item.amount === undefined) {
      return fail(`${item.name}: укажите использованное количество или отметьте, что продукт закончился.`);
    }
    const used = convertFridgeAmount(change.amount, change.unit, item.unit);
    if (used === null || !Number.isFinite(used) || used <= 0) return fail(`${item.name}: единицы измерения не совпадают.`);
    if (used > item.amount + 1e-9) return fail(`${item.name}: нельзя списать больше, чем осталось в холодильнике.`);
    const remaining = Math.round((item.amount - used) * 1e9) / 1e9;
    if (remaining <= 0) next.delete(item.id);
    else next.set(item.id, { ...item, amount: remaining });
  }
  return { items: items.flatMap(item => { const remaining = next.get(item.id); return remaining ? [remaining] : []; }), error: null };
}
