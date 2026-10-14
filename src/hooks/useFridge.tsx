import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FridgeItem } from '../types';
import { trackEvent } from '../services/analytics';
import { cleanFridgeName, FRIDGE_STORAGE_KEY, localDateString, parseFridgeItems, usableFridgeNames, validateFridgeInput, type FridgeInput } from '../utils/fridge';

interface FridgeState {
  items: FridgeItem[];
  usableNames: string[];
  addItem: (input: FridgeInput) => string | null;
  updateItem: (id: string, input: FridgeInput) => string | null;
  removeItem: (id: string) => void;
  clearFridge: () => void;
  fillDemo: () => boolean;
}

function readFridge(): FridgeItem[] {
  try { return parseFridgeItems(JSON.parse(localStorage.getItem(FRIDGE_STORAGE_KEY) ?? '[]')); }
  catch { return []; }
}

function makeId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `fridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const demoItems: FridgeInput[] = [
  { name: 'Куриное филе', amount: 500, unit: 'г', category: 'Мясо' },
  { name: 'Картофель', amount: 1, unit: 'кг', category: 'Овощи' },
  { name: 'Лук', amount: 3, unit: 'шт.', category: 'Овощи' },
  { name: 'Помидоры', amount: 4, unit: 'шт.', category: 'Овощи' },
  { name: 'Сыр', amount: 200, unit: 'г', category: 'Молочные' },
  { name: 'Сметана', amount: 300, unit: 'г', category: 'Молочные' },
  { name: 'Яйца', amount: 6, unit: 'шт.', category: 'Яйца' },
];

const FridgeContext = createContext<FridgeState | null>(null);

export function FridgeProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FridgeItem[]>(readFridge);
  const currentItems = useRef(items);
  const [today, setToday] = useState(localDateString);
  useEffect(() => {
    const updateDay = () => setToday(localDateString());
    const timer = window.setInterval(updateDay, 60_000);
    window.addEventListener('focus', updateDay);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', updateDay); };
  }, []);

  const usableNames = useMemo(() => usableFridgeNames(items, today), [items, today]);
  function commit(next: FridgeItem[]) {
    currentItems.current = next;
    setItems(next);
    try { localStorage.setItem(FRIDGE_STORAGE_KEY, JSON.stringify(next)); }
    catch { /* Blocked storage must not prevent the current cooking session. */ }
  }
  function cleanInput(input: FridgeInput): FridgeInput {
    return { name: cleanFridgeName(input.name), unit: input.unit, category: input.category,
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.expiresOn ? { expiresOn: input.expiresOn } : {}),
    };
  }
  function addItem(input: FridgeInput) {
    const error = validateFridgeInput(input, currentItems.current);
    if (error) return error;
    const item = { ...cleanInput(input), id: makeId() };
    commit([...currentItems.current, item]);
    trackEvent('fridge_item_added');
    return null;
  }
  function updateItem(id: string, input: FridgeInput) {
    if (!currentItems.current.some(item => item.id === id)) return 'Продукт уже удалён. Закройте форму и добавьте его заново.';
    const error = validateFridgeInput(input, currentItems.current, id);
    if (error) return error;
    const item = { ...cleanInput(input), id };
    commit(currentItems.current.map(previous => previous.id === id ? item : previous));
    return null;
  }
  function removeItem(id: string) {
    const item = currentItems.current.find(item => item.id === id);
    if (!item) return;
    commit(currentItems.current.filter(item => item.id !== id));
    trackEvent('fridge_item_removed');
  }
  function clearFridge() {
    const previous = currentItems.current;
    commit([]);
    previous.forEach(() => trackEvent('fridge_item_removed'));
  }
  function fillDemo() {
    if (currentItems.current.length) return false;
    const demo = demoItems.map(item => ({ ...item, id: makeId() }));
    commit(demo);
    demo.forEach(() => trackEvent('fridge_item_added'));
    return true;
  }
  return <FridgeContext.Provider value={{ items, usableNames, addItem, updateItem, removeItem, clearFridge, fillDemo }}>{children}</FridgeContext.Provider>;
}

export function useFridge() {
  const context = useContext(FridgeContext);
  if (!context) throw new Error('FridgeProvider is required');
  return context;
}
