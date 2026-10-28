import { describe, expect, it } from 'vitest';
import { cleanFridgeName, expiryDays, isValidExpiry, localDateString, parseFridgeItems, parseFridgeState, planFridgeBatch, previewFridgeUpdate, convertFridgeAmount, usableFridgeNames, validateFridgeInput, validateFridgeBatch, type FridgeInput } from './fridge';

const chicken: FridgeInput = { name: 'Куриное филе', amount: 500, unit: 'г', category: 'Мясо' };

describe('fridge inventory validation', () => {
  it('validates a bulk addition without changing existing inventory or accepting a partial batch', () => {
    const existing = [{ ...chicken, id: 'kept' }];
    const before = structuredClone(existing);
    expect(validateFridgeBatch([{ name: 'Яйца', unit: 'шт.', amount: 2, category: 'Яйца' }, { ...chicken, amount: -1 }], existing)).not.toBeNull();
    expect(existing).toEqual(before);
    expect(validateFridgeBatch([{ name: 'Яйца', unit: 'шт.', amount: 2, category: 'Яйца' }, { name: 'Яйцо', unit: '', category: 'Яйца' }], [])).not.toBeNull();
    expect(validateFridgeBatch([{ name: 'Яйца', unit: 'шт.', amount: 2, category: 'Яйца' }], existing)).toBeNull();
    expect(validateFridgeBatch([], existing)).not.toBeNull();
    const full = Array.from({ length: 100 }, (_, index) => ({ ...chicken, name: `Продукт ${index}`, id: String(index) }));
    expect(validateFridgeBatch([{ name: 'Яйца', unit: '', category: 'Яйца' }], full)).not.toBeNull();
  });
  it('accepts a name-only item while rejecting invalid amounts and canonical duplicates', () => {
    expect(validateFridgeInput({ name: 'Яйца', unit: '', category: 'Другое' }, [])).toBeNull();
    expect(validateFridgeInput({ ...chicken, amount: -1 }, [])).not.toBeNull();
    expect(validateFridgeInput({ ...chicken, amount: Infinity }, [])).not.toBeNull();
    expect(validateFridgeInput({ ...chicken, name: '  КУРИЦА ' }, [{ ...chicken, id: 'one' }])).toBeNull();
    expect(validateFridgeInput({ ...chicken, name: 'Куриная грудка' }, [{ ...chicken, id: 'one' }])).not.toBeNull();
    expect(validateFridgeInput(chicken, [{ ...chicken, id: 'one' }], 'one')).toBeNull();
    expect(cleanFridgeName('  куриное   филе ')).toBe('Куриное филе');
  });

  it('recovers valid items from malformed browser data without duplicate aliases or ids', () => {
    expect(parseFridgeItems({})).toEqual([]);
    const items = parseFridgeItems([
      null, 42, { name: 42 }, { name: '123' },
      { ...chicken, id: 'same', amount: -1, expiresOn: '2026-02-30' },
      { ...chicken, id: 'duplicate-alias', name: 'Куриная грудка' },
      { ...chicken, id: 'whole', name: 'Курица' },
      { name: 'Картофель', id: 'same', category: 'Unknown', unit: '<script>', amount: '20' },
    ]);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ id: 'same', name: 'Куриное филе', unit: 'г', category: 'Мясо' });
    expect(items[1]).toMatchObject({ name: 'Курица' });
    expect(items[2]).toMatchObject({ name: 'Картофель', unit: '', category: 'Другое' });
    expect(new Set(items.map(item => item.id)).size).toBe(3);
  });

  it('retains cuts and different oils after a stored inventory round-trip', () => {
    const names = ['Курица', 'Куриное филе', 'Филе куриного бедра', 'Оливковое масло', 'Подсолнечное масло', 'Растительное масло'];
    const stored = names.map((name, index) => ({ ...chicken, name, id: String(index), amount: index + 1 }));
    const restored = parseFridgeItems(JSON.parse(JSON.stringify(stored)));
    expect(restored.map(item => item.name)).toEqual(names);
    expect(restored.map(item => item.amount)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const name of names) expect(validateFridgeInput({ ...chicken, name }, restored)).not.toBeNull();
    expect(validateFridgeInput({ ...chicken, name: 'Масло оливковое' }, restored)).not.toBeNull();
  });
});

describe('fridge replenishment and storage migration', () => {
  const existing = { ...chicken, id: 'chicken', expiresOn: '2026-10-30' };
  it('adds compatible quantities into one canonical product without mutating the original', () => {
    const result = planFridgeBatch([{ ...chicken, name: 'Куриная грудка', amount: 1, unit: 'кг', expiresOn: '2026-11-01' }], [existing]);
    expect(result.error).toBeNull();
    expect(result.addedCount).toBe(0);
    expect(result.items).toEqual([{ ...existing, amount: 1500 }]);
    expect(existing.amount).toBe(500);
  });
  it('converts mass and volume but never guesses piece or pack sizes', () => {
    expect(convertFridgeAmount(1, 'кг', 'г')).toBe(1000);
    expect(convertFridgeAmount(500, 'мл', 'л')).toBe(0.5);
    expect(convertFridgeAmount(1, 'шт.', 'г')).toBeNull();
    expect(convertFridgeAmount(2, 'уп.', 'л')).toBeNull();
    expect(convertFridgeAmount(1, '', '')).toBeNull();
    expect(convertFridgeAmount(-1, 'г', 'г')).toBeNull();
  });
  it('does not invent totals for unknown stock or incompatible quantities', () => {
    expect(previewFridgeUpdate({ ...chicken, amount: undefined }, existing, 'add').input.amount).toBeUndefined();
    expect(previewFridgeUpdate({ ...chicken, amount: 2, unit: 'шт.' }, existing, 'add').input.amount).toBeUndefined();
    expect(previewFridgeUpdate(chicken, { ...existing, amount: undefined }, 'add').input.amount).toBeUndefined();
  });
  it('sets a stated current remainder instead of repeatedly increasing it', () => {
    const result = planFridgeBatch([{ ...chicken, amount: 1, unit: 'кг' }], [existing], 'set');
    expect(result.items[0]).toMatchObject({ id: 'chicken', amount: 1, unit: 'кг' });
    expect(planFridgeBatch([{ ...chicken, amount: 1, unit: 'кг' }], result.items, 'set').items[0].amount).toBe(1);
    expect(previewFridgeUpdate({ ...chicken, amount: undefined }, existing, 'set').input.amount).toBe(500);
  });
  it('keeps the earlier explicit expiry when restocking', () => {
    expect(previewFridgeUpdate({ ...chicken, expiresOn: '2026-11-01' }, existing, 'add').input.expiresOn).toBe('2026-10-30');
    expect(previewFridgeUpdate({ ...chicken, expiresOn: '2026-10-29' }, existing, 'add').input.expiresOn).toBe('2026-10-29');
  });
  it('refills an existing product at capacity and rejects an invalid batch atomically', () => {
    const full = Array.from({ length: 99 }, (_, index) => ({ ...existing, id: `item-${index}`, name: `Продукт ${index}` })).concat(existing);
    expect(planFridgeBatch([chicken], full).error).toBeNull();
    const failure = planFridgeBatch([chicken, { ...chicken, name: 'Рис', amount: -1 }], [existing]);
    expect(failure.error).not.toBeNull();
    expect(failure.items).toEqual([existing]);
  });
  it('preserves legacy inventory and validates bounded transaction and receipt ledgers', () => {
    expect(parseFridgeState([existing])).toEqual({ version: 2, items: [existing], appliedConsumptionIds: [], importedReceiptIds: [] });
    const state = parseFridgeState({ version: 2, items: [existing], appliedConsumptionIds: ['a', 'a', 2, '', 'b'], importedReceiptIds: ['receipt', 'receipt'] });
    expect(state.appliedConsumptionIds).toEqual(['a', 'b']);
    expect(state.importedReceiptIds).toEqual(['receipt']);
    expect(parseFridgeState(null).items).toEqual([]);
    expect(parseFridgeState({ items: [existing], appliedConsumptionIds: Array.from({ length: 120 }, (_, index) => String(index)) }).appliedConsumptionIds).toHaveLength(100);
  });
});

describe('fridge expiry uses local calendar dates', () => {
  it('validates actual days and leap years', () => {
    expect(isValidExpiry('2028-02-29')).toBe(true);
    expect(isValidExpiry('2026-02-29')).toBe(false);
    expect(isValidExpiry('2026-13-01')).toBe(false);
    expect(isValidExpiry('07.10.2026')).toBe(false);
    expect(localDateString(new Date(2026, 9, 7, 0, 1))).toBe('2026-10-07');
  });

  it('keeps products through their expiry day and excludes earlier dates from search', () => {
    const items = parseFridgeItems([
      { ...chicken, id: 'expired', expiresOn: '2026-10-06' },
      { name: 'Сыр', id: 'today', expiresOn: '2026-10-07' },
      { name: 'Помидоры', id: 'soon', expiresOn: '2026-10-10' },
      { name: 'Лук', id: 'no-date' },
    ]);
    expect(usableFridgeNames(items, '2026-10-07')).toEqual(['Сыр', 'Помидоры', 'Лук']);
    expect(expiryDays('2026-10-06', '2026-10-07')).toBe(-1);
    expect(expiryDays('2026-10-07', '2026-10-07')).toBe(0);
    expect(expiryDays('2026-10-10', '2026-10-07')).toBe(3);
    expect(expiryDays('2027-01-01', '2026-12-31')).toBe(1);
    expect(expiryDays(undefined, '2026-10-07')).toBeNull();
  });
});
