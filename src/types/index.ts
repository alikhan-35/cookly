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

export interface Recipe {
  id: string;
  name: string;
  description: string;
  cookingTime: number;
  difficulty: 'Легко' | 'Средне';
  servings: number;
  baseServings: number;
  nutrition: Nutrition;
  ingredients: Ingredient[];
  steps: string[];
  category: string;
  tags: string[];
  visual: FoodVisual;
}

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
