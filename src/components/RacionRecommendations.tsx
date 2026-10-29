import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, LoaderCircle, RotateCcw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useAnalyticsPreferences } from '../hooks/useAnalyticsPreferences';
import { trackEventOnce, type SearchSource } from '../services/analytics';
import { RacionProviderError, type RacionRecipe } from '../services/recipeProviders/racion';
import { recommendRacionFromFridge } from '../services/recipeProviders/racionFridgeSearch';
import { rankRacionRecipes } from '../services/recipeProviders/racionRecommendations';
import { RacionRecipeCard } from './RacionRecipeCard';
import { usePantry } from '../hooks/usePantry';
import '../racion-preview.css';
import '../racion-recommendations.css';

export function RacionRecommendations({ stock, maxTime, source }: { stock: readonly string[]; maxTime: number | null; source: SearchSource }) {
  const { profile } = useProfile();
  const { assumePantryStaples } = usePantry();
  const { consent } = useAnalyticsPreferences();
  const location = useLocation();
  const stockKey = JSON.stringify(stock);
  const profileKey = JSON.stringify(profile);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([stockKey, maxTime, profileKey, assumePantryStaples, retry]);
  const [result, setResult] = useState<{ key: string; recipes: RacionRecipe[]; checked: number; totalCandidates: number; error: unknown; loading: boolean }>({ key: '', recipes: [], checked: 0, totalCandidates: 0, error: null, loading: true });
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const waiting = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [waiting]);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ key, recipes: [], checked: 0, totalCandidates: 0, error: null, loading: true });
    if (!stock.length) { setResult({ key, recipes: [], checked: 0, totalCandidates: 0, error: null, loading: false }); return; }
    void recommendRacionFromFridge({ stock, maxTime, profile, matchingOptions: { assumePantryStaples }, signal: controller.signal,
      onProgress: progress => { if (!controller.signal.aborted) setResult({ key, ...progress, loading: true, error: null }); },
    }).then(next => {
      if (controller.signal.aborted) return;
      setResult({ key, recipes: next.recipes, checked: next.checked, totalCandidates: next.totalCandidates, error: next.error, loading: false });
      if (next.error instanceof RacionProviderError && next.error.code === 'rate_limit') {
        setNow(Date.now()); setBlockedUntil(Date.now() + Math.max(1, next.error.retryAfterSeconds ?? 60) * 1000);
      }
    }).catch(error => { if (!controller.signal.aborted) setResult(previous => ({ ...previous, key, error, loading: false })); });
    return () => controller.abort();
  }, [key]);
  const loaded = result.key === key ? result.recipes : [];
  const loading = result.key !== key || result.loading;
  const error = result.key === key ? result.error : null;
  const matches = useMemo(() => rankRacionRecipes(loaded, stock, maxTime, profile, { assumePantryStaples }), [loaded, stockKey, maxTime, profileKey, assumePantryStaples]);
  const remoteIds = matches.map(item => item.recipe.id).join(',');
  useEffect(() => {
    if (loading) return;
    trackEventOnce('recommendations_shown', `recommendations:${location.key}:${key}:${remoteIds}`, { search_source: source, total_recommendations: matches.length, ...(maxTime ? { cooking_time: maxTime } : {}) });
  }, [consent, loading, location.key, key, remoteIds, source, matches.length, maxTime]);
  const editTo = source === 'fridge' ? '/fridge' : '/#pantry';
  if (!stock.length) return <div className="empty-state"><h2>Что есть у вас дома?</h2><p>Добавьте продукты для подбора блюд.</p><Link className="button primary" to={editTo}>Добавить продукты <ArrowRight size={15}/></Link></div>;
  return <section className="racion-recommendations" aria-labelledby="racion-recommendations-title">
    <div className="section-title-row"><h2 id="racion-recommendations-title">Подходит вам</h2>{matches.length > 0 && <span className="muted">{matches.length} найдено</span>}</div>
    {loading && <p className="racion-results-note" role="status"><LoaderCircle size={18} className="spin"/>{result.checked ? 'Проверяем составы и добавляем подходящие блюда…' : 'Ищем блюда по всему вашему набору продуктов…'}</p>}
    {matches.length > 0 && <><div className="racion-grid">{matches.map(({ recipe }, index) => <RacionRecipeCard key={recipe.id} recipe={recipe} stock={[...stock]} knownIngredients={recipe.ingredients} eagerPhoto={index < 3}/>)}</div><p className="racion-recommendations-hint">Сначала лучшие совпадения. Недостающие продукты и разновидности, которые нужно уточнить, указаны на карточках. Количество проверьте перед готовкой.</p></>}
    {!loading && Boolean(error) && <div className="racion-results-note" role="status"><p>{waiting ? `Источник временно ограничил запросы. Повторить можно через ${waiting} сек.` : matches.length ? 'Часть составов проверить не удалось. Найденные блюда сохранены.' : 'Подбор сейчас не удалось завершить. Это не означает, что из ваших продуктов нельзя приготовить блюдо.'}</p><button className="button secondary" disabled={waiting > 0} onClick={() => setRetry(value => value + 1)}><RotateCcw size={15}/> Повторить подбор</button></div>}
    {!loading && !error && matches.length === 0 && <div className="empty-state"><h3>Нужно уточнить подбор</h3><p>Среди проверенных вариантов пока нет достаточно близких совпадений. Проверьте ограничения времени и питания или откройте каталог. Ваш набор продуктов сохранён.</p><Link className="button secondary" to="/catalog">Посмотреть каталог <ArrowRight size={15}/></Link><Link className="text-button" to={editTo}>Мои продукты</Link></div>}
    <p className="racion-recommendations-hint">Кандидаты найдены по вашему холодильнику в каталоге <a href="https://racion.app" target="_blank" rel="noreferrer">«Рациона»</a>; полный состав проверяется Cookly. {assumePantryStaples ? 'Обычные специи, соль, вода и растительное масло не требуют добавления в холодильник.' : 'Базовые продукты тоже учитываются.'}</p>
  </section>;
}
