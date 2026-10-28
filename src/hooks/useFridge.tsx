import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FridgeItem } from '../types';
import { trackEvent } from '../services/analytics';
import { cleanFridgeName, FRIDGE_STORAGE_KEY, localDateString, parseFridgeState, usableFridgeNames, validateFridgeInput, planFridgeBatch, type FridgeInput, type FridgeUpdateMode, type StoredFridgeState } from '../utils/fridge';
import { applyConsumption, type ConsumptionChange } from '../utils/fridgeConsumption';

interface FridgeState {
  items: FridgeItem[];
  usableNames: string[];
  addItem: (input: FridgeInput, mode?: FridgeUpdateMode) => string | null;
  addItems: (inputs: FridgeInput[], mode?: FridgeUpdateMode, receiptId?: string) => string | null;
  consumeItems: (transactionId: string, changes: ConsumptionChange[]) => string | null;
  hasConsumed: (transactionId: string) => boolean;
  hasImportedReceipt: (receiptId: string) => boolean;
  updateItem: (id: string, input: FridgeInput) => string | null;
  removeItem: (id: string) => void;
  clearFridge: () => void;
  fillDemo: () => boolean;
}

function readFridge(): StoredFridgeState {
  try { return parseFridgeState(JSON.parse(localStorage.getItem(FRIDGE_STORAGE_KEY) ?? '[]')); }
  catch { return parseFridgeState([]); }
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
  const [state, setState] = useState<StoredFridgeState>(readFridge);
  const currentState = useRef(state);
  const storageFailed = useRef(false);
  const items = state.items;
  const [today, setToday] = useState(localDateString);
  useEffect(() => {
    const updateDay = () => setToday(localDateString());
    const timer = window.setInterval(updateDay, 60_000);
    window.addEventListener('focus', updateDay);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', updateDay); };
  }, []);
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key !== FRIDGE_STORAGE_KEY && event.key !== null) return;
      if (storageFailed.current) return;
      const next = readFridge();
      currentState.current = next;
      setState(next);
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const usableNames = useMemo(() => usableFridgeNames(items, today), [items, today]);
  function latest() {
    if (!storageFailed.current) {
      try {
        const stored = localStorage.getItem(FRIDGE_STORAGE_KEY);
        currentState.current = parseFridgeState(stored === null ? [] : JSON.parse(stored));
      } catch { /* Keep current stock if storage is blocked or corrupt. */ }
    }
    return currentState.current;
  }
  function commit(next: FridgeItem[], ledger: Partial<Pick<StoredFridgeState, 'appliedConsumptionIds' | 'importedReceiptIds'>> = {}) {
    const nextState: StoredFridgeState = { ...currentState.current, ...ledger, items: next, version: 2 };
    currentState.current = nextState;
    setState(nextState);
    try { localStorage.setItem(FRIDGE_STORAGE_KEY, JSON.stringify(nextState)); storageFailed.current = false; }
    catch { storageFailed.current = true; /* Blocked storage must not prevent the current cooking session. */ }
  }
  function cleanInput(input: FridgeInput): FridgeInput {
    return { name: cleanFridgeName(input.name), unit: input.unit, category: input.category,
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.expiresOn ? { expiresOn: input.expiresOn } : {}),
    };
  }
  function addItem(input: FridgeInput, mode: FridgeUpdateMode = 'add') {
    return addItems([input], mode);
  }
  function updateItem(id: string, input: FridgeInput) {
    const current = latest();
    if (!current.items.some(item => item.id === id)) return 'Продукт уже удалён. Закройте форму и добавьте его заново.';
    const error = validateFridgeInput(input, current.items, id);
    if (error) return error;
    const item = { ...cleanInput(input), id };
    commit(current.items.map(previous => previous.id === id ? item : previous));
    return null;
  }
  function addItems(inputs: FridgeInput[], mode: FridgeUpdateMode = 'add', receiptId?: string) {
    const current = latest();
    if (receiptId && current.importedReceiptIds.includes(receiptId)) return 'Этот чек уже добавлен. Чтобы поправить остаток, измените продукт в холодильнике.';
    if (receiptId && receiptId.length > 250) return 'Не удалось проверить чек. Попробуйте выбрать фото заново.';
    const plan = planFridgeBatch(inputs, current.items, mode, makeId);
    if (plan.error) return plan.error;
    commit(plan.items, receiptId ? { importedReceiptIds: [...current.importedReceiptIds, receiptId].slice(-100) } : {});
    for (let index = 0; index < plan.addedCount; index++) trackEvent('fridge_item_added');
    return null;
  }
  function consumeItems(transactionId: string, changes: ConsumptionChange[]) {
    if (!transactionId || transactionId.length > 250) return 'Не удалось определить приготовление. Откройте рецепт заново.';
    const current = latest();
    if (current.appliedConsumptionIds.includes(transactionId)) { setState(current); return null; }
    const result = applyConsumption(current.items, changes);
    if (result.error) { setState(current); return result.error; }
    commit(result.items, { appliedConsumptionIds: [...current.appliedConsumptionIds, transactionId].slice(-100) });
    return null;
  }
  function hasConsumed(transactionId: string) { return state.appliedConsumptionIds.includes(transactionId); }
  function hasImportedReceipt(receiptId: string) { return state.importedReceiptIds.includes(receiptId); }
  function removeItem(id: string) {
    const current = latest();
    const item = current.items.find(item => item.id === id);
    if (!item) return;
    commit(current.items.filter(item => item.id !== id));
    trackEvent('fridge_item_removed');
  }
  function clearFridge() {
    const previous = latest().items;
    commit([]);
    previous.forEach(() => trackEvent('fridge_item_removed'));
  }
  function fillDemo() {
    if (latest().items.length) return false;
    const demo = demoItems.map(item => ({ ...item, id: makeId() }));
    commit(demo);
    demo.forEach(() => trackEvent('fridge_item_added'));
    return true;
  }
  return <FridgeContext.Provider value={{ items, usableNames, addItem, addItems, updateItem, consumeItems, hasConsumed, hasImportedReceipt, removeItem, clearFridge, fillDemo }}>{children}</FridgeContext.Provider>;
}

export function useFridge() {
  const context = useContext(FridgeContext);
  if (!context) throw new Error('FridgeProvider is required');
  return context;
}
