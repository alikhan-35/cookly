import { useState } from 'react';
import type { Recipe } from '../types';
import { getNutrition } from '../utils/nutrition';

export function NutritionCard({ recipe, servings, hasSubstitutions = false }: { recipe: Recipe; servings: number; hasSubstitutions?: boolean }) {
  const [mode, setMode] = useState<'serving' | 'total'>('serving');
  const nutrition = getNutrition(recipe, servings, mode);
  return <section className="nutrition-card" aria-label="Пищевая ценность"><div className="nutrition-heading"><h2>Пищевая ценность</h2><div className="nutrition-toggle" role="group" aria-label="Расчёт пищевой ценности"><button aria-pressed={mode === 'serving'} onClick={() => setMode('serving')}>На порцию</button><button aria-pressed={mode === 'total'} onClick={() => setMode('total')}>На всё блюдо</button></div></div><dl className="nutrition-values"><div><dt>Калории</dt><dd>{nutrition.calories}<span>ккал</span></dd></div><div><dt>Белки</dt><dd>{nutrition.protein}<span>г</span></dd></div><div><dt>Жиры</dt><dd>{nutrition.fat}<span>г</span></dd></div><div><dt>Углеводы</dt><dd>{nutrition.carbs}<span>г</span></dd></div></dl><p className="nutrition-note">Приблизительные значения для базового состава{mode === 'total' ? ` на ${servings} порц.` : ' одной порции'}.{hasSubstitutions ? ' С выбранными заменами КБЖУ может отличаться.' : ''}</p></section>;
}
