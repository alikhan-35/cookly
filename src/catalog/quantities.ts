import type { IngredientQuantity, NormalizedUnit } from './types';

const fractionValues: Record<string, number> = {
  '¼': 1 / 4, '½': 1 / 2, '¾': 3 / 4, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 1 / 10,
  '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const fractionChars = Object.keys(fractionValues).join('');
const amountPattern = new RegExp(`^(\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*[${fractionChars}]|\\d+\\s*/\\s*\\d+|\\d+(?:[.,]\\d+)?|[${fractionChars}])`);

interface UnitDefinition { unit: NormalizedUnit; factor: number; aliases: string[]; }
const units: UnitDefinition[] = [
  { unit: 'g', factor: 1000, aliases: ['kilograms', 'kilogram', 'kgs', 'kg', 'килограммов', 'килограмма', 'килограмм', 'кг'] },
  { unit: 'g', factor: 1, aliases: ['grams', 'gram', 'gr', 'g', 'граммов', 'грамма', 'грамм', 'гр', 'г'] },
  { unit: 'ml', factor: 1000, aliases: ['litres', 'litre', 'liters', 'liter', 'l', 'литров', 'литра', 'литр', 'л'] },
  { unit: 'ml', factor: 1, aliases: ['millilitres', 'millilitre', 'milliliters', 'milliliter', 'ml', 'миллилитров', 'миллилитра', 'миллилитр', 'мл'] },
  { unit: 'tsp', factor: 1, aliases: ['teaspoons', 'teaspoon', 'tsp', 'ч. л.', 'ч.л.', 'ч л', 'чайных ложек', 'чайные ложки', 'чайная ложка'] },
  { unit: 'tbsp', factor: 1, aliases: ['tablespoons', 'tablespoon', 'tblsp', 'tbsp', 'tbls', 'tbs', 'ст. л.', 'ст.л.', 'ст л', 'столовых ложек', 'столовые ложки', 'столовая ложка'] },
  { unit: 'cup', factor: 1, aliases: ['cups', 'cup', 'чашек', 'чашки', 'чашка'] },
  { unit: 'packet', factor: 1, aliases: ['packets', 'packet', 'packs', 'pack', 'упаковок', 'упаковки', 'упаковка', 'уп.', 'уп'] },
  { unit: 'piece', factor: 1, aliases: ['pieces', 'piece', 'шт.', 'шт', 'штук', 'штуки', 'штука'] },
];

function readAmount(value: string): number | null {
  const text = value.trim();
  const unicode = text.at(-1);
  if (unicode && unicode in fractionValues) {
    const whole = text.slice(0, -1).trim();
    return (whole ? Number(whole) : 0) + fractionValues[unicode];
  }
  if (text.includes('/')) {
    const match = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(text);
    if (!match || Number(match[3]) === 0) return null;
    return Number(match[1] ?? 0) + Number(match[2]) / Number(match[3]);
  }
  const amount = Number(text.replace(',', '.'));
  return Number.isFinite(amount) ? amount : null;
}

/** A finite allowlist, not removal of arbitrary words that might contain a range or qualifier. */
function isExactPreparation(unit: NormalizedUnit, description: string): boolean {
  const text = description.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/^,\s*/, '');
  if (unit === 'g') {
    return /^(?:(?:finely|roughly|thinly)\s+)?(?:chopped|diced|sliced|cubed|minced|grated|cut (?:into )?cubes|melted|softened)$/.test(text)
      || /^(?:нарезать кубиками|(?:мелко )?(?:нарезан(?:ный|ная|ное|ные)|измельчен(?:ный|ная|ное|ные))(?: (?:кубиками|ломтиками))?|растоплен(?:ный|ная|ное)|размягчен(?:ный|ная|ное))$/.test(text);
  }
  // This changes neither the source volume nor the unit; temperature is retained in originalMeasure.
  return unit === 'ml' && /^(?:hot|warm|cold|горячий|горячая|горячее|горячего|теплый|теплая|теплое|холодный|холодная|холодное)$/.test(text);
}

/** Only exact mass/volume conversions are allowed; cup and packet stay distinct units. */
export function parseIngredientQuantity(raw: string): IngredientQuantity {
  const result: IngredientQuantity = {
    originalAmount: null, originalUnit: null, normalizedAmount: null, normalizedUnit: null,
    canScale: false, needsClarification: true,
  };
  const input = raw.trim().replace(/\u00a0/g, ' ');
  const amountMatch = amountPattern.exec(input);
  if (!amountMatch) return { ...result, note: 'Количество не задано точным числом.' };

  result.originalAmount = amountMatch[0];
  const amount = readAmount(amountMatch[0]);
  const remainder = input.slice(amountMatch[0].length).trim();
  let definition: UnitDefinition | undefined;
  let trailing = remainder;
  // Match complete unit tokens, never the "g" in "garnish" or the "l" in "large".
  outer: for (const candidate of units) {
    for (const alias of candidate.aliases) {
      if (remainder.toLocaleLowerCase('ru-RU').startsWith(alias)
        && (remainder.length === alias.length || /[\s,]/.test(remainder[alias.length]))) {
        definition = candidate;
        result.originalUnit = remainder.slice(0, alias.length);
        trailing = remainder.slice(alias.length).trim();
        break outer;
      }
    }
  }
  if (!definition && remainder) {
    const unsupportedUnit = /^(ounces?|oz|lbs?|pounds?|cans?|jars?|bags?|cloves?|strips?|heads?|унци[яий]|фунт(?:а|ов)?|бан(?:ка|ки|ок)|зубчик(?:а|ов)?)(?=\s|$)/i.exec(remainder);
    result.originalUnit = unsupportedUnit?.[0] ?? null;
  }

  if (amount === null || amount <= 0 || !Number.isFinite(amount)) {
    return { ...result, note: 'Количество требует проверки.' };
  }
  if ((trailing && (!definition || !isExactPreparation(definition.unit, trailing))) || (!definition && remainder)) {
    return { ...result, note: 'Единица, диапазон или описание приготовления требуют уточнения; исходная мера сохранена.' };
  }
  if (!definition) {
    return { ...result, note: 'В источнике указано число без единицы; единица требует уточнения.' };
  }
  const normalizedAmount = amount * definition.factor;
  if (!Number.isFinite(normalizedAmount)) return { ...result, note: 'Количество требует проверки.' };
  return {
    ...result, normalizedAmount, normalizedUnit: definition.unit,
    canScale: true, needsClarification: false,
  };
}
