import { describe, expect, it } from 'vitest';
import { normalizeCatalogIngredient, resolveIngredient } from './ingredients';

describe('bilingual catalog ingredient dictionary', () => {
  it.each([
    [' Chicken Breast ', 'куриная грудка', 'chicken_breast'],
    ['Chicken Breast', 'куриное филе', 'chicken_breast'],
    ['Chicken Breast', 'филе курицы', 'chicken_breast'],
    ['Chicken', 'Курица', 'chicken'],
    ['Milk', 'молоко', 'milk'],
    ['Cream', 'Сливки', 'cream'],
    ['Tomato', 'помидоры', 'tomato'],
    ['Tomato Puree', 'томатное пюре', 'tomato_puree'],
    ['Tomato Paste', 'томатная паста', 'tomato_paste'],
    ['Minced Beef', 'говяжий фарш', 'beef_mince'],
    ['Beef', 'говядина', 'beef'],
    ['Buckwheat', 'гречневая крупа', 'buckwheat'],
    ['Buckwheat', 'Греча', 'buckwheat'],
    ['Spring Onions', 'Зелёный лук', 'spring_onion'],
    ['Eggs', 'яйцо', 'egg'],
    ['Garlic Clove', 'чеснок', 'garlic'],
    ['Olive Oil', 'оливковое масло', 'olive_oil'],
    ['Kielbasa', 'Колбаса келбаса', 'kielbasa'],
    ['Bryndza cheese', 'Словацкая брынза', 'bryndza'],
    ['Diced Tomatoes', 'Помидоры кубиками', 'tomato'],
    ['Red Onions', 'Красный репчатый лук', 'red_onion'],
    ['Lettuce', 'Листовой салат', 'lettuce'],
    ['Romano Pepper', 'Сладкий перец романо', 'romano_pepper'],
    ['Butter Beans', 'Крупная белая фасоль лима', 'butter_beans'],
    ['Cannellini Beans', 'Белая фасоль каннеллини', 'cannellini'],
    ['Bean Sprouts', 'Бобовые проростки', 'bean_sprouts'],
    ['Plain Flour', 'Пшеничная мука', 'plain_flour'],
    ['White Bread Mix', 'Смесь для выпечки белого хлеба', 'white_bread_mix'],
    ['Meringue Nests', 'Безе в форме гнезда', 'meringue_nests'],
    ['Orange Blossom Water', 'Вода из цветков апельсина', 'orange_blossom_water'],
    ['Extra Virgin Olive Oil', 'Оливковое масло первого холодного отжима', 'extra_virgin_olive_oil'],
    ['Hotsauce', 'Острый перечный соус', 'hot_sauce'],
    ['Pico De Gallo Sauce', 'Соус пико-де-гальо', 'pico_de_gallo'],
    ['Kosher Salt', 'Крупная кошерная соль', 'kosher_salt'],
    ['Chilli Powder', 'Молотый перец чили', 'chilli_powder'],
    ['Pul Biber', 'Перец пул бибер', 'pul_biber'],
    ['Celeriac', 'Корень сельдерея', 'celeriac'],
    ['Celery Root', 'Корень сельдерея', 'celeriac'],
    ['Masarepa', 'Предварительно приготовленная кукурузная мука', 'masarepa'],
  ])('resolves %s and %s through one canonical ID', (english, russian, id) => {
    expect(resolveIngredient(english)?.id).toBe(id);
    expect(resolveIngredient(russian)?.id).toBe(id);
  });

  it.each([
    ['Chicken Breast', 'Chicken'], ['Chicken Breast', 'Chicken Fillet'], ['Chicken Breast', 'Филе куриного бедра'],
    ['Milk', 'Cream'], ['Milk', 'Coconut Milk'],
    ['Tomato', 'Tomato Puree'], ['Tomato Puree', 'Tomato Sauce'], ['Tomato Puree', 'Томатная паста'],
    ['Beef', 'Minced Beef'], ['Chicken Stock', 'Chicken Stock Cube'],
    ['Sugar', 'Icing Sugar'], ['Cabbage', 'Sauerkraut'],
    ['Olive Oil', 'Sunflower Oil'], ['Ground Cumin', 'Caraway Seed'],
    ['Oil', 'Растительное масло'], ['Butter Beans', 'Cannellini Beans'],
    ['Plain Flour', 'Flour'], ['Plain Flour', 'Cornmeal'],
    ['Celery', 'Корень сельдерея'], ['Cornmeal', 'Масарепа'],
  ])('does not treat %s as a substitute for %s', (first, second) => {
    expect(resolveIngredient(first)).not.toBeNull();
    expect(resolveIngredient(second)).not.toBeNull();
    expect(resolveIngredient(first)?.id).not.toBe(resolveIngredient(second)?.id);
  });

  it.each(['Pepper', 'Coriander', 'Shredded Meat', 'Callaloo', 'Mystery flour', 'Chicken-free product', 'масло', 'фарш'])('does not invent identity for %s', (name) => {
    expect(resolveIngredient(name)).toBeNull();
  });

  it('retains original text and source slot; an editorial label cannot redefine identity', () => {
    const normalized = normalizeCatalogIngredient({ name: 'Chicken', measure: ' 2kg cut cubes ' }, 7, 'Куриная грудка', '2 кг, кубиками');
    expect(normalized).toMatchObject({
      slot: 7, originalName: 'Chicken', nameRu: 'Куриная грудка', canonicalIngredientId: 'chicken',
      originalMeasure: ' 2kg cut cubes ', measureRu: '2 кг, кубиками',
      quantity: { originalAmount: '2', originalUnit: 'kg', normalizedAmount: 2000, normalizedUnit: 'g', canScale: true, needsClarification: false },
    });
    expect(normalizeCatalogIngredient({ name: 'Mystery ingredient', measure: 'some' }, 1, 'Молоко').canonicalIngredientId).toBeNull();
  });

  it('retains Mint 4 without guessing leaves, stems, or pieces', () => {
    const mint = normalizeCatalogIngredient({ name: 'Mint', measure: '4' }, 3);
    expect(mint).toMatchObject({
      originalMeasure: '4', canonicalIngredientId: 'mint',
      quantity: { originalAmount: '4', originalUnit: null, normalizedUnit: null, canScale: false, needsClarification: true },
    });
  });
});
