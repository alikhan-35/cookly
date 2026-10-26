import { describe, expect, it } from 'vitest';
import { isPantryStaple } from './matchingPolicy';
import { isPantryStaple as legacyExport } from './ingredients';

describe('shared explicit pantry policy', () => {
  it('uses the same classifier through the existing ingredients export', () => {
    expect(legacyExport).toBe(isPantryStaple);
  });

  it.each([
    'Соль', ' Морская соль ', 'Вода', 'Оливковое масло', 'Растительное масло', 'Подсолнечное масло',
    'Перец', 'Чёрный молотый перец', 'Белый перец', 'Душистый перец', 'Паприка', 'Хлопья чили',
    'Лавровый лист', 'Зира', 'Семена тмина', 'Кориандр', 'Куркума', 'Корица', 'Гвоздика', 'Мускатный орех',
    'Чеснок сушёный', 'Лук сушеный', 'Имбирь молотый', 'Сушеный укроп', 'Петрушка сушеная',
    'Базилик сушеный', 'Сушеный орегано', 'Тимьян сушеный', 'Сушеный розмарин', 'Майоран сушеный',
    'Прованские травы', 'Итальянские травы', 'dried thyme', 'ground black pepper',
  ])('recognizes the explicitly listed ordinary staple %s', name => {
    expect(isPantryStaple(name)).toBe(true);
  });

  it.each([
    'Сахар', 'Сливочное масло', 'Масло', 'Кокосовое масло', 'Арахисовое масло', 'Соевый соус',
    'Чеснок', 'Лук', 'Имбирь', 'Петрушка', 'Свежий укроп', 'Базилик', 'Розмарин',
    'Болгарский перец', 'Сладкий перец', 'Свежий перец чили', 'Гарам масала', 'Карри',
    'Специи', 'Приправа для плова', 'Экзотическая смесь специй', 'Соус с сушеным чесноком',
  ])('never infers a pantry exemption from part of the label %s', name => {
    expect(isPantryStaple(name)).toBe(false);
  });
});
