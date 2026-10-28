import { describe, expect, it } from 'vitest';
import type { FridgeItem } from '../types';
import { applyConsumption, buildConsumptionSuggestions, type ConsumptionChange } from './fridgeConsumption';

const chicken: FridgeItem = { id: 'chicken', name: 'Куриное филе', amount: 1, unit: 'кг', category: 'Мясо' };
const eggs: FridgeItem = { id: 'eggs', name: 'Яйца', amount: 4, unit: 'шт.', category: 'Яйца' };
function change(item: FridgeItem, amount: number, unit = item.unit): ConsumptionChange {
  return { itemId: item.id, amount, unit, expected: { name: item.name, amount: item.amount, unit: item.unit } };
}

describe('cooking consumption suggestions', () => {
  it('scales source amounts per portion, aggregates repeated ingredient lines and converts units', () => {
    const suggestions = buildConsumptionSuggestions([chicken, eggs], [
      { name: 'Куриная грудка', amount: 125, unit: 'g' },
      { name: 'Куриное филе', amount: 0.025, unit: 'kg' },
      { name: 'Яйцо', amount: 1, unit: 'pcs' },
    ], 3);
    expect(suggestions.map(row => row.suggestedAmount)).toEqual([0.45, 3]);
    expect(suggestions[0].recipeQuantity).toBe('375 г + 0,075 кг');
  });
  it('does not match different cuts, absent items or expired inventory', () => {
    const suggestions = buildConsumptionSuggestions([
      chicken,
      { ...eggs, expiresOn: '2026-10-01' },
    ], [{ name: 'Курица', amount: 0.5, unit: 'kg' }, { name: 'Яйца', amount: 1, unit: 'pcs' }], 1, '2026-10-27');
    expect(suggestions).toEqual([]);
  });
  it('leaves unknown, incompatible and insufficient quantities unselected', () => {
    for (const stock of [{ ...chicken, amount: undefined }, { ...chicken, unit: 'шт.' }, { ...chicken, amount: 0.1 }]) {
      const [row] = buildConsumptionSuggestions([stock], [{ name: 'Куриное филе', amount: 500, unit: 'g' }], 1);
      expect(row.suggestedAmount).toBeNull();
      expect(row.note).not.toBeNull();
    }
    expect(buildConsumptionSuggestions([chicken], [{ name: chicken.name, amount: null, unit: 'g' }], 1)[0].suggestedAmount).toBeNull();
  });
  it('does not deduct a partial estimate when another matching line has an unknown amount', () => {
    const [row] = buildConsumptionSuggestions([chicken], [
      { name: chicken.name, amount: 100, unit: 'g' },
      { name: chicken.name, amount: null, unit: 'g' },
    ], 1);
    expect(row.suggestedAmount).toBeNull();
  });
  it('does not automatically deduct optional ingredients or invalid portions', () => {
    expect(buildConsumptionSuggestions([eggs], [{ name: 'Яйцо', amount: 1, unit: 'pcs', optional: true }], 2)[0].suggestedAmount).toBeNull();
    for (const servings of [0, -1, NaN, Infinity, 101]) expect(buildConsumptionSuggestions([eggs], [{ name: 'Яйцо', amount: 1, unit: 'pcs' }], servings)).toEqual([]);
  });
});

describe('atomic cooking deduction', () => {
  it('subtracts partial amounts and removes exhausted items, retaining unrelated data', () => {
    const stock = [chicken, { ...eggs, expiresOn: '2026-12-01' }];
    const original = structuredClone(stock);
    const result = applyConsumption(stock, [change(chicken, 450, 'г'), change(eggs, 4)]);
    expect(result.error).toBeNull();
    expect(result.items).toEqual([{ ...chicken, amount: 0.55 }]);
    expect(stock).toEqual(original);
  });
  it('handles volume conversions without floating-point residue', () => {
    const milk: FridgeItem = { id: 'milk', name: 'Молоко', amount: 0.3, unit: 'л', category: 'Молочные' };
    expect(applyConsumption([milk], [change(milk, 100, 'мл')]).items[0].amount).toBe(0.2);
    expect(applyConsumption([milk], [change(milk, 300, 'мл')]).items).toEqual([]);
  });
  it('keeps the entire stock unchanged if any row is stale or overdrawn', () => {
    for (const badChange of [change(eggs, 5), { ...change(eggs, 1), expected: { ...eggs, amount: 3 } }]) {
      const stock = [chicken, eggs];
      const result = applyConsumption(stock, [change(chicken, 100, 'г'), badChange]);
      expect(result.error).not.toBeNull();
      expect(result.items).toBe(stock);
    }
  });
  it('rejects missing products, duplicates, invalid amounts and incompatible units', () => {
    const stock = [chicken, eggs];
    for (const changes of [
      [change({ ...chicken, id: 'absent' }, 1)],
      [change(eggs, 1), change(eggs, 1)],
      [change(eggs, -1)], [change(eggs, 0)], [change(eggs, NaN)], [change(eggs, Infinity)],
      [change(chicken, 100, 'мл')], [change(eggs, 1, '')],
    ]) {
      expect(applyConsumption(stock, changes).error).not.toBeNull();
      expect(applyConsumption(stock, changes).items).toBe(stock);
    }
  });
  it('never subtracts a guessed amount from presence-only stock; explicit finished confirmation can remove it', () => {
    const unknown = { ...chicken, amount: undefined };
    expect(applyConsumption([unknown], [change(unknown, 0.5)]).error).not.toBeNull();
    const done = { itemId: unknown.id, expected: { name: unknown.name, unit: unknown.unit }, useAll: true };
    expect(applyConsumption([unknown], [done])).toEqual({ items: [], error: null });
    expect(applyConsumption([chicken], [done]).error).not.toBeNull();
  });
  it('rejects ambiguous use-all plus amount and changes after an item was renamed', () => {
    expect(applyConsumption([chicken], [{ ...change(chicken, 0.5), useAll: true }]).error).not.toBeNull();
    expect(applyConsumption([{ ...chicken, name: 'Говядина' }], [change(chicken, 0.5)]).error).not.toBeNull();
  });
});
