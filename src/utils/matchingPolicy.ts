export interface MatchingOptions {
  /** Ignore absent ordinary pantry staples in shortage counts. Defaults to true. */
  assumePantryStaples?: boolean;
}

function normalizePantryName(name: string): string {
  return name.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[‐‑–—]/g, '-')
    .replace(/\s+/gu, ' ').replace(/[.,;:!?]+$/gu, '').trim();
}

// Explicit product labels only. A source's pantry flag, a word fragment, or a
// generic "seasoning" label cannot turn an unknown product into a pantry staple.
const pantryLabels = [
  'соль', 'поваренная соль', 'соль поваренная', 'морская соль', 'соль морская', 'salt',
  'кошерная соль', 'крупная кошерная соль', 'kosher salt',
  'вода', 'питьевая вода', 'фильтрованная вода', 'water',
  'растительное масло', 'масло растительное', 'vegetable oil',
  'подсолнечное масло', 'масло подсолнечное', 'sunflower oil',
  'оливковое масло', 'масло оливковое', 'olive oil', 'extra virgin olive oil',
  'оливковое масло extra virgin', 'оливковое масло первого отжима', 'оливковое масло первого холодного отжима',
  'рапсовое масло', 'масло рапсовое', 'rapeseed oil', 'canola oil',
  // Legacy local recipe label «Перец» means the ordinary dry seasoning, never bell pepper.
  'перец', 'черный перец', 'перец черный', 'черный молотый перец', 'молотый черный перец',
  'перец черный молотый', 'перец молотый черный', 'молотый перец', 'black pepper', 'ground black pepper',
  'белый перец', 'перец белый', 'белый молотый перец', 'молотый белый перец',
  'перец белый молотый', 'white pepper', 'ground white pepper',
  'душистый перец', 'перец душистый', 'молотый душистый перец', 'душистый перец горошком', 'allspice', 'ground allspice',
  'паприка', 'молотая паприка', 'паприка молотая', 'сладкая паприка', 'копченая паприка', 'паприка копченая',
  'paprika', 'ground paprika', 'sweet paprika', 'smoked paprika',
  'сушеный чили', 'чили сушеный', 'молотый чили', 'чили молотый', 'молотый перец чили', 'перец чили молотый',
  'хлопья чили', 'сушеный перец чили', 'кайенский перец', 'перец кайенский',
  'dried chili', 'dried chilli', 'chili flakes', 'chilli flakes', 'red pepper flakes', 'chili powder', 'chilli powder', 'cayenne pepper',
  'лавровый лист', 'лавровые листья', 'bay leaf', 'bay leaves',
  'зира', 'кумин', 'молотая зира', 'зира молотая', 'молотый кумин', 'кумин молотый', 'cumin', 'ground cumin',
  'тмин', 'семена тмина', 'молотый тмин', 'caraway seed', 'caraway seeds',
  'кориандр', 'семена кориандра', 'кориандр молотый', 'молотый кориандр', 'coriander', 'coriander seed', 'coriander seeds', 'ground coriander',
  'куркума', 'молотая куркума', 'куркума молотая', 'turmeric', 'ground turmeric',
  'корица', 'молотая корица', 'корица молотая', 'палочка корицы', 'палочки корицы', 'cinnamon', 'ground cinnamon', 'cinnamon stick', 'cinnamon sticks',
  'гвоздика', 'молотая гвоздика', 'гвоздика молотая', 'cloves', 'clove', 'ground cloves',
  'мускатный орех', 'молотый мускатный орех', 'мускатный орех молотый', 'nutmeg', 'ground nutmeg',
  'сушеный чеснок', 'чеснок сушеный', 'сухой чеснок', 'чеснок сухой', 'чесночный порошок', 'dried garlic', 'garlic powder',
  'сушеный лук', 'лук сушеный', 'сухой лук', 'лук сухой', 'луковый порошок', 'dried onion', 'onion powder',
  'сушеный имбирь', 'имбирь сушеный', 'молотый имбирь', 'имбирь молотый', 'dried ginger', 'ground ginger', 'ginger powder',
  'сушеный укроп', 'укроп сушеный', 'сухой укроп', 'укроп сухой', 'dried dill',
  'сушеная петрушка', 'петрушка сушеная', 'сухая петрушка', 'петрушка сухая', 'dried parsley',
  'сушеный базилик', 'базилик сушеный', 'сухой базилик', 'базилик сухой', 'dried basil',
  'сушеный орегано', 'орегано сушеный', 'сухой орегано', 'орегано сухой', 'dried oregano',
  'сушеный тимьян', 'тимьян сушеный', 'сухой тимьян', 'тимьян сухой', 'dried thyme',
  'сушеный розмарин', 'розмарин сушеный', 'сухой розмарин', 'розмарин сухой', 'dried rosemary',
  'сушеный майоран', 'майоран сушеный', 'сухой майоран', 'майоран сухой', 'dried marjoram',
  'сухие итальянские травы', 'сушеные итальянские травы', 'итальянские травы', 'italian herbs', 'dried italian herbs',
  'сухие прованские травы', 'сушеные прованские травы', 'прованские травы', 'herbes de provence', 'dried herbes de provence',
];

const pantryStaples = new Set(pantryLabels.map(normalizePantryName));

/** Shared local/Racion policy: never broad aliases, substring guesses or source flags. */
export function isPantryStaple(name: string): boolean {
  return typeof name === 'string' && pantryStaples.has(normalizePantryName(name));
}
