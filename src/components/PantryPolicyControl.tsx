import { useId } from 'react';
import { usePantry } from '../hooks/usePantry';

/** One shared preference applies to the fridge, catalogue and both recipe sources. */
export function PantryPolicyControl() {
  const { assumePantryStaples, setAssumePantryStaples } = usePantry();
  const descriptionId = useId();
  return <div className="pantry-policy">
    <label><input type="checkbox" checked={assumePantryStaples} onChange={event => setAssumePantryStaples(event.target.checked)} aria-describedby={descriptionId}/><span>Базовые продукты и специи есть дома</span></label>
    <p id={descriptionId}>{assumePantryStaples ? 'Соль, вода, растительные масла и обычные сухие специи не влияют на подбор. Они остаются в составе рецепта.' : 'Учитываем каждый продукт, включая соль, масло и специи. Добавьте их в свой список, если они есть дома.'}</p>
    <details><summary>Какие продукты считаются базовыми?</summary><p>Соль, вода, обычные растительные масла; чёрный, белый и душистый перец, паприка, сухой чили, лавровый лист, зира, тмин, кориандр, куркума, корица, гвоздика, мускатный орех, сушёные чеснок, лук, имбирь, укроп, петрушка, базилик, орегано, тимьян, розмарин, майоран и обычные смеси сухих трав. Свежие овощи и зелень, сахар, сливочное масло, соусы и специальные смеси нужно добавлять отдельно.</p><p>Это допущение для подбора, а не запись в холодильнике. Перед готовкой проверьте специи и количество продуктов.</p></details>
  </div>;
}
