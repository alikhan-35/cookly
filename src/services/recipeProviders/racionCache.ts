import {
  getRacionRecipe,
  searchRacionRecipes,
  RacionProviderError,
  type RacionRecipe,
  type RacionRecipePage,
  type RacionSearchOptions,
} from './racion';

export const RACION_CACHE_TTL_MS = 10 * 60_000;
export const RACION_DETAIL_CACHE_MAX_ENTRIES = 100;
export const RACION_SEARCH_CACHE_MAX_ENTRIES = 30;

function abortError(): DOMException {
  return new DOMException('Загрузка Racion отменена.', 'AbortError');
}

function isSignal(value: unknown): value is AbortSignal {
  return typeof value === 'object' && value !== null
    && typeof (value as AbortSignal).aborted === 'boolean'
    && typeof (value as AbortSignal).addEventListener === 'function'
    && typeof (value as AbortSignal).removeEventListener === 'function';
}

function invalidRequest(): RacionProviderError {
  return new RacionProviderError('invalid_request', 'Некорректные параметры загрузки Racion.');
}

interface Pending<T> {
  controller: AbortController;
  promise: Promise<T>;
  subscribers: number;
  abandoned: boolean;
  settled: boolean;
}

/** Lazy TTL eviction and completed-value LRU; in-flight callers own their cancellation. */
function boundedMemoryCache<T>(
  maxEntries: number,
  now: () => number,
  beforeRequest: () => void,
  onFailure: (error: unknown) => void,
) {
  const values = new Map<string, { value: T; expiresAt: number }>();
  const inflight = new Map<string, Pending<T>>();

  function load(key: string, loader: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    const cached = values.get(key);
    if (cached) {
      values.delete(key);
      if (cached.expiresAt > now()) {
        values.set(key, cached);
        return Promise.resolve(structuredClone(cached.value));
      }
    }

    let pending = inflight.get(key);
    if (!pending) {
      try {
        beforeRequest();
      } catch (error) {
        return Promise.reject(error);
      }
      const entry: Pending<T> = {
        controller: new AbortController(), promise: undefined as unknown as Promise<T>,
        subscribers: 0, abandoned: false, settled: false,
      };
      inflight.set(key, entry);
      entry.promise = Promise.resolve().then(() => {
        if (entry.controller.signal.aborted) throw abortError();
        return loader(entry.controller.signal);
      }).then(value => {
        if (!entry.abandoned && inflight.get(key) === entry) {
          values.delete(key);
          values.set(key, { value: structuredClone(value), expiresAt: now() + RACION_CACHE_TTL_MS });
          while (values.size > maxEntries) values.delete(values.keys().next().value!);
        }
        return value;
      }).catch((error: unknown) => {
        onFailure(error);
        throw error;
      }).finally(() => {
        entry.settled = true;
        // An abandoned response must never remove a newer same-key request.
        if (inflight.get(key) === entry) inflight.delete(key);
      });
      pending = entry;
    }

    const entry = pending;
    entry.subscribers++;
    return new Promise<T>((resolve, reject) => {
      let active = true;
      const finish = () => {
        if (!active) return false;
        active = false;
        entry.subscribers--;
        signal?.removeEventListener('abort', cancel);
        return true;
      };
      const cancel = () => {
        if (!finish()) return;
        reject(abortError());
        if (entry.subscribers === 0 && !entry.settled) {
          entry.abandoned = true;
          if (inflight.get(key) === entry) inflight.delete(key);
          entry.controller.abort();
        }
      };
      signal?.addEventListener('abort', cancel, { once: true });
      entry.promise.then(value => {
        if (finish()) resolve(structuredClone(value));
      }, error => {
        if (finish()) reject(error);
      });
    });
  }

  return { load };
}

export interface RacionLoaderDependencies {
  getRecipe?: typeof getRacionRecipe;
  searchRecipes?: typeof searchRacionRecipes;
  now?: () => number;
}

/** An isolated loader session, also useful for deterministic offline tests. */
export function createRacionLoaders(dependencies: RacionLoaderDependencies = {}) {
  const getRecipe = dependencies.getRecipe ?? getRacionRecipe;
  const searchRecipes = dependencies.searchRecipes ?? searchRacionRecipes;
  const now = dependencies.now ?? Date.now;
  let cooldownUntil = 0;

  function beforeRequest() {
    const remaining = cooldownUntil - now();
    if (remaining > 0) {
      throw new RacionProviderError('rate_limit', 'Лимит запросов Racion исчерпан. Повторите загрузку позже.', {
        status: 429, retryAfterSeconds: Math.ceil(remaining / 1000),
      });
    }
  }

  function onFailure(error: unknown) {
    if (!(error instanceof RacionProviderError) || error.code !== 'rate_limit') return;
    const wait = typeof error.retryAfterSeconds === 'number' && Number.isFinite(error.retryAfterSeconds)
      && error.retryAfterSeconds >= 0 ? error.retryAfterSeconds : 60;
    cooldownUntil = Math.max(cooldownUntil, now() + wait * 1000);
  }

  const details = boundedMemoryCache<RacionRecipe>(RACION_DETAIL_CACHE_MAX_ENTRIES, now, beforeRequest, onFailure);
  const searches = boundedMemoryCache<RacionRecipePage>(RACION_SEARCH_CACHE_MAX_ENTRIES, now, beforeRequest, onFailure);

  async function loadRacionRecipe(id: string, options: { signal?: AbortSignal } = {}): Promise<RacionRecipe> {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(id)
      || typeof options !== 'object' || options === null || Array.isArray(options)
      || (options.signal !== undefined && !isSignal(options.signal))) throw invalidRequest();
    return details.load(id, signal => getRecipe(id, { signal }), options.signal);
  }

  async function loadRacionSearch(options: RacionSearchOptions = {}): Promise<RacionRecipePage> {
    if (typeof options !== 'object' || options === null || Array.isArray(options)) throw invalidRequest();
    const { query = '', slot, limit = 12, offset = 0, signal } = options;
    if (typeof query !== 'string' || query.length > 120 || /[\u0000-\u001f\u007f]/.test(query)
      || (limit !== 12 && limit !== 18) || !Number.isSafeInteger(offset) || offset < 0
      || (slot !== undefined && !['breakfast', 'lunch', 'dinner', 'snack'].includes(slot))
      || (signal !== undefined && !isSignal(signal))) throw invalidRequest();
    const request = { query: query.trim(), slot, limit, offset };
    const key = JSON.stringify(request);
    return searches.load(key, sharedSignal => searchRecipes({ ...request, signal: sharedSignal }), signal);
  }

  return { loadRacionRecipe, loadRacionSearch };
}

// Shared only for this browser/tab lifetime. No localStorage, IndexedDB or disk cache.
const loaders = createRacionLoaders();
export const loadRacionRecipe = loaders.loadRacionRecipe;
export const loadRacionSearch = loaders.loadRacionSearch;
