import { ArrowRightLeft, Check } from 'lucide-react';
import type { Ingredient, Recipe, UserProfile } from '../types';
import { getSubstitutionOptions } from '../utils/substitutions';
import { normalizeIngredient } from '../utils/ingredients';
import { trackEvent } from '../utils/analytics';

export function ingredientQuantity(ingredient: Ingredient) { return `${ingredient.amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${ingredient.unit}`; }

export function IngredientSubstitution({ recipe, ingredient, available, profile, selected, onSelect }: { recipe: Recipe; ingredient: Ingredient; available: string[]; profile: UserProfile; selected?: string; onSelect: (id?: string) => void }) {
  const options = getSubstitutionOptions(recipe, ingredient, available, profile);
  if (!options.length) return null;
  const validSelected = options.some(option => option.id === selected) ? selected : undefined;
  return <details className="substitution-picker" onToggle={event => { if (event.currentTarget.open) trackEvent('ingredient_substitution_viewed', { recipeId: recipe.id, ingredient: ingredient.name }); }}><summary><ArrowRightLeft size={15}/>{validSelected ? 'Изменить замену' : 'Чем заменить?'}</summary><fieldset><legend className="sr-only">Замена: {ingredient.name}</legend><label className={!validSelected ? 'substitution-option selected' : 'substitution-option'}><input type="radio" name={`sub-${recipe.id}-${normalizeIngredient(ingredient.name)}`} checked={!validSelected} onChange={() => onSelect(undefined)}/><span><strong>Оставить {ingredient.name.toLocaleLowerCase('ru')}</strong><small>{ingredientQuantity(ingredient)}</small></span></label>{options.map(option => <label key={option.id} className={`substitution-option ${validSelected === option.id ? 'selected' : ''}`}><input type="radio" name={`sub-${recipe.id}-${normalizeIngredient(ingredient.name)}`} checked={validSelected === option.id} onChange={() => onSelect(option.id)}/><span><strong>{option.label}</strong><small>{option.ingredients.map(item => `${item.name} — ${ingredientQuantity(item)}`).join(' + ')}</small><small>{option.note}</small><em className={option.available ? 'available' : ''}>{option.available ? <><Check size={13}/> Уже есть у вас</> : 'Нужно добавить в покупки'}</em></span></label>)}</fieldset></details>;
}
