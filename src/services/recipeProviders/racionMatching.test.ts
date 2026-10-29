import { describe, expect, it } from 'vitest';
import type { RacionRecipeIngredient } from './racion';
import { matchRacionIngredients } from './racionMatching';

const ingredient = (name: string, overrides: Partial<RacionRecipeIngredient> = {}): RacionRecipeIngredient => ({
  ingredientId: name, name, amount: 100, unit: 'г', pantry: false, ...overrides,
});

describe('Racion presence matching', () => {
  it('matches exact unknown Russian names with case, whitespace and ё equivalence', () => {
    const item = ingredient('  Пюре\u00a0из зелёного горошка  ');
    const result = matchRacionIngredients([item], ['пЮРЕ из   зеленого ГОРОШКА']);
    expect(result).toMatchObject({ matchedCount: 1, totalCount: 1, coverage: 1, fullyMatched: true });
    expect(result.available[0]).toBe(item);
  });

  it('uses only explicit dictionary aliases for different Russian ingredient labels', () => {
    const items = [ingredient('Картошка'), ingredient('Помидор'), ingredient('Куриная грудка')];
    const result = matchRacionIngredients(items, ['Картофель', 'Помидоры', 'Куриное филе']);
    expect(result.available).toEqual(items);
    expect(result.fullyMatched).toBe(true);
  });

  it('separates known absent products from unequal unknown Russian products', () => {
    const milk = ingredient('Молоко');
    const blend = ingredient('Приправа для плова');
    const result = matchRacionIngredients([milk, blend], ['Приправа для супа']);
    expect(result.available).toEqual([]);
    expect(result.missing).toEqual([milk]);
    expect(result.unknown).toEqual([blend]);
    expect(result.coverage).toBe(0);
  });

  it('keeps species, parts and distinct dairy products separate', () => {
    for (const [required, present] of [
      ['Курица', 'Индейка'], ['Куриное филе', 'Курица'],
      ['Курица целиком', 'Куриное филе'], ['Куриное мясо', 'Яйца'],
      ['Яйца', 'Куриное мясо'], ['Сыр', 'Моцарелла'],
      ['Моцарелла', 'Сыр'], ['Сливки', 'Сметана'], ['Сметана', 'Сливки'],
      ['Куриная грудка', 'Филе куриного бедра'],
    ]) {
      const result = matchRacionIngredients([ingredient(required)], [present]);
      expect(result.matchedCount, `${required} ≠ ${present}`).toBe(0);
      expect(result.fullyMatched).toBe(false);
    }
  });

  it('requires pantry products in strict mode and never infers food identity from a provider ID', () => {
    const salt = ingredient('Соль', { pantry: true });
    const oil = ingredient('Растительное масло', { pantry: true });
    const unknown = ingredient('Неизвестная смесь', { ingredientId: 'chicken', pantry: true });
    const result = matchRacionIngredients([salt, oil, unknown], ['Курица'], { assumePantryStaples: false });
    expect(result.available).toEqual([]);
    expect(result.missing).toEqual([salt, oil]);
    expect(result.unknown).toEqual([unknown]);
  });

  it('includes unknown positions in the denominator instead of reporting a false 100%', () => {
    const milk = ingredient('Молоко');
    const unknown = ingredient('Неизвестная приправа');
    const result = matchRacionIngredients([milk, unknown], ['Молоко']);
    expect(result).toMatchObject({ matchedCount: 1, totalCount: 2, coverage: 0.5, fullyMatched: false });
    expect(result.available[0]).toBe(milk);
    expect(result.unknown[0]).toBe(unknown);
  });

  it('retains repeated source positions and their original amounts, units and references', () => {
    const first = Object.freeze(ingredient('Молоко', { amount: 200, unit: 'мл' }));
    const second = Object.freeze(ingredient('Молоко', { amount: null, unit: 'по вкусу', pantry: true }));
    const source = Object.freeze([first, second]);
    const result = matchRacionIngredients(source, Object.freeze(['Молоко', 'Молоко']));
    expect(result.available).toEqual(source);
    expect(result.available[0]).toBe(first);
    expect(result.available[1]).toBe(second);
    expect(result).toMatchObject({ matchedCount: 1, totalCount: 1, meaningfulMatchedCount: 1, coverage: 1, fullyMatched: true });
  });

  it('matches an exact unknown label in either language but never matches an empty label', () => {
    const english = ingredient('Unregistered special blend');
    const blank = ingredient('  ');
    const result = matchRacionIngredients([english, blank], ['Unregistered special blend', '']);
    expect(result.available).toEqual([english]);
    expect(result.unknown).toEqual([blank]);
    expect(result.fullyMatched).toBe(false);
  });

  it('does not claim an empty recipe is complete or divide by zero', () => {
    expect(matchRacionIngredients([], ['Яйца'])).toEqual({
      available: [], assumedPantry: [], compatible: [], compatibleCount: 0, missing: [], unknown: [], matchedCount: 0, totalCount: 0,
      missingCount: 0, unknownCount: 0, meaningfulMatchedCount: 0, coverage: 0, fullyMatched: false,
    });
  });

  it('keeps actual source rows separate from assumed pantry while excluding staples from default counters', () => {
    const rice = ingredient('Рис');
    const salt = ingredient('Соль', { pantry: false });
    const pepper = ingredient('Чёрный перец');
    const source = Object.freeze([rice, salt, pepper]);
    const result = matchRacionIngredients(source, ['Рис', 'Соль']);
    expect(result.available).toEqual([rice, salt]);
    expect(result.assumedPantry).toEqual([pepper]);
    expect(result.assumedPantry[0]).toBe(pepper);
    expect(result.missing).toEqual([]);
    expect(result).toMatchObject({ matchedCount: 1, totalCount: 1, meaningfulMatchedCount: 1, coverage: 1, fullyMatched: true });
    const strict = matchRacionIngredients(source, ['Рис', 'Соль'], { assumePantryStaples: false });
    expect(strict.assumedPantry).toEqual([]);
    expect(strict.missing).toEqual([pepper]);
    expect(strict).toMatchObject({ matchedCount: 2, totalCount: 3, missingCount: 1, meaningfulMatchedCount: 1, fullyMatched: false });
  });

  it('never treats a provider pantry flag as permission to ignore food or unknown mixtures', () => {
    const milk = ingredient('Молоко', { pantry: true });
    const mixture = ingredient('Экзотическая смесь', { pantry: true });
    const result = matchRacionIngredients([milk, mixture], []);
    expect(result.assumedPantry).toEqual([]);
    expect(result.missing).toEqual([milk]);
    expect(result.unknown).toEqual([mixture]);
  });

  it('deduplicates absent aliases and unknown labels for counters without deleting source positions', () => {
    const source = [ingredient('Milk'), ingredient('Молоко'), ingredient('  Смесь без словаря '), ingredient('смесь без словаря')];
    const result = matchRacionIngredients(source, []);
    expect(result.missing).toHaveLength(2);
    expect(result.unknown).toHaveLength(2);
    expect(result).toMatchObject({ totalCount: 2, matchedCount: 0, missingCount: 1, unknownCount: 1, meaningfulMatchedCount: 0 });
  });

  it.each([true, false])('does not call an all-pantry recipe complete when assumePantryStaples=%s', assumePantryStaples => {
    const result = matchRacionIngredients([ingredient('Соль'), ingredient('Вода')], ['Соль', 'Вода'], { assumePantryStaples });
    expect(result.available).toHaveLength(2);
    expect(result.meaningfulMatchedCount).toBe(0);
    expect(result.fullyMatched).toBe(false);
  });
});
