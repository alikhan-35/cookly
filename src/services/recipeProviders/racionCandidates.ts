import { assistantEndpoint } from '../fridgeAssistant';
import { adaptRacionCandidateCard, RacionProviderError, type RacionRecipeCard } from './racion';
import { buildSourceHaveIds } from './racionCompatibility';

export interface RacionCandidatePool { items: RacionRecipeCard[]; total: number }
const cache = new Map<string, { expires: number; value: RacionCandidatePool }>();
/** The official HTML fridge form ranks the catalogue; its pantry claims are never trusted. */
export async function loadRacionCandidates({ stock, signal }: { stock: readonly string[]; signal?: AbortSignal }): Promise<RacionCandidatePool> {
  if (signal?.aborted) throw new DOMException('Подбор отменён.', 'AbortError');
  const have = buildSourceHaveIds(stock).sort();
  if (!have.length) return { items: [], total: 0 };
  const key = JSON.stringify(have);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return structuredClone(cached.value);
  const base = assistantEndpoint();
  if (!base) throw new RacionProviderError('network', 'Сервер подбора пока недоступен.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15_000);
  try {
    const response = await fetch(new URL('/api/recipes/candidates', base).href, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ have }),
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    if (response.status === 429) {
      const raw = response.headers.get('Retry-After') ?? '';
      throw new RacionProviderError('rate_limit', 'Источник ограничил подбор.', { status: 429, retryAfterSeconds: /^\d+$/.test(raw) ? Math.min(3600, Number(raw)) : 60 });
    }
    if (!response.ok) throw new RacionProviderError('http', 'Не удалось получить подборку источника.', { status: response.status });
    const text = await response.text();
    if (text.length > 150_000) throw new RacionProviderError('malformed_response', 'Некорректная подборка.');
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items) || value.items.length > 100) throw new RacionProviderError('malformed_response', 'Некорректная подборка.');
    const items = [...new Map(value.items.map(item => { const card = adaptRacionCandidateCard(item); return [card.id, card] as const; })).values()];
    const result = { items, total: items.length };
    cache.set(key, { expires: Date.now() + 600_000, value: result });
    while (cache.size > 20) cache.delete(cache.keys().next().value!);
    return structuredClone(result);
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Подбор отменён.', 'AbortError');
    if (error instanceof RacionProviderError) throw error;
    throw new RacionProviderError(controller.signal.aborted ? 'timeout' : 'network', 'Не удалось завершить поиск рецептов.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
