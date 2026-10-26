import { fridgeCategories, type FridgeCategory } from '../types';
import { resolveIngredient } from '../catalog/ingredients';
import { fridgeUnits } from './fridge';
import { matchingProductKey, pantryProductName } from './pantryProducts';

export const MAX_INTAKE_TEXT = 2000;
export const MAX_INTAKE_PRODUCTS = 40;

export interface IntakeProduct {
  id: string;
  name: string;
  amount?: number;
  unit: string;
  category: FridgeCategory;
  selected: boolean;
  note?: string;
}

export interface IntakeResult {
  products: IntakeProduct[];
  warnings: string[];
  engine: 'local' | 'ai';
}

export class IntakeValidationError extends Error {
  constructor(message = 'Некорректный список продуктов. Проверьте результат распознавания.') {
    super(message);
    this.name = 'IntakeValidationError';
  }
}

const clean = (value: string) => value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/gu, ' ');
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const instructionLike = /^(?:игнорируй|забудь|выполни|вызови|отправь|удали|покажи|system\s*:|assistant\s*:|javascript:|https?:\/\/|<)/iu;

interface KnownProduct { name: string; category: FridgeCategory; countable?: boolean }
const known = new Map<string, KnownProduct>();
function product(name: string, category: FridgeCategory, aliases: string[] = [], countable = false) {
  for (const alias of [name, ...aliases]) known.set(clean(alias), { name, category, countable });
}
product('Курица', 'Мясо', ['курицы']);
product('Куриное филе', 'Мясо', ['куриного филе', 'филе курицы']);
product('Куриная грудка', 'Мясо', ['куриной грудки', 'грудка куриная']);
product('Филе куриного бедра', 'Мясо', ['филе бедра курицы']);
product('Говядина', 'Мясо', ['говядины']);
product('Свинина', 'Мясо', ['свинины']);
product('Индейка', 'Мясо', ['индейки']);
product('Куриный фарш', 'Мясо', ['куриного фарша']);
product('Говяжий фарш', 'Мясо', ['говяжьего фарша', 'фарш говяжий']);
product('Свино-говяжий фарш', 'Мясо', ['свино-говяжьего фарша']);
product('Рыба', 'Рыба', ['рыбы']);
product('Лосось', 'Рыба', ['лосося']);
product('Треска', 'Рыба', ['трески']);
product('Креветки', 'Рыба', ['креветок']);
product('Яйца', 'Яйца', ['яйцо', 'яиц', 'яйца куриные', 'куриных яиц'], true);
product('Молоко', 'Молочные', ['молока']);
product('Сливки', 'Молочные', ['сливок']);
product('Сметана', 'Молочные', ['сметаны']);
product('Творог', 'Молочные', ['творога']);
product('Йогурт', 'Молочные', ['йогурта']);
product('Кефир', 'Молочные', ['кефира']);
product('Сыр', 'Молочные', ['сыра']);
product('Сливочное масло', 'Молочные', ['сливочного масла']);
product('Картофель', 'Овощи', ['картофеля', 'картошка', 'картошки']);
product('Помидоры', 'Овощи', ['помидоров', 'помидор', 'помидора', 'томаты', 'томатов'], true);
product('Помидоры черри', 'Овощи', ['томаты черри', 'помидоров черри'], true);
product('Огурцы', 'Овощи', ['огурцов', 'огурец', 'огурца'], true);
product('Лук', 'Овощи', ['лука', 'репчатого лука', 'репчатый лук']);
product('Морковь', 'Овощи', ['моркови']);
product('Чеснок', 'Овощи', ['чеснока']);
product('Капуста', 'Овощи', ['капусты']);
product('Петрушка', 'Овощи', ['петрушки']);
product('Укроп', 'Овощи', ['укропа']);
product('Базилик', 'Овощи', ['базилика']);
product('Яблоки', 'Фрукты', ['яблоко', 'яблок', 'яблока'], true);
product('Бананы', 'Фрукты', ['банан', 'бананов', 'банана'], true);
product('Лимон', 'Фрукты', ['лимона', 'лимонов', 'лимоны'], true);
product('Рис', 'Крупы', ['риса']);
product('Гречка', 'Крупы', ['гречки', 'гречневой крупы', 'гречневая крупа']);
product('Овсяные хлопья', 'Крупы', ['овсяных хлопьев', 'овсянка', 'овсянки']);
product('Макароны', 'Макароны', ['макарон']);
product('Спагетти', 'Макароны');
product('Оливковое масло', 'Другое', ['оливкового масла']);
product('Растительное масло', 'Другое', ['растительного масла']);
product('Подсолнечное масло', 'Другое', ['подсолнечного масла']);
product('Соль', 'Другое', ['соли']);
product('Сахар', 'Другое', ['сахара']);
product('Мука', 'Другое', ['муки']);
product('Вода', 'Другое', ['воды']);

const categoryIds: Partial<Record<string, FridgeCategory>> = {
  chicken: 'Мясо', chicken_breast: 'Мясо', chicken_fillet: 'Мясо', chicken_thigh_fillet: 'Мясо',
  beef: 'Мясо', beef_mince: 'Мясо', lamb_mince: 'Мясо', pork: 'Мясо', bacon: 'Мясо', sausages: 'Мясо',
  salmon: 'Рыба', prawn: 'Рыба', raw_king_prawn: 'Рыба', egg: 'Яйца', milk: 'Молочные',
  cream: 'Молочные', sour_cream: 'Молочные', greek_yogurt: 'Молочные', butter: 'Молочные', mozzarella: 'Молочные',
  potato: 'Овощи', red_potato: 'Овощи', tomato: 'Овощи', cherry_tomato: 'Овощи', onion: 'Овощи',
  spring_onion: 'Овощи', carrot: 'Овощи', cucumber: 'Овощи', garlic: 'Овощи', cabbage: 'Овощи',
  broccoli: 'Овощи', pumpkin: 'Овощи', mushroom: 'Овощи', apple: 'Фрукты', banana: 'Фрукты',
  lemon: 'Фрукты', lime: 'Фрукты', apricot: 'Фрукты', rice: 'Крупы', buckwheat: 'Крупы', rice_noodles: 'Макароны',
  soy_sauce: 'Соусы', tomato_sauce: 'Соусы', hot_sauce: 'Соусы',
};

const units: Record<string, string> = {};
function unit(output: string, labels: string[]) { for (const label of labels) units[label] = output; }
unit('г', ['г', 'гр', 'грамм', 'грамма', 'граммов']);
unit('кг', ['кг', 'килограмм', 'килограмма', 'килограммов']);
unit('мл', ['мл', 'миллилитр', 'миллилитра', 'миллилитров']);
unit('л', ['л', 'литр', 'литра', 'литров']);
unit('шт.', ['шт', 'штука', 'штуки', 'штук']);
unit('уп.', ['уп', 'упаковка', 'упаковки', 'упаковок', 'пачка', 'пачки', 'пачек']);
unit('пучок', ['пучок', 'пучка', 'пучков']);
const unitPattern = Object.keys(units).sort((a, b) => b.length - a.length).join('|');
const numberWords: Record<string, number> = {
  один: 1, одна: 1, одно: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
  шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, полтора: 1.5, полторы: 1.5,
};
const numberPattern = `(?:[+-]?\\s*\\d+(?:[.,]\\d+)?|(?:${Object.keys(numberWords).join('|')})(?=\\s|$))`;
const leadingQuantity = new RegExp(`^(${numberPattern})\\s*(?:(${unitPattern})\\.?(?=\\s|$))?\\s*(.*)$`, 'iu');
const trailingQuantity = new RegExp(`^(.+?)\\s+(${numberPattern})\\s*(${unitPattern})\\.?$`, 'iu');
const leadingUnit = new RegExp(`^(${unitPattern})\\.?\\s+(.+)$`, 'iu');
const leadingRange = new RegExp(`^(?:от\\s+)?[+-]?\\d+(?:[.,]\\d+)?\\s*(?:[-–—]|до|или)\\s*\\d+(?:[.,]\\d+)?\\s*(?:${unitPattern})?\\.?\\s+(.+)$`, 'iu');

function addWarning(warnings: string[], message: string) {
  if (warnings.length < MAX_INTAKE_PRODUCTS && !warnings.includes(message)) warnings.push(message);
}

function deduplicate(products: IntakeProduct[], warnings: string[]): IntakeProduct[] {
  const unique = new Map<string, IntakeProduct>();
  for (const item of products) {
    const key = matchingProductKey(item.name);
    const previous = unique.get(key);
    if (!previous) { unique.set(key, { ...item }); continue; }
    const hasQuantity = previous.amount !== undefined || item.amount !== undefined;
    const note = hasQuantity ? 'Продукт повторяется. Уточните количество: значения не суммировались.' : 'Повторное название объединено. Проверьте продукт.';
    unique.set(key, { ...previous, amount: undefined, unit: previous.unit === item.unit ? previous.unit : '', selected: false, note });
    addWarning(warnings, `${item.name}: ${note}`);
  }
  return [...unique.values()];
}

function splitProducts(text: string): string[] {
  const protectedDecimals = Array.from(text, (char, index) => char === ',' && /\d/u.test(text[index - 1] ?? '') && /\d/u.test(text[index + 1] ?? '') ? '\uE000' : char).join('');
  return protectedDecimals.split(/\r?\n|;|,|\s+и\s+/iu).map(value => value.replace(/\uE000/gu, ',').trim()).filter(Boolean);
}

/** Deterministic local text parser. It is not an AI model and never adds inventory itself. */
export function parseFridgeText(text: string): IntakeResult {
  const warnings: string[] = [];
  const products: IntakeProduct[] = [];
  if (typeof text !== 'string' || text.length > MAX_INTAKE_TEXT || controls.test(text)) {
    return { products, warnings: [`Введите обычный текст длиной не больше ${MAX_INTAKE_TEXT} символов.`], engine: 'local' };
  }
  const input = text.trim().replace(/^(?:у меня (?:есть|имеется|имеются)|в холодильнике (?:есть|лежат|лежит)|есть)\s*[:,-]?\s*/iu, '');
  for (const fragment of splitProducts(input)) {
    if (products.length >= MAX_INTAKE_PRODUCTS) {
      if (warnings.length >= MAX_INTAKE_PRODUCTS) warnings.pop();
      addWarning(warnings, `За один раз можно разобрать не больше ${MAX_INTAKE_PRODUCTS} продуктов. Остальные не добавлены.`);
      break;
    }
    let name = fragment.replace(/^(?:[•*]|-\s+(?=\p{L}))\s*/u, '').replace(/^(?:а также|также|еще|ещё)\s+/iu, '').trim();
    if (instructionLike.test(name) || /[<>]/u.test(name)) { addWarning(warnings, 'Строка с командой, ссылкой или разметкой не принята как продукт.'); continue; }
    let amount: number | undefined;
    let parsedUnit = '';
    const notes: string[] = [];
    const range = name.match(leadingRange);
    if (range) { name = range[1]; notes.push('Диапазон количества не перенесён: укажите одно точное значение.'); }
    else {
      const approximate = name.match(/^(?:около|примерно|приблизительно|несколько|немного|пара)\s+(.+)$/iu);
      if (approximate) { name = approximate[1]; notes.push('Неопределённое количество: уточните значение.'); }
      const half = name.match(/^(полкило|полкилограмма|пол-?литра)\s+(.+)$/iu);
      if (half) { amount = 0.5; parsedUnit = /^пол-?литра$/iu.test(half[1]) ? 'л' : 'кг'; name = half[2]; }
      else {
        const leading = name.match(leadingQuantity);
        const trailing = leading ? null : name.match(trailingQuantity);
        const unitOnly = leading || trailing ? null : name.match(leadingUnit);
        if (leading) {
          amount = numberWords[clean(leading[1])] ?? Number(leading[1].replace(/\s/gu, '').replace(',', '.'));
          parsedUnit = leading[2] ? units[clean(leading[2])] : '';
          name = leading[3];
        } else if (trailing) {
          name = trailing[1];
          amount = numberWords[clean(trailing[2])] ?? Number(trailing[2].replace(/\s/gu, '').replace(',', '.'));
          parsedUnit = units[clean(trailing[3])];
        } else if (unitOnly) { amount = 1; parsedUnit = units[clean(unitOnly[1])]; name = unitOnly[2]; }
      }
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)) {
        amount = undefined; notes.push('Количество должно быть больше нуля и не больше 1 000 000. Укажите его заново.');
      }
      if (/\d+\s*(?:г|кг|мл|л|шт\.?|уп\.?)(?=\s|$)/iu.test(name) || /(?:^|\s)по\s+\d/iu.test(name)) {
        amount = undefined; notes.push('В строке несколько или неподдерживаемые количества. Проверьте название и единицу.');
      }
      if (approximate) amount = undefined;
    }
    name = name.trim().replace(/[.,;:!?]+$/gu, '').trim();
    if (!name || !/\p{L}/u.test(name)) { addWarning(warnings, `Не найдено название продукта в строке «${fragment.slice(0, 70)}».`); continue; }
    const explicit = known.get(clean(name));
    const identity = explicit ? null : resolveIngredient(name);
    const label = explicit?.name ?? identity?.nameRu ?? pantryProductName(name);
    if (label.length > 60) { addWarning(warnings, `Название «${label.slice(0, 50)}…» длиннее 60 символов. Сократите его вручную.`); continue; }
    if (!explicit && !identity) notes.push('Название не распознано однозначно. Проверьте продукт.');
    if (amount !== undefined && !parsedUnit) {
      if (explicit?.countable && Number.isInteger(amount)) parsedUnit = 'шт.';
      else notes.push('Единица количества не указана. Выберите её перед добавлением.');
    }
    const note = notes.join(' ');
    if (note) addWarning(warnings, `${label}: ${note}`.slice(0, 240));
    products.push({
      id: `intake-${products.length + 1}`, name: label, ...(amount !== undefined ? { amount } : {}),
      unit: parsedUnit, category: explicit?.category ?? (identity ? categoryIds[identity.id] : undefined) ?? 'Другое',
      selected: notes.length === 0, ...(note ? { note: note.slice(0, 240) } : {}),
    });
  }
  return { products: deduplicate(products, warnings), warnings, engine: 'local' };
}

/** Validate data from a future AI adapter; extra instructions/fields are discarded. */
export function validateIntakeResult(value: unknown): IntakeResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IntakeValidationError();
  const result = value as Record<string, unknown>;
  if ((result.engine !== 'local' && result.engine !== 'ai') || !Array.isArray(result.products) || result.products.length > MAX_INTAKE_PRODUCTS
    || !Array.isArray(result.warnings) || result.warnings.length > MAX_INTAKE_PRODUCTS) throw new IntakeValidationError();
  const warnings = result.warnings.map((warning: unknown): string => {
    if (typeof warning !== 'string' || !warning.trim() || warning.length > 240 || /[\u0000-\u001f\u007f<>]/u.test(warning)) throw new IntakeValidationError();
    return warning;
  });
  const ids = new Set<string>();
  const products = result.products.map((entry: unknown): IntakeProduct => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new IntakeValidationError();
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/iu.test(item.id) || ids.has(item.id)) throw new IntakeValidationError();
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60 || !/\p{L}/u.test(item.name)
      || /[\u0000-\u001f\u007f<>]/u.test(item.name) || instructionLike.test(item.name.trim())) throw new IntakeValidationError();
    if (item.amount !== undefined && (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0 || item.amount > 1_000_000)) throw new IntakeValidationError();
    if (typeof item.unit !== 'string' || !(fridgeUnits as readonly string[]).includes(item.unit)
      || typeof item.category !== 'string' || !(fridgeCategories as readonly string[]).includes(item.category)
      || typeof item.selected !== 'boolean') throw new IntakeValidationError();
    if (item.note !== undefined && (typeof item.note !== 'string' || item.note.length > 240 || /[\u0000-\u001f\u007f<>]/u.test(item.note))) throw new IntakeValidationError();
    return {
      id: item.id, name: item.name.trim(), ...(typeof item.amount === 'number' ? { amount: item.amount } : {}),
      unit: item.unit, category: item.category as FridgeCategory, selected: item.selected,
      ...(typeof item.note === 'string' ? { note: item.note } : {}),
    };
  });
  return { products: deduplicate(products, warnings), warnings, engine: result.engine };
}
