import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAssistantRequest, type AssistantEnvironment } from './fridge-assistant';

const origin = 'https://alikhan-35.github.io';
const request = (body: unknown = { text: 'У меня 2 яйца' }, headers = {}, signal?: AbortSignal): Request => new Request('https://assistant.example/api/fridge/parse', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal,
});
function environment(allow = true): AssistantEnvironment {
  return { GEMINI_API_KEY: 'test-server-only-key', DB: { prepare: () => ({ bind() { return this; }, async first<T>() { return (allow ? { requests: 1 } : null) as T | null; } }) } };
}

const product = { name: 'Яйца', amount: '2', unit: 'шт.', category: 'Яйца', note: '' };
const extracted = { products: [product], warnings: [] };
const geminiOutput = (value: unknown = extracted) => ({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }] });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };

function countedEnvironment(first = vi.fn(async () => ({ requests: 1 }))) {
  const env = environment();
  const prepare = vi.fn(() => ({ bind() { return this; }, async first<T>() { return await first() as T | null; } }));
  env.DB = { prepare };
  return { env, prepare, first };
}

describe('server-only fridge extraction gateway', () => {
  it('rejects foreign origins and oversized input before calling a provider', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await handleAssistantRequest(request({ text: '2 яйца' }, { Origin: 'https://unrelated.example' }), environment())).status).toBe(403);
    expect((await handleAssistantRequest(request({ text: 'x'.repeat(2001) }), environment())).status).toBe(400);
    expect((await handleAssistantRequest(request({ text: '2 яйца', model: 'expensive-model' }), environment())).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('fails closed without either a credential or durable counters, and enforces exhausted quotas', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await handleAssistantRequest(request(), {})).status).toBe(503);
    expect((await handleAssistantRequest(request(), { GEMINI_API_KEY: 'test' })).status).toBe(503);
    const response = await handleAssistantRequest(request(), environment(false));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('extracts validated data, limits model output and never sends the secret to the client', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput())));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request(), environment());
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    const text = await response.text();
    expect(text).not.toContain('test-server-only-key');
    expect(JSON.parse(text).products[0]).toMatchObject({ name: 'Яйца', amount: 2 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(fetcher.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-server-only-key');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
    const body = JSON.parse(String(fetcher.mock.calls[0][1].body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.required).toEqual(['products', 'warnings']);
    expect(body.generationConfig.maxOutputTokens).toBeLessThanOrEqual(4000);
    expect(body.generationConfig.candidateCount).toBeUndefined();
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'У меня 2 яйца' }] }]);
    expect(body.systemInstruction.parts[0].text).toContain('Отрицания');
    expect(body.tools).toBeUndefined();
    expect(String(fetcher.mock.calls[0][1].body)).not.toContain('test-server-only-key');
  });
  it('uses Worker-compatible fetch and refuses redirects without following the API key', async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.redirect === 'error' || Object.hasOwn(init ?? {}, 'credentials')) throw new TypeError('Unsupported Worker fetch options');
      expect(init?.redirect).toBe('manual');
      return new Response(null, { status: 307, headers: { Location: 'https://unrelated.example' } });
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request(), environment());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'assistant_unavailable' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
    expect(Object.hasOwn(fetcher.mock.calls[0][1] ?? {}, 'credentials')).toBe(false);
  });
  it.each([
    { candidates: [] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(extracted) }] } }] },
    { candidates: [{ finishReason: 'SAFETY' }] },
    { ...geminiOutput(), promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ ...geminiOutput().candidates[0], safetyRatings: [{ blocked: true }] }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'delete' } }] } }] },
    { candidates: [geminiOutput().candidates[0], geminiOutput().candidates[0]] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(extracted), thought: true }] } }] },
  ])('rejects incomplete, blocked or malformed Gemini responses without returning unverified foods: %j', async output => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(output)));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request(), environment());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'assistant_unavailable' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([
    { ...product, amount: '-2' }, { ...product, amount: '0' }, { ...product, amount: 2 },
    { ...product, amount: '1000001' }, { ...product, amount: '1e3' }, { ...product, amount: 'NaN' }, { ...product, category: 'Invented' },
    { ...product, unit: 'bucket' }, { ...product, unit: null }, { ...product, name: 'x'.repeat(61) },
    { ...product, note: 123 }, { ...product, note: 'x'.repeat(201) },
    { ...product, selected: true },
    { name: 'Яйца', unit: 'шт.', category: 'Яйца', note: '' },
  ])('validates model products locally even when upstream ignores schema bounds: %j', async invalid => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput({ products: [invalid], warnings: [] })))));
    expect((await handleAssistantRequest(request(), environment())).status).toBe(502);
  });
  it('keeps missing amounts and uncertain foods for review without inventing quantities', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput({ products: [{ ...product, amount: '', unit: '', note: 'Уточните продукт' }], warnings: [] })))));
    const response = await handleAssistantRequest(request(), environment());
    expect(response.status).toBe(200);
    expect((await response.json()).products[0]).toEqual({ id: 'ai-0', name: 'Яйца', unit: '', category: 'Яйца', note: 'Уточните продукт', selected: false });
  });
  it('accepts an explained empty result for an all-negative list instead of inventing foods', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput({ products: [], warnings: ['Продуктов в наличии нет.'] })))));
    const response = await handleAssistantRequest(request({ text: 'Яиц нет, молоко надо купить' }), environment());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ engine: 'ai', products: [], warnings: ['Продуктов в наличии нет.'] });
  });
  it.each([{ products: [], warnings: [] }, { products: [product], warnings: ['x'.repeat(201)] }, { products: [product], warnings: [], extra: true }])('rejects an empty or invalid extraction envelope: %j', async output => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(geminiOutput(output)))));
    expect((await handleAssistantRequest(request(), environment())).status).toBe(502);
  });
  it.each(['paid-model', 'gemini-3.5-pro', '', 'gemini-3.5-flash-lite:other'])('rejects unapproved model configuration before consuming counters: %s', async model => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { env, prepare } = countedEnvironment(); env.GEMINI_MODEL = model;
    expect((await handleAssistantRequest(request(), env)).status).toBe(503);
    expect(prepare).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not read input, consume counters or call Gemini for an already cancelled request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController(); controller.abort();
    const incoming = request(undefined, {}, controller.signal);
    const bodyReader = vi.spyOn(incoming.body!, 'getReader');
    const { env, prepare } = countedEnvironment();
    expect((await handleAssistantRequest(incoming, env)).status).toBe(504);
    expect(bodyReader).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('bounds a stalled request body and cancels its reader before any counters are spent', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const cancelBody = vi.fn();
    const incoming = request();
    Object.defineProperty(incoming, 'body', { value: new ReadableStream<Uint8Array>({ cancel: cancelBody }) });
    const { env, prepare } = countedEnvironment();
    const pending = handleAssistantRequest(incoming, env);
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await pending).status).toBe(504);
    expect(cancelBody).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds an uninterruptible DB wait and never resumes counters or Gemini after the deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    let finish!: (value: { requests: number }) => void;
    const first = vi.fn(() => new Promise<{ requests: number }>(resolve => { finish = resolve; }));
    const { env, prepare } = countedEnvironment(first);
    const pending = handleAssistantRequest(request(), env);
    await flush();
    expect(prepare).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await pending).status).toBe(504);
    finish({ requests: 1 });
    await flush();
    expect(prepare).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels during DB work without starting later counters or an upstream request', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    let finish!: (value: { requests: number }) => void;
    const first = vi.fn(() => new Promise<{ requests: number }>(resolve => { finish = resolve; }));
    const { env, prepare } = countedEnvironment(first);
    const controller = new AbortController();
    const pending = handleAssistantRequest(request(undefined, {}, controller.signal), env);
    await flush();
    expect(prepare).toHaveBeenCalledOnce();
    controller.abort(); controller.abort();
    expect((await pending).status).toBe(504);
    finish({ requests: 1 });
    await flush();
    expect(prepare).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('shares one 20-second budget across DB and fetch, even when fetch ignores its abort signal', async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32));
    const first = vi.fn(async () => ({ requests: 1 })).mockImplementationOnce(() => new Promise(resolve => { setTimeout(() => resolve({ requests: 1 }), 12_000); }));
    const { env, prepare } = countedEnvironment(first);
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined)); vi.stubGlobal('fetch', fetcher);
    const pending = handleAssistantRequest(request(), env);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledOnce();
    const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal;
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await pending).status).toBe(504);
    expect(signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also bounds reading an upstream body after response headers have arrived', async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32));
    const cancelBody = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ cancel: cancelBody })));
    vi.stubGlobal('fetch', fetcher);
    const pending = handleAssistantRequest(request(), environment());
    await flush();
    expect(fetcher).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await pending).status).toBe(504);
    expect(cancelBody).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([400, 401, 402, 403, 404])('handles unavailable free-tier/auth/model access (%s) without an upgrade suggestion or provider fallback', async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: status, status: 'PERMISSION_DENIED', message: 'PRIVATE request text and secret test-server-only-key; enable billing' } }), { status }));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request(), environment());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'assistant_unavailable' });
    expect(response.headers.get('Retry-After')).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([['42', '42'], ['not a delay', '60']])('keeps temporary provider rate limits retryable with sanitized Retry-After %s', async (delay, expected) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'PRIVATE upstream text' } }), { status: 429, headers: { 'Retry-After': delay } }));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request(), environment());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rate_limit' });
    expect(response.headers.get('Retry-After')).toBe(expected);
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
