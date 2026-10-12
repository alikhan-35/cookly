import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock3, CookingPot, Signal, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { recipes } from '../data/recipes';
import { useProfile } from '../hooks/useProfile';
import { useRecipeSession } from '../hooks/useRecipeSession';
import { useAvailableIngredients } from '../hooks/useAvailableIngredients';
import { scaleIngredients } from '../utils/servings';
import { getRecipeSteps } from '../utils/recipeSteps';
import { isPantryStaple, normalizeIngredient } from '../utils/ingredients';
import { isRecipeAllowed } from '../utils/recommendations';
import { getEffectiveIngredients } from '../utils/substitutions';
import { trackEvent } from '../utils/analytics';
import { FoodArt } from '../components/FoodArt';
import { ServingSelector } from '../components/ServingSelector';
import { NutritionCard } from '../components/NutritionCard';
import { IngredientSubstitution, ingredientQuantity } from '../components/IngredientSubstitution';
import { MarketButton } from '../components/MockStore';
import { NotFoundPage } from './NotFoundPage';

export function RecipePage() {
  const { id = '' } = useParams();
  const recipe = recipes.find(item => item.id === id);
  const navigate = useNavigate();
  const { profile } = useProfile();
  const available = useAvailableIngredients();
  const { servings, setServings, selections, setSelections } = useRecipeSession(id);
  const [completed, setCompleted] = useState<number[]>([]);
  useEffect(() => { setCompleted([]); if (recipe) { document.title = `${recipe.name} — Cookly`; trackEvent('recipe_opened', { recipeId: recipe.id }); } }, [recipe]);
  if (!recipe) return <NotFoundPage/>;
  if (!isRecipeAllowed(recipe, profile)) return <RestrictedRecipe/>;
  const scaled = scaleIngredients(recipe.ingredients, servings, recipe.baseServings);
  const effective = getEffectiveIngredients(recipe, selections, servings, available, profile);
  const hasIngredient = (name: string) => available.includes(normalizeIngredient(name)) || isPantryStaple(name);
  const missing = effective.ingredients.filter(item => !item.optional && !item.isPantryStaple && !hasIngredient(item.name));
  const steps = getRecipeSteps(recipe, servings);
  function startCooking() { trackEvent('cooking_started', { recipeId: id, servings }); navigate(`/cook/${id}`); }
  return <div className="container recipe-detail-page">
    <Link className="back-link" to="/recipes"><ArrowLeft size={16}/> К подборке блюд</Link>
    <header className="recipe-detail-hero"><div><span className="overline">{recipe.category}</span><h1>{recipe.name}</h1><p>{recipe.description}</p><div className="recipe-detail-meta"><span><Clock3 size={17}/>{recipe.cookingTime} мин</span><span><Signal size={17}/>{recipe.difficulty}</span><span><Users size={17}/>Базовый рецепт: {recipe.baseServings} порц.</span></div><div className="recipe-tags">{recipe.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div><div className={`recipe-detail-art food-${recipe.visual}`}><FoodArt kind={recipe.visual}/></div></header>
    <ServingSelector value={servings} onChange={value => { setServings(value); trackEvent('servings_selected', { recipeId: id, servings: value }); }}/>
    <NutritionCard recipe={recipe} servings={servings} hasSubstitutions={effective.replacements.length > 0}/>
    <div className="recipe-detail-columns"><section className="recipe-ingredients-panel" aria-labelledby="ingredient-list-title"><div className="section-title-row"><h2 id="ingredient-list-title">Что понадобится</h2><span>{servings} порц.</span></div><p className="muted">Наличие — по вашему списку и холодильнику. Количество запасов проверьте перед готовкой.</p><ul className="effective-ingredients">{scaled.map((ingredient, index) => {
      const replacement = effective.replacements.find(item => normalizeIngredient(item.original.name) === normalizeIngredient(ingredient.name));
      const ingredients = replacement?.substitution.ingredients ?? [ingredient];
      const present = ingredients.every(item => hasIngredient(item.name));
      const staple = ingredient.isPantryStaple || isPantryStaple(ingredient.name);
      const key = normalizeIngredient(ingredient.name);
      return <li key={`${key}-${index}`}><div className="effective-ingredient-row"><div><strong className={replacement ? 'replaced-original' : ''}>{ingredient.name}</strong>{replacement && <strong className="selected-replacement">{replacement.substitution.ingredients.map(item => `${item.name} — ${ingredientQuantity(item)}`).join(' + ')}</strong>}<small className={present ? 'ingredient-present' : ''}>{ingredient.optional ? 'По желанию' : staple ? 'Базовый продукт' : present ? 'Есть у вас' : 'Нужно докупить'}</small></div><span className={replacement ? 'replaced-original' : ''}>{ingredientQuantity(ingredient)}</span></div><IngredientSubstitution recipe={recipe} ingredient={ingredient} available={available} profile={profile} selected={selections[key]} onSelect={optionId => { const next = { ...selections }; if (optionId) next[key] = optionId; else delete next[key]; setSelections(next); trackEvent('substitution_selected', { recipeId: id, ingredient: ingredient.name, substitution: optionId ?? 'original' }); }}/></li>;
    })}</ul>
    {missing.length ? <div className="recipe-shopping"><strong>Не хватает: {missing.map(item => item.name.toLocaleLowerCase('ru')).join(', ')}</strong><MarketButton recipe={recipe} missing={missing}/><small>Cookly Market · демо, без реальной покупки</small></div> : <div className="all-ingredients-ready"><Check size={18}/> Все основные продукты есть</div>}
    <Link className="text-button" to="/fridge">Открыть мой холодильник →</Link>
    </section><section className="recipe-method" aria-labelledby="recipe-method-title"><div className="section-title-row"><h2 id="recipe-method-title">Как приготовить</h2><span>{steps.length} шагов</span></div>
    {effective.replacements.length > 0 && <div className="replacement-notes"><strong>Готовим с выбранными заменами</strong>{effective.replacements.map(item => <p key={item.original.name}><b>{item.original.name} → {item.substitution.label}.</b> {item.substitution.note}</p>)}<small>В шагах ниже используйте выбранную замену вместо исходного продукта.</small></div>}
    <ol className="recipe-method-steps">{steps.map((step, index) => <li key={step} className={completed.includes(index) ? 'step-completed' : ''}><button className="step-check" aria-pressed={completed.includes(index)} aria-label={`${completed.includes(index) ? 'Снять отметку' : 'Отметить'}: шаг ${index + 1}`} onClick={() => setCompleted(previous => previous.includes(index) ? previous.filter(value => value !== index) : [...previous, index])}>{completed.includes(index) ? <Check size={17}/> : index + 1}</button><p>{step}</p></li>)}</ol><div className="start-cooking-card"><CookingPot size={27}/><div><h3>Готовим вместе?</h3><p>Крупные шаги, таймер и всё необходимое под рукой.</p></div><button className="button primary" onClick={startCooking}>Начать готовить <CookingPot size={17}/></button></div></section></div>
  </div>;
}

export function RestrictedRecipe() { return <div className="container empty-state"><h1>Этот рецепт не подходит вашему профилю</h1><p>В составе есть продукт, исключённый настройками питания или аллергиями. Подберём другие блюда с теми же ограничениями.</p><Link className="button primary" to="/recipes">К безопасной подборке</Link></div>; }
