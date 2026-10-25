import { describe, expect, it } from 'vitest';
import { pantryProductKey, uniquePantryProducts } from './pantryProducts';
describe('original pantry product labels', () => {
  it('preserves both whole meat and fillet and both oil varieties', () => {
    expect(uniquePantryProducts(['Куриное филе', 'Курица', 'Оливковое масло', 'Растительное масло']))
      .toEqual(['Куриное филе', 'Курица', 'Оливковое масло', 'Растительное масло']);
  });
  it('deduplicates only spelling whitespace and case, including ё', () => {
    expect(uniquePantryProducts(['  Зелёный   лук ', 'зеленый лук', 'Куриное филе', 'куриное филе'])).toEqual(['Зелёный лук', 'Куриное филе']);
    expect(pantryProductKey('Куриное филе')).not.toBe(pantryProductKey('Курица'));
  });
  it('limits and ignores empty labels', () => { expect(uniquePantryProducts(['', 'Рис', 'Лук'], 1)).toEqual(['Рис']); });
});
