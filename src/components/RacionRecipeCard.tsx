import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Clock3, ImageOff, LoaderCircle, ShieldAlert } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { usePantry } from '../hooks/usePantry';
import { RacionProviderError, type RacionRecipeCard as RecipeCard, type RacionRecipeIngredient } from '../services/recipeProviders/racion';
import { loadRacionRecipe } from '../services/recipeProviders/racionCache';
import { matchRacionIngredients } from '../services/recipeProviders/racionMatching';
import { isIngredientAllowed } from '../utils/ingredients';
import '../racion-preview.css';

const numberFormat = new Intl.NumberFormat('ru', { maximumFractionDigits: 2 });
const emptyStock: readonly string[] = [];
const mealLabels = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };

export interface RacionRecipeCardProps {
  recipe: RecipeCard;
  stock?: readonly string[];
  waitSeconds?: number;
  onLimit?: (cause: unknown) => void;
  eagerPhoto?: boolean;
  knownIngredients?: readonly RacionRecipeIngredient[];
}

export function racionErrorMessage(error: unknown): string {
  if (!(error instanceof RacionProviderError)) return 'Не удалось связаться с «Рационом». Попробуйте ещё раз.';
  if (error.code === 'rate_limit') return 'Источник временно ограничил число запросов. Подождите перед следующей попыткой.';
  if (error.code === 'timeout') return 'Источник отвечает дольше обычного. Попробуйте ещё раз чуть позже.';
  if (error.code === 'malformed_response') return 'Не удалось прочитать рецепт. Попробуйте ещё раз позже или откройте его у источника.';
  if (error.code === 'invalid_request') return 'Проверьте запрос: используйте короткое название блюда или продуктов.';
  return 'Не удалось загрузить данные «Рациона». Попробуйте ещё раз.';
}

export function RacionRecipeCard({ recipe, stock: comparisonStock, waitSeconds = 0, onLimit, eagerPhoto = false, knownIngredients }: RacionRecipeCardProps) {
  const { profile } = useProfile();
  const { assumePantryStaples } = usePantry();
  const location = useLocation();
  const stock = comparisonStock ?? emptyStock;
  const [fetchedIngredients, setFetchedIngredients] = useState<RacionRecipeIngredient[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const request = useRef<AbortController | null>(null);
  const ingredients = knownIngredients ?? fetchedIngredients;
  const match = useMemo(() => ingredients ? matchRacionIngredients(ingredients, stock, { assumePantryStaples }) : null, [ingredients, stock, assumePantryStaples]);
  // Pass source labels directly: normalization can discard dietary qualifiers.
  const restrictedNames = useMemo(() => ingredients
    ? [...new Set(ingredients.filter(item => !isIngredientAllowed(item.name, profile)).map(item => item.name))]
    : [], [ingredients, profile]);
  const hasProfileRestrictions = profile.allergies.length > 0 || profile.dietary !== 'Без ограничений';
  const recipePath = `/recipe/racion/${encodeURIComponent(recipe.id)}`;
  const returnState = {
    catalogSearch: location.pathname === '/catalog' ? location.search : undefined,
    comparisonStock: comparisonStock === undefined ? undefined : [...comparisonStock],
  };

  useEffect(() => {
    setFetchedIngredients(null); setOpen(false); setLoading(false); setError(null);
    return () => { request.current?.abort(); };
  }, [recipe.id]);

  async function inspect() {
    if (ingredients) { setOpen(value => !value); return; }
    if (loading || waitSeconds > 0) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(null);
    try {
      const result = await loadRacionRecipe(recipe.id, { signal: controller.signal });
      if (!controller.signal.aborted) { setFetchedIngredients(result.ingredients); setOpen(true); }
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause); onLimit?.(cause); }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return <article className="racion-card with-photo">
    <RacionPhoto src={recipe.imageUrl} title={recipe.title} to={recipePath} state={returnState} eager={eagerPhoto}/>
    <div className="racion-card-top"><span>{recipe.slot ? mealLabels[recipe.slot] : 'Рецепт'}</span></div>
    <h3><Link to={recipePath} state={returnState}>{recipe.title}</Link></h3>
    <div className="racion-card-meta">
      {recipe.timeMinutes !== null && <span><Clock3 size={14}/>{numberFormat.format(recipe.timeMinutes)} мин</span>}
    </div>
    {restrictedNames.length > 0 && <div className="racion-profile-warning"><ShieldAlert size={17}/><p><strong>Не подходит ограничениям профиля</strong><span>{restrictedNames.join(', ')}</span></p></div>}
    {!ingredients && hasProfileRestrictions && <p className="racion-profile-pending">Ограничения питания ещё не сверены с составом.</p>}
    {match && comparisonStock !== undefined && <div className={`racion-match ${match.fullyMatched ? 'complete' : ''}`}>
      <strong>{match.fullyMatched ? <><Check size={15}/> Все продукты есть</> : `Подходят ${match.matchedCount} из ${match.totalCount} продуктов`}</strong>
      <span>{match.fullyMatched ? 'Проверьте количество перед готовкой' : [match.missing.length || match.unknown.length ? `Докупить: ${[...match.missing, ...match.unknown].map(item => item.name).join(', ')}` : '', match.compatible.length ? `Уточнить вид/часть: ${match.compatible.map(item => item.name).join(', ')}` : ''].filter(Boolean).join(' · ')}{match.unknownCount > 0 && ` · Уточнить: ${match.unknownCount}`}</span>
    </div>}
    <button className="racion-inspect" disabled={loading || (!ingredients && waitSeconds > 0)} aria-expanded={open} onClick={() => void inspect()}>
      {loading ? <><LoaderCircle className="spin" size={15}/> Проверяем состав…</> : ingredients ? open ? 'Скрыть состав' : 'Показать состав' : stock.length ? 'Сверить состав с продуктами' : 'Посмотреть состав'}
      <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {Boolean(error) && <p className="racion-card-error" role="alert">{racionErrorMessage(error)} Нажмите ещё раз для повторной попытки.</p>}
    {open && ingredients && <div className="racion-ingredients">
      <p>Состав и количества — по данным «Рациона».</p>
      <ul>{ingredients.map((ingredient, index) => <li key={`${ingredient.ingredientId}-${index}`}>
        <div><strong>{ingredient.name}</strong><span>{ingredient.amount === null ? 'Количество не указано' : `${numberFormat.format(ingredient.amount)} ${displayUnit(ingredient.unit)}`.trim()}</span></div>
        {comparisonStock !== undefined && match && <small className={match.available.includes(ingredient) ? 'available' : match.assumedPantry.includes(ingredient) || match.compatible.includes(ingredient) || match.unknown.includes(ingredient) ? 'unknown' : 'missing'}>{match.available.includes(ingredient) ? 'Есть' : match.compatible.includes(ingredient) ? 'Уточнить вид/часть' : match.assumedPantry.includes(ingredient) ? 'Базовый продукт' : match.unknown.includes(ingredient) ? 'Уточнить' : 'Нет'}</small>}
      </li>)}</ul>
      <p>Показан полный состав источника. Сверяется наличие продуктов, без проверки достаточного количества и замен.</p>
    </div>}
    <Link className="racion-recipe-link" to={recipePath} state={returnState}>Посмотреть рецепт <ArrowRight size={16}/></Link>
    <a className="racion-card-source" href={recipe.sourceUrl} target="_blank" rel="noreferrer">Источник: «Рацион» <ArrowUpRight size={11}/></a>
  </article>;
}

function displayUnit(unit: string) { return ({ g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт.' } as Record<string, string>)[unit] ?? unit; }

function RacionPhoto({ src, title, to, state, eager }: { src: string | null; title: string; to: string; state: { catalogSearch: string | undefined; comparisonStock: string[] | undefined }; eager: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return <Link className="racion-photo" to={to} state={state} tabIndex={-1} aria-hidden="true">
    {src && !failed
      ? <img src={src} alt={title} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>
      : <span className="racion-photo-fallback"><ImageOff size={29}/><span>Фотография недоступна</span></span>}
  </Link>;
}
