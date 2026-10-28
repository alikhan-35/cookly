import { useId } from 'react';
import { usePantry } from '../hooks/usePantry';

/** One shared preference applies to the fridge, catalogue and both recipe sources. */
export function PantryPolicyControl() {
  const { assumePantryStaples, setAssumePantryStaples } = usePantry();
  const descriptionId = useId();
  return <div className="pantry-policy">
    <label><input type="checkbox" checked={assumePantryStaples} onChange={event => setAssumePantryStaples(event.target.checked)} aria-describedby={descriptionId}/><span>Соль, масло и обычные специи есть дома</span></label>
    <details><summary>Что учитывается в подборе</summary><p id={descriptionId}>{assumePantryStaples ? 'Базовые продукты не влияют на совпадение, но остаются в полном составе рецепта.' : 'Учитываем весь состав. Добавьте базовые продукты в холодильник, если они есть дома.'}</p><p>Базовые продукты: соль, вода, обычные растительные масла; чёрный, белый и душистый перец, паприка, сухой чили, лавровый лист, зира, тмин, кориандр, куркума, корица, гвоздика, мускатный орех, сушёные чеснок, лук, имбирь, укроп, петрушка, базилик, орегано, тимьян, розмарин, майоран и обычные смеси сухих трав. Свежие овощи и зелень, сахар, сливочное масло, соусы и специальные смеси нужно добавлять отдельно.</p><p>Перед готовкой проверьте специи и количество продуктов.</p></details>
  </div>;
}
