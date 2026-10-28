import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CookingPot, LoaderCircle, Plus, Refrigerator, RotateCcw, Search, SearchX, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { RacionRecipeCard, racionErrorMessage } from '../components/RacionRecipeCard';
import { PantryPolicyControl } from '../components/PantryPolicyControl';
import { useFridge } from '../hooks/useFridge';
import { usePantry } from '../hooks/usePantry';
import { matchingProductKey } from '../utils/pantryProducts';
import { RacionProviderError, type RacionRecipePage, type RacionSlot } from '../services/recipeProviders/racion';
import { loadRacionSearch } from '../services/recipeProviders/racionCache';
import '../preview.css';
import '../racion-preview.css';

const meals: { value: RacionSlot | ''; label: string }[] = [
  { value: '', label: 'Любой приём пищи' }, { value: 'breakfast', label: 'Завтрак' },
  { value: 'lunch', label: 'Обед' }, { value: 'dinner', label: 'Ужин' }, { value: 'snack', label: 'Перекус' },
];
const examples = [
  { label: 'Курица и рис', query: 'курица рис', names: ['Куриное филе', 'Рис', 'Лук', 'Морковь', 'Чеснок', 'Растительное масло', 'Соль', 'Чёрный перец', 'Вода'] },
  { label: 'Картофель и овощи', query: 'картофель', names: ['Картофель', 'Лук', 'Морковь', 'Помидоры', 'Чеснок', 'Растительное масло', 'Соль', 'Вода'] },
  { label: 'Продукты для завтрака', query: 'яйца', names: ['Яйца', 'Молоко', 'Сливочное масло', 'Пшеничная мука', 'Сахар', 'Соль', 'Вода'] },
];
function readSlot(value: string | null): RacionSlot | '' { return meals.some(item => item.value === value) ? value as RacionSlot | '' : ''; }

export function RacionCatalogPage() {
  const { usableNames } = useFridge();
  const { catalogStock, setCatalogStock } = usePantry();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const slot = readSlot(params.get('slot'));
  const offsetValue = params.get('offset') ?? '0';
  const offset = /^\d{1,6}$/.test(offsetValue) ? Number(offsetValue) : 0;
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftSlot, setDraftSlot] = useState<RacionSlot | ''>(slot);
  const [page, setPage] = useState<RacionRecipePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [stock, setStock] = useState<string[]>(() => catalogStock ?? [...usableNames]);
  const [stockDraft, setStockDraft] = useState('');
  const [stockError, setStockError] = useState('');
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const waitSeconds = Math.max(0, Math.ceil((blockedUntil - now) / 1000));

  useEffect(() => { document.title = 'Каталог рецептов — Cookly'; }, []);
  useEffect(() => { setCatalogStock(stock); }, [stock, setCatalogStock]);
  useEffect(() => { setDraftQuery(query); setDraftSlot(slot); }, [query, slot]);
  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setPage(null); setError(null);
    loadRacionSearch({ query, slot: slot || undefined, offset, limit: 12, signal: controller.signal })
      .then(result => { if (active) setPage(result); })
      .catch(cause => {
        if (!active || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        setError(cause);
        if (cause instanceof RacionProviderError && cause.code === 'rate_limit') {
          setBlockedUntil(Date.now() + Math.max(1, cause.retryAfterSeconds ?? 60) * 1000);
        }
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [query, slot, offset, retry]);

  function search(nextQuery: string, nextSlot: RacionSlot | '' = '') {
    if (loading || waitSeconds > 0) return;
    const next = new URLSearchParams({ q: nextQuery.trim() });
    if (nextSlot) next.set('slot', nextSlot);
    setDraftQuery(nextQuery.trim()); setDraftSlot(nextSlot);
    if (query === nextQuery.trim() && slot === nextSlot && offset === 0) setRetry(value => value + 1);
    else setParams(next);
  }
  function submit(event: FormEvent) { event.preventDefault(); search(draftQuery, draftSlot); }
  function pageTo(nextOffset: number) {
    const next = new URLSearchParams(params);
    next.set('q', query);
    if (nextOffset) next.set('offset', String(nextOffset)); else next.delete('offset');
    setParams(next);
    resultsHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function addStock(event: FormEvent) {
    event.preventDefault();
    const name = stockDraft.trim();
    if (!name || !/[а-яёa-z]/i.test(name)) { setStockError('Введите название продукта.'); return; }
    if (stock.length >= 40) { setStockError('Можно добавить до 40 продуктов.'); return; }
    if (stock.some(item => matchingProductKey(item) === matchingProductKey(name))) { setStockError('Этот продукт уже выбран.'); return; }
    setStock(previous => [...previous, name]); setStockDraft(''); setStockError('');
  }
  function onLimit(cause: unknown) {
    if (cause instanceof RacionProviderError && cause.code === 'rate_limit') {
      setBlockedUntil(Date.now() + Math.max(1, cause.retryAfterSeconds ?? 60) * 1000);
    }
  }

  return <div className="container recipe-preview-page racion-page">
    <Link className="back-link" to="/"><ArrowLeft size={16}/> На главную</Link>
    <header className="racion-hero">
      <div><span className="preview-badge"><BookOpen size={13}/> Каталог рецептов</span>
        <h1>Рецепты на каждый день</h1>
        <p>Знакомые блюда и новые сочетания. Найдите свой следующий завтрак, обед или ужин.</p>
      </div>
    </header>

    <section className="racion-search" aria-labelledby="racion-search-heading">
      <h2 id="racion-search-heading">Что приготовим?</h2>
      <form onSubmit={submit}>
        <div className="racion-query"><Search size={19}/><label className="sr-only" htmlFor="racion-query">Название блюда или продукты</label><input id="racion-query" type="search" maxLength={120} value={draftQuery} onChange={event => setDraftQuery(event.target.value)} placeholder="Например, курица рис или гречка"/></div>
        <label className="sr-only" htmlFor="racion-meal">Приём пищи</label><select id="racion-meal" value={draftSlot} onChange={event => setDraftSlot(readSlot(event.target.value))}>{meals.map(meal => <option key={meal.value} value={meal.value}>{meal.label}</option>)}</select>
        <button type="submit" className="button primary" disabled={loading || waitSeconds > 0}>{loading ? <LoaderCircle className="spin" size={17}/> : <Search size={17}/>} Найти рецепты</button>
      </form>
      <div className="racion-quick" aria-label="Быстрые запросы">{[['Курица', 'курица'], ['Гречка', 'гречка'], ['Картофель', 'картофель'], ['Домашние супы', 'суп'], ['Весь каталог', '']].map(([label, value]) => <button key={label} disabled={loading || waitSeconds > 0} onClick={() => search(value)}>{label}</button>)}</div>
      <p>Ищите по названию блюда или продуктам. Наличие ингредиентов можно сверить с вашим набором.</p>
    </section>

    <details className="racion-stock" >
      <summary><Refrigerator size={19}/><span>Мои продукты для сверки</span><small>{stock.length ? `Выбрано: ${stock.length}` : 'Добавить или взять пример'}</small></summary>
      <div className="racion-stock-body"><div className="racion-stock-top"><p>Эти продукты сравниваются с составом после нажатия «Сверить состав».</p>{usableNames.length > 0 ? <button className="racion-text-button" onClick={() => { setStock(usableNames); setStockError(''); }}>Взять из моего холодильника</button> : <Link to="/fridge">Открыть холодильник <ArrowUpRight size={14}/></Link>}</div>
        <div className="racion-quick">{examples.map(example => <button key={example.label} onClick={() => { setStock(example.names); setStockError(''); }}>{example.label}</button>)}</div>
        {stock.length > 0 && <ul className="racion-stock-chips" aria-label="Продукты для сверки">{stock.map(name => <li key={name}><span>{name}</span><button aria-label={`Убрать ${name}`} onClick={() => setStock(previous => previous.filter(item => item !== name))}><X size={13}/></button></li>)}</ul>}
        <form className="racion-add-stock" onSubmit={addStock}><label className="sr-only" htmlFor="racion-stock-input">Добавить продукт для сверки</label><input id="racion-stock-input" maxLength={60} value={stockDraft} onChange={event => { setStockDraft(event.target.value); setStockError(''); }} placeholder="Например, яйца"/><button className="button secondary" type="submit"><Plus size={16}/> Добавить</button>{stock.length > 0 && <button type="button" className="racion-text-button" onClick={() => setStock([])}>Очистить набор</button>}</form>
        {stockError && <p className="racion-form-error" role="alert">{stockError}</p>}
        <PantryPolicyControl/>
        <p className="racion-stock-hint">В рецептах всегда показан полный состав источника. Сверяется наличие продуктов, без проверки их количества.</p>
      </div>
    </details>

    <div className="racion-source-note"><CookingPot size={19}/><p>Откройте рецепт, чтобы увидеть полный состав и пошаговое приготовление.</p></div>
    {waitSeconds > 0 && <p className="racion-limit" role="status">Источник ограничил запросы. Следующая попытка доступна через {waitSeconds} сек.</p>}
    <div className="preview-results-heading"><h2 ref={resultsHeading} tabIndex={-1}>{query ? `Рецепты по запросу «${query}»` : 'Каталог рецептов'}</h2><p role="status">{loading ? 'Ищем рецепты…' : page ? `Найдено: ${page.total.toLocaleString('ru')}` : 'Данные временно недоступны'}</p></div>
    {loading && <div className="racion-loading" role="status"><LoaderCircle className="spin" size={25}/><p>Получаем свежую подборку…</p></div>}
    {Boolean(error) && <div className="preview-state" role="alert"><SearchX size={30}/><h2>Не получилось загрузить подборку</h2><p>{racionErrorMessage(error)}</p><button className="button secondary" disabled={waitSeconds > 0} onClick={() => setRetry(value => value + 1)}><RotateCcw size={16}/> Повторить</button><a href="https://racion.app/recipes" target="_blank" rel="noreferrer">Открыть каталог источника <ArrowUpRight size={15}/></a></div>}
    {page && page.items.length === 0 && <div className="preview-state"><SearchX size={30}/><h2>Рецепты не найдены</h2><p>Попробуйте один основной продукт: например, «гречка» или «курица».</p><button className="button secondary" onClick={() => search('')}>Показать весь каталог</button></div>}
    {page && page.items.length > 0 && <><div className="racion-grid">{page.items.map((recipe, index) => <RacionRecipeCard key={recipe.id} recipe={recipe} stock={stock} waitSeconds={waitSeconds} onLimit={onLimit} eagerPhoto={index < 3}/>)}</div><nav className="racion-pagination" aria-label="Страницы рецептов"><button className="button secondary" disabled={page.offset === 0 || loading || waitSeconds > 0} onClick={() => pageTo(Math.max(0, page.offset - page.limit))}><ArrowLeft size={16}/> Назад</button><span>{page.offset + 1}–{page.offset + page.items.length} из {page.total.toLocaleString('ru')}</span><button className="button secondary" disabled={page.nextOffset === null || loading || waitSeconds > 0} onClick={() => page.nextOffset !== null && pageTo(page.nextOffset)}>Дальше <ArrowRight size={16}/></button></nav></>}
    <footer className="racion-attribution"><BookOpen size={18}/><p>Источник — <a href="https://racion.app" target="_blank" rel="noreferrer">«Рацион»</a>. Время и калорийность на порцию показаны по данным источника. <a href="https://racion.app/terms" target="_blank" rel="noreferrer">Условия использования</a>.</p></footer>
  </div>;
}
