import { MAX_INTAKE_TEXT, validateIntakeResult, type IntakeResult } from '../utils/fridgeIntake';

/** Only these locally written messages are safe to show in the intake UI. */
export class FridgeAssistantError extends Error { name = 'FridgeAssistantError'; }

export function assistantEndpoint(value = import.meta.env.VITE_FRIDGE_ASSISTANT_URL): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(import.meta.env.DEV && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return url.href;
  } catch { return null; }
}

export function assistantConfigured(): boolean { return assistantEndpoint() !== null; }

/** Only a backend URL is public; provider credentials never belong in the Vite app. */
export async function parseFridgeWithAssistant(text: string, { signal }: { signal?: AbortSignal } = {}): Promise<IntakeResult> {
  const endpoint = assistantEndpoint();
  if (!endpoint) throw new FridgeAssistantError('ИИ пока не подключён. Используйте обычный разбор списка.');
  if (!text.trim() || text.length > MAX_INTAKE_TEXT) throw new FridgeAssistantError(`Введите список длиной до ${MAX_INTAKE_TEXT} символов.`);
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 25_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }), credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
    });
    if (response.status === 429) throw new FridgeAssistantError('Слишком много запросов к ИИ. Попробуйте позже или нажмите «Разобрать на устройстве».');
    if (!response.ok) throw new FridgeAssistantError('Gemini сейчас недоступен. Нажмите «Разобрать на устройстве», чтобы продолжить.');
    const content = await response.text();
    if (content.length > 65_536) throw new FridgeAssistantError('Не удалось прочитать результат ИИ. Попробуйте обычный разбор.');
    let result: IntakeResult;
    try { result = validateIntakeResult(JSON.parse(content)); }
    catch { throw new FridgeAssistantError('ИИ вернул некорректный список. Используйте обычный разбор или исправьте текст.'); }
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return { ...result, engine: 'ai' };
  } catch (error) {
    if (timedOut) throw new FridgeAssistantError('ИИ отвечает слишком долго. Попробуйте обычный разбор списка.');
    if (signal?.aborted || controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error instanceof TypeError) throw new FridgeAssistantError('Не удалось связаться с ИИ. Проверьте интернет или используйте обычный разбор.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
