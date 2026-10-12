import { Minus, Plus, Users } from 'lucide-react';
import { servingsLabel } from '../utils/servings';

export function ServingSelector({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="serving-selector" aria-label="Количество порций"><div><span className="serving-icon"><Users size={17}/></span><div><strong>На сколько порций готовим?</strong><small>Количество продуктов пересчитаем автоматически</small></div></div><div className="serving-control"><button type="button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Уменьшить порции"><Minus size={16}/></button><span><b>{value}</b><small>{servingsLabel(value).replace(`${value} `, '')}</small></span><button type="button" onClick={() => onChange(Math.min(6, value + 1))} disabled={value >= 6} aria-label="Увеличить порции"><Plus size={16}/></button></div></div>;
}
