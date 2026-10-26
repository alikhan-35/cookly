import type { UserProfile } from '../../types';
import { hasDislikedIngredient, isIngredientAllowed } from '../../utils/ingredients';
import { isPantryStaple, type MatchingOptions } from '../../utils/matchingPolicy';
import { matchingProductKey } from '../../utils/pantryProducts';
import { matchRacionIngredients } from './racionMatching';
import type { RacionRecipe } from './racion';

const clean = (value: string) => value.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');

// Meal-base categories, not inferred per-recipe "main" flags or source position.
const substantialKeys = new Set([
  'chicken', 'chicken_breast', 'chicken_fillet', 'chicken_thigh_fillet', 'beef', 'beef_mince', 'lamb_mince',
  'pork', 'bacon', 'sausages', 'kielbasa', 'salmon', 'prawn', 'raw_king_prawn', 'egg',
  'milk', 'cream', 'sour_cream', 'sour_milk', 'greek_yogurt', 'mascarpone', 'mozzarella', 'bryndza', 'stilton', 'queso_fresco', 'coconut_milk',
  'potato', 'red_potato', 'buckwheat', 'rice', 'rice_noodles', 'black_beans', 'butter_beans', 'cannellini',
  'flour', 'plain_flour', 'cornmeal', 'masarepa', 'white_bread', 'filo_pastry',
].map(id => `id:${id}`));
for (const name of [
  'Курица целиком', 'Индейка', 'Филе индейки', 'Баранина', 'Куриный фарш', 'Свино-говяжий фарш', 'Мясной фарш', 'Фарш',
  'Рыба', 'Минтай', 'Треска', 'Тунец', 'Семга', 'Скумбрия', 'Сельдь', 'Кальмар', 'Мидии',
  'Макароны', 'Спагетти', 'Пенне', 'Паста', 'Лапша', 'Овсяные хлопья', 'Овсянка',
  'Перловка', 'Пшено', 'Пшенная крупа', 'Булгур', 'Кускус', 'Киноа', 'Манная крупа',
  'Фасоль', 'Консервированная фасоль', 'Красная фасоль', 'Нут', 'Чечевица', 'Красная чечевица', 'Зеленая чечевица', 'Горох',
  'Йогурт', 'Кефир', 'Творог', 'Сыр', 'Твердый сыр', 'Ряженка',
]) substantialKeys.add(matchingProductKey(name));

const nonSeedCondiments = new Set([
  'garam_masala', 'curry_powder', 'pul_biber', 'hot_sauce', 'soy_sauce', 'worcestershire_sauce',
  'english_mustard', 'sweet_chilli_sauce', 'pico_de_gallo', 'vinegar', 'apple_cider_vinegar',
  'red_wine_vinegar', 'orange_blossom_water', 'vanilla_extract', 'baking_powder', 'baking_soda',
].map(id => `id:${id}`));
// Known condiment labels stay required when absent, but cannot discover a meal alone.
for (const name of ['Специи', 'Смесь специй', 'Приправа', 'Приправа для плова', 'Приправа для курицы', 'Карри', 'Смесь карри', 'Гарам-масала', 'Хмели-сунели', 'Сумах', 'Сумак', 'Масло']) {
  nonSeedCondiments.add(matchingProductKey(name));
}

function substantialProductKeys(names: readonly string[]): Set<string> {
  return new Set(names.map(matchingProductKey).filter(key => substantialKeys.has(key)));
}

/** Search seeds discover candidates; only the full ingredient list establishes a match. */
export function racionSearchSeeds(stock: readonly string[]): string[] {
  const names = [...new Map(stock.filter(name => /[а-яёa-z]/i.test(name)).map(name => [matchingProductKey(name), name.trim()])).values()];
  const priority = (name: string) => /куриц|курин|говяд|индей|рыб|фарш|лосос|минтай|свинин/.test(clean(name)) ? 0
    : /рис|греч|макарон|карто|яйц|творог|овсян/.test(clean(name)) ? 1
    : 2;
  return names.filter(name => !isPantryStaple(name) && !nonSeedCondiments.has(matchingProductKey(name)) && name.length <= 120)
    .sort((a, b) => priority(a) - priority(b)).slice(0, 8);
}

export function rankRacionRecipes(recipes: readonly RacionRecipe[], stock: readonly string[], maxTime: number | null, profile: UserProfile, options: MatchingOptions = {}) {
  return recipes.filter(recipe => maxTime === null || (recipe.timeMinutes !== null && recipe.timeMinutes <= maxTime))
    .filter(recipe => recipe.ingredients.every(item => isIngredientAllowed(item.name, profile)))
    .map(recipe => {
      const match = matchRacionIngredients(recipe.ingredients, stock, options);
      const substantial = substantialProductKeys(recipe.ingredients.map(item => item.name));
      const presentSubstantial = substantialProductKeys(match.available.map(item => item.name));
      return { recipe, match, disliked: hasDislikedIngredient(recipe.ingredients.map(item => item.name), profile),
        missingSubstantialCount: substantial.size - presentSubstantial.size, hasSubstantial: substantial.size > 0,
        matchedSubstantialCount: presentSubstantial.size };
    })
    .filter(item => item.match.meaningfulMatchedCount > 0 && (!item.hasSubstantial || item.matchedSubstantialCount > 0))
    .sort((a, b) => Number(a.disliked) - Number(b.disliked)
      || Number(b.match.fullyMatched) - Number(a.match.fullyMatched)
      || (a.match.missingCount + a.match.unknownCount) - (b.match.missingCount + b.match.unknownCount)
      || a.missingSubstantialCount - b.missingSubstantialCount
      || b.match.coverage - a.match.coverage
      || b.match.meaningfulMatchedCount - a.match.meaningfulMatchedCount
      || (a.recipe.timeMinutes ?? Infinity) - (b.recipe.timeMinutes ?? Infinity)
      || a.recipe.id.localeCompare(b.recipe.id, 'ru'));
}
