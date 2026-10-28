import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, RotateCcw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useAnalyticsPreferences } from '../hooks/useAnalyticsPreferences';
import { trackEventOnce, type SearchSource } from '../services/analytics';
import { RacionProviderError, type RacionRecipe } from '../services/recipeProviders/racion';
import { discoverRacionRecipes, initialRacionDiscoveryCursor } from '../services/recipeProviders/racionDiscovery';
import { racionSearchSeeds, rankRacionRecipes } from '../services/recipeProviders/racionRecommendations';
import { RacionRecipeCard } from './RacionRecipeCard';
import { usePantry } from '../hooks/usePantry';
import '../racion-preview.css';
import '../racion-recommendations.css';

const emptyRecipes: RacionRecipe[] = [];

export function RacionRecommendations({ stock, maxTime, source }: { stock: readonly string[]; maxTime: number | null; source: SearchSource }) {
  const { profile } = useProfile();
  const { assumePantryStaples } = usePantry();
  const { consent } = useAnalyticsPreferences();
  const location = useLocation();
  const stockKey = JSON.stringify(stock);
  const seeds = useMemo(() => racionSearchSeeds(stock), [stockKey]);
  const [batch, setBatch] = useState(0);
  const requestKey = JSON.stringify([stockKey, batch]);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [pool, setPool] = useState<{ key: string; recipes: RacionRecipe[] }>({ key: '', recipes: [] });
  const session = useRef({ key: '', cursor: initialRacionDiscoveryCursor(), recipes: emptyRecipes });
  const loaded = pool.key === stockKey ? pool.recipes : emptyRecipes;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const waiting = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [waiting]);
  useEffect(() => {
    if (!seeds.length) { setPool({ key: stockKey, recipes: [] }); setLoading(false); setHasMore(false); setSettledKey(requestKey); return; }
    const controller = new AbortController();
    const { signal } = controller;
    if (session.current.key !== stockKey) {
      session.current = { key: stockKey, cursor: initialRacionDiscoveryCursor(), recipes: [] };
      setPool({ key: stockKey, recipes: [] });
    }
    const current = session.current;
    setLoading(true); setError(null); setSettledKey(null);
    const merge = (recipes: RacionRecipe[]) => [...new Map([...current.recipes, ...recipes].map(recipe => [recipe.id, recipe])).values()];
    async function load() {
      const result = await discoverRacionRecipes({
        seeds, cursor: current.cursor, knownIds: current.recipes.map(recipe => recipe.id), signal,
        onProgress: recipes => { if (!signal.aborted) setPool({ key: stockKey, recipes: merge(recipes) }); },
      });
      if (!signal.aborted) {
        session.current = { key: stockKey, recipes: merge(result.recipes), cursor: result.cursor };
        setPool({ key: stockKey, recipes: session.current.recipes });
        setHasMore(result.hasMore);
        if (result.error) throw result.error;
      }
    }
    void load().catch(cause => {
      if (signal.aborted) return;
      setError(cause);
      if (cause instanceof RacionProviderError && cause.code === 'rate_limit') {
        setNow(Date.now()); setBlockedUntil(Date.now() + Math.max(1, cause.retryAfterSeconds ?? 60) * 1000);
      }
    }).finally(() => { if (!signal.aborted) { setLoading(false); setSettledKey(requestKey); } });
    return () => controller.abort();
  }, [stockKey, batch]);
  const matches = useMemo(() => rankRacionRecipes(loaded, stock, maxTime, profile, { assumePantryStaples }), [loaded, stockKey, maxTime, profile, assumePantryStaples]);
  const remoteIds = matches.map(item => item.recipe.id).join(',');
  useEffect(() => {
    if (loading || settledKey !== requestKey) return;
    trackEventOnce('recommendations_shown', `recommendations:${location.key}:${source}:${maxTime ?? 'all'}:${remoteIds}`, {
      search_source: source, total_recommendations: matches.length,
      ...(maxTime ? { cooking_time: maxTime } : {}),
    });
  }, [consent, loading, settledKey, requestKey, location.key, source, maxTime, remoteIds, matches.length]);
  if (!seeds.length) return <div className="empty-state"><h2>Добавьте продукты для блюда</h2><p>Одних специй недостаточно для подбора. Укажите овощи, крупы, мясо или другие продукты, которые есть дома.</p><Link className="button primary" to={source === 'fridge' ? '/fridge' : '/#pantry'}>Добавить продукты <ArrowRight size={15}/></Link></div>;
  return <section className="racion-recommendations" aria-labelledby="racion-recommendations-title">
    <div className="section-title-row"><h2 id="racion-recommendations-title">Подходит вам</h2>{matches.length > 0 && <span className="muted">{matches.length} найдено</span>}</div>
    {loading && <p className="racion-results-note" role="status"><LoaderCircle size={18} className="spin"/> Подбираем блюда по вашим продуктам…</p>}
    {Boolean(error) && <div className="racion-results-note" role="status"><p>{waiting ? `Каталог временно ограничил запросы. Повторить можно через ${waiting} сек.` : 'Не все рецепты удалось проверить. Найденные варианты сохранены — можно повторить загрузку.'}</p><button className="button secondary" disabled={loading || waiting > 0} onClick={() => setBatch(value => value + 1)}><RotateCcw size={15}/> Повторить</button></div>}
    {matches.length > 0 && <><div className="racion-grid">{matches.map(({ recipe }, index) => <RacionRecipeCard key={recipe.id} recipe={recipe} stock={[...stock]} knownIngredients={recipe.ingredients} eagerPhoto={index < 3}/>)}</div><p className="racion-recommendations-hint">Проверено наличие продуктов, без проверки их количества. {assumePantryStaples ? 'Базовые продукты и сухие специи исключены из счётчика.' : 'Соль, масло и специи тоже учитываются.'} Настройки питания применены ко всему составу.</p></>}
    {!loading && !error && matches.length === 0 && <div className="empty-state"><h3>Пока нет близких совпадений</h3><p>Ищем блюда, где есть основа и нужно докупить не больше двух продуктов. Можно продолжить поиск или дополнить список.</p><Link className="text-button" to={source === 'fridge' ? '/fridge' : '/#pantry'}>Изменить продукты <ArrowRight size={15}/></Link></div>}
    {!loading && !error && hasMore && <button className="button secondary" disabled={waiting > 0} onClick={() => setBatch(value => value + 1)}>Найти ещё варианты <ArrowRight size={16}/></button>}
    <p className="racion-recommendations-hint">Проверено рецептов: {loaded.length}. Подборка расширяется по кнопке «Найти ещё варианты»; весь каталог доступен в <Link to="/catalog">поиске</Link>. Источник — <a href="https://racion.app" target="_blank" rel="noreferrer">«Рацион»</a>.</p>
  </section>;
}
