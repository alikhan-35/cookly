import { parseIngredientQuantity } from './quantities';
import type { NormalizedCatalogIngredient } from './types';

export interface CanonicalIngredient { id: string; nameRu: string; }
interface IngredientDefinition extends CanonicalIngredient { aliases: string[]; }
const ingredient = (id: string, nameRu: string, ...aliases: string[]): IngredientDefinition => ({ id, nameRu, aliases });

/** Explicit bilingual equivalences, not substitutions, stemming, or fuzzy food guesses. */
const dictionary: IngredientDefinition[] = [
  ingredient('chicken', 'Курица', 'chicken', 'курицы', 'куриное мясо'),
  // Cookly uses the Russian product label «куриное филе» for breast; explicit thigh stays separate.
  ingredient('chicken_breast', 'Куриная грудка (филе)', 'chicken breast', 'chicken breasts', 'куриная грудка', 'куриные грудки', 'грудка куриная', 'куриная грудка без кости', 'куриное филе', 'филе курицы'),
  ingredient('chicken_fillet', 'Куриное филе (часть не указана)', 'chicken fillet'),
  ingredient('chicken_thigh_fillet', 'Филе куриного бедра', 'chicken thigh fillet', 'chicken thigh fillets', 'филе бедра курицы', 'филе бедра'),
  ingredient('beef', 'Говядина', 'beef', 'говядины'),
  ingredient('beef_mince', 'Говяжий фарш', 'minced beef', 'beef mince', 'ground beef', 'фарш говяжий', 'фарш из говядины'),
  ingredient('lamb_mince', 'Фарш из баранины', 'lamb mince', 'ground lamb', 'бараний фарш', 'фарш бараний'),
  ingredient('pork', 'Свинина', 'pork', 'свинины'),
  ingredient('bacon', 'Бекон', 'bacon'),
  ingredient('sausages', 'Колбаски', 'sausages', 'sausage'),
  ingredient('kielbasa', 'Польская колбаса кельбаса', 'kielbasa', 'кельбаса', 'колбаса келбаса'),
  ingredient('salmon', 'Лосось', 'salmon', 'лосося'),
  ingredient('prawn', 'Креветки', 'prawns', 'prawn', 'shrimp', 'shrimps', 'креветка', 'креветок'),
  ingredient('raw_king_prawn', 'Сырые королевские креветки', 'raw king prawns', 'raw king prawn', 'королевские креветки сырые'),
  ingredient('egg', 'Яйцо', 'egg', 'eggs', 'яйца', 'яиц', 'яйца куриные', 'куриные яйца', 'куриное яйцо'),
  ingredient('milk', 'Молоко', 'milk', 'молока'),
  ingredient('cream', 'Сливки', 'cream'),
  ingredient('sour_cream', 'Сметана', 'sour cream', 'сметаны'),
  ingredient('sour_milk', 'Кислое молоко', 'sour milk', 'скисшее молоко'),
  ingredient('greek_yogurt', 'Греческий йогурт', 'greek yogurt', 'greek yoghurt', 'йогурт греческий'),
  ingredient('mascarpone', 'Маскарпоне', 'mascarpone', 'сыр маскарпоне'),
  ingredient('mozzarella', 'Моцарелла', 'mozzarella', 'моцарела', 'сыр моцарелла'),
  ingredient('bryndza', 'Брынза', 'bryndza cheese', 'bryndza', 'словацкая брынза'),
  ingredient('stilton', 'Сыр стилтон', 'stilton cheese', 'stilton', 'стилтон'),
  ingredient('queso_fresco', 'Кесо фреско', 'queso fresco', 'сыр кесо фреско'),
  ingredient('butter', 'Сливочное масло', 'butter', 'масло сливочное'),
  ingredient('coconut_milk', 'Кокосовое молоко', 'coconut milk', 'молоко кокосовое'),
  ingredient('potato', 'Картофель', 'potatoes', 'potato', 'картошка', 'картофеля', 'картофелина', 'картофелины'),
  ingredient('buckwheat', 'Гречка', 'buckwheat', 'гречневая крупа', 'греча'),
  ingredient('red_potato', 'Красный картофель', 'red potatoes', 'red potato', 'картофель красный'),
  ingredient('tomato', 'Помидор', 'tomato', 'tomatoes', 'помидоры', 'томаты', 'томат', 'помидора', 'diced tomatoes', 'нарезанные помидоры', 'помидоры кубиками'),
  ingredient('cherry_tomato', 'Помидоры черри', 'cherry tomatoes', 'cherry tomato', 'томаты черри'),
  ingredient('plum_tomato', 'Сливовидные помидоры', 'plum tomatoes', 'plum tomato', 'помидоры сливка'),
  ingredient('tomato_puree', 'Томатное пюре', 'tomato puree', 'tomato purée', 'пюре томатное'),
  ingredient('tomato_paste', 'Томатная паста', 'tomato paste', 'паста томатная'),
  ingredient('tomato_sauce', 'Томатный соус', 'tomato sauce', 'соус томатный'),
  ingredient('tomato_passata', 'Томатная пассата', 'passata', 'пассата', 'протертые томаты', 'протёртые томаты'),
  ingredient('onion', 'Лук', 'onion', 'onions', 'луковица', 'луковицы', 'репчатый лук', 'лук репчатый'),
  ingredient('red_onion', 'Красный лук', 'red onions', 'red onion', 'лук красный', 'красный репчатый лук'),
  ingredient('spring_onion', 'Зелёный лук', 'spring onions', 'spring onion', 'scallions', 'scallion', 'лук зеленый'),
  ingredient('leek', 'Лук-порей', 'leek', 'leeks', 'лук порей'),
  ingredient('garlic', 'Чеснок', 'garlic', 'garlic clove', 'garlic cloves', 'зубчик чеснока', 'чеснока'),
  ingredient('ginger', 'Имбирь', 'ginger', 'корень имбиря'),
  ingredient('ginger_garlic_paste', 'Имбирно-чесночная паста', 'ginger garlic paste'),
  ingredient('carrot', 'Морковь', 'carrots', 'carrot', 'морковка', 'моркови'),
  ingredient('cucumber', 'Огурец', 'cucumber', 'cucumbers', 'огурцы', 'огурца'),
  ingredient('cabbage', 'Капуста', 'cabbage', 'белокочанная капуста'),
  ingredient('sauerkraut', 'Квашеная капуста', 'sauerkraut', 'капуста квашеная'),
  ingredient('broccoli', 'Брокколи', 'broccoli'),
  ingredient('beetroot', 'Свёкла', 'beetroot', 'beet', 'свекла'),
  ingredient('swede', 'Брюква', 'swede', 'rutabaga'),
  ingredient('pumpkin', 'Тыква', 'pumpkin'),
  ingredient('eggplant', 'Баклажан', 'egg plants', 'eggplant', 'aubergine', 'баклажаны'),
  ingredient('mushroom', 'Грибы', 'mushrooms', 'mushroom', 'гриб'),
  ingredient('celery', 'Сельдерей', 'celery'),
  ingredient('celeriac', 'Корень сельдерея', 'celery root', 'celeriac'),
  ingredient('fennel', 'Фенхель', 'fennel'),
  ingredient('lettuce', 'Салат-латук', 'lettuce', 'латук', 'листовой салат'),
  ingredient('rocket', 'Руккола', 'rocket', 'arugula', 'рукола'),
  ingredient('radish', 'Редис', 'radish', 'редиска'),
  ingredient('red_bell_pepper', 'Красный сладкий перец', 'red pepper', 'red bell pepper', 'красный болгарский перец'),
  ingredient('green_bell_pepper', 'Зелёный сладкий перец', 'green pepper', 'green bell pepper', 'зеленый болгарский перец'),
  ingredient('romano_pepper', 'Перец романо', 'romano pepper', 'сладкий перец романо'),
  ingredient('habanero', 'Перец хабанеро', 'habanero pepper', 'habanero', 'хабанеро'),
  ingredient('jalapeno', 'Перец халапеньо', 'jalapeno', 'jalapeño', 'халапеньо'),
  ingredient('red_pepper_paste', 'Паста из красного перца', 'red pepper paste'),
  ingredient('avocado', 'Авокадо', 'avocado'),
  ingredient('apple', 'Яблоко', 'apples', 'apple', 'яблоки'),
  ingredient('apricot', 'Абрикос', 'apricot', 'apricots', 'абрикосы'),
  ingredient('banana', 'Банан', 'banana', 'bananas', 'бананы'),
  ingredient('lemon', 'Лимон', 'lemon', 'lemons', 'лимоны'),
  ingredient('lime', 'Лайм', 'lime', 'limes', 'лаймы'),
  ingredient('lime_juice', 'Сок лайма', 'lime juice', 'лаймовый сок'),
  ingredient('lemon_juice', 'Лимонный сок', 'lemon juice', 'сок лимона'),
  ingredient('almond', 'Миндаль', 'almonds', 'almond'),
  ingredient('peanut_butter', 'Арахисовая паста', 'peanut butter', 'арахисовое масло'),
  ingredient('black_beans', 'Чёрная фасоль', 'black beans', 'black bean', 'фасоль черная'),
  ingredient('butter_beans', 'Фасоль лима', 'butter beans', 'lima beans', 'крупная белая фасоль лима'),
  ingredient('cannellini', 'Фасоль каннеллини', 'cannellini beans', 'cannellini', 'каннеллини', 'белая фасоль каннеллини'),
  ingredient('bean_sprouts', 'Проростки бобовых', 'bean sprouts', 'бобовые проростки'),
  ingredient('black_olive', 'Чёрные оливки', 'black olives', 'маслины'),
  ingredient('rice', 'Рис', 'rice', 'риса'),
  ingredient('rice_noodles', 'Рисовая лапша', 'rice noodles'),
  ingredient('flour', 'Мука', 'flour', 'муки'),
  ingredient('plain_flour', 'Пшеничная мука без разрыхлителя', 'plain flour', 'all-purpose flour', 'all purpose flour', 'пшеничная мука'),
  ingredient('cornmeal', 'Кукурузная мука', 'cornmeal'),
  ingredient('masarepa', 'Масарепа', 'masarepa', 'предварительно приготовленная кукурузная мука'),
  ingredient('cornstarch', 'Кукурузный крахмал', 'cornstarch', 'corn starch'),
  ingredient('filo_pastry', 'Тесто фило', 'filo pastry', 'phyllo pastry'),
  ingredient('white_bread', 'Белый хлеб', 'white bread'),
  ingredient('white_bread_mix', 'Смесь для белого хлеба', 'white bread mix', 'смесь для выпечки белого хлеба'),
  ingredient('meringue_nests', 'Гнёзда из безе', 'meringue nests', 'гнезда из безе', 'безе в форме гнезда'),
  ingredient('turkish_delight', 'Рахат-лукум', 'turkish delight', 'лукум'),
  ingredient('sugar', 'Сахар', 'sugar', 'сахара'),
  ingredient('icing_sugar', 'Сахарная пудра', 'icing sugar', 'powdered sugar'),
  ingredient('honey', 'Мёд', 'clear honey', 'honey', 'мед', 'жидкий мед'),
  ingredient('maple_syrup', 'Кленовый сироп', 'maple syrup'),
  ingredient('black_treacle', 'Чёрная патока', 'black treacle', 'черная патока'),
  ingredient('vanilla_extract', 'Ванильный экстракт', 'vanilla extract'),
  ingredient('orange_blossom_water', 'Вода цветков апельсина', 'orange blossom water', 'флердоранж', 'вода из цветков апельсина'),
  ingredient('baking_powder', 'Разрыхлитель', 'baking powder', 'разрыхлитель теста'),
  ingredient('baking_soda', 'Пищевая сода', 'bicarbonate of soda', 'baking soda', 'сода пищевая'),
  ingredient('cooking_oil', 'Кулинарное масло', 'oil', 'масло для жарки'),
  ingredient('vegetable_oil', 'Растительное масло', 'vegetable oil', 'масло растительное'),
  ingredient('olive_oil', 'Оливковое масло', 'olive oil', 'масло оливковое'),
  ingredient('extra_virgin_olive_oil', 'Оливковое масло extra virgin', 'extra virgin olive oil', 'оливковое масло первого отжима', 'оливковое масло первого холодного отжима'),
  ingredient('sunflower_oil', 'Подсолнечное масло', 'sunflower oil', 'масло подсолнечное'),
  ingredient('rapeseed_oil', 'Рапсовое масло', 'rapeseed oil', 'canola oil'),
  ingredient('coconut_oil', 'Кокосовое масло', 'coconut oil'),
  ingredient('vinegar', 'Уксус', 'vinegar'),
  ingredient('apple_cider_vinegar', 'Яблочный уксус', 'apple cider vinegar', 'cider vinegar'),
  ingredient('red_wine_vinegar', 'Красный винный уксус', 'red wine vinegar', 'винный уксус красный'),
  ingredient('red_wine', 'Красное вино', 'red wine'),
  ingredient('beef_stock', 'Говяжий бульон', 'beef stock', 'beef broth'),
  ingredient('chicken_stock', 'Куриный бульон', 'chicken stock', 'chicken broth'),
  ingredient('chicken_stock_cube', 'Кубик куриного бульона', 'chicken stock cube', 'куриный бульонный кубик'),
  ingredient('vegetable_stock', 'Овощной бульон', 'vegetable stock', 'vegetable broth'),
  ingredient('soy_sauce', 'Соевый соус', 'soy sauce'),
  ingredient('worcestershire_sauce', 'Вустерский соус', 'worcestershire sauce', 'вустерширский соус'),
  ingredient('english_mustard', 'Английская горчица', 'english mustard'),
  ingredient('hot_sauce', 'Острый соус', 'hotsauce', 'hot sauce', 'острый перечный соус'),
  ingredient('sweet_chilli_sauce', 'Сладкий соус чили', 'sweet chilli sauce', 'sweet chili sauce'),
  ingredient('pico_de_gallo', 'Пико-де-гальо', 'pico de gallo sauce', 'pico de gallo', 'соус пико-де-гальо'),
  ingredient('water', 'Вода', 'water', 'воды'),
  ingredient('salt', 'Соль', 'salt', 'поваренная соль'),
  ingredient('kosher_salt', 'Кошерная соль', 'kosher salt', 'крупная кошерная соль'),
  ingredient('black_pepper', 'Чёрный перец', 'black pepper', 'перец черный', 'черный молотый перец', 'перец черный молотый'),
  ingredient('allspice', 'Душистый перец', 'allspice'),
  ingredient('paprika', 'Паприка', 'paprika', 'молотая паприка'),
  ingredient('cayenne_pepper', 'Кайенский перец', 'cayenne pepper', 'перец кайенский'),
  ingredient('chilli_flakes', 'Хлопья чили', 'chilli flakes', 'chili flakes'),
  ingredient('chilli_powder', 'Молотый чили', 'chilli powder', 'chili powder', 'порошок чили', 'молотый перец чили'),
  ingredient('pul_biber', 'Пул бибер', 'pul biber', 'турецкие хлопья перца', 'перец пул бибер'),
  ingredient('ground_cumin', 'Молотая зира', 'ground cumin', 'молотый кумин'),
  ingredient('ground_cinnamon', 'Молотая корица', 'ground cinnamon', 'корица молотая'),
  ingredient('ground_turmeric', 'Молотая куркума', 'ground turmeric', 'куркума молотая'),
  ingredient('caraway_seed', 'Семена тмина', 'caraway seed', 'caraway seeds'),
  ingredient('achiote_seed', 'Семена аннато', 'achiote seeds', 'annatto seeds', 'семена ачиоте'),
  ingredient('curry_powder', 'Порошок карри', 'curry powder', 'карри в порошке'),
  ingredient('garam_masala', 'Гарам масала', 'garam masala'),
  ingredient('bay_leaf', 'Лавровый лист', 'bay leaf', 'bay leaves'),
  ingredient('basil', 'Базилик', 'basil'),
  ingredient('parsley', 'Петрушка', 'parsley'),
  ingredient('cilantro', 'Кинза', 'cilantro', 'coriander leaves', 'листья кориандра'),
  ingredient('coriander_seed', 'Семена кориандра', 'coriander seeds', 'coriander seed'),
  ingredient('dill', 'Укроп', 'dill'),
  ingredient('mint', 'Мята', 'mint'),
  ingredient('chives', 'Шнитт-лук', 'chives', 'шнитт лук'),
  ingredient('thyme', 'Тимьян', 'thyme', 'чабрец'),
  ingredient('oregano', 'Орегано', 'oregano', 'душица'),
  ingredient('marjoram', 'Майоран', 'marjoram'),
];

function cleanName(name: string): string {
  return name.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ').replace(/[.,;:]+$/g, '').trim();
}

const aliases = new Map<string, CanonicalIngredient>();
for (const entry of dictionary) {
  for (const name of [entry.nameRu, ...entry.aliases]) {
    const key = cleanName(name);
    if (aliases.has(key) && aliases.get(key)?.id !== entry.id) throw new Error(`Ambiguous ingredient alias: ${name}`);
    aliases.set(key, { id: entry.id, nameRu: entry.nameRu });
  }
}

export function resolveIngredient(name: string): CanonicalIngredient | null {
  const resolved = aliases.get(cleanName(name));
  return resolved ? { ...resolved } : null;
}

export function normalizeCatalogIngredient(
  original: { name: string; measure: string }, slot: number, nameRuOverride?: string, measureRuOverride?: string,
): NormalizedCatalogIngredient {
  // Translation labels are editorial display data and cannot change ingredient identity.
  const canonical = resolveIngredient(original.name);
  return {
    slot, originalName: original.name, nameRu: nameRuOverride?.trim() || canonical?.nameRu || original.name,
    canonicalIngredientId: canonical?.id ?? null, originalMeasure: original.measure,
    measureRu: measureRuOverride?.trim() || original.measure, quantity: parseIngredientQuantity(original.measure),
  };
}
