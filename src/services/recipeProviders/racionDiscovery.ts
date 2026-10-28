import { RacionProviderError, type RacionRecipe } from './racion';
import { loadRacionRecipe, loadRacionSearch } from './racionCache';

export const RACION_DISCOVERY_SEARCHES = 4;
export const RACION_DISCOVERY_DETAILS = 8;

export interface RacionDiscoveryCursor {
  nextSeed: number;
  offsets: Record<string, number>;
  exhausted: string[];
}

export function initialRacionDiscoveryCursor(): RacionDiscoveryCursor {
  return { nextSeed: 0, offsets: {}, exhausted: [] };
}

interface DiscoveryOptions {
  seeds: readonly string[];
  cursor: RacionDiscoveryCursor;
  knownIds: readonly string[];
  signal?: AbortSignal;
  onProgress?: (recipes: RacionRecipe[]) => void;
}

interface DiscoveryDependencies {
  search?: typeof loadRacionSearch;
  detail?: typeof loadRacionRecipe;
}

/**
 * One explicit discovery batch: at most four queries and eight full recipes.
 * Each query gets a fair share; subsequent batches rotate across the fridge and
 * resume unvisited rows. This is a bounded sample, not a catalogue-wide index.
 */
export async function discoverRacionRecipes(
  { seeds, cursor: previous, knownIds, signal, onProgress }: DiscoveryOptions,
  dependencies: DiscoveryDependencies = {},
) {
  const search = dependencies.search ?? loadRacionSearch;
  const detail = dependencies.detail ?? loadRacionRecipe;
  const cursor: RacionDiscoveryCursor = { nextSeed: previous.nextSeed, offsets: { ...previous.offsets }, exhausted: [...previous.exhausted] };
  const exhausted = new Set(cursor.exhausted);
  const seen = new Set(knownIds);
  const recipes: RacionRecipe[] = [];
  let error: unknown = null;
  const groups: { query: string; index: number }[] = [];
  for (let distance = 0; distance < seeds.length && groups.length < RACION_DISCOVERY_SEARCHES; distance++) {
    const index = (cursor.nextSeed + distance) % seeds.length;
    if (!exhausted.has(seeds[index])) groups.push({ query: seeds[index], index });
  }
  const requireActive = () => {
    if (signal?.aborted) throw new DOMException('Подбор отменён.', 'AbortError');
  };

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    requireActive();
    const { query, index } = groups[groupIndex];
    // Retry a failed group, then resume the fair rotation, without skipping rows.
    cursor.nextSeed = index;
    const offset = cursor.offsets[query] ?? 0;
    const budget = Math.floor(RACION_DISCOVERY_DETAILS / groups.length)
      + (groupIndex < RACION_DISCOVERY_DETAILS % groups.length ? 1 : 0);
    try {
      const page = await search({ query, offset, limit: 12, signal });
      let requested = 0;
      for (const candidate of page.items) {
        requireActive();
        if (!seen.has(candidate.id)) {
          if (requested >= budget) break;
          requested++;
          try {
            const recipe = await detail(candidate.id, { signal });
            requireActive();
            recipes.push(recipe);
            seen.add(recipe.id);
            onProgress?.([...recipes]);
          } catch (cause) {
            requireActive();
            // Skip only an unusable source record; transport/rate errors stop
            // the entire batch immediately and leave this row for explicit retry.
            if (!(cause instanceof RacionProviderError) || cause.code !== 'malformed_response') throw cause;
            error ??= cause;
            seen.add(candidate.id);
          }
        }
        cursor.offsets[query] = (cursor.offsets[query] ?? offset) + 1;
      }
      if ((cursor.offsets[query] ?? offset) >= page.total) exhausted.add(query);
      cursor.nextSeed = (index + 1) % seeds.length;
    } catch (cause) {
      requireActive();
      error = cause;
      break;
    }
  }
  cursor.exhausted = [...exhausted];
  return { recipes, cursor, error, hasMore: seeds.some(seed => !exhausted.has(seed)) };
}
