import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAssistantRequest, type AssistantEnvironment } from './fridge-assistant';

const origin = 'https://alikhan-35.github.io';
const request = (body: unknown = { text: 'У меня 2 яйца' }, headers = {}): Request => new Request('https://assistant.example/api/fridge/parse', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
function environment(allow = true): AssistantEnvironment {
  return { OPENAI_API_KEY: 'test-server-only-key', OPENAI_MODEL: 'test-extractor', DB: { prepare: () => ({ bind() { return this; }, async first<T>() { return (allow ? { requests: 1 } : null) as T | null; } }) } };
}
afterEach(() => { vi.unstubAllGlobals(); });
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
    expect((await handleAssistantRequest(request(), { OPENAI_API_KEY: 'test' })).status).toBe(503);
    const response = await handleAssistantRequest(request(), environment(false));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('extracts validated data, limits model output and never sends the secret to the client', async () => {
    const extracted = { products: [{ name: 'Яйца', amount: 2, unit: 'шт.', category: 'Яйца', note: null }], warnings: [] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(extracted) }] }] })));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleAssistantRequest(request(), environment());
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    const text = await response.text();
    expect(text).not.toContain('test-server-only-key');
    expect(JSON.parse(text).products[0]).toMatchObject({ name: 'Яйца', amount: 2 });
    const body = JSON.parse(String(fetcher.mock.calls[0][1].body));
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.max_output_tokens).toBeLessThanOrEqual(2500);
    expect(body.input).toBe('У меня 2 яйца');
  });
  it('rejects incomplete, refused and invalid model output instead of returning unverified foods', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: 'incomplete', output: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ products: [{ name: 'Яйца', amount: -2, unit: 'шт.', category: 'Яйца', note: null }], warnings: [] }) }] }] })));
    vi.stubGlobal('fetch', fetcher);
    for (let i = 0; i < 3; i++) expect((await handleAssistantRequest(request(), environment())).status).toBe(502);
  });
});
