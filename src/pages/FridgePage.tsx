import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, CookingPot, Leaf, Pencil, Plus, Refrigerator, Sparkles, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { useFridge } from '../hooks/useFridge';
import { usePantry } from '../hooks/usePantry';
import { useToast } from '../hooks/useToast';
import { fridgeCategories, type FridgeCategory, type FridgeItem } from '../types';
import { trackEvent } from '../services/analytics';
import { expiryDays, fridgeUnits, formatFridgeQuantity, previewFridgeUpdate, validateFridgeInput, type FridgeInput, type FridgeUpdateMode } from '../utils/fridge';
import { matchingProductKey } from '../utils/pantryProducts';
import '../fridge.css';
import { PantryPolicyControl } from '../components/PantryPolicyControl';
import { FridgeIntake } from '../components/FridgeIntake';

export function FridgePage() {
  const { items, usableNames, addItem, updateItem, removeItem, clearFridge, fillDemo } = useFridge();
  const { replaceIngredients } = usePantry();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<FridgeItem | null | undefined>(undefined);
  const [replenishing, setReplenishing] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const intakePanel = useRef<HTMLDivElement>(null);
  useEffect(() => { document.title = 'Мой холодильник — Cookly'; }, []);
  const expired = items.length - usableNames.length;
  const soon = items.filter(item => { const days = expiryDays(item.expiresOn); return days !== null && days >= 0 && days <= 3; }).length;
  function searchFridge() {
    if (!usableNames.length) return;
    replaceIngredients(usableNames, 'fridge');
    trackEvent('fridge_used_for_search', { search_source: 'fridge' });
    trackEvent('recommendations_requested', { search_source: 'fridge' });
    navigate('/recipes');
  }
  function openIntake() {
    setIntakeOpen(true);
    requestAnimationFrame(() => { intakePanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); intakePanel.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true }); });
  }
  function openForm(item: FridgeItem | null, refill = false) { setReplenishing(refill); setEditing(item); }
  function saveProduct(input: FridgeInput, mode: FridgeUpdateMode): string | null {
    const error = editing && !replenishing ? updateItem(editing.id, input) : addItem(input, mode);
    if (error) return error;
    toast('Холодильник обновлён'); setEditing(undefined); return null;
  }
  return <div className="container fridge-page">
    <div className="fridge-heading"><div><span className="eyebrow"><Refrigerator size={15}/> Ваши продукты</span><h1>Мой холодильник</h1><p>Достаточно помнить, что есть дома. Количество и сроки — по желанию.</p></div><button className="button secondary fridge-add" onClick={openIntake} aria-expanded={intakeOpen} aria-controls="fridge-intake-panel"><Plus size={18}/> Добавить продукты</button></div>
    {items.length > 0 && <section className="fridge-search-panel"><span className="fridge-search-icon"><CookingPot size={27}/></span><div><h2>Что приготовим сегодня?</h2><p>{usableNames.length ? `В подборе учтём ${usableNames.length} ${productWord(usableNames.length)}. Проверьте количество перед готовкой.` : 'Проверьте сроки или добавьте продукты, чтобы подобрать блюда.'}</p></div><button className="button primary" disabled={!usableNames.length} onClick={searchFridge}>Подобрать блюда <ArrowRight size={17}/></button></section>}
    <div ref={intakePanel} id="fridge-intake-panel" className="fridge-intake-panel" hidden={!intakeOpen}><div className="fridge-intake-toggle"><button className="text-button" onClick={() => setIntakeOpen(false)} aria-expanded={intakeOpen} aria-controls="fridge-intake-content"><X size={16}/> Свернуть добавление</button><button className="text-button" onClick={() => openForm(null)}><Pencil size={15}/> Добавить один продукт вручную</button></div><div id="fridge-intake-content"><FridgeIntake/></div></div>
    {items.length === 0 ? <section className="fridge-empty" aria-labelledby="fridge-empty-title"><span className="fridge-empty-icon"><Refrigerator size={38} strokeWidth={1.5}/></span><h2 id="fridge-empty-title">Что есть у вас дома?</h2><p>Добавьте продукты списком, голосом или по чеку. В следующий раз они уже будут здесь.</p>{!intakeOpen && <button className="button primary" onClick={openIntake}><Plus size={18}/> Добавить продукты</button>}<button className="fridge-demo-button" onClick={() => { if (fillDemo()) toast('Пример продуктов добавлен'); }}><Sparkles size={16}/> Попробовать с примером</button></section> : <><div className="fridge-summary"><span><Refrigerator size={18}/><strong>{items.length}</strong> {productWord(items.length)} дома</span>{soon > 0 && <span className="fridge-summary-soon"><CalendarDays size={16}/>{soon} использовать скорее</span>}<button className="text-button fridge-clear" onClick={() => setConfirmClear(true)}><Trash2 size={15}/> Очистить</button></div>{expired > 0 && <p className="fridge-expiry-note"><CalendarDays size={17}/> Продукты с истёкшим указанным сроком исключены из подбора. Проверьте их.</p>}<div className="fridge-grid">{items.map(item => <FridgeCard key={item.id} item={item} onRefill={() => openForm(item, true)} onEdit={() => openForm(item)} onRemove={() => { removeItem(item.id); toast(`${item.name}: закончился`); }}/>)}</div></>}
    <PantryPolicyControl/><p className="fridge-storage-note"><Leaf size={14}/> Продукты сохраняются в этом браузере. После готовки можно подтвердить расход и обновить остатки.</p>
    {editing !== undefined && <Modal title={editing ? replenishing ? `Пополнить: ${editing.name}` : 'Изменить остаток' : 'Добавить продукт'} onClose={() => setEditing(undefined)}><FridgeForm key={`${editing?.id ?? 'new'}-${replenishing}`} item={editing} items={items} replenishing={replenishing} onSave={saveProduct} onCancel={() => setEditing(undefined)}/></Modal>}
    {confirmClear && <Modal title="Очистить холодильник?" onClose={() => setConfirmClear(false)}><div className="fridge-confirm"><p>Все продукты будут удалены. Добавить их снова можно в любой момент.</p><div className="fridge-form-actions"><button className="button secondary" data-autofocus onClick={() => setConfirmClear(false)}>Отмена</button><button className="button primary" onClick={() => { clearFridge(); setConfirmClear(false); toast('Холодильник очищен'); }}>Очистить холодильник</button></div></div></Modal>}
  </div>;
}
function FridgeCard({ item, onRefill, onEdit, onRemove }: { item: FridgeItem; onRefill: () => void; onEdit: () => void; onRemove: () => void }) {
  const days = expiryDays(item.expiresOn);
  const expired = days !== null && days < 0;
  const soon = days !== null && days >= 0 && days <= 3;
  return <article className={`fridge-card ${expired ? 'fridge-card-expired' : ''}`}><div className="fridge-card-top"><span className="fridge-category">{item.category}</span></div><h2>{item.name}</h2><p className="fridge-amount">{formatFridgeQuantity(item)}</p>{days !== null && <div className="fridge-expiry"><span className={`fridge-expiry-badge ${expired ? 'fridge-expired' : soon ? 'fridge-soon' : 'fridge-fresh'}`}><CalendarDays size={13}/>{expired ? 'Срок истёк' : days === 0 ? 'Использовать сегодня' : soon ? 'Использовать скорее' : `До ${formatExpiry(item.expiresOn!)}`}</span></div>}<div className="fridge-card-actions"><button onClick={onRefill} aria-label={`Пополнить ${item.name}`}><Plus size={15}/> Пополнить</button><button onClick={onEdit} aria-label={`Изменить остаток ${item.name}`}><Pencil size={15}/> Остаток</button><button onClick={onRemove} aria-label={`${item.name}: закончился`}><Trash2 size={15}/> Закончился</button></div></article>;
}
function FridgeForm({ item, items, replenishing, onSave, onCancel }: { item: FridgeItem | null; items: FridgeItem[]; replenishing: boolean; onSave: (input: FridgeInput, mode: FridgeUpdateMode) => string | null; onCancel: () => void }) {
  const editing = Boolean(item && !replenishing);
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(editing ? item?.amount?.toString() ?? '' : '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [category, setCategory] = useState<FridgeCategory>(item?.category ?? 'Другое');
  const [expiresOn, setExpiresOn] = useState(editing ? item?.expiresOn ?? '' : '');
  const [mode, setMode] = useState<FridgeUpdateMode>(editing ? 'set' : 'add');
  const [error, setError] = useState('');
  const input: FridgeInput = { name, unit, category, ...(amount.trim() ? { amount: Number(amount.replace(',', '.')) } : {}), ...(expiresOn ? { expiresOn } : {}) };
  const existing = items.find(entry => matchingProductKey(entry.name) === matchingProductKey(name));
  const preview = !editing && existing && !validateFridgeInput(input, []) ? previewFridgeUpdate(input, existing, mode) : null;
  function submit(event: FormEvent) { event.preventDefault(); setError(onSave(input, mode) ?? ''); }
  return <form className="fridge-form" onSubmit={submit}><p className="fridge-form-intro">{editing ? 'Укажите весь текущий остаток. Пустое количество означает «Есть дома».' : 'Достаточно названия. Для покупки можно указать количество, которое прибавится к запасу.'}</p><label className="fridge-field" htmlFor="fridge-name"><span>Название продукта</span><input id="fridge-name" data-autofocus value={name} onChange={event => { setName(event.target.value); setError(''); }} maxLength={60} required autoComplete="off" placeholder="Например, куриное филе" aria-describedby={error ? 'fridge-form-error' : undefined}/></label>
    <details className="fridge-form-details" open={item ? true : undefined}><summary>Количество, категория и срок — необязательно</summary><div className="fridge-form-row"><label className="fridge-field" htmlFor="fridge-amount"><span>{editing ? 'Текущий остаток' : 'Количество'}</span><input id="fridge-amount" type="number" inputMode="decimal" min="0.001" max="1000000" step="any" value={amount} onChange={event => { setAmount(event.target.value); setError(''); }} placeholder="Не указано"/></label><label className="fridge-field" htmlFor="fridge-unit"><span>Единица</span><select id="fridge-unit" value={unit} onChange={event => setUnit(event.target.value)}>{fridgeUnits.map(value => <option key={value} value={value}>{value || 'Не указана'}</option>)}</select></label></div><label className="fridge-field" htmlFor="fridge-category"><span>Категория</span><select id="fridge-category" value={category} onChange={event => setCategory(event.target.value as FridgeCategory)}>{fridgeCategories.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="fridge-field" htmlFor="fridge-expiry"><span>Срок годности</span><input id="fridge-expiry" type="date" min="1900-01-01" max="9999-12-31" value={expiresOn} onChange={event => { setExpiresOn(event.target.value); setError(''); }}/></label><p className="fridge-date-hint">Дата необязательна. Новая покупка не продлевает срок прежнего остатка.</p></details>
    {!editing && existing && <><label className="fridge-field" htmlFor="fridge-update-mode"><span>Как обновить запас</span><select id="fridge-update-mode" value={mode} onChange={event => setMode(event.target.value as FridgeUpdateMode)}><option value="add">Куплено ещё — прибавить</option><option value="set">Указать весь текущий остаток</option></select></label>{preview && <p className="fridge-stock-preview" role="status">{preview.note}</p>}</>}
    {error && <p className="fridge-form-error" id="fridge-form-error" role="alert">{error}</p>}<div className="fridge-form-actions"><button type="button" className="button secondary" onClick={onCancel}>Отмена</button><button type="submit" className="button primary">{editing ? 'Сохранить остаток' : existing ? mode === 'add' ? 'Пополнить запас' : 'Обновить остаток' : 'Добавить продукт'}</button></div></form>;
}
function productWord(count: number): string { return count % 100 >= 11 && count % 100 <= 14 ? 'продуктов' : count % 10 === 1 ? 'продукт' : count % 10 >= 2 && count % 10 <= 4 ? 'продукта' : 'продуктов'; }
function formatExpiry(value: string): string { const [year, month, day] = value.split('-'); return `${day}.${month}.${year}`; }
