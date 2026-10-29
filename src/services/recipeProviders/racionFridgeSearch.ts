import type { UserProfile } from '../../types';
import type { MatchingOptions } from '../../utils/matchingPolicy';
import { loadRacionCandidates } from './racionCandidates';
import { loadRacionRecipe } from './racionCache';
import { rankRacionRecipes } from './racionRecommendations';
import { RacionProviderError, type RacionRecipe, type RacionRecipeCard } from './racion';

export const RACION_FRIDGE_MAX_DETAILS = 36;
export const RACION_FRIDGE_TARGET = 6;
interface SearchOptions {
  stock: readonly string[]; maxTime: number | null; profile: UserProfile;
  matchingOptions?: MatchingOptions; signal?: AbortSignal;
  onProgress?: (progress: { recipes: RacionRecipe[]; checked: number; totalCandidates: number }) => void;
}
interface Dependencies { candidates?: typeof loadRacionCandidates; detail?: typeof loadRacionRecipe }

/** Prefer everyday hot food before seasonal pastries, but always check the full composition. */
function candidatePriority(recipe: RacionRecipeCard, index: number): number {
  const sweet = /печень[еяк]|торт|кекс|десерт|пирожн|варень|конфет|пряник|тесто|крекер|cake|cookie/i.test(recipe.title);
  return (sweet ? 1000 : 0) + (recipe.timeMinutes ?? 60) + index * 0.8;
}

/** One automatic search: catalogue-ranked candidates, then independently verified full recipes. */
export async function recommendRacionFromFridge(
  { stock, maxTime, profile, matchingOptions = {}, signal, onProgress }: SearchOptions,
  dependencies: Dependencies = {},
) {
  const candidates = dependencies.candidates ?? loadRacionCandidates;
  const detail = dependencies.detail ?? loadRacionRecipe;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
  const recipes: RacionRecipe[] = [];
  let checked = 0;
  let totalCandidates = 0;
  let nextIndex = 0;
  let error: unknown = null;
  let cards: RacionRecipeCard[] = [];
  const animal = /говяд|баран|ягнят|с[её]мг|лосос|рыб|сельд|куриц|курин|индей|свин|фарш/i;
  const enough = () => {
    const ranked = rankRacionRecipes(recipes, stock, maxTime, profile, matchingOptions);
    if (ranked.length < RACION_FRIDGE_TARGET) return false;
    const families = new Set(ranked.map(item => item.family));
    const lookForAnimal = stock.some(name => animal.test(name)) && cards.some(card => animal.test(card.title));
    const hasAnimal = ranked.some(item => /chicken|turkey|beef|pork|lamb|fish|seafood|meat/.test(item.family));
    return families.size >= 2 && (!lookForAnimal || hasAnimal);
  };
  try {
    const pool = await candidates({ stock, signal: controller.signal });
    totalCandidates = pool.items.length;
    cards = pool.items.map((recipe, index) => ({ recipe, priority: candidatePriority(recipe, index) }))
      .filter(({ recipe }) => maxTime === null || recipe.timeMinutes === null || recipe.timeMinutes <= maxTime)
      .sort((a, b) => a.priority - b.priority).map(item => item.recipe);
    async function worker() {
      while (!controller.signal.aborted && !error && nextIndex < cards.length && nextIndex < RACION_FRIDGE_MAX_DETAILS && !enough()) {
        const card = cards[nextIndex++];
        try {
          const recipe = await detail(card.id, { signal: controller.signal });
          if (controller.signal.aborted) break;
          recipes.push(recipe); checked++;
          onProgress?.({ recipes: [...recipes], checked, totalCandidates });
        } catch (cause) {
          if (signal?.aborted) throw cause;
          if (cause instanceof RacionProviderError && (cause.code === 'malformed_response' || cause.status === 404)) { checked++; continue; }
          error = cause;
          break;
        }
      }
    }
    await Promise.all([worker(), worker()]);
  } catch (cause) {
    if (signal?.aborted) throw new DOMException('Подбор отменён.', 'AbortError');
    error = cause;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel);
  }
  if (signal?.aborted) throw new DOMException('Подбор отменён.', 'AbortError');
  if (timedOut) error = new RacionProviderError('timeout', 'Проверка составов заняла слишком много времени.');
  return { recipes, checked, totalCandidates, truncated: nextIndex < cards.length || Boolean(error), error };
}
