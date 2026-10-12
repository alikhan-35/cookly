import { fridgeCategories, type FridgeItem } from '../types';
import { normalizeIngredient } from './ingredients';

export const FRIDGE_STORAGE_KEY = 'cookly:fridge';
export const MAX_FRIDGE_ITEMS = 100;
export const fridgeUnits = ['', 'г', 'кг', 'мл', 'л', 'шт.', 'уп.', 'пучок'] as const;
export type FridgeInput = Omit<FridgeItem, 'id'>;

export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isValidExpiry(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function expiryDays(expiresOn: string | undefined, today = localDateString()): number | null {
  if (!isValidExpiry(expiresOn) || !isValidExpiry(today)) return null;
  const [year, month, day] = expiresOn.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000);
}

export function usableFridgeNames(items: FridgeItem[], today = localDateString()): string[] {
  return items.filter(item => !item.expiresOn || item.expiresOn >= today).map(item => item.name);
}

export function cleanFridgeName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  return name.charAt(0).toLocaleUpperCase('ru-RU') + name.slice(1);
}

export function validateFridgeInput(input: FridgeInput, items: FridgeItem[], editingId?: string): string | null {
  const name = cleanFridgeName(input.name);
  if (!name || !/\p{L}/u.test(name)) return 'Введите название продукта, например «Куриное филе».';
  if (name.length > 60) return 'Название должно содержать не больше 60 символов.';
  if (items.some(item => item.id !== editingId && normalizeIngredient(item.name) === normalizeIngredient(name))) {
    return 'Этот продукт уже есть в холодильнике. Измените его количество в карточке.';
  }
  if (!editingId && items.length >= MAX_FRIDGE_ITEMS) return 'В холодильнике уже 100 продуктов. Удалите ненужные, чтобы добавить новый.';
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000)) {
    return 'Количество должно быть больше нуля и не больше 1 000 000.';
  }
  if (!(fridgeUnits as readonly string[]).includes(input.unit)) return 'Выберите единицу измерения из списка.';
  if (!(fridgeCategories as readonly string[]).includes(input.category)) return 'Выберите категорию из списка.';
  if (input.expiresOn && !isValidExpiry(input.expiresOn)) return 'Укажите корректную дату срока годности.';
  return null;
}

/** Recover valid inventory entries without trusting old or manually edited browser data. */
export function parseFridgeItems(value: unknown): FridgeItem[] {
  if (!Array.isArray(value)) return [];
  const names = new Set<string>();
  const ids = new Set<string>();
  const result: FridgeItem[] = [];
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.name !== 'string') continue;
    const name = cleanFridgeName(raw.name);
    const normalized = normalizeIngredient(name);
    if (!name || name.length > 60 || !/\p{L}/u.test(name) || names.has(normalized)) continue;
    let id = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 100 ? raw.id : `fridge-restored-${index}`;
    while (ids.has(id)) id = `${id}-${index}`;
    const amount = typeof raw.amount === 'number' && Number.isFinite(raw.amount) && raw.amount > 0 && raw.amount <= 1_000_000 ? raw.amount : undefined;
    const unit = typeof raw.unit === 'string' && (fridgeUnits as readonly string[]).includes(raw.unit) ? raw.unit : '';
    const category = fridgeCategories.find(category => category === raw.category) ?? 'Другое';
    const expiresOn = isValidExpiry(raw.expiresOn) ? raw.expiresOn : undefined;
    result.push({ id, name, unit, category, ...(amount !== undefined ? { amount } : {}), ...(expiresOn ? { expiresOn } : {}) });
    names.add(normalized);
    ids.add(id);
    if (result.length >= MAX_FRIDGE_ITEMS) break;
  }
  return result;
}
