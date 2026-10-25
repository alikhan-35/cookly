import { useCallback, useEffect, useState } from 'react';
import { RacionProviderError, type RacionRecipe } from '../services/recipeProviders/racion';
import { loadRacionRecipe } from '../services/recipeProviders/racionCache';

interface RecipeState {
  id: string;
  recipe: RacionRecipe | null;
  error: unknown;
  loading: boolean;
}

/** A route owns its request; obsolete responses must never replace its recipe. */
export function useRacionRecipe(id: string) {
  const [state, setState] = useState<RecipeState>({ id, recipe: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ id, recipe: null, error: null, loading: true });
    loadRacionRecipe(id, { signal: controller.signal })
      .then(recipe => { if (active) setState({ id, recipe, error: null, loading: false }); })
      .catch(error => {
        if (!active || controller.signal.aborted) return;
        setState({ id, recipe: null, error, loading: false });
        if (error instanceof RacionProviderError && error.code === 'rate_limit') {
          setRetryAt(Date.now() + Math.max(1, error.retryAfterSeconds ?? 60) * 1000);
          setNow(Date.now());
        }
      });
    return () => { active = false; controller.abort(); };
  }, [id, attempt]);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const retry = useCallback(() => {
    if (Date.now() >= retryAt) setAttempt(value => value + 1);
  }, [retryAt]);
  return {
    recipe: state.id === id ? state.recipe : null,
    error: state.id === id ? state.error : null,
    loading: state.id !== id || state.loading,
    retry,
    retryAfter: Math.max(0, Math.ceil((retryAt - now) / 1000)),
  };
}

export function racionRecipeError(error: unknown): string {
  if (!(error instanceof RacionProviderError)) return 'Не удалось связаться с «Рационом». Проверьте подключение и попробуйте ещё раз.';
  if (error.status === 404) return 'Этот рецепт больше не доступен у источника. Выберите другое блюдо.';
  if (error.code === 'rate_limit') return 'Источник временно ограничил запросы. Рецепт можно открыть на его сайте или повторить загрузку позже.';
  if (error.code === 'timeout') return 'Рецепт загружается дольше обычного. Попробуйте ещё раз.';
  if (error.code === 'invalid_request' || error.code === 'malformed_response') return 'Не получилось прочитать рецепт. Откройте оригинал или выберите другое блюдо.';
  return 'Не удалось загрузить рецепт. Выбранные продукты и настройки Cookly сохранены.';
}

export function racionAnalyticsId(id: string): string { return `racion-${id}`.slice(0, 80); }

export interface RacionNavigationState {
  catalogSearch?: string;
  comparisonStock?: string[];
}

/** History state is untrusted; an intentional empty comparison set stays empty. */
export function readRacionNavigationState(value: unknown): RacionNavigationState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const state = value as Record<string, unknown>;
  const result: RacionNavigationState = {};
  const controls = /[\u0000-\u001f\u007f]/;
  if (typeof state.catalogSearch === 'string' && state.catalogSearch.length <= 4096
    && (!state.catalogSearch || state.catalogSearch.startsWith('?')) && !controls.test(state.catalogSearch)) {
    result.catalogSearch = state.catalogSearch;
  }
  if (Array.isArray(state.comparisonStock) && state.comparisonStock.length <= 100
    && state.comparisonStock.every((name: unknown) => typeof name === 'string' && name.length <= 120 && Boolean(name.trim()) && !controls.test(name))) {
    result.comparisonStock = [...state.comparisonStock] as string[];
  }
  return result;
}

export function racionCategory(recipe: RacionRecipe): string {
  return recipe.slot ? ({ breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' } as const)[recipe.slot] : 'Рецепт';
}

export function racionQuantity(amount: number | null, unit: string, servings: number): string {
  if (amount === null) return 'Количество не указано';
  const value = amount * servings;
  if (!Number.isFinite(value)) return 'Количество не указано';
  const label = ({ g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт.' } as Record<string, string>)[unit] ?? unit;
  return `${new Intl.NumberFormat('ru', { maximumFractionDigits: value > 0 && value < 0.01 ? 5 : 2 }).format(value)} ${label}`.trim();
}
