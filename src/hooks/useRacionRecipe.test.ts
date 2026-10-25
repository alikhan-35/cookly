import { describe, expect, it } from 'vitest';
import { racionQuantity, readRacionNavigationState } from './useRacionRecipe';

const normalizedSpaces = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');

describe('Racion source quantities per one portion', () => {
  it('scales a source amount for the selected family size', () => {
    expect(normalizedSpaces(racionQuantity(200, 'g', 6))).toBe('1 200 г');
    expect(racionQuantity(150, 'ml', 2)).toBe('300 мл');
  });

  it('preserves fractional pieces and the source unit instead of rounding up eggs or converting measures', () => {
    expect(racionQuantity(0.5, 'pcs', 3)).toBe('1,5 шт.');
    expect(racionQuantity(0.5, 'ст. л.', 3)).toBe('1,5 ст. л.');
  });

  it('keeps unknown amounts unknown for any number of servings', () => {
    expect(racionQuantity(null, 'g', 1)).toBe('Количество не указано');
    expect(racionQuantity(null, 'g', 6)).toBe('Количество не указано');
  });

  it('does not replace a genuine zero with an unknown amount', () => {
    expect(racionQuantity(0, 'g', 3)).toBe('0 г');
  });

  it('keeps small positive seasoning amounts visible', () => {
    expect(racionQuantity(0.002, 'g', 2)).toBe('0,004 г');
  });

  it('never prints Infinity after multiplication overflow', () => {
    expect(racionQuantity(Number.MAX_VALUE, 'g', 6)).toBe('Количество не указано');
  });
});

describe('Racion comparison stock in navigation state', () => {
  it('keeps an intentional empty set so the detail does not fall back to a different pantry', () => {
    expect(readRacionNavigationState({ comparisonStock: [] }).comparisonStock).toEqual([]);
    expect(readRacionNavigationState(null).comparisonStock).toBeUndefined();
  });

  it('preserves distinct original product labels and the catalogue filters', () => {
    expect(readRacionNavigationState({ comparisonStock: ['Куриное филе', 'Курица', 'Оливковое масло'], catalogSearch: '?q=курица&offset=12' })).toEqual({
      comparisonStock: ['Куриное филе', 'Курица', 'Оливковое масло'], catalogSearch: '?q=курица&offset=12',
    });
  });

  it('rejects a malformed set as a whole instead of silently removing a product', () => {
    for (const comparisonStock of [['Яйца', 3], ['Молоко\n'], ['x'.repeat(121)], Array.from({ length: 101 }, () => 'Рис')]) {
      expect(readRacionNavigationState({ comparisonStock }).comparisonStock).toBeUndefined();
    }
  });

  it('copies valid history state so later mutations cannot alter the comparison', () => {
    const original = ['Куриное филе'];
    const value = readRacionNavigationState({ comparisonStock: original });
    original.push('Соль');
    expect(value.comparisonStock).toEqual(['Куриное филе']);
  });

  it('ignores external destinations and controls in the catalogue return query', () => {
    expect(readRacionNavigationState({ catalogSearch: 'https://example.com/' })).toEqual({});
    expect(readRacionNavigationState({ catalogSearch: '?q=яйца\n' })).toEqual({});
    expect(readRacionNavigationState({ catalogSearch: '' }).catalogSearch).toBe('');
  });
});
