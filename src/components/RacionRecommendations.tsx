import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, LoaderCircle, RotateCcw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useAnalyticsPreferences } from '../hooks/useAnalyticsPreferences';
import { trackEventOnce, type SearchSource } from '../services/analytics';
import { RacionProviderError, type RacionRecipe } from '../services/recipeProviders/racion';
import { loadRacionRecipe, loadRacionSearch } from '../services/recipeProviders/racionCache';
import { racionSearchSeeds, rankRacionRecipes } from '../services/recipeProviders/racionRecommendations';
import { RacionRecipeCard } from './RacionRecipeCard';
import { usePantry } from '../hooks/usePantry';
import '../racion-preview.css';
import '../racion-recommendations.css';

export function RacionRecommendations({ stock, maxTime, source, localRecommendationIds }: { stock: readonly string[]; maxTime: number | null; source: SearchSource; localRecommendationIds: readonly string[] }) {
  const { profile } = useProfile();
  const { assumePantryStaples } = usePantry();
  const { consent } = useAnalyticsPreferences();
  const location = useLocation();
  const stockKey = JSON.stringify(stock);
  const seeds = useMemo(() => racionSearchSeeds(stock), [stockKey]);
  const [selected, setSelected] = useState('');
  const query = seeds.includes(selected) ? selected : seeds[0] ?? '';
  const [pageState, setPageState] = useState({ query: '', offset: 0 });
  const offset = pageState.query === query ? pageState.offset : 0;
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([query, offset, maxTime, retry]);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const poolKey = JSON.stringify([query, maxTime]);
  const [pool, setPool] = useState<{ key: string; recipes: RacionRecipe[] }>({ key: '', recipes: [] });
  const loaded = pool.key === poolKey ? pool.recipes : [];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const waiting = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [waiting]);
  useEffect(() => {
    if (!query) { setPool({ key: poolKey, recipes: [] }); setLoading(false); setSettledKey(requestKey); return; }
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true); if (offset === 0) setPool({ key: poolKey, recipes: [] }); setError(null); setNextOffset(null); setSettledKey(null);
    async function load() {
      const page = await loadRacionSearch({ query, limit: 12, offset, signal });
      const visited = page.items.slice(0, 6);
      const candidates = visited.filter(item => maxTime === null || (item.timeMinutes !== null && item.timeMinutes <= maxTime));
      const results: RacionRecipe[] = [];
      let partialError: unknown = null;
      // Bound work to six details; stop immediately on rate limits or network errors.
      for (const candidate of candidates) {
        if (signal.aborted) return;
        try { results.push(await loadRacionRecipe(candidate.id, { signal })); }
        catch (cause) {
          if (signal.aborted) return;
          partialError = cause;
          if (!(cause instanceof RacionProviderError) || cause.code !== 'malformed_response') break;
        }
      }
      if (!signal.aborted) {
        setPool(previous => ({ key: poolKey, recipes: [...new Map([...(previous.key === poolKey ? previous.recipes : []), ...results].map(recipe => [recipe.id, recipe])).values()] }));
        const next = offset + visited.length;
        setNextOffset(!partialError && next < page.total ? next : null);
        if (partialError) throw partialError;
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
  }, [query, offset, maxTime, retry]);
  const matches = useMemo(() => rankRacionRecipes(loaded, stock, maxTime, profile, { assumePantryStaples }), [loaded, stockKey, maxTime, profile, assumePantryStaples]);
  const remoteIds = matches.map(item => item.recipe.id).join(',');
  const localIds = localRecommendationIds.join(',');
  useEffect(() => {
    if (loading || settledKey !== requestKey) return;
    trackEventOnce('recommendations_shown', `recommendations:${location.key}:${source}:${maxTime ?? 'all'}:${remoteIds}:${localIds}`, {
      search_source: source, total_recommendations: matches.length + localRecommendationIds.length,
      ...(maxTime ? { cooking_time: maxTime } : {}),
    });
  }, [consent, loading, settledKey, requestKey, location.key, source, maxTime, remoteIds, localIds, matches.length, localRecommendationIds.length]);
  if (!seeds.length) return <div className="racion-results-note"><p>В большом каталоге можно искать блюда по названию или основному продукту.</p><Link to="/catalog">Открыть каталог <ArrowRight size={15}/></Link></div>;
  return <section className="racion-recommendations" aria-labelledby="racion-recommendations-title">
    <div className="section-title-row"><h2 id="racion-recommendations-title">Идеи из большого каталога</h2><Link to="/catalog">Все рецепты <ArrowRight size={15}/></Link></div>
    <div className="racion-seed-picker"><label htmlFor="racion-main-product">Основной продукт</label><select id="racion-main-product" value={query} disabled={loading || waiting > 0} onChange={event => { setSelected(event.target.value); setPageState({ query: event.target.value, offset: 0 }); }}>{seeds.map(seed => <option key={seed} value={seed}>{seed}</option>)}</select><p>Ищем по основному продукту и проверяем полный состав каждой идеи. Можно выбрать другой продукт.</p></div>
    {loading && <p className="racion-results-note" role="status"><LoaderCircle size={18} className="spin"/> Проверяем состав рецептов…</p>}
    {Boolean(error) && <div className="racion-results-note" role="status"><p>{waiting ? `Каталог временно ограничил запросы. Повторить можно через ${waiting} сек.` : 'Часть рецептов сейчас недоступна. Ниже есть наша домашняя коллекция.'}</p><button className="button secondary" disabled={loading || waiting > 0} onClick={() => setRetry(value => value + 1)}><RotateCcw size={15}/> Повторить</button></div>}
    {matches.length > 0 && <><div className="racion-grid">{matches.map(({ recipe }, index) => <RacionRecipeCard key={recipe.id} recipe={recipe} stock={[...stock]} knownIngredients={recipe.ingredients} eagerPhoto={index < 3}/>)}</div><p className="racion-recommendations-hint">Проверено наличие продуктов, без проверки их количества. {assumePantryStaples ? 'Базовые продукты и сухие специи исключены из счётчика.' : 'Соль, масло и специи тоже учитываются.'} Настройки питания применены ко всему составу.</p></>}
    {!loading && !error && matches.length === 0 && <p className="racion-results-note">В этой подборке совпадений нет. Выберите другой основной продукт или посмотрите следующие рецепты.</p>}
    {!loading && nextOffset !== null && <button className="button secondary" disabled={waiting > 0} onClick={() => setPageState({ query, offset: nextOffset })}>Ещё идеи по этому продукту <ArrowRight size={16}/></button>}
    <p className="racion-recommendations-hint">Проверен состав рецептов: {loaded.length}. Следующие идеи дополнят подборку и будут отсортированы по вашим продуктам. Это часть каталога; весь каталог доступен в поиске. Источник рецептов — <a href="https://racion.app" target="_blank" rel="noreferrer">«Рацион»</a>.</p>
  </section>;
}
