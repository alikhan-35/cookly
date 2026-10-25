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

  it('does not assume pantry products or infer food identity from a provider ID', () => {
    const salt = ingredient('Соль', { pantry: true });
    const oil = ingredient('Растительное масло', { pantry: true });
    const unknown = ingredient('Неизвестная смесь', { ingredientId: 'chicken', pantry: true });
    const result = matchRacionIngredients([salt, oil, unknown], ['Курица']);
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
    expect(result).toMatchObject({ matchedCount: 2, totalCount: 2, coverage: 1, fullyMatched: true });
  });

  it('keeps unknown English labels and blank labels unresolved rather than creating raw aliases', () => {
    const english = ingredient('Unregistered special blend');
    const blank = ingredient('  ');
    const result = matchRacionIngredients([english, blank], ['Unregistered special blend', '']);
    expect(result.available).toEqual([]);
    expect(result.unknown).toEqual([english, blank]);
    expect(result.fullyMatched).toBe(false);
  });

  it('does not claim an empty recipe is complete or divide by zero', () => {
    expect(matchRacionIngredients([], ['Яйца'])).toEqual({
      available: [], missing: [], unknown: [], matchedCount: 0, totalCount: 0, coverage: 0, fullyMatched: false,
    });
  });
});
