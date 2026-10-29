import { describe, expect, it } from 'vitest';
import { matchingProductKey, pantryProductKey, uniquePantryProducts } from './pantryProducts';
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

  it('deduplicates real catalog aliases while retaining the first original label', () => {
    expect(uniquePantryProducts(['Картошка', 'Картофель', 'Яйцо', 'Яйца', 'Филе курицы', 'Куриная грудка', 'Курица']))
      .toEqual(['Картошка', 'Яйцо', 'Филе курицы', 'Курица']);
    expect(matchingProductKey('Масло оливковое')).toBe(matchingProductKey('Оливковое масло'));
    expect(pantryProductKey).toBe(matchingProductKey);
  });

  it('uses exact text for unknown products and never merges varieties or preparation states', () => {
    expect(matchingProductKey('  Паста   мисо. ')).toBe(matchingProductKey('паста мисо'));
    for (const [first, second] of [['Курица', 'Куриное филе'], ['Оливковое масло', 'Подсолнечное масло'], ['Рис', 'Варёный рис'], ['Сливки', 'Сметана'], ['Помидоры', 'Помидоры черри']]) {
      expect(matchingProductKey(first)).not.toBe(matchingProductKey(second));
    }
    expect(matchingProductKey('')).toBe('');
  });
});


describe('everyday fridge product identities', () => {
  it.each([
    ['Рис', 'Рисовая крупа'],
    ['Картофель', 'Картошка'],
    ['Яйца', 'Куриные яйца'],
    ['Говядина', 'Говяжье мясо'],
    ['Баранина', 'Баранье мясо'],
    ['Сёмга', 'Атлантический лосось'],
    ['капуста', 'Капуста белокочанная'],
    ['Мандарины', 'Мандарин'],
    ['Масло сливочное', 'Сливочное масло'],
    ['Сельдь', 'Селёдка'],
    ['Сыр', 'Cheese'],
    ['Гречка', 'Гречневая крупа'],
    ['Сыр твердый', 'Твёрдый сыр'],
  ])('recognizes %s and %s as the same product', (stock, source) => {
    expect(matchingProductKey(stock)).toBe(matchingProductKey(source));
  });

  it.each([
    ['Баранина', 'Бараний фарш'],
    ['Сёмга', 'Лосось'],
    ['Сёмга', 'Сёмга слабосолёная'],
    ['Сельдь', 'Сельдь солёная'],
    ['Сыр', 'Твёрдый сыр'],
    ['Твёрдый сыр', 'Моцарелла'],
    ['Капуста', 'Квашеная капуста'],
  ])('does not merge inventory cards for %s and %s', (first, second) => {
    expect(matchingProductKey(first)).not.toBe(matchingProductKey(second));
  });
});
