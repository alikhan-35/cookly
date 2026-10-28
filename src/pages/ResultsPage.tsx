import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, Clock3, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePantry } from '../hooks/usePantry';
import { useFridge } from '../hooks/useFridge';
import { Eyebrow } from '../components/Layout';
import { RacionRecommendations } from '../components/RacionRecommendations';
import { PantryPolicyControl } from '../components/PantryPolicyControl';

export function ResultsPage() {
  const { rawIngredients, source, maxTime, setMaxTime } = usePantry();
  const { usableNames } = useFridge();
  const stock = source === 'fridge' ? usableNames : rawIngredients;
  const editTo = source === 'fridge' ? '/fridge' : '/#pantry';
  useEffect(() => { document.title = 'Ваши блюда — Cookly'; }, []);
  return <div className="container results-page">
    <Link className="back-link" to={editTo}><ArrowLeft size={16}/> Изменить продукты</Link>
    <div className="results-heading"><div><Eyebrow>Ваши продукты — новые идеи</Eyebrow><h1>Что приготовим<span className="colored-dot">?</span></h1><p>Лучшие совпадения — первыми. Всё есть дома или осталось докупить немного.</p></div><Link className="catalog-home-link" to="/catalog">Весь каталог <ArrowRight size={15}/></Link></div>
    <div className="results-toolbar">
      <details className="results-stock-details"><summary>Ваш список · {stock.length}</summary><div className="result-ingredients">{stock.length ? stock.map(name => <span className="simple-chip" key={name}>{name}</span>) : <span>Пока ничего не добавлено</span>}</div></details>
      <Link to={editTo} className="text-button"><SlidersHorizontal size={15}/> Изменить</Link>
    </div>
    {maxTime !== null && <div className="time-summary"><Clock3 size={15}/> До {maxTime} минут <button onClick={() => setMaxTime(null)}>Убрать ограничение</button></div>}
    <PantryPolicyControl/>
    <RacionRecommendations stock={stock} maxTime={maxTime} source={source}/>
  </div>;
}
