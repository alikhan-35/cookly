import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Clock3, CookingPot, ImageOff, LoaderCircle, RotateCcw, SearchX, Users } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRacionRecipe, racionAnalyticsId, racionCategory, racionQuantity, racionRecipeError, readRacionNavigationState, type RacionNavigationState } from '../hooks/useRacionRecipe';
import { useRecipeSession } from '../hooks/useRecipeSession';
import { usePantry } from '../hooks/usePantry';
import { useFridge } from '../hooks/useFridge';
import { useProfile } from '../hooks/useProfile';
import { useAnalyticsPreferences } from '../hooks/useAnalyticsPreferences';
import { ServingSelector } from '../components/ServingSelector';
import { RecipeUsefulnessPrompt } from '../components/RecipeUsefulnessPrompt';
import { RestrictedRecipe } from './RecipePage';
import { isIngredientAllowed } from '../utils/ingredients';
import { matchRacionIngredients } from '../services/recipeProviders/racionMatching';
import { trackEvent, trackEventOnce } from '../services/analytics';
import type { RacionRecipe, RacionRecipeIngredient } from '../services/recipeProviders/racion';
import '../racion-recipe.css';

export function RacionRecipePage() {
  const { id = '' } = useParams();
  return <RacionRecipeDetail key={id} id={id}/>;
}

function RacionRecipeDetail({ id }: { id: string }) {
  const { recipe, loading, error, retry, retryAfter } = useRacionRecipe(id);
  const { servings, setServings } = useRecipeSession(`racion:${id}`);
  const { profile } = useProfile();
  const { rawIngredients, source } = usePantry();
  const { usableNames } = useFridge();
  const { consent } = useAnalyticsPreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationState = useMemo(() => readRacionNavigationState(location.state), [location.state]);
  const catalogSearch = navigationState.catalogSearch;
  const backTo = catalogSearch === undefined ? '/recipes' : `/catalog${catalogSearch}`;
  const [completed, setCompleted] = useState<number[]>([]);
  const [photoFailed, setPhotoFailed] = useState(false);
  const stock = navigationState.comparisonStock ?? (source === 'fridge' || rawIngredients.length > 0 ? rawIngredients : usableNames);
  const allowed = Boolean(recipe && recipe.ingredients.every(item => isIngredientAllowed(item.name, profile)));
  const match = useMemo(() => recipe && stock.length > 0 ? matchRacionIngredients(recipe.ingredients, stock) : null, [recipe, stock]);
  const category = recipe ? racionCategory(recipe) : 'Рецепт';
  const analyticsId = racionAnalyticsId(id);
  useEffect(() => { document.title = recipe ? `${recipe.title} — Cookly` : 'Загружаем рецепт — Cookly'; }, [recipe]);
  useEffect(() => {
    if (!recipe || !allowed) return;
    trackEventOnce('recipe_opened', `racion-recipe:${location.key}:${id}`, {
      recipe_id: analyticsId, recipe_category: category, number_of_servings: servings,
      ...(recipe.timeMinutes !== null ? { cooking_time: recipe.timeMinutes } : {}),
    });
  }, [recipe, allowed, consent, location.key, id, analyticsId, category, servings]);
  if (loading || error || !recipe) return <RacionRecipeState loading={loading} error={error} retry={retry} retryAfter={retryAfter} backTo={backTo} backState={navigationState}/>;
  if (!allowed) return <RestrictedRecipe/>;
  function startCooking() {
    if (!recipe) return;
    trackEvent('cooking_started', {
      recipe_id: analyticsId, recipe_category: category, number_of_servings: servings,
      ...(recipe.timeMinutes !== null ? { cooking_time: recipe.timeMinutes } : {}),
    });
    navigate(`/cook/racion/${encodeURIComponent(id)}`, { state: navigationState });
  }
  return <div className="container recipe-detail-page racion-recipe-page">
    <Link className="back-link" to={backTo} state={navigationState}><ArrowLeft size={16}/> {catalogSearch === undefined ? 'К подборке блюд' : 'К каталогу рецептов'}</Link>
    <header className="recipe-detail-hero">
      <div><span className="overline">{category} · «Рацион»</span><h1>{recipe.title}</h1>{recipe.description && <p>{recipe.description}</p>}
        <div className="recipe-detail-meta"><span><Clock3 size={17}/>{recipe.timeMinutes === null ? 'Время не указано' : `${recipe.timeMinutes} мин`}</span><span><Users size={17}/>Состав источника на 1 порцию</span></div>
        <a className="racion-source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer">Оригинал в «Рационе» <ArrowUpRight size={14}/></a>
      </div>
      <div className="racion-detail-photo">{recipe.imageUrl && !photoFailed ? <img src={recipe.imageUrl} alt={recipe.title} referrerPolicy="no-referrer" decoding="async" onError={() => setPhotoFailed(true)}/> : <div><ImageOff size={34}/><span>Фотография недоступна</span></div>}</div>
    </header>
    <ServingSelector value={servings} onChange={value => { setServings(value); trackEvent('servings_selected', { recipe_id: analyticsId, recipe_category: category, number_of_servings: value }); }}/>
    <RacionNutrition recipe={recipe}/>
    <div className="recipe-detail-columns">
      <section className="recipe-ingredients-panel" aria-labelledby="racion-ingredients-title"><div className="section-title-row"><h2 id="racion-ingredients-title">Что понадобится</h2><span>{servings} порц.</span></div>
        <p className="muted">Количество пересчитано из состава на одну порцию. Размер посуды и время приготовления уточняйте по ходу готовки.</p>
        <RacionIngredientList ingredients={recipe.ingredients} servings={servings} stock={stock.length > 0 ? stock : undefined}/>
        {match && <div className={match.fullyMatched ? 'all-ingredients-ready' : 'racion-stock-summary'}>{match.fullyMatched ? <><Check size={18}/> Все продукты есть в вашем списке</> : <p>Есть {match.matchedCount} из {match.totalCount} ингредиентов. Нет в списке: {match.missing.length}.{match.unknown.length > 0 ? ` Требуют сверки: ${match.unknown.length}.` : ''}</p>}</div>}
        <p className="racion-detail-note">Проверяется наличие продуктов, без достаточности запасов. Соль, масло и вода автоматически не добавляются.</p>
        <Link className="text-button" to="/fridge">Открыть мой холодильник →</Link>
      </section>
      <section className="recipe-method" aria-labelledby="racion-method-title"><div className="section-title-row"><h2 id="racion-method-title">Как приготовить</h2><span>{recipe.steps.length} шагов</span></div>
        <p className="racion-detail-note">Шаги приведены по источнику. Числа в тексте не меняются при выборе порций: используйте количество из списка ингредиентов.</p>
        {recipe.steps.length > 0 ? <><ol className="recipe-method-steps">{recipe.steps.map((step, index) => <li key={index} className={completed.includes(index) ? 'step-completed' : ''}><button className="step-check" aria-pressed={completed.includes(index)} aria-label={`${completed.includes(index) ? 'Снять отметку' : 'Отметить'}: шаг ${index + 1}`} onClick={() => setCompleted(previous => previous.includes(index) ? previous.filter(value => value !== index) : [...previous, index])}>{completed.includes(index) ? <Check size={17}/> : index + 1}</button><p>{step}</p></li>)}</ol><div className="start-cooking-card"><CookingPot size={27}/><div><h3>Готовим вместе?</h3><p>Крупные шаги, таймер и состав под рукой.</p></div><button className="button primary" onClick={startCooking}>Начать готовить <CookingPot size={17}/></button></div></> : <div className="racion-stock-summary"><p>Источник не передал шаги приготовления.</p><a href={recipe.sourceUrl} target="_blank" rel="noreferrer">Посмотреть оригинал <ArrowUpRight size={14}/></a></div>}
        <RecipeUsefulnessPrompt recipeId={`racion:${id}`} recipeCategory={category}/>
        <p className="racion-detail-note">Источник рецепта и фотографии — <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">«Рацион»</a>. КБЖУ и время приведены по его данным.</p>
      </section>
    </div>
  </div>;
}

export function RacionRecipeState({ loading, error, retry, retryAfter, backTo = '/recipes', backState }: { loading: boolean; error: unknown; retry: () => void; retryAfter: number; backTo?: string; backState?: RacionNavigationState }) {
  const backLabel = backTo.startsWith('/catalog') ? 'К каталогу рецептов' : backTo.startsWith('/recipe/racion/') ? 'Вернуться к рецепту' : 'К подборке блюд';
  return <div className="container racion-recipe-state"><Link className="back-link" to={backTo} state={backState}><ArrowLeft size={16}/> {backLabel}</Link><section className="empty-state" role={loading ? 'status' : 'alert'}>{loading ? <><LoaderCircle size={34} className="spin"/><h1>Загружаем рецепт…</h1><p>Получаем состав и шаги из «Рациона».</p></> : <><SearchX size={34}/><h1>Рецепт пока недоступен</h1><p>{racionRecipeError(error)}</p><div className="empty-actions"><button className="button secondary" disabled={retryAfter > 0} onClick={retry}><RotateCcw size={16}/>{retryAfter > 0 ? `Повторить через ${retryAfter} сек.` : 'Попробовать ещё раз'}</button><a className="button primary" href="https://racion.app/recipes" target="_blank" rel="noreferrer">Открыть «Рацион» <ArrowUpRight size={16}/></a></div></>}</section></div>;
}

export function RacionIngredientList({ ingredients, servings, stock }: { ingredients: RacionRecipeIngredient[]; servings: number; stock?: string[] }) {
  const match = stock ? matchRacionIngredients(ingredients, stock) : null;
  return <ul className="effective-ingredients racion-detail-ingredients">{ingredients.map((item, index) => <li key={`${item.ingredientId}-${index}`}><div className="effective-ingredient-row"><div><strong>{item.name}</strong>{match && <small className={match.available.includes(item) ? 'ingredient-present' : ''}>{match.available.includes(item) ? 'Есть в вашем списке' : match.unknown.includes(item) ? 'Сверьте наличие' : 'Нет в вашем списке'}</small>}</div><span>{racionQuantity(item.amount, item.unit, servings)}</span></div></li>)}</ul>;
}

function RacionNutrition({ recipe }: { recipe: RacionRecipe }) {
  const values = [
    { label: 'Калории', value: recipe.nutrition.calories, unit: 'ккал' },
    { label: 'Белки', value: recipe.nutrition.protein, unit: 'г' },
    { label: 'Жиры', value: recipe.nutrition.fat, unit: 'г' },
    { label: 'Углеводы', value: recipe.nutrition.carbs, unit: 'г' },
  ];
  return <section className="nutrition-card" aria-label="Пищевая ценность на порцию"><div className="nutrition-heading"><h2>Пищевая ценность</h2><span>На одну порцию</span></div><dl className="nutrition-values">{values.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value === null ? '—' : new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(item.value)}<span>{item.value === null ? 'не указано' : item.unit}</span></dd></div>)}</dl><p className="nutrition-note">Значения на одну порцию по данным источника. При выборе числа порций состав блюда не меняется.</p></section>;
}
