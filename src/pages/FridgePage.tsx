import { useEffect, useState, type FormEvent } from 'react';
import { Apple, ArrowRight, Beef, CalendarDays, Carrot, Check, CookingPot, Egg, Fish, Leaf, Milk, Package, Pencil, Plus, Refrigerator, Sparkles, Trash2, Wheat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { useFridge } from '../hooks/useFridge';
import { usePantry } from '../hooks/usePantry';
import { useToast } from '../hooks/useToast';
import { fridgeCategories, type FridgeCategory, type FridgeItem } from '../types';
import { trackEvent } from '../utils/analytics';
import { expiryDays, fridgeUnits, type FridgeInput } from '../utils/fridge';
import '../fridge.css';

const categoryIcons = { Овощи: Carrot, Фрукты: Apple, Мясо: Beef, Рыба: Fish, Молочные: Milk, Яйца: Egg, Крупы: Wheat, Макароны: CookingPot, Соусы: Package, Другое: Package };

export function FridgePage() {
  const { items, usableNames, addItem, updateItem, removeItem, clearFridge, fillDemo } = useFridge();
  const { replaceIngredients } = usePantry();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<FridgeItem | null | undefined>(undefined);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { document.title = 'Мой холодильник — Cookly'; trackEvent('fridge_opened'); }, []);
  const expired = items.length - usableNames.length;
  const soon = items.filter(item => { const days = expiryDays(item.expiresOn); return days !== null && days >= 0 && days <= 3; }).length;

  function searchFridge() {
    if (!usableNames.length) return;
    replaceIngredients(usableNames, 'fridge');
    trackEvent('fridge_used_for_search', { count: usableNames.length, excludedExpired: expired });
    trackEvent('recommendations_requested', { ingredients: usableNames, source: 'fridge' });
    toast('Продукты из холодильника добавлены в подбор');
    navigate('/recipes');
  }
  function saveProduct(input: FridgeInput): string | null {
    const error = editing ? updateItem(editing.id, input) : addItem(input);
    if (error) return error;
    toast(editing ? 'Продукт обновлён' : 'Продукт добавлен в холодильник');
    setEditing(undefined);
    return null;
  }

  return <div className="container fridge-page">
    <div className="fridge-heading"><div><span className="eyebrow"><Leaf size={15}/> Всё хорошее уже дома</span><h1>Мой холодильник<span>.</span></h1><p>Добавляйте продукты, которые есть дома, и Cookly будет учитывать их при подборе блюд.</p></div>{items.length > 0 && <button className="button primary fridge-add" onClick={() => setEditing(null)}><Plus size={18}/> Добавить продукт</button>}</div>

    {items.length === 0 ? <section className="fridge-empty" aria-labelledby="fridge-empty-title"><span className="fridge-empty-icon"><Refrigerator size={50} strokeWidth={1.4}/><span><Leaf size={20}/></span></span><span className="fridge-kicker">МЕСТО ДЛЯ ВКУСНЫХ ИДЕЙ</span><h2 id="fridge-empty-title">В холодильнике пока пусто</h2><p>Добавьте продукты, чтобы Cookly мог предлагать блюда из того, что уже есть дома.</p><button className="button primary" onClick={() => setEditing(null)}><Plus size={18}/> Добавить первый продукт</button><button className="fridge-demo-button" onClick={() => { if (fillDemo()) toast('Пример продуктов добавлен'); }}><Sparkles size={16}/> Заполнить примером</button><span className="fridge-demo-hint">7 привычных продуктов, чтобы попробовать Cookly</span></section> : <>
      <div className="fridge-summary"><span><Refrigerator size={19}/><strong>{items.length}</strong> {productWord(items.length)} дома</span><span className="fridge-summary-fresh"><Check size={16}/>{usableNames.length} для подбора</span>{soon > 0 && <span className="fridge-summary-soon"><CalendarDays size={16}/>{soon} использовать скорее</span>}<button className="text-button fridge-clear" onClick={() => setConfirmClear(true)}><Trash2 size={15}/> Очистить холодильник</button></div>
      {expired > 0 && <p className="fridge-expiry-note"><CalendarDays size={17}/> Продукты с истёкшим сроком не участвуют в подборе. Проверьте их и обновите холодильник.</p>}
      <div className="fridge-grid">{items.map(item => <FridgeCard key={item.id} item={item} onEdit={() => setEditing(item)} onRemove={() => { removeItem(item.id); toast(`${item.name}: продукт удалён`); }}/>)}</div>
      <section className="fridge-search-panel"><span className="fridge-search-icon"><CookingPot size={29}/></span><div><h2>Превратим запасы в ужин?</h2><p>{usableNames.length ? 'Подберём рецепты из ваших продуктов. Количество можно сверить в рецепте.' : 'Добавьте продукты с актуальным сроком годности, чтобы получить рекомендации.'}</p></div><button className="button primary" disabled={!usableNames.length} onClick={searchFridge}>Подобрать блюда из моего холодильника <ArrowRight size={17}/></button></section>
      <p className="fridge-storage-note"><Leaf size={14}/> Ваш холодильник сохраняется в этом браузере — продукты останутся после обновления страницы.</p>
    </>}

    {editing !== undefined && <Modal title={editing ? 'Изменить продукт' : 'Добавить продукт'} onClose={() => setEditing(undefined)}><FridgeForm key={editing?.id ?? 'new'} item={editing} onSave={saveProduct} onCancel={() => setEditing(undefined)}/></Modal>}
    {confirmClear && <Modal title="Очистить холодильник?" onClose={() => setConfirmClear(false)}><div className="fridge-confirm"><span className="fridge-confirm-icon"><Trash2 size={26}/></span><p>Все продукты будут удалены из холодильника. После этого можно добавить их заново или заполнить холодильник примером.</p><div className="fridge-form-actions"><button className="button secondary" data-autofocus onClick={() => setConfirmClear(false)}>Отмена</button><button className="button primary" onClick={() => { clearFridge(); setConfirmClear(false); toast('Холодильник очищен'); }}>Очистить холодильник</button></div></div></Modal>}
  </div>;
}

function FridgeCard({ item, onEdit, onRemove }: { item: FridgeItem; onEdit: () => void; onRemove: () => void }) {
  const Icon = categoryIcons[item.category];
  const days = expiryDays(item.expiresOn);
  const expired = days !== null && days < 0;
  const soon = days !== null && days >= 0 && days <= 3;
  return <article className={`fridge-card ${expired ? 'fridge-card-expired' : ''}`}><div className="fridge-card-top"><span className={`fridge-product-icon ${expired ? 'fridge-product-expired' : ''}`}><Icon size={25} strokeWidth={1.6}/></span><span className="fridge-category">{item.category}</span></div><h2>{item.name}</h2><p className="fridge-amount">{item.amount !== undefined ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(item.amount)} ${item.unit}` : 'Количество не указано'}</p><div className="fridge-expiry">{days !== null ? <><span className={`fridge-expiry-badge ${expired ? 'fridge-expired' : soon ? 'fridge-soon' : 'fridge-fresh'}`}><CalendarDays size={13}/>{expired ? 'Срок истёк' : soon ? 'Использовать скорее' : 'Срок указан'}</span><span className="fridge-expiry-caption">{expired ? `До ${formatExpiry(item.expiresOn!)}` : days === 0 ? 'Срок годности — сегодня' : days <= 3 ? `Осталось ${days} ${days === 1 ? 'день' : 'дня'}` : `До ${formatExpiry(item.expiresOn!)}`}</span></> : <span className="fridge-expiry-caption">Срок годности не указан</span>}</div><div className="fridge-card-actions"><button onClick={onEdit} aria-label={`Изменить ${item.name}`}><Pencil size={15}/> Изменить</button><button onClick={onRemove} aria-label={`Удалить ${item.name}`}><Trash2 size={15}/> Удалить</button></div></article>;
}

function FridgeForm({ item, onSave, onCancel }: { item: FridgeItem | null; onSave: (input: FridgeInput) => string | null; onCancel: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(item?.amount?.toString() ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [category, setCategory] = useState<FridgeCategory>(item?.category ?? 'Другое');
  const [expiresOn, setExpiresOn] = useState(item?.expiresOn ?? '');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = onSave({ name, unit, category, ...(amount.trim() ? { amount: Number(amount.replace(',', '.')) } : {}), ...(expiresOn ? { expiresOn } : {}) });
    setError(result ?? '');
  }
  return <form className="fridge-form" onSubmit={submit}><p className="fridge-form-intro">Для начала достаточно названия. Остальное можно добавить позже.</p><label className="fridge-field" htmlFor="fridge-name"><span>Название продукта <span className="fridge-required">*</span></span><input id="fridge-name" data-autofocus value={name} onChange={event => { setName(event.target.value); setError(''); }} maxLength={60} required autoComplete="off" placeholder="Например, куриное филе" aria-describedby={error ? 'fridge-form-error' : undefined}/></label><div className="fridge-form-row"><label className="fridge-field" htmlFor="fridge-amount"><span>Количество <small>необязательно</small></span><input id="fridge-amount" type="number" inputMode="decimal" min="0.001" max="1000000" step="any" value={amount} onChange={event => { setAmount(event.target.value); setError(''); }} placeholder="500"/></label><label className="fridge-field" htmlFor="fridge-unit"><span>Единица</span><select id="fridge-unit" value={unit} onChange={event => setUnit(event.target.value)}>{fridgeUnits.map(value => <option key={value} value={value}>{value || 'Не указана'}</option>)}</select></label></div><label className="fridge-field" htmlFor="fridge-category"><span>Категория</span><select id="fridge-category" value={category} onChange={event => setCategory(event.target.value as FridgeCategory)}>{fridgeCategories.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="fridge-field" htmlFor="fridge-expiry"><span>Срок годности <small>необязательно</small></span><input id="fridge-expiry" type="date" min="1900-01-01" max="9999-12-31" value={expiresOn} onChange={event => { setExpiresOn(event.target.value); setError(''); }}/></label><p className="fridge-date-hint">Напомним в холодильнике за 3 дня до указанной даты.</p>{error && <p className="fridge-form-error" id="fridge-form-error" role="alert">{error}</p>}<div className="fridge-form-actions"><button type="button" className="button secondary" onClick={onCancel}>Отмена</button><button type="submit" className="button primary"><Check size={17}/>{item ? 'Сохранить изменения' : 'Добавить продукт'}</button></div></form>;
}

function productWord(count: number): string { return count % 100 >= 11 && count % 100 <= 14 ? 'продуктов' : count % 10 === 1 ? 'продукт' : count % 10 >= 2 && count % 10 <= 4 ? 'продукта' : 'продуктов'; }
function formatExpiry(value: string): string { const [year, month, day] = value.split('-'); return `${day}.${month}.${year}`; }
