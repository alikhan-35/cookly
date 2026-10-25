export interface Ingredient {
  name: string;
  amount: number;
  unit: string;
  optional?: boolean;
  main?: boolean;
  isPantryStaple?: boolean;
}

export interface Nutrition { calories: number; protein: number; fat: number; carbs: number }

export type FoodVisual = 'pasta' | 'chicken' | 'rice' | 'egg' | 'salad' | 'soup' | 'potato' | 'pancake' | 'stew';

/** Shared display content; only local recipes have validated Cookly quantities. */
export interface RecipeContent {
  id: string;
  name: string;
  steps: string[];
}

export interface Recipe extends RecipeContent {
  source: 'local';
  description: string;
  cookingTime: number;
  difficulty: 'Легко' | 'Средне';
  servings: number;
  baseServings: number;
  nutrition: Nutrition;
  ingredients: Ingredient[];
  category: string;
  tags: string[];
  visual: FoodVisual;
}

/** The provider's measure is kept verbatim: it must not be scaled as a Cookly amount. */
export interface ExternalIngredient {
  name: string;
  measure: string;
}

export interface ExternalRecipe extends RecipeContent {
  id: `themealdb:${string}`;
  source: 'themealdb';
  externalId: string;
  originalTitle: string;
  imageUrl: string | null;
  imageSourceUrl: string | null;
  category: string | null;
  area: string | null;
  ingredients: ExternalIngredient[];
  /** Full original text, including its original paragraph breaks. */
  instructions: string;
  sourceUrl: string | null;
  providerUrl: string;
  videoUrl: string | null;
  author: string | null;
  copyright: string | null;
  creativeCommons: string | null;
  nutrition: null;
  servings: null;
  baseServings: null;
  cookingTime: null;
  difficulty: null;
  titleRu?: string;
  ingredientsRu?: ExternalIngredient[];
  instructionsRu?: string;
}

export type ProviderRecipe = Recipe | ExternalRecipe;

export interface RecipeMatch {
  recipe: Recipe;
  available: Ingredient[];
  missing: Ingredient[];
  optional: Ingredient[];
  matchedCount: number;
  requiredCount: number;
  coverage: number;
  score: number;
  substitutionCount?: number;
  profileFit?: boolean;
  substitutions?: { original: string; replacement: string }[];
}

export const fridgeCategories = ['Овощи', 'Фрукты', 'Мясо', 'Рыба', 'Молочные', 'Яйца', 'Крупы', 'Макароны', 'Соусы', 'Другое'] as const;
export type FridgeCategory = typeof fridgeCategories[number];
export interface FridgeItem {
  id: string;
  name: string;
  amount?: number;
  unit: string;
  category: FridgeCategory;
  expiresOn?: string;
}

export interface SubstitutionOption {
  id: string;
  label: string;
  ingredients: Ingredient[];
  note: string;
  available: boolean;
}
export type SubstitutionSelections = Record<string, string>;

export type DietaryPreference = 'Без ограничений' | 'Вегетарианское' | 'Без свинины' | 'Без лактозы' | 'Другое';
export type DifficultyPreference = 'Простые блюда' | 'Средние' | 'Любые';

export interface UserProfile {
  familySize: number;
  hasChildren: boolean;
  dislikes: string[];
  allergies: string[];
  dietary: DietaryPreference;
  difficulty: DifficultyPreference;
}

export interface RecipeFeedback {
  recipeId: string;
  liked: boolean;
  timestamp: string;
}
