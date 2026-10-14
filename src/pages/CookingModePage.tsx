import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChefHat, Clock3, Heart, ListChecks, TimerReset, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { recipes } from '../data/recipes';
import { useFeedback } from '../hooks/useFeedback';
import { useProfile } from '../hooks/useProfile';
import { useRecipeSession } from '../hooks/useRecipeSession';
import { useAvailableIngredients } from '../hooks/useAvailableIngredients';
import { getRecipeSteps } from '../utils/recipeSteps';
import { getEffectiveIngredients } from '../utils/substitutions';
import { isRecipeAllowed } from '../utils/recommendations';
import { trackEvent } from '../services/analytics';
import { ingredientQuantity } from '../components/IngredientSubstitution';
import { NotFoundPage } from './NotFoundPage';
import { RestrictedRecipe } from './RecipePage';

export function CookingModePage() {
  const { id = '' } = useParams();
  const { get, rate } = useFeedback();
  const { profile } = useProfile();
  const { servings, selections } = useRecipeSession(id);
  const available = useAvailableIngredients();
  const recipe = recipes.find(item => item.id === id);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const finishTitle = useRef<HTMLHeadingElement>(null);
  const completionStarted = useRef(false);
  useEffect(() => { setStep(0); setDone([]); setFinished(false); setTimer(null); if (recipe) document.title = `Готовим: ${recipe.name} — Cookly`; }, [recipe]);
  useEffect(() => {
    if (timer === null || timer === 0) return;
    const interval = window.setInterval(() => setTimer(value => value === null ? null : Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [timer === null, timer === 0]);
  useEffect(() => { if (finished) finishTitle.current?.focus(); }, [finished]);
  if (!recipe) return <NotFoundPage/>;
  if (!isRecipeAllowed(recipe, profile)) return <RestrictedRecipe/>;
  const steps = getRecipeSteps(recipe, servings);
  const effective = getEffectiveIngredients(recipe, selections, servings, available, profile);
  const stepTime = extractMinutes(steps[step]);
  function goToStep(next: number, markCurrent = false) {
    if (!recipe) return;
    const bounded = Math.max(0, Math.min(steps.length - 1, next));
    if (bounded === step) return;
    if (markCurrent) setDone(current => current.includes(step) ? current : [...current, step]);
    setStep(bounded); setTimer(null);
    trackEvent('cooking_step_changed', { recipe_id: id, recipe_category: recipe.category, step_number: bounded + 1 });
    title.current?.focus({ preventScroll: true });
  }
  function completeCooking() {
    if (!recipe) return;
    if (completionStarted.current) return;
    completionStarted.current = true;
    setFinished(true); setTimer(null); setDone(steps.map((_, index) => index));
    trackEvent('cooking_completed', { recipe_id: id, recipe_category: recipe.category, cooking_time: recipe.cookingTime, number_of_servings: servings });
  }
  if (finished) return <div className="container cooking-page cooking-complete"><Link className="back-link" to={`/recipe/${id}`}><ArrowLeft size={16}/> Вернуться к рецепту</Link><div className="complete-card"><span className="complete-badge"><Check size={30}/></span><span className="eyebrow"><ChefHat size={15}/> ГОТОВО</span><h1 ref={finishTitle} tabIndex={-1}>Как получилось?</h1><p>{recipe.name} приготовлен. Ваш отзыв поможет Cookly лучше подбирать блюда.</p><div className="feedback-actions"><button aria-pressed={get(id)?.liked === true} className={`feedback-button ${get(id)?.liked === true ? 'selected' : ''}`} onClick={() => rate(id, recipe.category, true)}><ThumbsUp size={19}/> Понравилось</button><button aria-pressed={get(id)?.liked === false} className={`feedback-button ${get(id)?.liked === false ? 'selected negative' : ''}`} onClick={() => rate(id, recipe.category, false)}><ThumbsDown size={19}/> Не понравилось</button></div>{get(id) && <p className="feedback-saved" role="status"><Heart size={14}/> Спасибо, отзыв сохранён</p>}<div className="complete-links"><button className="button primary" onClick={() => { completionStarted.current = false; setFinished(false); setStep(0); setDone([]); }}>Посмотреть шаги ещё раз</button><Link className="button secondary" to="/recipes">К рекомендациям</Link></div></div></div>;
  const isLast = step === steps.length - 1;
  return <div className="container cooking-page"><div className="cooking-topbar"><Link className="back-link" to={`/recipe/${id}`}><ArrowLeft size={16}/> Выйти из режима</Link><span className="cooking-title"><ChefHat size={16}/> {recipe.name}</span><span className="cooking-servings">{servings} порц.</span></div>
    <nav className="step-picker" aria-label="Перейти к шагу">{steps.map((_, index) => <button key={index} aria-label={`Перейти к шагу ${index + 1}`} aria-current={index === step ? 'step' : undefined} className={index === step ? 'active' : done.includes(index) ? 'completed' : ''} onClick={() => goToStep(index)}>{done.includes(index) && index !== step ? <Check size={17}/> : index + 1}</button>)}</nav>
    {effective.replacements.length > 0 && <div className="replacement-notes cooking-replacements"><strong>Ваши замены действуют во всех шагах</strong>{effective.replacements.map(item => <p key={item.original.name}><b>{item.original.name} → {item.substitution.label}.</b> {item.substitution.ingredients.map(part => `${part.name} ${ingredientQuantity(part)}`).join(' + ')}. {item.substitution.note}</p>)}</div>}
    <div className="cooking-layout"><section className="current-step-card" aria-label="Текущий шаг"><div className="current-step-eyebrow"><span>ШАГ {step + 1} ИЗ {steps.length}</span><span className="step-progress">Пройдено {done.length} из {steps.length}</span></div><div className="progress-track"><span style={{ width: `${(done.length / steps.length) * 100}%` }}/></div><div className="current-step-content"><span className="big-step-number" aria-hidden="true">{String(step + 1).padStart(2, '0')}</span><h1 ref={title} tabIndex={-1}>{steps[step]}</h1>{stepTime > 0 && <div className="step-timer"><Clock3 size={21}/><span>Примерно {stepTime} мин.</span>{timer !== null ? <><strong role={timer === 0 ? 'status' : undefined}>{timer === 0 ? 'Время вышло' : formatTimer(timer)}</strong><button aria-label="Сбросить таймер" onClick={() => setTimer(null)}><TimerReset size={16}/> Сбросить</button></> : <button onClick={() => setTimer(stepTime * 60)}><TimerReset size={15}/> Запустить таймер</button>}</div>}<details className="cooking-ingredient-reference"><summary>Ингредиенты на {servings} порц.</summary><ul>{effective.ingredients.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}{item.optional ? ' (по желанию)' : ''}</span><strong>{ingredientQuantity(item)}</strong></li>)}</ul></details></div><div className="cooking-navigation"><button className="button secondary" onClick={() => goToStep(step - 1)} disabled={step === 0}><ArrowLeft size={17}/> Назад</button>{isLast ? <button className="button primary" onClick={completeCooking}>Я приготовил это блюдо <Check size={17}/></button> : <button className="button primary" onClick={() => goToStep(step + 1, true)}>Далее <ArrowRight size={17}/></button>}</div></section>
    <aside className={`all-steps-panel ${showSteps ? 'steps-expanded' : ''}`}><div className="all-steps-heading"><div><span className="overline">ВАШ МАРШРУТ</span><h2>Все шаги</h2></div><ListChecks size={21}/></div><button className="mobile-steps-toggle text-button" aria-expanded={showSteps} onClick={() => setShowSteps(value => !value)}>{showSteps ? 'Свернуть инструкции' : 'Показать все инструкции'}</button><ol>{steps.map((text, index) => <li key={index}><button aria-current={index === step ? 'step' : undefined} className={`${index === step ? 'active' : ''} ${done.includes(index) ? 'completed' : ''}`} onClick={() => goToStep(index)}><span>{done.includes(index) ? <Check size={15}/> : String(index + 1).padStart(2, '0')}</span><em>{text}</em></button></li>)}</ol></aside></div>
  </div>;
}
function extractMinutes(text: string) { const range = text.match(/(\d+)\s*(?:–|-|до)\s*(\d+)\s*мин/iu); if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2); const single = text.match(/(\d+)\s*мин/iu); return single ? Number(single[1]) : 0; }
function formatTimer(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
