import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Clock3, Leaf, LoaderCircle, Plus, Search, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePantry } from '../hooks/usePantry';
import { popularIngredients } from '../utils/ingredients';
import { pantryProductKey } from '../utils/pantryProducts';
import { trackEvent } from '../services/analytics';
import { PantryPolicyControl } from './PantryPolicyControl';

export function IngredientForm() {
  const { ingredients, rawIngredients, source, maxTime, setMaxTime, addIngredient, removeIngredient, clearIngredients } = usePantry();
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navigate = useNavigate();
  useEffect(() => () => clearTimeout(timer.current), []);
  function add(value: string) {
    const error = addIngredient(value);
    setMessage(error ?? '');
    if (!error) setInput('');
    inputRef.current?.focus();
  }
  function submit(event: FormEvent) { event.preventDefault(); add(input); }
  function findRecipes() {
    if (!ingredients.length || loading) return;
    setLoading(true);
    trackEvent('recommendations_requested', {
      search_source: source,
      ...(maxTime ? { cooking_time: maxTime } : {}),
    });
    timer.current = setTimeout(() => navigate('/recipes'), 800);
  }
  return <section className="pantry-panel" id="pantry" aria-labelledby="pantry-title" aria-busy={loading}>
    <div className="pantry-header"><div className="section-icon"><ShoppingBasketIcon/></div><div><h2 id="pantry-title">Что есть у вас дома?</h2><p>Добавьте продукты — остальное придумаем вместе.</p></div>{ingredients.length > 0 && <button className="text-button clear-button" onClick={() => { clearIngredients(); setMessage(''); }} disabled={loading}>Очистить</button>}</div>
    <div className="pantry-columns"><div className="pantry-input-area">
      <form onSubmit={submit} className="ingredient-input-form">
        <label className="sr-only" htmlFor="ingredient-input">Название продукта</label><Search size={19} aria-hidden="true"/>
        <input id="ingredient-input" ref={inputRef} value={input} onChange={event => { setInput(event.target.value); setMessage(''); }} placeholder="Например, курица или помидоры" maxLength={80} autoComplete="off" disabled={loading} aria-describedby="ingredient-feedback" aria-invalid={!!message}/>
        <button type="submit" className="add-button" disabled={!input.trim() || loading} aria-label="Добавить продукт"><Plus size={18}/><span>Добавить</span></button>
      </form>
      <p className={`input-feedback ${message ? 'has-error' : ''}`} id="ingredient-feedback" role="status">{message || 'Введите продукт и нажмите Enter или выберите ниже'}</p>
      {ingredients.length > 0 && <div className="selected-ingredients" aria-label="Ваши продукты">{ingredients.map((name, index) => <span className="ingredient-chip" key={name}><Check size={13}/>{rawIngredients[index] ?? name}<button type="button" onClick={() => removeIngredient(name)} disabled={loading} aria-label={`Удалить ${name}`}><X size={14}/></button></span>)}</div>}
      <div className="popular-label">Часто есть под рукой</div><div className="popular-ingredients">{popularIngredients.map(name => {
        const selected = ingredients.some(item => pantryProductKey(item) === pantryProductKey(name));
        return <button key={name} type="button" className={`popular-chip ${selected ? 'selected' : ''}`} onClick={() => add(name)} disabled={selected || loading}><span>{selected ? <Check size={13}/> : <Plus size={13}/>}</span>{name}</button>;
      })}</div>
    </div><div className="pantry-options"><label className="time-label" htmlFor="cooking-time"><Clock3 size={17}/> Сколько времени на готовку?</label>
      <div className="select-wrap"><select id="cooking-time" value={maxTime ?? ''} onChange={e => setMaxTime(e.target.value ? Number(e.target.value) : null)} disabled={loading}><option value="">Неважно</option>{[20,30,45,60].map(time => <option key={time} value={time}>До {time} минут</option>)}</select></div>
      <button className="button primary find-button" onClick={findRecipes} disabled={!ingredients.length || loading}>{loading ? <><LoaderCircle className="spin" size={19}/> Подбираем блюда…</> : <><Sparkles size={18}/> Что приготовить? <ArrowRight size={18}/></>}</button>
      <span className="cta-hint">{loading ? 'Ищем вкусные совпадения' : ingredients.length ? 'Несколько вкусных идей за один клик' : 'Добавьте хотя бы один продукт'}</span>
    </div></div>
    <PantryPolicyControl/>
    <div className="pantry-tip"><Leaf size={15}/><p>Добавляйте основные продукты. Наличие и количество специй проверьте перед готовкой.</p><span>Меньше покупок, больше вкуса</span></div>
  </section>;
}
function ShoppingBasketIcon() { return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m7 9 5-6 5 6M3 9h18l-2 11H5ZM9 12v5m6-5v5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
