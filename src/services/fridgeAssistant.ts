import { MAX_INTAKE_TEXT, validateIntakeResult, type IntakeResult } from '../utils/fridgeIntake';
import { validateReceiptImage, type ReceiptImage } from '../utils/receiptPayload';

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
  if (!text.trim() || text.length > MAX_INTAKE_TEXT) throw new FridgeAssistantError(`Введите список длиной до ${MAX_INTAKE_TEXT} символов.`);
  return requestAssistant({ text: text.trim() }, false, signal);
}

export async function parseFridgeReceiptWithAssistant(receipt: ReceiptImage, { signal }: { signal?: AbortSignal } = {}): Promise<IntakeResult> {
  let checked: ReceiptImage;
  try { checked = validateReceiptImage(receipt); }
  catch { throw new FridgeAssistantError('Не удалось прочитать фото. Выберите другое изображение чека.'); }
  return requestAssistant({ receipt: checked }, true, signal);
}

async function requestAssistant(payload: { text: string } | { receipt: ReceiptImage }, isReceipt: boolean, signal?: AbortSignal): Promise<IntakeResult> {
  const endpoint = assistantEndpoint();
  if (!endpoint) throw new FridgeAssistantError('ИИ пока не подключён. Используйте обычный разбор списка.');
  const fallback = isReceipt ? 'Можно ввести продукты в режиме «Список и голос».' : 'Нажмите «Разобрать на устройстве», чтобы продолжить.';
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 25_000);
  try {
    const response = await fetch(isReceipt ? new URL('./receipt', endpoint).href : endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
    });
    if (response.status === 429) throw new FridgeAssistantError(`Слишком много запросов к ИИ. Попробуйте позже. ${fallback}`);
    if (!response.ok) throw new FridgeAssistantError(`Gemini сейчас недоступен. ${fallback}`);
    const content = await response.text();
    if (content.length > 65_536) throw new FridgeAssistantError(`Не удалось прочитать результат ИИ. ${fallback}`);
    let result: IntakeResult;
    try { result = validateIntakeResult(JSON.parse(content)); }
    catch { throw new FridgeAssistantError(`ИИ вернул некорректный список. ${fallback}`); }
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return { ...result, engine: 'ai' };
  } catch (error) {
    if (timedOut) throw new FridgeAssistantError(`ИИ отвечает слишком долго. ${fallback}`);
    if (signal?.aborted || controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error instanceof TypeError) throw new FridgeAssistantError(`Не удалось связаться с ИИ. Проверьте интернет. ${fallback}`);
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
