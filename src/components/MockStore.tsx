import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Minus, Plus, ShoppingBasket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Ingredient, Recipe } from '../types';
import { findMockProduct, money, requiredPacks } from '../data/mockProducts';
import { trackEvent } from '../services/analytics';
import { Modal } from './Modal';

export function MarketButton({ recipe, missing, compact = false }: { recipe: Recipe; missing: Ingredient[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!missing.length) return null;
  return <><button type="button" className={`button market-button ${compact ? 'market-button-compact' : ''}`} onClick={() => { setOpen(true); trackEvent('mock_store_opened', { recipe_id: recipe.id, recipe_category: recipe.category, missing_ingredients_count: missing.length }); }}><ShoppingBasket size={17}/> Заказать недостающие продукты</button>{open && <MockStore recipe={recipe} missing={missing} onClose={() => setOpen(false)}/>}</>;
}

function MockStore({ recipe, missing, onClose }: { recipe: Recipe; missing: Ingredient[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<'products' | 'cart' | 'checkout' | 'success'>('products');
  const completed = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [rows, setRows] = useState(() => missing.map(ingredient => {
    const product = findMockProduct(ingredient);
    return { ingredient, product, quantity: requiredPacks(ingredient, product), selected: true };
  }));
  const selected = rows.filter(row => row.selected);
  const total = selected.reduce((sum, row) => sum + row.product.price * row.quantity, 0);
  const quantity = selected.reduce((sum, row) => sum + row.quantity, 0);
  useEffect(() => { if (stage !== 'products') heading.current?.focus(); }, [stage]);
  const titles = { products: 'Продукты для вашего блюда', cart: 'Ваша демо-корзина', checkout: 'Проверим демо-заказ', success: 'Демо-заказ оформлен' };
  function addToCart() {
    setStage('cart');
  }
  function completeCheckout() {
    if (completed.current) return;
    completed.current = true;
    setStage('success');
    trackEvent('mock_checkout_completed', { recipe_id: recipe.id, recipe_category: recipe.category, missing_ingredients_count: missing.length });
  }
  return <Modal title="Cookly Market" onClose={onClose} wide>
    <div className="market-demo"><span>ДЕМО-МАГАЗИН</span><p>Тестовые товары и цены. Покупки, оплаты и доставки не будет.</p></div>
    <h3 ref={heading} tabIndex={-1} className="market-stage-title">{titles[stage]}</h3>
    {stage === 'success' ? <div className="market-success"><span className="success-circle"><Check size={30}/></span><p>Вы проверили, как будет работать заказ недостающих продуктов для блюда «{recipe.name}».</p><p className="muted">В будущем здесь может появиться интеграция с магазинами. Сейчас данные остаются в вашем браузере, заказ никуда не отправлен.</p><button className="button primary" onClick={() => { onClose(); navigate(`/recipe/${recipe.id}`); }}>Вернуться к рецепту <ArrowRight size={17}/></button></div> : <>
      <p className="market-recipe-name">Для блюда «{recipe.name}»</p>
      <div className="market-items">{(stage === 'products' ? rows : selected).map(row => {
        const index = rows.indexOf(row);
        return <div key={`${row.product.id}-${index}`} className={`market-item ${!row.selected ? 'market-item-unselected' : ''}`}>
          {stage === 'products' && <input type="checkbox" checked={row.selected} aria-label={`Выбрать ${row.product.name}`} onChange={event => setRows(previous => previous.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))}/>}
          <div className="market-product"><strong>{row.product.name}</strong><span>Упаковка: {row.product.amount} {row.product.unit} · {money(row.product.price)}</span><small>По рецепту: {row.ingredient.amount} {row.ingredient.unit}</small></div>
          {stage !== 'checkout' ? <div className="quantity-control"><button disabled={row.quantity <= 1} aria-label={`Уменьшить ${row.product.name}`} onClick={() => setRows(previous => previous.map((item, i) => i === index ? { ...item, quantity: item.quantity - 1 } : item))}><Minus size={15}/></button><span aria-label={`Упаковок ${row.product.name}`}>{row.quantity}</span><button disabled={row.quantity >= 99} aria-label={`Увеличить ${row.product.name}`} onClick={() => setRows(previous => previous.map((item, i) => i === index ? { ...item, quantity: item.quantity + 1 } : item))}><Plus size={15}/></button></div> : <span>{row.quantity} уп.</span>}
          <strong className="market-line-price">{money(row.product.price * row.quantity)}</strong>
        </div>;
      })}</div>
      {!selected.length && <p role="status" className="inline-hint">Выберите хотя бы один продукт.</p>}
      <dl className="market-totals"><div><dt>Товары · {quantity} уп.</dt><dd>{money(total)}</dd></div><div><dt>Демо-доставка</dt><dd>{money(0)}</dd></div><div className="market-total"><dt>Итого</dt><dd>{money(total)}</dd></div></dl>
      {stage === 'products' && <p className="muted market-pack-note">Количество упаковок рассчитано приблизительно. Можно изменить его перед добавлением в корзину.</p>}
      <div className="dialog-actions market-actions">
        {stage !== 'products' && <button className="button secondary" onClick={() => setStage(stage === 'cart' ? 'products' : 'cart')}><ArrowLeft size={16}/> Назад</button>}
        {stage === 'products' && <button className="button primary" disabled={!selected.length} onClick={addToCart}>Добавить в корзину <ShoppingBasket size={17}/></button>}
        {stage === 'cart' && <button className="button primary" onClick={() => setStage('checkout')}>Перейти к оформлению <ArrowRight size={17}/></button>}
        {stage === 'checkout' && <button className="button primary" onClick={completeCheckout}>Оформить демо-заказ <Check size={17}/></button>}
      </div>
    </>}
  </Modal>;
}
