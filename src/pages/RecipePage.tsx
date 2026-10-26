import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock3, CookingPot, Signal, Users } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { recipes } from '../data/recipes';
import { useProfile } from '../hooks/useProfile';
import { useRecipeSession } from '../hooks/useRecipeSession';
import { useAvailableIngredients } from '../hooks/useAvailableIngredients';
import { scaleIngredients } from '../utils/servings';
import { getRecipeSteps } from '../utils/recipeSteps';
import { isPantryStaple, normalizeIngredient } from '../utils/ingredients';
import { isRecipeAllowed } from '../utils/recommendations';
import { getEffectiveIngredients } from '../utils/substitutions';
import { trackEvent, trackEventOnce } from '../services/analytics';
import { FoodArt } from '../components/FoodArt';
import { ServingSelector } from '../components/ServingSelector';
import { NutritionCard } from '../components/NutritionCard';
import { IngredientSubstitution, ingredientQuantity } from '../components/IngredientSubstitution';
import { MarketButton } from '../components/MockStore';
import { NotFoundPage } from './NotFoundPage';
import { RecipeUsefulnessPrompt } from '../components/RecipeUsefulnessPrompt';
import { useAnalyticsPreferences } from '../hooks/useAnalyticsPreferences';
import { usePantry } from '../hooks/usePantry';
import { matchingProductKey } from '../utils/pantryProducts';
import { PantryPolicyControl } from '../components/PantryPolicyControl';

export function RecipePage() {
  const { id = '' } = useParams();
  const recipe = recipes.find(item => item.id === id);
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useProfile();
  const { consent } = useAnalyticsPreferences();
  const available = useAvailableIngredients();
  const { assumePantryStaples } = usePantry();
  const { servings, setServings, selections, setSelections } = useRecipeSession(id);
  const [completed, setCompleted] = useState<number[]>([]);
  const allowed = Boolean(recipe && isRecipeAllowed(recipe, profile));
  const recommendation = (location.state as { recommendation?: { recommendation_position: number; missing_ingredients_count: number; matched_ingredients_count: number; search_source: 'manual' | 'fridge' } } | null)?.recommendation;
  useEffect(() => { setCompleted([]); }, [recipe?.id]);
  useEffect(() => {
    if (!recipe || !allowed) return;
    document.title = `${recipe.name} — Cookly`;
    trackEventOnce('recipe_opened', `recipe:${location.key}:${recipe.id}`, {
      recipe_id: recipe.id,
      recipe_category: recipe.category,
      cooking_time: recipe.cookingTime,
      number_of_servings: servings,
      ...(recommendation ?? {}),
    });
  }, [allowed, consent, location.key, recipe, recommendation, servings]);
  if (!recipe) return <NotFoundPage/>;
  if (!allowed) return <RestrictedRecipe/>;
  const scaled = scaleIngredients(recipe.ingredients, servings, recipe.baseServings);
  const effective = getEffectiveIngredients(recipe, selections, servings, available, profile, { assumePantryStaples });
  const stockKeys = new Set(available.map(matchingProductKey));
  const hasIngredient = (name: string) => stockKeys.has(matchingProductKey(name));
  const isAssumed = (name: string) => assumePantryStaples && isPantryStaple(name) && !hasIngredient(name);
  const missing = effective.ingredients.filter(item => !item.optional && !hasIngredient(item.name) && !isAssumed(item.name));
  const steps = getRecipeSteps(recipe, servings);
  function startCooking() { if (!recipe) return; trackEvent('cooking_started', { recipe_id: id, recipe_category: recipe.category, cooking_time: recipe.cookingTime, number_of_servings: servings }); navigate(`/cook/${id}`); }
  return <div className="container recipe-detail-page">
    <Link className="back-link" to="/recipes"><ArrowLeft size={16}/> К подборке блюд</Link>
    <header className="recipe-detail-hero"><div><span className="overline">{recipe.category}</span><h1>{recipe.name}</h1><p>{recipe.description}</p><div className="recipe-detail-meta"><span><Clock3 size={17}/>{recipe.cookingTime} мин</span><span><Signal size={17}/>{recipe.difficulty}</span><span><Users size={17}/>Базовый рецепт: {recipe.baseServings} порц.</span></div><div className="recipe-tags">{recipe.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div><div className={`recipe-detail-art food-${recipe.visual}`}><FoodArt kind={recipe.visual}/></div></header>
    <ServingSelector value={servings} onChange={value => { setServings(value); trackEvent('servings_selected', { recipe_id: id, recipe_category: recipe.category, number_of_servings: value }); }}/>
    <NutritionCard recipe={recipe} servings={servings} hasSubstitutions={effective.replacements.length > 0}/>
    <div className="recipe-detail-columns"><section className="recipe-ingredients-panel" aria-labelledby="ingredient-list-title"><div className="section-title-row"><h2 id="ingredient-list-title">Что понадобится</h2><span>{servings} порц.</span></div><p className="muted">Наличие — по вашему списку и холодильнику. Количество запасов проверьте перед готовкой.</p><PantryPolicyControl/><ul className="effective-ingredients">{scaled.map((ingredient, index) => {
      const replacement = effective.replacements.find(item => normalizeIngredient(item.original.name) === normalizeIngredient(ingredient.name));
      const ingredients = replacement?.substitution.ingredients ?? [ingredient];
      const present = ingredients.every(item => hasIngredient(item.name));
      const staple = ingredients.every(item => hasIngredient(item.name) || isAssumed(item.name)) && ingredients.some(item => isAssumed(item.name));
      const key = normalizeIngredient(ingredient.name);
      return <li key={`${key}-${index}`}><div className="effective-ingredient-row"><div><strong className={replacement ? 'replaced-original' : ''}>{ingredient.name}</strong>{replacement && <strong className="selected-replacement">{replacement.substitution.ingredients.map(item => `${item.name} — ${ingredientQuantity(item)}`).join(' + ')}</strong>}<small className={present ? 'ingredient-present' : ''}>{ingredient.optional ? 'По желанию' : present ? 'Есть у вас' : staple ? 'Базовый продукт · проверьте дома' : 'Нужно докупить'}</small></div><span className={replacement ? 'replaced-original' : ''}>{ingredientQuantity(ingredient)}</span></div><IngredientSubstitution recipe={recipe} ingredient={ingredient} available={available} profile={profile} selected={selections[key]} onSelect={optionId => { const next = { ...selections }; if (optionId) next[key] = optionId; else delete next[key]; setSelections(next); if (optionId) trackEvent('ingredient_substitution_selected', { recipe_id: id, recipe_category: recipe.category }); }}/></li>;
    })}</ul>
    {missing.length ? <div className="recipe-shopping"><strong>Не хватает: {missing.map(item => item.name.toLocaleLowerCase('ru')).join(', ')}</strong><MarketButton recipe={recipe} missing={missing}/><small>Cookly Market · демо, без реальной покупки</small></div> : <div className="all-ingredients-ready"><Check size={18}/> Все основные продукты есть</div>}
    <Link className="text-button" to="/fridge">Открыть мой холодильник →</Link>
    </section><section className="recipe-method" aria-labelledby="recipe-method-title"><div className="section-title-row"><h2 id="recipe-method-title">Как приготовить</h2><span>{steps.length} шагов</span></div>
    {effective.replacements.length > 0 && <div className="replacement-notes"><strong>Готовим с выбранными заменами</strong>{effective.replacements.map(item => <p key={item.original.name}><b>{item.original.name} → {item.substitution.label}.</b> {item.substitution.note}</p>)}<small>В шагах ниже используйте выбранную замену вместо исходного продукта.</small></div>}
    <ol className="recipe-method-steps">{steps.map((step, index) => <li key={step} className={completed.includes(index) ? 'step-completed' : ''}><button className="step-check" aria-pressed={completed.includes(index)} aria-label={`${completed.includes(index) ? 'Снять отметку' : 'Отметить'}: шаг ${index + 1}`} onClick={() => setCompleted(previous => previous.includes(index) ? previous.filter(value => value !== index) : [...previous, index])}>{completed.includes(index) ? <Check size={17}/> : index + 1}</button><p>{step}</p></li>)}</ol><div className="start-cooking-card"><CookingPot size={27}/><div><h3>Готовим вместе?</h3><p>Крупные шаги, таймер и всё необходимое под рукой.</p></div><button className="button primary" onClick={startCooking}>Начать готовить <CookingPot size={17}/></button></div><RecipeUsefulnessPrompt recipeId={recipe.id} recipeCategory={recipe.category}/></section></div>
  </div>;
}

export function RestrictedRecipe() { return <div className="container empty-state"><h1>Этот рецепт не подходит вашему профилю</h1><p>В составе есть продукт, исключённый настройками питания или аллергиями. Подберём другие блюда с теми же ограничениями.</p><Link className="button primary" to="/recipes">К безопасной подборке</Link></div>; }
