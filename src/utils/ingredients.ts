import type { UserProfile } from '../types';

/** Canonical ingredient names keep chips, stored lists and recipe matching consistent. */
const aliasGroups: Record<string, string[]> = {
  курица: ['курицы', 'куриное филе', 'филе курицы', 'куриная грудка', 'куриные грудки', 'грудка куриная', 'куриное мясо', 'chicken', 'chicken breast'],
  картофель: ['картошка', 'картофеля', 'картофелины', 'картофелина', 'potato', 'potatoes'],
  яйца: ['яйцо', 'яйца куриные', 'куриное яйцо', 'куриные яйца', 'яиц', 'egg', 'eggs'],
  помидоры: ['помидор', 'помидора', 'томаты', 'томат', 'помидоры черри', 'томаты черри', 'tomato', 'tomatoes'],
  лук: ['репчатый лук', 'лук репчатый', 'луковица', 'луковицы', 'onion', 'onions'],
  сыр: ['твердый сыр', 'сыр твердый', 'полутвердый сыр', 'тертый сыр', 'cheese'],
  макароны: ['паста', 'спагетти', 'пенне', 'фузилли', 'рожки', 'макаронные изделия', 'pasta'],
  рис: ['риса', 'рис белый', 'белый рис', 'длиннозерный рис', 'rice'],
  гречка: ['гречневая крупа', 'греча', 'buckwheat'],
  морковь: ['морковка', 'моркови', 'carrot', 'carrots'],
  огурцы: ['огурец', 'огурца', 'огурчики', 'cucumber', 'cucumbers'],
  'болгарский перец': ['сладкий перец', 'перец болгарский', 'красный сладкий перец', 'bell pepper'],
  кабачок: ['кабачки', 'цуккини', 'zucchini'],
  баклажан: ['баклажаны'],
  капуста: ['белокочанная капуста', 'капуста белокочанная'],
  грибы: ['шампиньоны', 'шампиньон', 'mushrooms'],
  чеснок: ['зубчик чеснока', 'чеснока', 'garlic'],
  молоко: ['молока', 'milk'],
  сливки: ['сливки 10%', 'сливки 20%', 'cream'],
  сметана: ['сметаны', 'sour cream'],
  творог: ['творога', 'cottage cheese'],
  мука: ['пшеничная мука', 'мука пшеничная', 'flour'],
  хлеб: ['батон', 'белый хлеб', 'тостовый хлеб', 'bread'],
  фарш: ['мясной фарш', 'фарш мясной', 'minced meat'],
  'говяжий фарш': ['фарш говяжий', 'фарш из говядины'],
  'свино-говяжий фарш': ['фарш свино-говяжий', 'свиной фарш', 'фарш из свинины'],
  'куриный фарш': ['фарш куриный', 'фарш из курицы'],
  индейка: ['филе индейки', 'филе индюшки', 'грудка индейки'],
  йогурт: ['натуральный йогурт', 'йогурт натуральный', 'греческий йогурт'],
  'панировочные сухари': ['сухари панировочные', 'сухари для панировки'],
  'вареный рис': ['отварной рис', 'готовый рис', 'рис отварной'],
  'консервированная фасоль': ['фасоль консервированная', 'фасоль в банке'],
  'томатная пассата': ['пассата', 'протертые томаты', 'протертые помидоры'],
  'овсяные хлопья': ['овсянка', 'геркулес'],
  'сушеный чеснок': ['чеснок сушеный', 'чесночный порошок'],
  'томатная паста': ['паста томатная'],
  'зеленый горошек': ['горошек', 'горошек зеленый', 'консервированный горошек'],
  кукуруза: ['консервированная кукуруза'],
  'растительное масло': ['масло', 'подсолнечное масло', 'оливковое масло', 'масло растительное', 'oil', 'olive oil'],
  'сливочное масло': ['масло сливочное', 'butter'],
  соль: ['поваренная соль', 'морская соль', 'salt'],
  'черный перец': ['перец', 'молотый перец', 'черный молотый перец', 'перец черный', 'перец черный молотый', 'black pepper'],
  вода: ['water'],
  паприка: ['молотая паприка', 'сладкая паприка'],
};

function cleanIngredient(value: string): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
}

const aliases = new Map<string, string>();
for (const [canonical, variants] of Object.entries(aliasGroups)) {
  aliases.set(canonical, canonical);
  for (const variant of variants) aliases.set(cleanIngredient(variant), canonical);
}

export function normalizeIngredient(value: string): string {
  const normalized = cleanIngredient(value);
  return aliases.get(normalized) ?? normalized;
}

export function displayIngredient(value: string): string {
  const normalized = normalizeIngredient(value);
  return normalized.charAt(0).toLocaleUpperCase('ru-RU') + normalized.slice(1);
}

const pantryStaples = new Set([
  'соль', 'черный перец', 'вода', 'растительное масло', 'паприка', 'сушеный чеснок',
  'сушеный базилик', 'орегано', 'лавровый лист', 'зира', 'кориандр', 'корица',
  'специи', 'итальянские травы', 'прованские травы',
]);

/** Dairy butter, sugar and fresh herbs are actual ingredients, not assumed staples. */
export function isPantryStaple(name: string): boolean {
  return pantryStaples.has(normalizeIngredient(name));
}

export const popularIngredients = [
  'Курица', 'Картофель', 'Яйца', 'Рис', 'Макароны', 'Помидоры', 'Лук', 'Сыр',
];

const dairy = /молок|сливки|сметан|творог|йогурт|кефир|сыр|моцарелл|пармезан|сливочн.*масло|масло.*сливочн|казеин|сыворотк/;
const plantDairy = /^(овсян\S*|соев\S*|кокосов\S*|миндальн\S*|рисов\S*|растительн\S*)\s+(молоко|сливки|йогурт|сыр)/;
const meatOrFish = /куриц|курин|индей|говяд|свинин|свиной|фарш|бекон|ветчин|колбас|сосиск|мяс|рыб|тунец|лосос|семг|треск|минтай|форел|скумбр|кревет|кальмар|миди|краб|бульон|желатин/;
const porkOrUnknownMeat = /свин|бекон|ветчин|колбас|сосиск|сало|смалец/;
const fish = /рыб|тунец|лосос|семг|треск|минтай|форел|скумбр|сардин|анчоус/;
const shellfish = /кревет|краб|раки|омар|лобстер|кальмар|миди|устриц|морепродукт/;
const wheat = /мука|макарон|хлеб|лаваш|лепешк|тортиль|булгур|кускус|манк|пшениц|сухари|соевый соус|терияки|лапша/;
const nuts = /орех|миндал|фундук|кешью|фисташ|пекан|макадам/;
const egg = /яйц|яич|омлет|майонез|меланж/;

function preferenceValues(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((item): item is string => typeof item === 'string').map(normalizeIngredient).filter(Boolean) : [];
}

/** Conservative label-level filtering; product packaging remains the source for traces/allergens. */
export function ingredientMatchesPreference(name: string, preference: string): boolean {
  const value = normalizeIngredient(name);
  const wanted = normalizeIngredient(preference);
  if (!value || !wanted) return false;
  const isDairy = dairy.test(value) && !plantDairy.test(value);
  if (/лактоз/.test(wanted)) return isDairy && !/безлактоз|без лактоз/.test(value);
  if (/молок|молочн|казеин/.test(wanted)) return isDairy;
  if (/яйц|яич/.test(wanted)) return egg.test(value);
  if (/глютен|пшениц/.test(wanted)) return wheat.test(value) || /рожь|ржан|ячмен|перлов/.test(value);
  if (/морепродукт|моллюск|ракообраз/.test(wanted)) return shellfish.test(value);
  if (wanted === 'рыба') return fish.test(value);
  if (/орех/.test(wanted)) return nuts.test(value) || /арахис/.test(value);
  if (/арахис/.test(wanted)) return /арахис/.test(value);
  if (/со[яеию]|соев/.test(wanted)) return /соев|соя|тофу|мисо|терияки/.test(value);
  if (/кунжут|сезам/.test(wanted)) return /кунжут|сезам|тахин/.test(value);
  if (wanted === 'мясо') return meatOrFish.test(value) && !fish.test(value) && !shellfish.test(value);
  return value === wanted || value.split(/[\s,-]+/).includes(wanted);
}

export function isIngredientAllowed(name: string, profile?: UserProfile): boolean {
  if (!profile) return true;
  const value = normalizeIngredient(name);
  if (preferenceValues(profile.allergies).some((allergy) => ingredientMatchesPreference(value, allergy))) return false;
  if (profile.dietary === 'Вегетарианское' && meatOrFish.test(value)) return false;
  if (profile.dietary === 'Без лактозы' && ingredientMatchesPreference(value, 'лактоза')) return false;
  if (profile.dietary === 'Без свинины' && (porkOrUnknownMeat.test(value) || value === 'фарш' || value === 'мясо')) return false;
  return true;
}

export function hasDislikedIngredient(names: string[], profile?: UserProfile): boolean {
  return preferenceValues(profile?.dislikes).some((dislike) => names.some((name) => ingredientMatchesPreference(name, dislike)));
}
