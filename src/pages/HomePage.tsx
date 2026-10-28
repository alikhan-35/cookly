import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, CookingPot, Refrigerator } from 'lucide-react';
import { IngredientForm } from '../components/IngredientForm';
import { useFridge } from '../hooks/useFridge';
import { usePantry } from '../hooks/usePantry';
import { trackEvent } from '../services/analytics';

export function HomePage() {
  const navigate = useNavigate();
  const { usableNames } = useFridge();
  const { replaceIngredients } = usePantry();
  useEffect(() => { document.title = 'Cookly — что приготовить из ваших продуктов'; }, []);
  function useStock() {
    replaceIngredients(usableNames, 'fridge');
    trackEvent('fridge_used_for_search', { search_source: 'fridge' });
    trackEvent('recommendations_requested', { search_source: 'fridge' });
    navigate('/recipes');
  }
  return <div className="container home-page">
    <section className="home-hero" aria-labelledby="hero-title">
      <div className="home-hero-copy"><span className="home-kicker">ДОМА ВКУСНЕЕ</span>
        <h1 id="hero-title">Хороший ужин<br/>уже <em>у вас дома.</em></h1>
        <p>Найдём, что приготовить из ваших продуктов.<br className="desktop-break"/> Меньше лишних покупок, больше любимой еды.</p>
        <div className="home-hero-actions">{usableNames.length > 0
          ? <button className="button primary" onClick={useStock}>Подобрать блюда <ArrowRight size={18}/></button>
          : <a className="button primary" href="#pantry" onClick={event => { event.preventDefault(); document.getElementById('pantry')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.getElementById('ingredient-input')?.focus({ preventScroll: true }); }}>Что приготовить? <ArrowRight size={18}/></a>}
          <Link className="home-catalog-link" to="/catalog">Посмотреть рецепты <ArrowRight size={16}/></Link></div>
        {usableNames.length > 0 && <Link className="home-stock-link" to="/fridge"><Refrigerator size={16}/> В холодильнике: {usableNames.length} продуктов</Link>}
      </div>
      <div className="home-hero-photo"><img src="https://racion.app/images/recipes/buckwheat_merchant.webp" alt="Гречка по-купечески с мясом и овощами" fetchPriority="high" referrerPolicy="no-referrer"/><a className="home-photo-source" href="https://racion.app/recipe/buckwheat_merchant" target="_blank" rel="noreferrer">Гречка по-купечески · «Рацион»</a><span className="home-photo-caption"><CookingPot size={18}/> Простые продукты. Настоящая еда.</span></div>
    </section>
    <IngredientForm/>
    <section className="home-fridge-invitation" aria-labelledby="home-fridge-title"><span className="home-fridge-invitation-icon"><Camera size={25}/></span><div><h2 id="home-fridge-title">Покупки уже в холодильнике?</h2><p>Добавьте продукты списком, голосом или по фото чека. Cookly запомнит их для следующего ужина.</p></div><Link className="button secondary" to="/fridge">Мой холодильник <ArrowRight size={17}/></Link></section>
  </div>;
}
