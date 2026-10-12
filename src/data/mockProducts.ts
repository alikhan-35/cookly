import type { Ingredient } from '../types';
import { normalizeIngredient } from '../utils/ingredients';

export interface MockProduct { id: string; name: string; amount: number; unit: string; price: number }
export const mockProducts: MockProduct[] = [
  { id: 'chicken', name: 'Курица', amount: 500, unit: 'г', price: 1690 },
  { id: 'potato', name: 'Картофель', amount: 1, unit: 'кг', price: 390 },
  { id: 'onion', name: 'Лук', amount: 1, unit: 'кг', price: 280 },
  { id: 'tomato', name: 'Помидоры', amount: 500, unit: 'г', price: 790 },
  { id: 'cheese', name: 'Сыр', amount: 200, unit: 'г', price: 1290 },
  { id: 'sour-cream', name: 'Сметана', amount: 300, unit: 'г', price: 790 },
  { id: 'egg', name: 'Яйца', amount: 10, unit: 'шт.', price: 890 },
  { id: 'milk', name: 'Молоко', amount: 1, unit: 'л', price: 590 },
  { id: 'flour', name: 'Мука', amount: 1, unit: 'кг', price: 490 },
  { id: 'rice', name: 'Рис', amount: 800, unit: 'г', price: 890 },
  { id: 'pasta', name: 'Макароны', amount: 400, unit: 'г', price: 590 },
  { id: 'buckwheat', name: 'Гречка', amount: 800, unit: 'г', price: 790 },
  { id: 'carrot', name: 'Морковь', amount: 1, unit: 'кг', price: 350 },
  { id: 'cucumber', name: 'Огурцы', amount: 500, unit: 'г', price: 690 },
  { id: 'cabbage', name: 'Капуста', amount: 1, unit: 'кг', price: 330 },
  { id: 'zucchini', name: 'Кабачок', amount: 500, unit: 'г', price: 650 },
  { id: 'mince', name: 'Фарш', amount: 500, unit: 'г', price: 2190 },
  { id: 'beef-mince', name: 'Говяжий фарш', amount: 500, unit: 'г', price: 2490 },
  { id: 'fish', name: 'Рыба', amount: 500, unit: 'г', price: 2390 },
  { id: 'mushroom', name: 'Шампиньоны', amount: 300, unit: 'г', price: 990 },
  { id: 'cream', name: 'Сливки', amount: 200, unit: 'мл', price: 990 },
  { id: 'butter', name: 'Сливочное масло', amount: 180, unit: 'г', price: 1190 },
  { id: 'yogurt', name: 'Натуральный йогурт', amount: 250, unit: 'г', price: 590 },
  { id: 'cottage', name: 'Творог', amount: 300, unit: 'г', price: 1090 },
  { id: 'garlic', name: 'Чеснок', amount: 1, unit: 'шт.', price: 190 },
  { id: 'tomato-paste', name: 'Томатная паста', amount: 200, unit: 'г', price: 590 },
  { id: 'lentils', name: 'Чечевица', amount: 400, unit: 'г', price: 890 },
  { id: 'beans', name: 'Консервированная фасоль', amount: 400, unit: 'г', price: 690 },
  { id: 'oats', name: 'Овсяные хлопья', amount: 400, unit: 'г', price: 490 },
  { id: 'bread', name: 'Хлеб', amount: 400, unit: 'г', price: 390 },
  { id: 'banana', name: 'Банан', amount: 1, unit: 'шт.', price: 250 },
  { id: 'apple', name: 'Яблоко', amount: 1, unit: 'шт.', price: 220 },
];

export function findMockProduct(ingredient: Ingredient): MockProduct {
  const key = normalizeIngredient(ingredient.name);
  return mockProducts.find(product => normalizeIngredient(product.name) === key) ?? {
    id: `generic-${key}`, name: ingredient.name,
    amount: ingredient.amount, unit: ingredient.unit, price: 750,
  };
}
function toGrams(ingredient: Pick<Ingredient, 'name' | 'amount' | 'unit'>): number | null {
  if (ingredient.unit === 'г') return ingredient.amount;
  if (ingredient.unit === 'кг') return ingredient.amount * 1000;
  if (ingredient.unit === 'мл') return ingredient.amount;
  if (ingredient.unit === 'л') return ingredient.amount * 1000;
  if (ingredient.unit.startsWith('ст.')) return ingredient.amount * 15;
  if (ingredient.unit.startsWith('ч.')) return ingredient.amount * 5;
  const itemMass: Record<string, number> = { картофель: 160, лук: 120, помидоры: 150, огурцы: 150, морковь: 100, кабачок: 300 };
  const mass = itemMass[normalizeIngredient(ingredient.name)];
  return mass && ingredient.unit.startsWith('шт') ? ingredient.amount * mass : null;
}
export function requiredPacks(ingredient: Ingredient, product: MockProduct): number {
  const amount = toGrams(ingredient);
  const pack = toGrams(product);
  if (amount !== null && pack !== null) return Math.max(1, Math.ceil(amount / pack));
  if (ingredient.unit.replace('.', '') === product.unit.replace('.', '')) return Math.max(1, Math.ceil(ingredient.amount / product.amount));
  return 1;
}
export function money(value: number) { return `${value.toLocaleString('ru-RU')} ₸`; }
