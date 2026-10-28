import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChefHat, Clock3, Heart, ListChecks, ThumbsDown, ThumbsUp, TimerReset } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useRacionRecipe, racionAnalyticsId, racionCategory, readRacionNavigationState } from '../hooks/useRacionRecipe';
import { useRecipeSession } from '../hooks/useRecipeSession';
import { useProfile } from '../hooks/useProfile';
import { useFeedback } from '../hooks/useFeedback';
import { useFridge } from '../hooks/useFridge';
import { isIngredientAllowed } from '../utils/ingredients';
import { trackEvent } from '../services/analytics';
import { RacionIngredientList, RacionRecipeState } from './RacionRecipePage';
import { RestrictedRecipe } from './RecipePage';
import { FridgeConsumptionReview } from '../components/FridgeConsumptionReview';
import '../racion-recipe.css';

export function RacionCookingPage() {
  const { id = '' } = useParams();
  return <RacionCooking key={id} id={id}/>;
}

function RacionCooking({ id }: { id: string }) {
  const location = useLocation();
  const recipeState = useMemo(() => readRacionNavigationState(location.state), [location.state]);
  const { recipe, loading, error, retry, retryAfter } = useRacionRecipe(id);
  const sessionId = `racion:${id}`;
  const { servings: sessionServings } = useRecipeSession(sessionId);
  const startedServings: unknown = location.state && typeof location.state === 'object' ? location.state.cookingServings : undefined;
  const servings = typeof startedServings === 'number' && Number.isInteger(startedServings) && startedServings >= 1 && startedServings <= 6 ? startedServings : sessionServings;
  const { profile } = useProfile();
  const { get, rate } = useFeedback();
  const { hasConsumed } = useFridge();
  const transactionId = `racion:${id}:${location.key}`;
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const [finished, setFinished] = useState(() => hasConsumed(transactionId));
  const [timer, setTimer] = useState<number | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const finishTitle = useRef<HTMLHeadingElement>(null);
  const completionStarted = useRef(finished);
  const analyticsId = racionAnalyticsId(id);
  const category = recipe ? racionCategory(recipe) : 'Рецепт';
  const recipeRoute = `/recipe/racion/${encodeURIComponent(id)}`;
  useEffect(() => { document.title = recipe ? `Готовим: ${recipe.title} — Cookly` : 'Загружаем шаги — Cookly'; }, [recipe]);
  useEffect(() => {
    if (timer === null || timer === 0) return;
    const interval = window.setInterval(() => setTimer(value => value === null ? null : Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [timer === null, timer === 0]);
  useEffect(() => { if (finished) finishTitle.current?.focus(); }, [finished]);
  if (loading || error || !recipe) return <RacionRecipeState loading={loading} error={error} retry={retry} retryAfter={retryAfter} backTo={recipeRoute} backState={recipeState}/>;
  if (!recipe.ingredients.every(item => isIngredientAllowed(item.name, profile))) return <RestrictedRecipe/>;
  if (recipe.steps.length === 0) return <div className="container empty-state"><ChefHat size={35}/><h1>У рецепта пока нет шагов</h1><p>Источник не передал инструкцию. Посмотрите оригинал перед приготовлением.</p><div className="empty-actions"><Link className="button secondary" to={recipeRoute} state={recipeState}>Вернуться к составу</Link><a className="button primary" href={recipe.sourceUrl} target="_blank" rel="noreferrer">Открыть оригинал <ArrowUpRight size={16}/></a></div></div>;
  const steps = recipe.steps;
  const current = Math.min(step, steps.length - 1);
  const stepTime = extractMinutes(steps[current]);
  function goToStep(next: number, markCurrent = false) {
    const bounded = Math.max(0, Math.min(steps.length - 1, next));
    if (bounded === current) return;
    if (markCurrent) setDone(previous => previous.includes(current) ? previous : [...previous, current]);
    setStep(bounded); setTimer(null);
    trackEvent('cooking_step_changed', { recipe_id: analyticsId, recipe_category: category, step_number: bounded + 1 });
    title.current?.focus({ preventScroll: true });
  }
  function completeCooking() {
    if (!recipe) return;
    setFinished(true); setTimer(null); setDone(steps.map((_, index) => index));
    if (completionStarted.current) return;
    completionStarted.current = true;
    trackEvent('cooking_completed', {
      recipe_id: analyticsId, recipe_category: category, number_of_servings: servings,
      ...(recipe.timeMinutes !== null ? { cooking_time: recipe.timeMinutes } : {}),
    });
  }
  if (finished) return <div className="container cooking-page cooking-complete racion-cooking-page"><Link className="back-link" to={recipeRoute} state={recipeState}><ArrowLeft size={16}/> Вернуться к рецепту</Link><div className="complete-card"><span className="complete-badge"><Check size={30}/></span><span className="eyebrow"><ChefHat size={15}/> ГОТОВО</span><h1 ref={finishTitle} tabIndex={-1}>Как получилось?</h1><p>{recipe.title} приготовлен. Ваш отзыв поможет Cookly лучше подбирать блюда.</p><FridgeConsumptionReview transactionId={transactionId} ingredients={recipe.ingredients} servings={servings}/><div className="feedback-actions"><button aria-pressed={get(sessionId)?.liked === true} className={`feedback-button ${get(sessionId)?.liked === true ? 'selected' : ''}`} onClick={() => rate(sessionId, category, true)}><ThumbsUp size={19}/> Понравилось</button><button aria-pressed={get(sessionId)?.liked === false} className={`feedback-button ${get(sessionId)?.liked === false ? 'selected negative' : ''}`} onClick={() => rate(sessionId, category, false)}><ThumbsDown size={19}/> Не понравилось</button></div>{get(sessionId) && <p className="feedback-saved" role="status"><Heart size={14}/> Спасибо, отзыв сохранён</p>}<div className="complete-links"><button className="button primary" onClick={() => { setFinished(false); setStep(0); setDone([]); setTimer(null); }}>Посмотреть шаги ещё раз</button><Link className="button secondary" to="/recipes">К рекомендациям</Link></div></div></div>;
  const isLast = current === steps.length - 1;
  return <div className="container cooking-page racion-cooking-page"><div className="cooking-topbar"><Link className="back-link" to={recipeRoute} state={recipeState}><ArrowLeft size={16}/> Выйти из режима</Link><span className="cooking-title"><ChefHat size={16}/> {recipe.title}</span><span className="cooking-servings">{servings} порц.</span></div>
    <p className="racion-detail-note racion-cooking-note">Количества в списке пересчитаны на {servings} порц.; числа в шагах сохранены по источнику. Размер посуды и время приготовления уточняйте.</p>
    <nav className="step-picker" aria-label="Перейти к шагу">{steps.map((_, index) => <button key={index} aria-label={`Перейти к шагу ${index + 1}`} aria-current={index === current ? 'step' : undefined} className={index === current ? 'active' : done.includes(index) ? 'completed' : ''} onClick={() => goToStep(index)}>{done.includes(index) && index !== current ? <Check size={17}/> : index + 1}</button>)}</nav>
    <div className="cooking-layout"><section className="current-step-card" aria-label="Текущий шаг"><div className="current-step-eyebrow"><span>ШАГ {current + 1} ИЗ {steps.length}</span><span className="step-progress">Пройдено {done.length} из {steps.length}</span></div><div className="progress-track"><span style={{ width: `${done.length / steps.length * 100}%` }}/></div><div className="current-step-content"><span className="big-step-number" aria-hidden="true">{String(current + 1).padStart(2, '0')}</span><h1 ref={title} tabIndex={-1}>{steps[current]}</h1>{stepTime > 0 && <div className="step-timer"><Clock3 size={21}/><span>Примерно {stepTime} мин.</span>{timer !== null ? <><strong role={timer === 0 ? 'status' : undefined}>{timer === 0 ? 'Время вышло' : formatTimer(timer)}</strong><button aria-label="Сбросить таймер" onClick={() => setTimer(null)}><TimerReset size={16}/> Сбросить</button></> : <button onClick={() => setTimer(stepTime * 60)}><TimerReset size={15}/> Запустить таймер</button>}</div>}<details className="cooking-ingredient-reference"><summary>Ингредиенты на {servings} порц.</summary><RacionIngredientList ingredients={recipe.ingredients} servings={servings}/></details></div><div className="cooking-navigation"><button className="button secondary" onClick={() => goToStep(current - 1)} disabled={current === 0}><ArrowLeft size={17}/> Назад</button>{isLast ? <button className="button primary" onClick={completeCooking}>Я приготовил это блюдо <Check size={17}/></button> : <button className="button primary" onClick={() => goToStep(current + 1, true)}>Далее <ArrowRight size={17}/></button>}</div></section>
      <aside className={`all-steps-panel ${showSteps ? 'steps-expanded' : ''}`}><div className="all-steps-heading"><div><span className="overline">ВАШ МАРШРУТ</span><h2>Все шаги</h2></div><ListChecks size={21}/></div><button className="mobile-steps-toggle text-button" aria-expanded={showSteps} onClick={() => setShowSteps(value => !value)}>{showSteps ? 'Свернуть инструкции' : 'Показать все инструкции'}</button><ol>{steps.map((text, index) => <li key={index}><button aria-current={index === current ? 'step' : undefined} className={`${index === current ? 'active' : ''} ${done.includes(index) ? 'completed' : ''}`} onClick={() => goToStep(index)}><span>{done.includes(index) ? <Check size={15}/> : String(index + 1).padStart(2, '0')}</span><em>{text}</em></button></li>)}</ol></aside>
    </div><p className="racion-detail-note racion-cooking-source">Рецепт — <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">«Рацион» <ArrowUpRight size={12}/></a></p>
  </div>;
}

function extractMinutes(text: string): number {
  const range = text.match(/(\d+)\s*(?:–|—|-|до)\s*(\d+)\s*мин/iu);
  const value = range ? Math.round((Number(range[1]) + Number(range[2])) / 2) : Number(text.match(/(\d+)\s*мин/iu)?.[1] ?? 0);
  return Number.isFinite(value) && value > 0 && value <= 1440 ? value : 0;
}
function formatTimer(seconds: number): string { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
