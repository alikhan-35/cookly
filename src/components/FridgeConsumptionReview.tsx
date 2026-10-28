import { useState } from 'react';
import { Check, Refrigerator } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFridge } from '../hooks/useFridge';
import { buildConsumptionSuggestions, consumptionQuantity, type ConsumptionChange, type ConsumptionIngredient, type ConsumptionSuggestion } from '../utils/fridgeConsumption';

interface ReviewRow extends ConsumptionSuggestion { action: 'keep' | 'amount' | 'all'; amountText: string }
function makeRows(suggestions: ConsumptionSuggestion[]): ReviewRow[] {
  return suggestions.map(suggestion => ({ ...suggestion, action: suggestion.suggestedAmount === null ? 'keep' : 'amount', amountText: suggestion.suggestedAmount === null ? '' : String(suggestion.suggestedAmount) }));
}

/** Render only after the cook explicitly finishes; never mutate inventory on recipe view or start. */
export function FridgeConsumptionReview({ transactionId, ingredients, servings }: {
  transactionId: string; ingredients: ConsumptionIngredient[]; servings: number;
}) {
  const { items, consumeItems, hasConsumed } = useFridge();
  const [rows, setRows] = useState(() => makeRows(buildConsumptionSuggestions(items, ingredients, servings)));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const selected = rows.filter(row => row.action !== 'keep').length;
  function updateRow(itemId: string, patch: Partial<Pick<ReviewRow, 'action' | 'amountText'>>) {
    setError(null);
    setRows(previous => previous.map(row => row.item.id === itemId ? { ...row, ...patch } : row));
  }
  function save() {
    const changes: ConsumptionChange[] = rows.filter(row => row.action !== 'keep').map(row => ({
      itemId: row.item.id,
      expected: { name: row.item.name, amount: row.item.amount, unit: row.item.unit },
      ...(row.action === 'all' ? { useAll: true } : { amount: Number(row.amountText.trim().replace(',', '.')), unit: row.item.unit }),
    }));
    const problem = consumeItems(transactionId, changes);
    if (problem) setError(problem);
    else setSaved(true);
  }
  if (saved || hasConsumed(transactionId)) return <section className="consumption-review consumption-success" role="status" aria-label="Расход продуктов"><Check size={22}/><div><h2>Холодильник обновлён</h2><p>Расход этой готовки уже учтён. Повторно продукты не спишутся.</p><Link className="text-button" to="/fridge">Посмотреть остатки →</Link></div></section>;
  if (skipped) return <section className="consumption-review"><p>Запасы оставлены без изменений.</p><button className="text-button" onClick={() => setSkipped(false)}>Вернуться к списанию</button></section>;
  if (!rows.length) return <section className="consumption-review"><Refrigerator size={22}/><div><h2>Холодильник без изменений</h2><p>В нём нет продуктов с точно совпадающими названиями для этого блюда.</p><Link className="text-button" to="/fridge">Мой холодильник →</Link></div></section>;
  return <section className="consumption-review" aria-labelledby="consumption-title">
    <h2 id="consumption-title">Что использовали из холодильника?</h2>
    <p>Проверьте расход на {servings} порц. Остатки обновятся после подтверждения.</p>
    <ul className="consumption-list">{rows.map(row => <li className="consumption-row" key={row.item.id}>
      <div className="consumption-row-main"><strong>{row.item.name}</strong><span>В холодильнике: {row.item.amount === undefined ? 'есть, количество не указано' : consumptionQuantity(row.item.amount, row.item.unit)}</span><small>По рецепту: {row.recipeQuantity}</small></div>
      <div className="consumption-controls"><label>Действие<select aria-label={`Расход: ${row.item.name}`} value={row.action} onChange={event => updateRow(row.item.id, { action: event.target.value as ReviewRow['action'] })}><option value="keep">Оставить без изменений</option>{row.canEnterAmount && <option value="amount">Списать количество</option>}<option value="all">Продукт закончился</option></select></label>
        {row.action === 'amount' && <label className="consumption-amount">Использовали, {row.item.unit}<input type="text" aria-label={`Использовали: ${row.item.name}, ${row.item.unit}`} inputMode="decimal" value={row.amountText} onChange={event => updateRow(row.item.id, { amountText: event.target.value })}/></label>}
      </div>{row.note && <p className="consumption-note">{row.note}</p>}
    </li>)}</ul>
    {error && <div role="alert"><p>{error}</p><button className="text-button" onClick={() => { setRows(makeRows(buildConsumptionSuggestions(items, ingredients, servings))); setError(null); }}>Обновить список расхода</button></div>}
    <div className="empty-actions"><button className="button primary" disabled={selected === 0} onClick={save}>Обновить холодильник <Check size={17}/></button><button className="button secondary" onClick={() => setSkipped(true)}>Оставить как есть</button></div>
    <p className="consumption-note">Продукты с неизвестным остатком сохранятся, если не отметить «Продукт закончился».</p>
  </section>;
}
