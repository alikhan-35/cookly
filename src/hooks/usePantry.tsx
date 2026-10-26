import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { pantryProductKey, pantryProductName, uniquePantryProducts } from '../utils/pantryProducts';
import { readJson, writeJson } from '../utils/storage';

interface PantryState {
  ingredients: string[];
  /** Original product labels for providers that distinguish cuts and varieties. */
  rawIngredients: string[];
  source: 'manual' | 'fridge';
  maxTime: number | null;
  assumePantryStaples: boolean;
  setAssumePantryStaples: (value: boolean) => void;
  catalogStock: string[] | null;
  setCatalogStock: (names: string[]) => void;
  addIngredient: (name: string) => string | null;
  removeIngredient: (name: string) => void;
  clearIngredients: () => void;
  replaceIngredients: (names: string[], source?: 'manual' | 'fridge') => void;
  setMaxTime: (value: number | null) => void;
}
const PantryContext = createContext<PantryState | null>(null);

/** Search is deliberately memory-only. The fridge owns persistent inventory. */
export function PantryProvider({ children }: { children: ReactNode }) {
  const [ingredients, setIngredients] = useState<string[]>([]);
  const rawIngredients = ingredients;
  const [source, setSource] = useState<'manual' | 'fridge'>('manual');
  const [maxTime, setMaxTime] = useState<number | null>(null);
  const [catalogStock, setCatalogStock] = useState<string[] | null>(null);
  const [assumePantryStaples, setAssumePantryStaples] = useState(() => {
    const saved = readJson<unknown>('cookly:matching:pantry-staples', true);
    return typeof saved === 'boolean' ? saved : true;
  });
  useEffect(() => { writeJson('cookly:matching:pantry-staples', assumePantryStaples); }, [assumePantryStaples]);
  function addIngredient(value: string) {
    const name = pantryProductName(value);
    if (!name || !/[а-яa-z]/i.test(name)) return 'Введите название продукта, например «Курица».';
    if (name.length > 40) return 'Название продукта должно быть короче 40 символов.';
    if (ingredients.some(item => pantryProductKey(item) === pantryProductKey(name))) return 'Этот продукт уже в вашем списке.';
    if (ingredients.length >= 40) return 'Можно добавить до 40 продуктов. Удалите ненужные.';
    setIngredients(previous => [...previous, name]);
    setSource('manual');
    return null;
  }
  return <PantryContext.Provider value={{ ingredients, rawIngredients, source, maxTime, assumePantryStaples, setAssumePantryStaples, catalogStock, setCatalogStock, addIngredient,
    removeIngredient: name => { setIngredients(previous => previous.filter(item => item !== name)); setSource('manual'); },
    clearIngredients: () => { setIngredients([]); setSource('manual'); },
    replaceIngredients: (names, nextSource = 'manual') => {
      setIngredients(uniquePantryProducts(names));
      setSource(nextSource);
    },
    setMaxTime: value => setMaxTime(value !== null && [20,30,45,60].includes(value) ? value : null),
  }}>{children}</PantryContext.Provider>;
}
export function usePantry() {
  const context = useContext(PantryContext);
  if (!context) throw new Error('PantryProvider is required');
  return context;
}
