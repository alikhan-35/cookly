// Live Racion catalogue and explicit recipe reads; no bulk import or persistence.
// Contract: https://racion.app/openapi.json — RecipePage and RecipeCard.
export const RACION_API_URL = 'https://racion.app/api/recipes';
export const RACION_REQUEST_TIMEOUT_MS = 10_000;
const RACION_ORIGIN = 'https://racion.app';

export type RacionSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface RacionRecipeCard {
  id: string;
  title: string;
  slot: RacionSlot | null;
  timeMinutes: number | null;
  caloriesPerPortion: number | null;
  sourceUrl: string;
  /** Remote official photo URL; no image files are copied into Cookly. */
  imageUrl: string | null;
}

export interface RacionRecipePage {
  items: RacionRecipeCard[];
  total: number;
  offset: number;
  limit: 12 | 18;
  nextOffset: number | null;
}

export interface RacionRecipeIngredient {
  ingredientId: string;
  name: string;
  amount: number | null;
  unit: string;
  pantry: boolean;
}

/** Ingredient facts only, fetched explicitly for one selected recipe. */
export interface RacionRecipeIngredients {
  id: string;
  ingredients: RacionRecipeIngredient[];
}

export interface RacionRecipe extends RacionRecipeCard {
  description: string | null;
  /** Source amounts are for ONE portion, not the entire recipe. */
  ingredients: RacionRecipeIngredient[];
  /** Original steps, retained verbatim without inferred cooking conditions. */
  steps: string[];
  /** All source nutrition values are for ONE portion. */
  nutrition: {
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbs: number | null;
  };
  tags: string[];
}

export interface RacionSearchOptions {
  /** Free-text title/ingredient search; this is not a whole-fridge match. */
  query?: string;
  slot?: RacionSlot;
  limit?: 12 | 18;
  offset?: number;
  signal?: AbortSignal;
}

export type RacionProviderErrorCode =
  | 'invalid_request'
  | 'network'
  | 'http'
  | 'rate_limit'
  | 'timeout'
  | 'malformed_response';

export class RacionProviderError extends Error {
  readonly code: RacionProviderErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: RacionProviderErrorCode,
    message: string,
    details: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = 'RacionProviderError';
    this.code = code;
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

const slots = new Set<RacionSlot>(['breakfast', 'lunch', 'dinner', 'snack']);
const controlCharacters = /[\u0000-\u001f\u007f]/;

function malformed(): RacionProviderError {
  return new RacionProviderError('malformed_response', 'Racion вернул некорректную страницу рецептов.');
}

function abortError(): DOMException {
  return new DOMException('Поиск Racion отменён.', 'AbortError');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRouteId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value);
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return isRecord(value) && typeof value.aborted === 'boolean'
    && typeof value.addEventListener === 'function' && typeof value.removeEventListener === 'function';
}

function nullableNumber(value: unknown, integer = false): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw malformed();
  }
  return value;
}

function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || controlCharacters.test(value)) return null;
  try {
    const image = new URL(value, RACION_ORIGIN);
    if (image.origin !== RACION_ORIGIN || image.username || image.password) return null;
    // Both photo locations were verified on the official live catalogue.
    if (!image.pathname.startsWith('/images/recipes/') && !image.pathname.startsWith('/media/recipe/')) return null;
    return image.href;
  } catch {
    return null;
  }
}

function adaptCard(value: unknown): RacionRecipeCard {
  if (!isRecord(value)) throw malformed();
  const { ID: id, Title: title, Href: href, Slot: slot } = value;
  // IDs are route slugs, never arbitrary URL segments or encoded paths.
  if (!isRouteId(id)) throw malformed();
  if (typeof title !== 'string' || !title.trim() || title.length > 512 || controlCharacters.test(title)) throw malformed();
  if (slot !== undefined && slot !== null && (typeof slot !== 'string' || !slots.has(slot as RacionSlot))) throw malformed();
  if (typeof href !== 'string' || controlCharacters.test(href)) throw malformed();

  let source: URL;
  try {
    source = new URL(href, RACION_ORIGIN);
  } catch {
    throw malformed();
  }
  if (
    source.origin !== RACION_ORIGIN || source.username || source.password
    || source.pathname !== `/recipe/${id}` || source.search || source.hash
  ) throw malformed();

  // Deliberately omit Cost, Tags and all detail/description fields.
  return {
    id,
    title: title.trim(),
    slot: slot === undefined || slot === null ? null : slot as RacionSlot,
    timeMinutes: nullableNumber(value.TimeMin, true),
    caloriesPerPortion: nullableNumber(value.Kcal),
    sourceUrl: source.href,
    imageUrl: safeImageUrl(value.Image),
  };
}

function adaptPage(value: unknown, offset: number, limit: 12 | 18): RacionRecipePage {
  if (!isRecord(value) || !isNonnegativeInteger(value.total) || value.offset !== offset || value.limit !== limit || !Array.isArray(value.items)) {
    throw malformed();
  }
  if (value.items.length > limit || value.items.length > Math.max(0, value.total - offset)) throw malformed();
  if (value.items.length === 0 && offset < value.total) throw malformed();
  const items = value.items.map(adaptCard);
  if (new Set(items.map(item => item.id)).size !== items.length) throw malformed();
  const endOffset = offset + items.length;
  return {
    items,
    total: value.total,
    offset,
    limit,
    nextOffset: items.length > 0 && endOffset < value.total ? endOffset : null,
  };
}

function adaptIngredients(value: unknown, expectedId: string): RacionRecipeIngredients {
  if (!isRecord(value) || value.id !== expectedId || !Array.isArray(value.ingredients) || value.ingredients.length === 0) throw malformed();
  const ingredients = value.ingredients.map((item: unknown): RacionRecipeIngredient => {
    if (!isRecord(item) || !isRouteId(item.ingredientId)) throw malformed();
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 512 || controlCharacters.test(item.name)) throw malformed();
    if (typeof item.unit !== 'string' || !item.unit.trim() || item.unit.length > 32 || controlCharacters.test(item.unit)) throw malformed();
    if (typeof item.pantry !== 'boolean') throw malformed();
    return {
      ingredientId: item.ingredientId,
      name: item.name.trim(),
      amount: nullableNumber(item.amount),
      unit: item.unit,
      pantry: item.pantry,
    };
  });
  return { id: expectedId, ingredients };
}

function adaptRecipe(value: unknown, expectedId: string): RacionRecipe {
  if (!isRecord(value) || value.id !== expectedId || !Array.isArray(value.steps) || value.steps.length === 0) throw malformed();
  const steps = value.steps.map((step: unknown): string => {
    if (typeof step !== 'string' || !step.trim()) throw malformed();
    return step;
  });
  let description: string | null = null;
  if (value.description !== undefined && value.description !== null) {
    if (typeof value.description !== 'string') throw malformed();
    description = value.description.trim() ? value.description : null;
  }
  let tags: string[] = [];
  if (value.tags !== undefined && value.tags !== null) {
    if (!Array.isArray(value.tags)) throw malformed();
    tags = value.tags.map((tag: unknown): string => {
      if (typeof tag !== 'string' || !tag.trim()) throw malformed();
      return tag;
    });
  }
  const card = adaptCard({
    ID: value.id, Title: value.title, Slot: value.slot, TimeMin: value.timeMin,
    Kcal: value.kcal, Image: value.image, Href: `/recipe/${expectedId}`,
  });
  return {
    ...card,
    description,
    ingredients: adaptIngredients(value, expectedId).ingredients,
    steps,
    nutrition: {
      calories: card.caloriesPerPortion,
      protein: nullableNumber(value.protein),
      fat: nullableNumber(value.fat),
      carbs: nullableNumber(value.carb),
    },
    tags,
  };
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('Retry-After')?.trim();
  if (!value || !/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

async function requestRacion<T>(url: URL, adapt: (payload: unknown) => T, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  let timedOut = false;
  const interrupted = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new RacionProviderError('timeout', 'Racion не ответил за 10 секунд. Попробуйте ещё раз.'));
    }, RACION_REQUEST_TIMEOUT_MS);
    cancel = () => {
      controller.abort();
      reject(abortError());
    };
    signal?.addEventListener('abort', cancel, { once: true });
  });

  const operation = (async () => {
    const response = await globalThis.fetch(url.href, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 429) {
        throw new RacionProviderError('rate_limit', 'Лимит запросов Racion исчерпан. Повторите поиск позже.', {
          status: 429,
          retryAfterSeconds: retryAfterSeconds(response),
        });
      }
      throw new RacionProviderError('http', `Racion вернул ошибку HTTP ${response.status}.`, { status: response.status });
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw malformed();
    }
    return adapt(payload);
  })();

  try {
    return await Promise.race([operation, interrupted]);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (timedOut) throw new RacionProviderError('timeout', 'Racion не ответил за 10 секунд. Попробуйте ещё раз.');
    if (error instanceof RacionProviderError) throw error;
    throw new RacionProviderError('network', 'Не удалось связаться с Racion. Проверьте подключение и повторите поиск.');
  } finally {
    clearTimeout(timer);
    if (cancel) signal?.removeEventListener('abort', cancel);
  }
}

/**
 * One user-requested catalogue page. No persistent or response cache and no retries.
 * Aborting a search cancels this caller's request; no shared request can cancel a peer.
 */
export async function searchRacionRecipes(options: RacionSearchOptions = {}): Promise<RacionRecipePage> {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) throw new RacionProviderError('invalid_request', 'Некорректные параметры поиска.');
  const { query = '', slot, limit = 12, offset = 0, signal } = options;
  if (
    typeof query !== 'string' || query.length > 120 || controlCharacters.test(query)
    || (limit !== 12 && limit !== 18) || !isNonnegativeInteger(offset)
    || (slot !== undefined && !slots.has(slot))
    || (signal !== undefined && !isAbortSignal(signal))
  ) throw new RacionProviderError('invalid_request', 'Введите короткий запрос и выберите допустимую страницу поиска.');

  const url = new URL(RACION_API_URL);
  url.searchParams.set('country', 'KZ');
  url.searchParams.set('lang', 'ru');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  if (query.trim()) url.searchParams.set('q', query.trim());
  if (slot !== undefined) url.searchParams.set('slot', slot);
  return requestRacion(url, payload => adaptPage(payload, offset, limit), signal);
}

/** Explicit single-recipe ingredient check; never called by a list/search request. */
export async function getRacionRecipeIngredients(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<RacionRecipeIngredients> {
  if (!isRouteId(id) || typeof options !== 'object' || options === null || Array.isArray(options)
    || (options.signal !== undefined && !isAbortSignal(options.signal))) {
    throw new RacionProviderError('invalid_request', 'Некорректный идентификатор рецепта Racion.');
  }
  const url = new URL(`${RACION_API_URL}/${id}`);
  url.searchParams.set('country', 'KZ');
  url.searchParams.set('lang', 'ru');
  return requestRacion(url, payload => adaptIngredients(payload, id), options.signal);
}

/** One explicitly selected full recipe. Page-level caching lives in racionCache.ts. */
export async function getRacionRecipe(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<RacionRecipe> {
  if (!isRouteId(id) || typeof options !== 'object' || options === null || Array.isArray(options)
    || (options.signal !== undefined && !isAbortSignal(options.signal))) {
    throw new RacionProviderError('invalid_request', 'Некорректный идентификатор рецепта Racion.');
  }
  const url = new URL(`${RACION_API_URL}/${id}`);
  url.searchParams.set('country', 'KZ');
  url.searchParams.set('lang', 'ru');
  return requestRacion(url, payload => adaptRecipe(payload, id), options.signal);
}

/** Strict shared adapter for cards retrieved by the official fridge form. */
export function adaptRacionCandidateCard(value: unknown): RacionRecipeCard { return adaptCard(value); }
