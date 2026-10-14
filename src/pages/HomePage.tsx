import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Check, CookingPot, Leaf, ListPlus, MousePointer2, Sparkles } from 'lucide-react';
import { FoodArt } from '../components/FoodArt';
import { IngredientForm } from '../components/IngredientForm';
import { Eyebrow } from '../components/Layout';
import { RecipeCard } from '../components/RecipeCard';
import { recipes } from '../data/recipes';
import { useFridge } from '../hooks/useFridge';
import { usePantry } from '../hooks/usePantry';
import { useToast } from '../hooks/useToast';
import { trackEvent } from '../services/analytics';

export function HomePage() {
  const navigate = useNavigate();
  const { usableNames } = useFridge();
  const { replaceIngredients } = usePantry();
  const { toast } = useToast();
  useEffect(() => { document.title = 'Cookly — что приготовить сегодня?'; }, []);
  return <div className="container">
    <section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><Eyebrow>Хороший ужин начинается дома</Eyebrow><h1 id="hero-title">Что приготовить<br/><span>сегодня?</span><svg className="title-spark" viewBox="0 0 40 40" aria-hidden="true"><path d="m21 2-3 11M37 13l-12 6M34 33l-10-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg></h1><p>Укажите продукты, которые есть дома —<br className="desktop-break"/> Cookly предложит подходящие блюда<br className="desktop-break"/> и покажет, как их приготовить.</p><a className="hero-anchor" href="#pantry" onClick={e => { e.preventDefault(); document.getElementById('pantry')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.getElementById('ingredient-input')?.focus({ preventScroll: true }); }}>Заглянем в холодильник? <ArrowDown size={15}/></a></div>
      <div className="hero-visual"><div className="hero-orbit"/><span className="handwritten">Вкусное уже рядом<svg viewBox="0 0 85 40" aria-hidden="true"><path d="M2 3q25 40 73 19m-13-6 17 4-8 13"/></svg></span><FoodArt hero/><div className="floating-note note-fresh"><span className="note-icon"><Leaf size={19}/></span><div><strong>Из ваших продуктов</strong><span>Просто, по-домашнему</span></div></div><div className="floating-note note-recipes"><span className="note-icon peach"><CookingPot size={20}/></span><div><strong>{recipes.length} домашних рецептов</strong><span>На каждый день</span></div></div><span className="hero-dot dot-one"/><span className="hero-dot dot-two"/><span className="tiny-spark">✳</span></div>
    </section>
    <IngredientForm/>{usableNames.length > 0 && <div className="home-fridge-cta"><span><span className="home-fridge-icon"><CookingPot size={18}/></span><span><strong>Уже ведёте продукты в Cookly?</strong><small>{usableNames.length} продуктов с актуальным сроком в холодильнике</small></span></span><button className="button secondary" onClick={() => { replaceIngredients(usableNames, 'fridge'); trackEvent('fridge_used_for_search', { search_source: 'fridge' }); trackEvent('recommendations_requested', { search_source: 'fridge' }); toast('Продукты из холодильника добавлены в подбор'); navigate('/recipes'); }}>Использовать мой холодильник <ArrowUpRight size={16}/></button></div>}
    <section className="inspiration" aria-labelledby="inspiration-title"><div className="section-heading"><div><span className="overline">ПРОСТО И СО ВКУСОМ</span><h2 id="inspiration-title">Немного вдохновения</h2></div><span className="section-aside">Знакомые продукты. Любимые блюда. <Sparkles size={16}/></span></div><div className="recipe-grid">{recipes.slice(0,3).map(recipe => <RecipeCard key={recipe.id} recipe={recipe}/>)}</div></section>
    <section className="how-section" id="how-it-works" aria-labelledby="how-title"><div className="how-intro"><Eyebrow>Без лишних хлопот</Eyebrow><h2 id="how-title">От «что приготовить?»<br/>до «как вкусно!»</h2><p>Три простых шага к домашнему ужину.</p></div><div className="how-steps">{[{icon:ListPlus,title:'Добавьте продукты',text:'Расскажите, что есть в холодильнике.'},{icon:MousePointer2,title:'Выберите блюдо',text:'Найдите свой вариант среди рекомендаций.'},{icon:CookingPot,title:'Готовьте с удовольствием',text:'Следуйте понятному рецепту шаг за шагом.'}].map((step,i) => <div className="how-step" key={step.title}><span className="how-icon"><step.icon size={21}/></span><span className="step-index">0{i+1}</span><h3>{step.title}</h3><p>{step.text}</p></div>)}</div></section>
    <div className="closing-line"><Check size={15}/><span>Простые продукты</span><span className="dot-separator">·</span><span>Понятные рецепты</span><span className="dot-separator">·</span><span>Каждый день <ArrowUpRight size={13}/></span></div>
  </div>;
}
