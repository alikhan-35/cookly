import { describe, expect, it } from 'vitest';
import type { RacionRecipeIngredient } from './racion';
import { buildSourceHaveIds, classifyRacionIngredient, racionSourceProductName } from './racionCompatibility';
import { matchingProductKey } from '../../utils/pantryProducts';

function ingredient(ingredientId: string, name: string): RacionRecipeIngredient {
  return { ingredientId, name, amount: 1, unit: 'g', pantry: false };
}
const userStock = ['Рис', 'Картофель', 'Яйца', 'Говядина', 'Баранина', 'Сёмга', 'капуста', 'Мандарины', 'Масло сливочное', 'Сельдь', 'Сыр', 'Гречка'];

describe('recipe compatibility independent of strict inventory identity', () => {
  it.each([
    ['eggs', 'Яйца куриные', 'Яйца'],
    ['cabbage', 'Капуста белокочанная', 'Капуста'],
    ['butter', 'Масло сливочное', 'Сливочное масло'],
    ['lamb', 'Баранина', 'Баранина'],
    ['buckwheat', 'Гречка', 'Гречневая крупа'],
    ['cheese_hard', 'Сыр твёрдый', 'Твёрдый сыр'],
    ['mandarin', 'Мандарины', 'Мандарин'],
  ])('keeps exact presence for %s', (id, name, stock) => {
    expect(classifyRacionIngredient(ingredient(id, name), [stock])).toBe('exact');
  });

  it.each([
    ['rice', 'Рис длиннозёрный', 'Рис'],
    ['beef_stew', 'Говядина для тушения', 'Говядина'],
    ['cheese_hard', 'Сыр твёрдый', 'Сыр'],
    ['salmon_fillet', 'Филе лосося', 'Сёмга'],
    ['salmon_fillet', 'Филе лосося', 'Лосось'],
    ['salmon_steak', 'Стейк лосося', 'Сёмга'],
    ['milk', 'Молоко 2,5%', 'Молоко'],
    ['sour_cream', 'Сметана 15%', 'Сметана'],
    ['cottage_cheese', 'Творог 5%', 'Творог'],
    ['herring', 'Сельдь солёная (филе)', 'Сельдь солёная'],
  ])('marks a qualified recipe product %s compatible, not exact', (id, name, stock) => {
    expect(classifyRacionIngredient(ingredient(id, name), [stock])).toBe('compatible');
    expect(matchingProductKey(name)).not.toBe(matchingProductKey(stock));
  });

  it.each([
    ['herring', 'Сельдь солёная (филе)', 'Сельдь'],
    ['salmon_fillet', 'Филе лосося', 'Рыба'],
    ['salmon_fillet', 'Филе лосося', 'Треска'],
    ['salmon_fillet', 'Филе лосося', 'Сёмга слабосолёная'],
    ['salmon_fillet', 'Филе лосося', 'Лосось копчёный'],
    ['salmon_salted', 'Лосось слабосолёный', 'Сёмга'],
    ['salmon_fillet', 'Филе лосося', 'Стейк лосося'],
    ['ground_beef', 'Фарш говяжий', 'Говядина'],
    ['cheese_processed', 'Сыр плавленый', 'Сыр'],
    ['rice_round', 'Рис круглозёрный', 'Рис'],
    ['cabbage', 'Капуста белокочанная', 'Квашеная капуста'],
  ])('does not assume an unsupported preparation/species for %s', (id, name, stock) => {
    expect(classifyRacionIngredient(ingredient(id, name), [stock])).toBeNull();
  });

  it('does not grant compatibility to a mismatched source ID/label', () => {
    expect(classifyRacionIngredient(ingredient('salmon_fillet', 'Филе трески'), ['Сёмга'])).toBeNull();
    expect(classifyRacionIngredient(ingredient('unknown_fish', 'Филе лосося'), ['Сёмга'])).toBeNull();
  });

  it('keeps exact labels for newly introduced source products', () => {
    expect(classifyRacionIngredient(ingredient('new_product', 'Неизвестный продукт'), ['неизвестный продукт'])).toBe('exact');
  });

  it('builds official source selectors from the reported real fridge', () => {
    const ids = buildSourceHaveIds(userStock);
    expect(ids).toEqual(expect.arrayContaining(['rice', 'potato', 'eggs', 'beef_stew', 'lamb', 'salmon_fillet', 'salmon_steak', 'cabbage', 'mandarin', 'butter', 'cheese_hard', 'buckwheat']));
    expect(ids).not.toContain('herring'); // Provider herring is explicitly salted.
    expect(ids).not.toContain('salmon_salted');
    expect(ids).not.toContain('ground_beef');
    expect(ids).not.toContain('beef_tenderloin');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('recognizes exact source-qualified products and ignores empty or unknown stock', () => {
    expect(buildSourceHaveIds(['Сельдь солёная (филе)'])).toContain('herring');
    expect(buildSourceHaveIds(['Филе лосося'])).toContain('salmon_fillet');
    expect(buildSourceHaveIds(['Рыба'])).not.toContain('salmon_fillet');
    expect(buildSourceHaveIds(['', '  ', 'Безымянная еда'])).toEqual([]);
    expect(buildSourceHaveIds([])).toEqual([]);
    expect(racionSourceProductName('rice')).toBe('Рис длиннозёрный');
    expect(racionSourceProductName('unknown')).toBeNull();
  });
});
