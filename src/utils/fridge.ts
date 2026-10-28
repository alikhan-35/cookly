import { fridgeCategories, type FridgeItem } from '../types';
import { matchingProductKey } from './pantryProducts';

export const FRIDGE_STORAGE_KEY = 'cookly:fridge';
export const MAX_FRIDGE_ITEMS = 100;
export const fridgeUnits = ['', 'г', 'кг', 'мл', 'л', 'шт.', 'уп.', 'пучок'] as const;
export type FridgeInput = Omit<FridgeItem, 'id'>;
export type FridgeUpdateMode = 'add' | 'set';

/** Only compatible, explicit units can be converted. A pack has no assumed weight. */
export function convertFridgeAmount(amount: number, fromUnit: string, toUnit: string): number | null {
  if (!Number.isFinite(amount) || amount < 0 || !fromUnit || !toUnit) return null;
  if (!(fridgeUnits as readonly string[]).includes(fromUnit) || !(fridgeUnits as readonly string[]).includes(toUnit)) return null;
  if (fromUnit === toUnit) return amount;
  const mass: Record<string, number> = { 'г': 1, 'кг': 1000 };
  const volume: Record<string, number> = { 'мл': 1, 'л': 1000 };
  for (const group of [mass, volume]) {
    if (group[fromUnit] && group[toUnit]) return amount * group[fromUnit] / group[toUnit];
  }
  return null;
}

export function formatFridgeQuantity(item: Pick<FridgeInput, 'amount' | 'unit'>): string {
  return item.amount === undefined ? 'Есть дома' : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(item.amount)}${item.unit ? ` ${item.unit}` : ' (без единицы)'}`;
}

/** Shared by the preview and commit, so the displayed result is the result we save. */
export function previewFridgeUpdate(input: FridgeInput, existing: FridgeItem | undefined, mode: FridgeUpdateMode): { input: FridgeInput; note: string } {
  const clean: FridgeInput = { ...input, name: cleanFridgeName(input.name) };
  if (!existing) return { input: clean, note: `Новый продукт · ${formatFridgeQuantity(clean)}` };
  const expiresOn = [existing.expiresOn, input.expiresOn].filter((value): value is string => Boolean(value)).sort()[0];
  const next: FridgeInput = { name: existing.name, category: input.category === 'Другое' ? existing.category : input.category,
    unit: existing.unit, ...(expiresOn ? { expiresOn } : {}) };
  let explanation = '';
  if (mode === 'set') {
    next.amount = input.amount ?? existing.amount;
    next.unit = input.amount === undefined ? existing.unit : input.unit;
    explanation = input.amount === undefined ? 'Наличие подтверждено, прежнее количество сохранено.' : 'Это весь текущий остаток, количество заменится.';
  } else if (existing.amount !== undefined && input.amount !== undefined) {
    const converted = convertFridgeAmount(input.amount, input.unit, existing.unit);
    if (converted !== null && existing.amount + converted <= 1_000_000) {
      next.amount = Math.round((existing.amount + converted) * 1e6) / 1e6;
      explanation = 'Покупка прибавится к запасу.';
    } else {
      explanation = 'Количество нельзя безопасно сложить. Сохраним наличие без количества; точный остаток можно указать вручную.';
    }
  } else {
    explanation = 'Количество одной из покупок неизвестно. Сохраним наличие без количества; точный остаток можно указать вручную.';
  }
  if (existing.expiresOn) explanation += ' Прежний срок не продлеваем.';
  return { input: next, note: `${formatFridgeQuantity(existing)} → ${formatFridgeQuantity(next)}. ${explanation}` };
}

export function planFridgeBatch(inputs: FridgeInput[], items: FridgeItem[], mode: FridgeUpdateMode = 'add', makeId = () => `fridge-${Date.now()}-${Math.random().toString(36).slice(2)}`): { items: FridgeItem[]; addedCount: number; error: string | null } {
  const fail = (error: string) => ({ items, addedCount: 0, error });
  if (!inputs.length) return fail('Выберите хотя бы один продукт.');
  if (inputs.length > 40) return fail('За один раз можно добавить до 40 продуктов.');
  const next = [...items];
  const selected = new Set<string>();
  let addedCount = 0;
  for (const input of inputs) {
    const error = validateFridgeInput(input, []);
    if (error) return fail(`${cleanFridgeName(input.name)}: ${error}`);
    const key = matchingProductKey(input.name);
    if (selected.has(key)) return fail(`${cleanFridgeName(input.name)}: продукт повторяется в списке. Уточните количество в одной строке.`);
    selected.add(key);
    const index = next.findIndex(item => matchingProductKey(item.name) === key);
    if (index < 0 && next.length >= MAX_FRIDGE_ITEMS) return fail('В холодильнике уже 100 продуктов. Удалите ненужные, чтобы добавить новый.');
    const existing = index < 0 ? undefined : next[index];
    const merged = { ...previewFridgeUpdate(input, existing, mode).input, id: existing?.id ?? makeId() };
    if (index < 0) { next.push(merged); addedCount++; } else next[index] = merged;
  }
  return { items: next, addedCount, error: null };
}

export interface StoredFridgeState {
  version: 2;
  items: FridgeItem[];
  appliedConsumptionIds: string[];
  importedReceiptIds: string[];
}

export function parseFridgeState(value: unknown): StoredFridgeState {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const validIds = (ids: unknown): string[] => Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 250))].slice(-100) : [];
  return { version: 2, items: parseFridgeItems(raw ? raw.items : value), appliedConsumptionIds: validIds(raw?.appliedConsumptionIds), importedReceiptIds: validIds(raw?.importedReceiptIds) };
}

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
  if (items.some(item => item.id !== editingId && matchingProductKey(item.name) === matchingProductKey(name))) {
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

/** Validate the entire selection before the inventory is changed. */
export function validateFridgeBatch(inputs: FridgeInput[], items: FridgeItem[]): string | null {
  return planFridgeBatch(inputs, items).error;
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
    const normalized = matchingProductKey(name);
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
