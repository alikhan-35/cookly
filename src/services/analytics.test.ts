import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  stopSessionRecording: vi.fn(),
  capture: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: posthogMock }));

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function stubBrowser(address: string) {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const browser = {
    location: new URL(address),
    localStorage,
    sessionStorage,
    innerWidth: 1280,
    navigator: { userAgent: 'Test browser' },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, relativeUrl: string) => {
        browser.location = new URL(relativeUrl, browser.location.origin);
      },
    },
    addEventListener: vi.fn(),
  };
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', { referrer: '' });
  return { browser, localStorage };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('VITE_ANALYTICS_ENABLED', 'true');
  vi.stubEnv('VITE_POSTHOG_KEY', 'phc_testproject');
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('anonymous analytics', () => {
  it('requires consent, removes research params, and deduplicates only the same navigation', async () => {
    const { browser, localStorage } = stubBrowser('https://cookly.test/?participant=R01&qa=1#/fridge?qa=0');
    const analytics = await import('./analytics');

    expect(browser.location.href).toBe('https://cookly.test/#/fridge');
    expect(analytics.getAnalyticsPreferences()).toMatchObject({ participantCode: 'R01', qaMode: true, consent: 'unknown' });
    analytics.trackEvent('fridge_item_added');
    expect(localStorage.getItem(analytics.ANALYTICS_STORAGE_KEY)).toBeNull();

    analytics.setAnalyticsConsent('granted');
    expect(analytics.trackPageView('/fridge', 'first')).toBe(true);
    expect(analytics.trackPageView('/fridge', 'first')).toBe(false);
    expect(analytics.trackPageView('/fridge', 'second')).toBe(true);
    expect(analytics.trackPageView('/recipe/private@example.com', 'third')).toBe(true);
    const events = JSON.parse(localStorage.getItem(analytics.ANALYTICS_STORAGE_KEY) ?? '[]') as Array<{ name: string; payload: Record<string, unknown> }>;
    expect(events.map(event => event.name)).toEqual(['page_view', 'page_view', 'page_view']);
    expect(events[0].payload).toMatchObject({ path: '/fridge', participant_code: 'R01', qa_mode: true });
    expect(events[2].payload.path).toBe('/recipe/:id');
    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it('keeps only approved event properties before PostHog sends an event', async () => {
    stubBrowser('https://cookly.test/#/recipe/abc');
    const analytics = await import('./analytics');
    analytics.setAnalyticsConsent('granted');
    await vi.waitFor(() => expect(posthogMock.init).toHaveBeenCalledOnce());

    const config = posthogMock.init.mock.calls[0]?.[1] as {
      before_send: (event: { event: string; properties: Record<string, unknown> }) =>
        { properties: Record<string, unknown> } | null;
    };
    const sanitized = config.before_send({
      event: 'recipe_opened',
      properties: {
        recipe_id: 'abc',
        recipe_category: 'Ужин',
        cooking_time: 30,
        number_of_servings: 2,
        distinct_id: 'anon-123',
        $session_id: 'session-123',
        $current_url: 'https://cookly.test/?email=private@example.com',
        $referrer: 'https://search.test/?q=allergies',
        ingredient_names: ['secret'],
      },
    });

    expect(sanitized?.properties).toEqual({
      recipe_id: 'abc', recipe_category: 'Ужин', cooking_time: 30,
      number_of_servings: 2, distinct_id: 'anon-123',
      $session_id: 'session-123', token: 'phc_testproject',
    });
    expect(config.before_send({ event: '$autocapture', properties: {} })).toBeNull();
  });

  it('does not send a queued event after the participant changes', async () => {
    stubBrowser('https://cookly.test/#/fridge');
    const analytics = await import('./analytics');
    analytics.setParticipantCode('R01');
    analytics.setAnalyticsConsent('granted');
    analytics.trackEvent('fridge_item_added');
    analytics.setParticipantCode('R02');

    await vi.waitFor(() => expect(posthogMock.init).toHaveBeenCalledOnce());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it('leaves local history empty through the reset navigation', async () => {
    const { localStorage } = stubBrowser('https://cookly.test/?qa=1#/recipe/abc');
    const analytics = await import('./analytics');
    analytics.setAnalyticsConsent('granted');
    analytics.trackPageView('/recipe/abc', 'old-page');
    analytics.resetAnalyticsForCooklyData();
    analytics.trackEvent('fridge_item_added');
    expect(analytics.trackPageView('/', 'reset-home')).toBe(false);
    expect(localStorage.getItem(analytics.ANALYTICS_STORAGE_KEY)).toBeNull();
    expect(analytics.trackPageView('/fridge', 'next-page')).toBe(true);
    expect(JSON.parse(localStorage.getItem(analytics.ANALYTICS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });
});
