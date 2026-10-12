import { useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Clock3, CookingPot, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePantry } from '../hooks/usePantry';
import { useProfile } from '../hooks/useProfile';
import { useFeedback } from '../hooks/useFeedback';
import { recipes } from '../data/recipes';
import { recommendRecipes } from '../utils/recommendations';
import { trackEvent } from '../utils/analytics';
import { RecipeCard } from '../components/RecipeCard';
import { Eyebrow } from '../components/Layout';
import { servingsLabel } from '../utils/servings';

export function ResultsPage() {
  const { ingredients, source, maxTime, setMaxTime, replaceIngredients } = usePantry();
  const { profile } = useProfile();
  const { feedback } = useFeedback();
  const matches = useMemo(() => recommendRecipes(recipes, ingredients, maxTime, 5, profile, feedback), [ingredients, maxTime, profile, feedback]);
  useEffect(() => { document.title = 'Ваши блюда — Cookly'; trackEvent('recommendations_shown', { count: matches.length, recipeIds: matches.map(m => m.recipe.id), maxTime }); }, [matches, maxTime]);
  return <div className="container results-page"><Link className="back-link" to="/#pantry"><ArrowLeft size={16}/> Изменить продукты</Link><div className="results-heading"><div><Eyebrow>Домашнее — самое вкусное</Eyebrow><h1>Вот что можно<br className="mobile-break"/> приготовить<span className="colored-dot">.</span></h1><p>Мы подобрали блюда на основе ваших продуктов.</p></div><span className="results-count">{matches.length} {matches.length === 1 ? 'идея' : matches.length >= 2 && matches.length <= 4 ? 'идеи' : 'идей'} для вашего стола</span></div>
    <div className="results-toolbar"><div className="result-ingredients"><span className="toolbar-label">У вас есть</span>{ingredients.length ? ingredients.map(name => <span className="simple-chip" key={name}>{name}</span>) : <span>Пока ничего не добавлено</span>}<small className="results-source">{source === 'fridge' ? 'Источник: мой холодильник' : 'Временный список поиска'}</small></div><Link to="/#pantry" className="text-button"><SlidersHorizontal size={15}/> Изменить</Link></div>
    {maxTime && <div className="time-summary"><Clock3 size={15}/> До {maxTime} минут <button onClick={() => setMaxTime(null)}>Убрать ограничение</button></div>}
    {matches.length ? <><div className="profile-match-note"><SlidersHorizontal size={15}/><span>{servingsLabel(profile.familySize)} по профилю · {profile.difficulty === 'Любые' ? 'любая сложность' : profile.difficulty.toLocaleLowerCase('ru')}</span><em>Профиль учитывается</em></div><div className="recipe-grid results-grid">{matches.map(match => <RecipeCard key={match.recipe.id} recipe={match.recipe} match={match}/>)}</div><p className="results-footnote">Сначала — блюда, для которых нужно меньше покупок. Соль, перец, вода и масло не входят в счётчик.</p>{matches.length < 3 && <div className="more-ideas"><p>Пока нашли {matches.length === 1 ? 'один подходящий рецепт' : 'два подходящих рецепта'}. Добавьте ещё продукты{maxTime ? ' или увеличьте время' : ''}, чтобы получить больше вариантов.</p><Link to="/#pantry">Изменить продукты <ArrowRight size={15}/></Link></div>}</> : <div className="empty-state"><span className="empty-icon"><CookingPot size={36}/></span><h2>{ingredients.length ? 'Пока нет подходящего блюда' : 'Начнём с ваших продуктов'}</h2><p>{ingredients.length ? 'Попробуйте добавить яйца, картофель или другие продукты. В нашей коллекции уже 48 рецептов.' : 'Укажите, что есть дома, и мы поможем придумать вкусный обед или ужин.'}</p><div className="empty-actions"><Link to="/#pantry" className="button primary">{ingredients.length ? 'Изменить продукты' : 'Добавить продукты'} <ArrowRight size={17}/></Link>{source === 'fridge' && <button className="button secondary" onClick={() => replaceIngredients([], 'manual')}>Очистить список</button>}{maxTime && <button className="button secondary" onClick={() => setMaxTime(null)}>Показать без лимита времени</button>}</div></div>}
  </div>;
}
