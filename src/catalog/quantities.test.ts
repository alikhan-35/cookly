import { describe, expect, it } from 'vitest';
import { parseIngredientQuantity } from './quantities';

describe('catalog quantity parsing', () => {
  it.each([
    ['150g', 150, 'g', '150', 'g'],
    ['1.5kg', 1500, 'g', '1.5', 'kg'],
    ['0,25 л', 250, 'ml', '0,25', 'л'],
    ['125ml', 125, 'ml', '125', 'ml'],
    ['1/2 tsp', 0.5, 'tsp', '1/2', 'tsp'],
    ['1 1/2 cups', 1.5, 'cup', '1 1/2', 'cups'],
    ['1 ½ tbsp', 1.5, 'tbsp', '1 ½', 'tbsp'],
    ['¾ cup', 0.75, 'cup', '¾', 'cup'],
    ['1¼ kg', 1250, 'g', '1¼', 'kg'],
    ['2 ст. л.', 2, 'tbsp', '2', 'ст. л.'],
    ['2 pieces', 2, 'piece', '2', 'pieces'],
    ['1 Packet', 1, 'packet', '1', 'Packet'],
    ['2kg cut cubes', 2000, 'g', '2', 'kg'],
    ['500g chopped', 500, 'g', '500', 'g'],
    ['500 g, finely chopped', 500, 'g', '500', 'g'],
    ['2 кг, нарезать кубиками', 2000, 'g', '2', 'кг'],
    ['1 litre hot', 1000, 'ml', '1', 'litre'],
    ['1 л, горячий', 1000, 'ml', '1', 'л'],
  ])('parses %s without inventing conversions', (raw, normalizedAmount, normalizedUnit, originalAmount, originalUnit) => {
    expect(parseIngredientQuantity(raw)).toMatchObject({
      normalizedAmount, normalizedUnit, originalAmount, originalUnit,
      canScale: true, needsClarification: false,
    });
  });

  it('retains cups and packets rather than guessing grams or millilitres', () => {
    const cup = parseIngredientQuantity('1 cup');
    const packet = parseIngredientQuantity('1 packet');
    expect(cup.normalizedUnit).toBe('cup');
    expect(packet.normalizedUnit).toBe('packet');
    expect(cup.normalizedAmount).toBe(1);
    expect(packet.normalizedAmount).toBe(1);
  });

  it.each([
    '', 'To taste', 'Dash', 'Pinch', 'Juice of 1', 'Zest of 1', 'Minced', '2', '4',
    '1-2 tsp', '1 to 2 cups', '1/0 g', '0 g', '-2 g',
    '2 tbs chopped', '2 medium', '1/2 bag', '2 oz', '1 lb',
    '1 clove finely chopped', '1/2 tsp or more', '1 large', '1 garnish',
    '500-600g chopped', '500g chopped or more', '500g approximately', '500g chopped plus 1 tsp',
    '1 cup chopped', '2kg, to taste', '1 litre hot or cold', '500g drained weight unknown',
  ])('keeps ambiguous measure %s unscalable', (raw) => {
    expect(parseIngredientQuantity(raw)).toMatchObject({
      normalizedAmount: null, normalizedUnit: null, canScale: false, needsClarification: true,
    });
  });

  it('preserves recognized source tokens even when additional text prevents arithmetic', () => {
    expect(parseIngredientQuantity('2kg cut cubes or more')).toMatchObject({
      originalAmount: '2', originalUnit: 'kg', normalizedAmount: null, canScale: false,
    });
    expect(parseIngredientQuantity('2 oz')).toMatchObject({
      originalAmount: '2', originalUnit: 'oz', normalizedAmount: null, canScale: false,
    });
  });

  it('does not invent pieces for a unitless source number', () => {
    expect(parseIngredientQuantity('4')).toMatchObject({
      originalAmount: '4', originalUnit: null, normalizedUnit: null,
      canScale: false, needsClarification: true,
    });
    expect(parseIngredientQuantity('4 pieces')).toMatchObject({
      normalizedAmount: 4, normalizedUnit: 'piece', canScale: true, needsClarification: false,
    });
  });
});
