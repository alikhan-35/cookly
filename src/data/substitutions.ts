import type { Ingredient } from '../types';

export type SubstitutionContext = 'sauce' | 'salad' | 'soup' | 'stew' | 'bake' | 'pan' | 'grain' | 'binding' | 'coating' | 'toast' | 'porridge' | 'pancake';
export interface SubstitutionRule {
  id: string;
  original: string;
  label: string;
  contexts: SubstitutionContext[];
  /** Quantities below replace this reference amount; the utility scales it to selected servings. */
  amount: number;
  units: string[];
  ingredients: Ingredient[];
  note: string;
}

const part = (name: string, amount: number, unit: string): Ingredient => ({ name, amount, unit });
const dairyUnits = ['г', 'мл'];
const savory: SubstitutionContext[] = ['sauce', 'salad', 'soup', 'stew', 'bake', 'pan'];

/** Curated kitchen substitutions, intentionally restricted to suitable cooking contexts. */
export const substitutionRules: SubstitutionRule[] = [
  { id: 'cream-sour-cream', original: 'сливки', label: 'Сметана', contexts: ['sauce', 'soup', 'stew', 'bake', 'pan'], amount: 100, units: dairyUnits, ingredients: [part('Сметана', 100, 'г')], note: 'Вмешайте сметану на слабом огне в конце приготовления. Не кипятите бурно: соус будет чуть кислее и может расслоиться.' },
  { id: 'cream-milk-butter', original: 'сливки', label: 'Молоко + сливочное масло', contexts: ['sauce', 'soup', 'stew', 'bake'], amount: 100, units: dairyUnits, ingredients: [part('Молоко', 80, 'мл'), part('Сливочное масло', 20, 'г')], note: 'Подогрейте молоко с маслом и добавьте вместо сливок. Соус получится менее густым; для взбивания эта смесь не подходит.' },
  { id: 'cream-oat', original: 'сливки', label: 'Овсяные сливки', contexts: ['sauce', 'soup', 'stew', 'bake'], amount: 100, units: dairyUnits, ingredients: [part('Овсяные сливки', 100, 'мл')], note: 'Берите несладкие овсяные сливки для готовки. Вкус немного изменится; проверьте состав продукта на упаковке.' },
  { id: 'sour-cream-yogurt', original: 'сметана', label: 'Натуральный йогурт', contexts: ['sauce', 'salad', 'stew', 'bake', 'pan'], amount: 100, units: dairyUnits, ingredients: [part('Йогурт', 100, 'г')], note: 'Нужен густой йогурт без сахара. В горячее блюдо вмешивайте после снятия с огня; заправка будет легче.' },
  { id: 'yogurt-sour-cream', original: 'йогурт', label: 'Сметана', contexts: ['sauce', 'salad', 'stew', 'bake'], amount: 100, units: dairyUnits, ingredients: [part('Сметана', 100, 'г')], note: 'Используйте то же количество сметаны. Заправка станет гуще и жирнее; не подвергайте ее сильному кипению.' },
  { id: 'milk-oat', original: 'молоко', label: 'Овсяное молоко', contexts: ['sauce', 'porridge', 'pancake', 'bake', 'pan'], amount: 100, units: dairyUnits, ingredients: [part('Овсяное молоко', 100, 'мл')], note: 'Выбирайте несладкий овсяный напиток. Он немного изменит вкус; проверьте состав и маркировку аллергенов.' },
  { id: 'milk-lactose-free', original: 'молоко', label: 'Безлактозное молоко', contexts: ['sauce', 'porridge', 'pancake', 'bake', 'pan'], amount: 100, units: dairyUnits, ingredients: [part('Безлактозное молоко', 100, 'мл')], note: 'Замените в том же количестве. Безлактозное молоко по-прежнему содержит молочный белок.' },
  { id: 'butter-oil', original: 'сливочное масло', label: 'Растительное масло', contexts: ['pan', 'sauce', 'stew', 'porridge'], amount: 20, units: ['г'], ingredients: [part('Растительное масло', 15, 'мл')], note: 'Подходит для обжаривания и добавления в готовую кашу. Сливочный вкус исчезнет; не используйте эту замену для слоеного или песочного теста.' },
  { id: 'oil-butter', original: 'растительное масло', label: 'Сливочное масло', contexts: ['pan', 'porridge'], amount: 15, units: ['мл'], ingredients: [part('Сливочное масло', 20, 'г')], note: 'Готовьте на умеренном огне: сливочное масло быстрее темнеет. Для фритюра и сильного обжаривания замена не подходит.' },
  { id: 'cheese-mozzarella', original: 'сыр', label: 'Моцарелла', contexts: ['sauce', 'bake', 'pan', 'toast'], amount: 100, units: ['г'], ingredients: [part('Моцарелла', 100, 'г')], note: 'Для горячих блюд подойдет моцарелла для пиццы. Рассольную хорошо обсушите; корочка будет мягче.' },
  { id: 'mozzarella-cheese', original: 'моцарелла', label: 'Твердый сыр', contexts: ['sauce', 'bake', 'pan', 'toast'], amount: 100, units: ['г'], ingredients: [part('Сыр', 100, 'г')], note: 'Натрите твердый сыр. В горячем блюде он расплавится; вкус будет насыщеннее и солонее. Для капрезе эта замена не предлагается.' },
  { id: 'paste-passata', original: 'томатная паста', label: 'Томатная пассата', contexts: ['sauce', 'soup', 'stew', 'pan'], amount: 20, units: ['г'], ingredients: [part('Томатная пассата', 60, 'г')], note: 'Пассата менее концентрированная. Уменьшите другую жидкость на разницу в объеме и уваривайте до нужной густоты.' },
  { id: 'tomatoes-canned', original: 'помидоры', label: 'Томаты в собственном соку', contexts: ['sauce', 'soup', 'stew', 'pan'], amount: 1, units: ['шт.'], ingredients: [part('Томаты в собственном соку', 150, 'г')], note: 'Один средний помидор заменяет около 150 г томатов без лишнего сока. Добавляйте на том же этапе; для свежего салата замена не подходит.' },
  { id: 'tomatoes-canned-weight', original: 'помидоры', label: 'Томаты в собственном соку', contexts: ['sauce', 'soup', 'stew', 'pan'], amount: 100, units: ['г'], ingredients: [part('Томаты в собственном соку', 100, 'г')], note: 'Используйте томаты без лишнего сока, в том же количестве. Подходит только для горячих блюд.' },
  { id: 'rice-bulgur', original: 'рис', label: 'Булгур', contexts: ['grain'], amount: 100, units: ['г'], ingredients: [part('Булгур', 100, 'г')], note: 'Только для рассыпчатого гарнира с овощами. Готовьте булгур отдельно по упаковке и соедините с остальными продуктами. Для плова, тефтелей и жареного риса замена не подходит.' },
  { id: 'bulgur-buckwheat', original: 'булгур', label: 'Гречка', contexts: ['grain'], amount: 100, units: ['г'], ingredients: [part('Гречка', 100, 'г')], note: 'Для рассыпчатого гарнира: сварите гречку отдельно по упаковке, затем смешайте с овощами. Вкус блюда изменится.' },
  { id: 'buckwheat-bulgur', original: 'гречка', label: 'Булгур', contexts: ['grain'], amount: 100, units: ['г'], ingredients: [part('Булгур', 100, 'г')], note: 'Сварите булгур отдельно по упаковке, затем соедините с готовой курицей или овощами. Булгур содержит пшеницу.' },
  { id: 'pasta-noodles', original: 'макароны', label: 'Пшеничная лапша', contexts: ['soup', 'sauce'], amount: 100, units: ['г'], ingredients: [part('Пшеничная лапша', 100, 'г')], note: 'Возьмите обычную пшеничную лапшу. Варите по времени на упаковке, затем соедините с соусом; в суп добавляйте ближе к концу.' },
  { id: 'chicken-turkey', original: 'курица', label: 'Филе индейки', contexts: ['pan', 'soup', 'stew', 'bake', 'sauce'], amount: 100, units: ['г'], ingredients: [part('Индейка', 100, 'г')], note: 'Нарежьте филе индейки кусочками того же размера. Время может отличаться: доведите мясо до полной готовности, проверив температуру внутри — 74 °C.' },
  { id: 'turkey-chicken', original: 'индейка', label: 'Куриное филе', contexts: ['pan', 'soup', 'stew', 'bake', 'sauce'], amount: 100, units: ['г'], ingredients: [part('Курица', 100, 'г')], note: 'Используйте куриное филе без кожи и костей. Проверьте готовность термометром: внутри самого толстого кусочка должно быть 74 °C.' },
  { id: 'bread-crumbs', original: 'хлеб', label: 'Панировочные сухари + вода', contexts: ['binding'], amount: 50, units: ['г'], ingredients: [part('Панировочные сухари', 30, 'г'), part('Вода', 30, 'мл')], note: 'Для котлет: смешайте сухари с водой, дайте набухнуть 5 минут и вмешайте в фарш. Для тостов замена не подходит.' },
  { id: 'bread-lavash', original: 'хлеб', label: 'Лаваш', contexts: ['toast'], amount: 50, units: ['г'], ingredients: [part('Лаваш', 50, 'г')], note: 'Заверните начинку в лаваш и слегка подрумяньте с двух сторон. Получится конвертик; не подходит для сладких гренок.' },
  { id: 'crumbs-oats', original: 'панировочные сухари', label: 'Овсяные хлопья', contexts: ['binding', 'coating'], amount: 30, units: ['г'], ingredients: [part('Овсяные хлопья', 30, 'г')], note: 'Измельчите хлопья почти в крошку. Для фарша дайте смеси постоять 5 минут, для панировки используйте сухими.' },
  { id: 'mayonnaise-yogurt', original: 'майонез', label: 'Натуральный йогурт', contexts: ['salad', 'sauce', 'toast'], amount: 100, units: ['г'], ingredients: [part('Йогурт', 100, 'г')], note: 'Используйте густой несладкий йогурт. Заправка будет легче и кислее; приправьте по вкусу.' },
  { id: 'egg-flax', original: 'яйца', label: 'Молотый лён + вода', contexts: ['binding'], amount: 1, units: ['шт.'], ingredients: [part('Молотый лён', 7, 'г'), part('Вода', 45, 'мл')], note: 'Только как связка в овощных оладьях или котлетах: смешайте лён с водой и оставьте на 10 минут. Не подходит для омлета, шакшуки, сырников или блинов; текстура будет плотнее.' },
  { id: 'garlic-dried', original: 'чеснок', label: 'Сушеный чеснок', contexts: savory, amount: 1, units: ['зубчик'], ingredients: [part('Сушеный чеснок', 0.25, 'ч. л.')], note: 'Один зубчик заменяет примерно четверть чайной ложки сушеного чеснока. Добавьте к жидкости или в конце готовки, чтобы он не подгорел.' },
  { id: 'onion-leek', original: 'лук', label: 'Лук-порей', contexts: ['soup', 'stew', 'pan', 'sauce', 'bake'], amount: 1, units: ['шт.'], ingredients: [part('Лук-порей', 100, 'г')], note: 'Возьмите белую часть порея, хорошо промойте между слоями и нарежьте тонко. Она мягче и готовится быстрее репчатого лука.' },
  { id: 'herbs-parsley', original: 'зелень', label: 'Петрушка', contexts: savory, amount: 10, units: ['г'], ingredients: [part('Петрушка', 10, 'г')], note: 'Петрушка подойдет для подачи или заправки. Добавляйте в самом конце, чтобы сохранить свежий аромат.' },
  { id: 'herbs-dill', original: 'зелень', label: 'Укроп', contexts: ['salad', 'soup', 'stew', 'sauce'], amount: 10, units: ['г'], ingredients: [part('Укроп', 10, 'г')], note: 'Используйте укроп в салате, супе или сметанном соусе. Добавляйте в конце; аромат будет заметно укропным.' },
  { id: 'lemon-lime', original: 'лимон', label: 'Лайм', contexts: ['salad', 'sauce', 'bake', 'pan'], amount: 1, units: ['шт.'], ingredients: [part('Лайм', 1, 'шт.')], note: 'Добавляйте сок постепенно и пробуйте: лайм может быть кислее. Для десертов с точными пропорциями эта замена не предлагается.' },
];
