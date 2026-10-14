import type { PostHog } from 'posthog-js';

export type AnalyticsConsent = 'unknown' | 'granted' | 'denied';
export type SearchSource = 'manual' | 'fridge';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

interface RecipeProperties {
  recipe_id: string;
  recipe_category: string;
  cooking_time: number;
  number_of_servings: number;
}

export interface AnalyticsEventMap {
  page_view: {
    path: string;
    device_type: DeviceType;
    referrer_host: string;
  };
  fridge_opened: Record<never, never>;
  fridge_item_added: Record<never, never>;
  fridge_item_removed: Record<never, never>;
  fridge_used_for_search: { search_source: 'fridge' };
  recommendations_requested: {
    search_source: SearchSource;
    cooking_time?: number;
  };
  recommendations_shown: {
    search_source: SearchSource;
    total_recommendations: number;
    cooking_time?: number;
  };
  recipe_opened: RecipeProperties & {
    missing_ingredients_count?: number;
    matched_ingredients_count?: number;
    recommendation_position?: number;
    search_source?: SearchSource;
    elapsed_time_ms?: number;
  };
  servings_selected: Pick<RecipeProperties, 'recipe_id' | 'recipe_category'> & {
      number_of_servings: number;
    };
  ingredient_substitution_selected: Pick<RecipeProperties, 'recipe_id' | 'recipe_category'>;
  mock_store_opened: Pick<RecipeProperties, 'recipe_id' | 'recipe_category'> & {
      missing_ingredients_count: number;
    };
  mock_checkout_completed: Pick<RecipeProperties, 'recipe_id' | 'recipe_category'> & {
      missing_ingredients_count: number;
    };
  cooking_started: RecipeProperties;
  cooking_step_changed: Pick<RecipeProperties, 'recipe_id' | 'recipe_category'> & {
      step_number: number;
    };
  cooking_completed: RecipeProperties & { elapsed_time_ms?: number };
  recipe_liked: Pick<RecipeProperties, 'recipe_id' | 'recipe_category'>;
  recipe_disliked: Pick<RecipeProperties, 'recipe_id' | 'recipe_category'>;
  recipe_usefulness_answered: Pick<RecipeProperties, 'recipe_id' | 'recipe_category'> & {
      answer: 'yes' | 'no';
      elapsed_time_ms?: number;
    };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;
export type AnalyticsEventProperties<Name extends AnalyticsEventName> = AnalyticsEventMap[Name];

type EventArguments<Name extends AnalyticsEventName> = keyof AnalyticsEventMap[Name] extends never
  ? [properties?: AnalyticsEventMap[Name]]
  : [properties: AnalyticsEventMap[Name]];

type SafeAnalyticsValue = string | number | boolean;
type SafeProperties = Record<string, SafeAnalyticsValue>;

export interface LocalAnalyticsEvent {
  name: AnalyticsEventName;
  timestamp: string;
  payload: SafeProperties;
}

export interface AnalyticsPreferences {
  configured: boolean;
  consent: AnalyticsConsent;
  participantCode: string;
  qaMode: boolean;
}

export const ANALYTICS_STORAGE_KEY = 'cookly:analytics';
export const ANALYTICS_CONSENT_STORAGE_KEY = 'cookly:analytics:consent';
export const ANALYTICS_PARTICIPANT_STORAGE_KEY = 'cookly:analytics:participant';
export const ANALYTICS_QA_STORAGE_KEY = 'cookly:analytics:qa';

const SELECTION_TIMER_KEY = 'cookly:analytics:selection-start';
const COOKING_TIMER_KEY = 'cookly:analytics:cooking-start';
const LAST_SELECTION_KEY = 'cookly:analytics:last-selection';
const MAX_LOCAL_EVENTS = 200;
const MAX_ONCE_KEYS = 500;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_TIMER_AGE_MS = 24 * 60 * 60 * 1000;
const PARTICIPANT_PATTERN = /^R\d{2,3}$/;

const EVENT_SCHEMA = {
  page_view: {
    allowed: ['path', 'device_type', 'referrer_host'],
    required: ['path', 'device_type', 'referrer_host'],
  },
  fridge_opened: { allowed: [], required: [] },
  fridge_item_added: { allowed: [], required: [] },
  fridge_item_removed: { allowed: [], required: [] },
  fridge_used_for_search: { allowed: ['search_source'], required: ['search_source'] },
  recommendations_requested: {
    allowed: ['search_source', 'cooking_time'],
    required: ['search_source'],
  },
  recommendations_shown: {
    allowed: ['search_source', 'total_recommendations', 'cooking_time'],
    required: ['search_source', 'total_recommendations'],
  },
  recipe_opened: {
    allowed: [
      'recipe_id', 'recipe_category', 'cooking_time', 'number_of_servings',
      'missing_ingredients_count', 'matched_ingredients_count',
      'recommendation_position', 'search_source', 'elapsed_time_ms',
    ],
    required: ['recipe_id', 'recipe_category', 'cooking_time', 'number_of_servings'],
  },
  servings_selected: {
    allowed: ['recipe_id', 'recipe_category', 'number_of_servings'],
    required: ['recipe_id', 'recipe_category', 'number_of_servings'],
  },
  ingredient_substitution_selected: {
    allowed: ['recipe_id', 'recipe_category'],
    required: ['recipe_id', 'recipe_category'],
  },
  mock_store_opened: {
    allowed: ['recipe_id', 'recipe_category', 'missing_ingredients_count'],
    required: ['recipe_id', 'recipe_category', 'missing_ingredients_count'],
  },
  mock_checkout_completed: {
    allowed: ['recipe_id', 'recipe_category', 'missing_ingredients_count'],
    required: ['recipe_id', 'recipe_category', 'missing_ingredients_count'],
  },
  cooking_started: {
    allowed: ['recipe_id', 'recipe_category', 'cooking_time', 'number_of_servings'],
    required: ['recipe_id', 'recipe_category', 'cooking_time', 'number_of_servings'],
  },
  cooking_step_changed: {
    allowed: ['recipe_id', 'recipe_category', 'step_number'],
    required: ['recipe_id', 'recipe_category', 'step_number'],
  },
  cooking_completed: {
    allowed: ['recipe_id', 'recipe_category', 'cooking_time', 'number_of_servings', 'elapsed_time_ms'],
    required: ['recipe_id', 'recipe_category', 'cooking_time', 'number_of_servings'],
  },
  recipe_liked: {
    allowed: ['recipe_id', 'recipe_category'],
    required: ['recipe_id', 'recipe_category'],
  },
  recipe_disliked: {
    allowed: ['recipe_id', 'recipe_category'],
    required: ['recipe_id', 'recipe_category'],
  },
  recipe_usefulness_answered: {
    allowed: ['recipe_id', 'recipe_category', 'answer', 'elapsed_time_ms'],
    required: ['recipe_id', 'recipe_category', 'answer'],
  },
} as const satisfies Record<AnalyticsEventName, {
  allowed: readonly string[];
  required: readonly string[];
}>;

const configured = readEnvironmentFlag(import.meta.env.VITE_ANALYTICS_ENABLED)
  && isProjectApiKey(import.meta.env.VITE_POSTHOG_KEY)
  && isValidPostHogHost(import.meta.env.VITE_POSTHOG_HOST);
const automaticQaMode = isAutomaticQaMode();
const listeners = new Set<() => void>();
const inMemoryOnceKeys = new Set<string>();

let posthogClient: PostHog | null = null;
let posthogPromise: Promise<PostHog | null> | null = null;
let analyticsEpoch = 0;
let suppressUntilHomeNavigation = false;
let lastPageViewKey: string | null = null;
let selectionStartedAt: number | null = null;
let cookingStarted: { recipeId: string; startedAt: number } | null = null;
let preferencesSnapshot: AnalyticsPreferences = readPreferences();

applyQueryPreferences();

/** Idempotent browser startup hook. PostHog is loaded only after explicit consent. */
export function initializeAnalytics(): void {
  applyQueryPreferences();
  refreshPreferences();
  if (preferencesSnapshot.consent === 'granted' && !preferencesSnapshot.qaMode) {
    void ensurePostHog();
  }
}

export function getAnalyticsPreferences(): AnalyticsPreferences {
  return preferencesSnapshot;
}

export function subscribeAnalyticsPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAnalyticsConsent(value: AnalyticsConsent | boolean): void {
  const consent: AnalyticsConsent = typeof value === 'boolean'
    ? (value ? 'granted' : 'denied')
    : value;
  if (consent !== preferencesSnapshot.consent) analyticsEpoch += 1;

  if (consent === 'unknown') removeLocalValue(ANALYTICS_CONSENT_STORAGE_KEY);
  else writeLocalValue(ANALYTICS_CONSENT_STORAGE_KEY, consent);

  refreshPreferences();
  if (consent === 'granted') {
    void ensurePostHog();
  } else {
    posthogClient?.opt_out_capturing();
  }
}

/** Stores only anonymous research codes such as R01. Returns false for an invalid code. */
export function setParticipantCode(value: string | null): boolean {
  const normalized = value?.trim().toUpperCase() ?? '';
  const previousCode = preferencesSnapshot.participantCode;
  if (!normalized) {
    removeLocalValue(ANALYTICS_PARTICIPANT_STORAGE_KEY);
    refreshPreferences();
    if (previousCode) resetAnalyticsSession();
    return true;
  }
  if (!PARTICIPANT_PATTERN.test(normalized)) return false;
  writeLocalValue(ANALYTICS_PARTICIPANT_STORAGE_KEY, normalized);
  refreshPreferences();
  if (previousCode !== normalized) resetAnalyticsSession();
  return true;
}

/** Explicit QA mode is persisted. localhost and `?qa=1` always remain QA sessions. */
export function setQaMode(value: boolean): void {
  const previousQaMode = preferencesSnapshot.qaMode;
  if (value) writeLocalValue(ANALYTICS_QA_STORAGE_KEY, '1');
  else removeLocalValue(ANALYTICS_QA_STORAGE_KEY);
  refreshPreferences();
  if (preferencesSnapshot.qaMode !== previousQaMode) analyticsEpoch += 1;
  if (preferencesSnapshot.qaMode) posthogClient?.opt_out_capturing();
  else if (preferencesSnapshot.consent === 'granted') void ensurePostHog();
}

/** Clears the browser-only audit trail. It cannot delete events already received by PostHog. */
export function clearLocalAnalyticsHistory(): void {
  removeLocalValue(ANALYTICS_STORAGE_KEY);
}

/** Starts a fresh anonymous analytics session while preserving consent and participant code. */
export function resetAnalyticsSession(): void {
  analyticsEpoch += 1;
  for (const key of [SELECTION_TIMER_KEY, COOKING_TIMER_KEY, LAST_SELECTION_KEY]) {
    removeSessionValue(key);
  }
  inMemoryOnceKeys.clear();
  selectionStartedAt = null;
  cookingStarted = null;
  lastPageViewKey = null;
  posthogClient?.reset(true);
}

/** Keeps the local history empty while the old page unmounts after Cookly reset. */
export function resetAnalyticsForCooklyData(): void {
  suppressUntilHomeNavigation = true;
  removeLocalValue(ANALYTICS_PARTICIPANT_STORAGE_KEY);
  refreshPreferences();
  resetAnalyticsSession();
  clearLocalAnalyticsHistory();
}

export function trackEvent<Name extends AnalyticsEventName>(
  name: Name,
  ...args: EventArguments<Name>
): void {
  captureEvent(name, (args[0] ?? {}) as AnalyticsEventMap[Name]);
}

export function trackEventOnce<Name extends AnalyticsEventName>(
  name: Name,
  dedupeKey: string,
  ...args: EventArguments<Name>
): void {
  if (preferencesSnapshot.consent !== 'granted') return;
  const safeKey = `${name}:${hashString(dedupeKey)}`;
  if (hasOnceKey(safeKey)) return;
  if (captureEvent(name, (args[0] ?? {}) as AnalyticsEventMap[Name])) rememberOnceKey(safeKey);
}

/** Tracks HashRouter route changes without query strings or duplicate StrictMode mounts. */
export function trackPageView(pathname: string, navigationKey = pathname): boolean {
  const path = normalizePath(pathname);
  const pageViewKey = `${path}:${navigationKey}`;
  if (suppressUntilHomeNavigation) {
    if (path === '/') {
      suppressUntilHomeNavigation = false;
      lastPageViewKey = pageViewKey;
    }
    return false;
  }
  if (pageViewKey === lastPageViewKey) return false;
  if (preferencesSnapshot.consent !== 'granted') return false;

  if (captureEvent('page_view', {
    path,
    device_type: getDeviceType(),
    referrer_host: getReferrerHost(),
  })) {
    lastPageViewKey = pageViewKey;
    return true;
  }
  return false;
}

function captureEvent<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventMap[Name],
): boolean {
  if (typeof window === 'undefined' || preferencesSnapshot.consent !== 'granted'
    || suppressUntilHomeNavigation) return false;

  const safeProperties = sanitizeProperties(name, properties as Record<string, unknown>);
  if (!hasRequiredProperties(name, safeProperties)) return false;

  const now = Date.now();
  const derivedProperties = addTimingProperties(name, safeProperties, now);
  const payload: SafeProperties = {
    ...derivedProperties,
    ...(preferencesSnapshot.participantCode
      ? { participant_code: preferencesSnapshot.participantCode }
      : {}),
    ...(preferencesSnapshot.qaMode ? { qa_mode: true } : {}),
  };

  storeLocalEvent({ name, timestamp: new Date(now).toISOString(), payload });
  if (!preferencesSnapshot.qaMode) {
    const captureEpoch = analyticsEpoch;
    void ensurePostHog().then(client => {
      if (!client || captureEpoch !== analyticsEpoch
        || getAnalyticsPreferences().consent !== 'granted'
        || getAnalyticsPreferences().qaMode) return;
      client.capture(name, payload);
    });
  }
  return true;
}

function addTimingProperties(
  name: AnalyticsEventName,
  properties: SafeProperties,
  now: number,
): SafeProperties {
  if (name === 'recommendations_requested') {
    selectionStartedAt = now;
    writeSessionValue(SELECTION_TIMER_KEY, String(now));
  }

  if (name === 'recipe_opened' && properties.elapsed_time_ms === undefined) {
    const startedAt = readTimestamp(SELECTION_TIMER_KEY, selectionStartedAt);
    removeSessionValue(SELECTION_TIMER_KEY);
    selectionStartedAt = null;
    if (startedAt !== null) {
      const elapsed = validElapsed(now - startedAt);
      if (elapsed !== null) {
        properties = { ...properties, elapsed_time_ms: elapsed };
        const recipeId = typeof properties.recipe_id === 'string' ? properties.recipe_id : '';
        writeSessionValue(LAST_SELECTION_KEY, JSON.stringify({ recipeId, elapsed }));
      }
    }
  }

  if (name === 'recipe_usefulness_answered' && properties.elapsed_time_ms === undefined) {
    const lastSelection = readJson<{ recipeId?: unknown; elapsed?: unknown }>(sessionStorageOrNull(), LAST_SELECTION_KEY);
    if (lastSelection
      && lastSelection.recipeId === properties.recipe_id
      && typeof lastSelection.elapsed === 'number'
      && validElapsed(lastSelection.elapsed) !== null) {
      properties = { ...properties, elapsed_time_ms: Math.round(lastSelection.elapsed) };
    }
  }

  if (name === 'cooking_started') {
    const recipeId = typeof properties.recipe_id === 'string' ? properties.recipe_id : '';
    cookingStarted = { recipeId, startedAt: now };
    writeSessionValue(COOKING_TIMER_KEY, JSON.stringify(cookingStarted));
  }

  if (name === 'cooking_completed' && properties.elapsed_time_ms === undefined) {
    const stored = readJson<{ recipeId?: unknown; startedAt?: unknown }>(sessionStorageOrNull(), COOKING_TIMER_KEY);
    const active = stored
      && typeof stored.recipeId === 'string'
      && typeof stored.startedAt === 'number'
      ? { recipeId: stored.recipeId, startedAt: stored.startedAt }
      : cookingStarted;
    if (active?.recipeId === properties.recipe_id) {
      const elapsed = validElapsed(now - active.startedAt);
      if (elapsed !== null) properties = { ...properties, elapsed_time_ms: elapsed };
    }
    cookingStarted = null;
    removeSessionValue(COOKING_TIMER_KEY);
  }

  return properties;
}

function sanitizeProperties(name: AnalyticsEventName, properties: Record<string, unknown>): SafeProperties {
  const allowed = new Set<string>(EVENT_SCHEMA[name].allowed);
  const result: SafeProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.has(key)) continue;
    const sanitized = sanitizeProperty(key, value);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function sanitizeProperty(key: string, value: unknown): SafeAnalyticsValue | undefined {
  if (key === 'answer') return value === 'yes' || value === 'no' ? value : undefined;
  if (key === 'search_source') return value === 'manual' || value === 'fridge' ? value : undefined;
  if (key === 'device_type') return value === 'mobile' || value === 'tablet' || value === 'desktop' ? value : undefined;
  if (key === 'path') return typeof value === 'string' ? normalizePath(value) : undefined;
  if (key === 'referrer_host') return typeof value === 'string' && isSafeHost(value) ? value.slice(0, 120) : undefined;
  if (key === 'recipe_id') return typeof value === 'string' && /^[a-z0-9_-]{1,80}$/i.test(value) ? value : undefined;
  if (key === 'recipe_category') return safeLabel(value);
  if (isNumericProperty(key)) return safeNumber(key, value);
  return undefined;
}

function safeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, 80);
  if (!normalized || /@|https?:\/\/|\b\d{7,}\b/i.test(normalized)) return undefined;
  return normalized;
}

function safeNumber(key: string, value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  const limits: Record<string, number> = {
    cooking_time: 24 * 60,
    number_of_servings: 100,
    missing_ingredients_count: 1000,
    matched_ingredients_count: 1000,
    recommendation_position: 1000,
    total_recommendations: 1000,
    step_number: 1000,
    elapsed_time_ms: MAX_TIMER_AGE_MS,
  };
  const limit = limits[key];
  if (limit === undefined || value > limit) return undefined;
  return Math.round(value);
}

function isNumericProperty(key: string): boolean {
  return [
    'cooking_time', 'number_of_servings', 'missing_ingredients_count',
    'matched_ingredients_count', 'recommendation_position',
    'total_recommendations', 'step_number', 'elapsed_time_ms',
  ].includes(key);
}

function hasRequiredProperties(name: AnalyticsEventName, properties: SafeProperties): boolean {
  return EVENT_SCHEMA[name].required.every(key => Object.hasOwn(properties, key));
}

function storeLocalEvent(event: LocalAnalyticsEvent): void {
  const storage = localStorageOrNull();
  if (!storage) return;
  const existing = readJson<unknown[]>(storage, ANALYTICS_STORAGE_KEY);
  const history = Array.isArray(existing) ? existing.flatMap(sanitizeStoredEvent) : [];
  try {
    storage.setItem(
      ANALYTICS_STORAGE_KEY,
      JSON.stringify([...history.slice(-(MAX_LOCAL_EVENTS - 1)), event]),
    );
  } catch {
    // Analytics must never interrupt the cooking flow.
  }
}

function sanitizeStoredEvent(value: unknown): LocalAnalyticsEvent[] {
  if (!value || typeof value !== 'object') return [];
  const candidate = value as { name?: unknown; timestamp?: unknown; payload?: unknown; properties?: unknown };
  if (typeof candidate.name !== 'string' || !isEventName(candidate.name)) return [];
  if (typeof candidate.timestamp !== 'string' || !Number.isFinite(Date.parse(candidate.timestamp))) return [];
  const raw = candidate.payload ?? candidate.properties;
  const properties = raw && typeof raw === 'object'
    ? sanitizeProperties(candidate.name, raw as Record<string, unknown>)
    : {};
  const participantCode = raw && typeof raw === 'object'
    ? (raw as Record<string, unknown>).participant_code
    : undefined;
  if (typeof participantCode === 'string' && PARTICIPANT_PATTERN.test(participantCode)) {
    properties.participant_code = participantCode;
  }
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).qa_mode === true) {
    properties.qa_mode = true;
  }
  if (!hasRequiredProperties(candidate.name, properties)) return [];
  return [{ name: candidate.name, timestamp: new Date(candidate.timestamp).toISOString(), payload: properties }];
}

function isEventName(value: string): value is AnalyticsEventName {
  return Object.hasOwn(EVENT_SCHEMA, value);
}

async function ensurePostHog(): Promise<PostHog | null> {
  if (!configured || preferencesSnapshot.consent !== 'granted' || preferencesSnapshot.qaMode) return null;
  if (posthogClient) {
    posthogClient.opt_in_capturing({ captureEventName: false });
    posthogClient.stopSessionRecording();
    return posthogClient;
  }
  if (posthogPromise) return posthogPromise;

  posthogPromise = import('posthog-js')
    .then(module => {
      if (preferencesSnapshot.consent !== 'granted' || preferencesSnapshot.qaMode) {
        posthogPromise = null;
        return null;
      }
      const client = module.default;
      client.init(import.meta.env.VITE_POSTHOG_KEY!.trim(), {
        api_host: import.meta.env.VITE_POSTHOG_HOST!.trim(),
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_capture_url_hashes: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
        respect_dnt: true,
        save_campaign_params: false,
        save_referrer: false,
        request_batching: false,
        cross_subdomain_cookie: false,
        person_profiles: 'never',
        persistence: 'localStorage',
        get_current_url: getSanitizedCurrentUrl,
        before_send: event => {
          if (!event || getAnalyticsPreferences().consent !== 'granted'
            || getAnalyticsPreferences().qaMode || !isEventName(event.event)) return null;
          const raw = event.properties as Record<string, unknown>;
          const safe = sanitizeProperties(event.event, raw);
          if (!hasRequiredProperties(event.event, safe)) return null;
          const participantCode = raw.participant_code;
          if (typeof participantCode === 'string' && PARTICIPANT_PATTERN.test(participantCode)) {
            safe.participant_code = participantCode;
          }
          for (const key of ['distinct_id', '$device_id', '$session_id', '$window_id', '$insert_id']) {
            const value = raw[key];
            if (typeof value === 'string' && /^[a-z0-9_-]{1,128}$/i.test(value)) safe[key] = value;
          }
          safe.token = import.meta.env.VITE_POSTHOG_KEY!.trim();
          return { ...event, properties: safe };
        },
      });
      client.opt_in_capturing({ captureEventName: false });
      client.stopSessionRecording();
      posthogClient = client;
      return client;
    })
    .catch(() => {
      posthogPromise = null;
      return null;
    });
  return posthogPromise;
}

function readPreferences(): AnalyticsPreferences {
  const storedConsent = readLocalValue(ANALYTICS_CONSENT_STORAGE_KEY);
  const consent: AnalyticsConsent = storedConsent === 'granted' || storedConsent === 'denied'
    ? storedConsent
    : 'unknown';
  const participant = readLocalValue(ANALYTICS_PARTICIPANT_STORAGE_KEY)?.toUpperCase() ?? null;
  return {
    configured,
    consent,
    participantCode: participant && PARTICIPANT_PATTERN.test(participant) ? participant : '',
    qaMode: automaticQaMode || readLocalValue(ANALYTICS_QA_STORAGE_KEY) === '1',
  };
}

function refreshPreferences(): void {
  const next = readPreferences();
  if (next.configured === preferencesSnapshot.configured
    && next.consent === preferencesSnapshot.consent
    && next.participantCode === preferencesSnapshot.participantCode
    && next.qaMode === preferencesSnapshot.qaMode) return;
  preferencesSnapshot = next;
  listeners.forEach(listener => listener());
}

function applyQueryPreferences(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const currentRelativeUrl = `${url.pathname}${url.search}${url.hash}`;
  let participant = url.searchParams.get('participant') ?? url.searchParams.get('participant_code');
  let qa = url.searchParams.get('qa');
  url.searchParams.delete('participant');
  url.searchParams.delete('participant_code');
  url.searchParams.delete('qa');

  const hashValue = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashQueryIndex = hashValue.indexOf('?');
  if (hashQueryIndex >= 0) {
    const hashPath = hashValue.slice(0, hashQueryIndex);
    const hashParams = new URLSearchParams(hashValue.slice(hashQueryIndex + 1));
    participant ??= hashParams.get('participant') ?? hashParams.get('participant_code');
    qa ??= hashParams.get('qa');
    hashParams.delete('participant');
    hashParams.delete('participant_code');
    hashParams.delete('qa');
    const cleanHashQuery = hashParams.toString();
    url.hash = `#${hashPath}${cleanHashQuery ? `?${cleanHashQuery}` : ''}`;
  }

  if (participant) setParticipantCode(participant);
  if (qa === '1') setQaMode(true);
  else if (qa === '0') setQaMode(false);

  const cleanRelativeUrl = `${url.pathname}${url.search}${url.hash}`;
  if (cleanRelativeUrl !== currentRelativeUrl) {
    window.history.replaceState(window.history.state, '', cleanRelativeUrl);
  }
}

function isAutomaticQaMode(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '[::1]';
}

function readEnvironmentFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function isProjectApiKey(value: string | undefined): boolean {
  return /^phc_[a-z0-9]+$/i.test(value?.trim() ?? '');
}

function isValidPostHogHost(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch {
    return false;
  }
}

function getSanitizedCurrentUrl(): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.search = '';
  if (url.hash) url.hash = `#${normalizePath(url.hash.slice(1))}`;
  return url.toString();
}

function normalizePath(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0]?.trim() || '/';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const path = withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  if (['/', '/fridge', '/recipes'].includes(path)) return path;
  if (/^\/recipe\/[^/]+$/i.test(path)) return '/recipe/:id';
  if (/^\/cook\/[^/]+$/i.test(path)) return '/cook/:id';
  return '/other';
}

function getDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  const mobileUa = /Android|iPhone|iPod|Mobile/i.test(window.navigator.userAgent);
  if (width < 768 || mobileUa) return 'mobile';
  if (width < 1100 || /iPad|Tablet/i.test(window.navigator.userAgent)) return 'tablet';
  return 'desktop';
}

function getReferrerHost(): string {
  if (typeof document === 'undefined' || !document.referrer) return 'direct';
  try {
    return new URL(document.referrer).hostname.toLowerCase().slice(0, 120) || 'direct';
  } catch {
    return 'direct';
  }
}

function isSafeHost(value: string): boolean {
  return value === 'direct' || /^[a-z0-9.-]{1,120}$/i.test(value);
}

function validElapsed(value: number): number | null {
  return Number.isFinite(value) && value >= 0 && value <= MAX_TIMER_AGE_MS
    ? Math.round(value)
    : null;
}

function readTimestamp(key: string, fallback: number | null): number | null {
  const stored = Number(readSessionValue(key));
  return Number.isFinite(stored) && stored > 0 ? stored : fallback;
}

function hasOnceKey(key: string): boolean {
  return inMemoryOnceKeys.has(key);
}

function rememberOnceKey(key: string): void {
  inMemoryOnceKeys.add(key);
  if (inMemoryOnceKeys.size > MAX_ONCE_KEYS) {
    const oldestKey = inMemoryOnceKeys.values().next().value;
    if (oldestKey) inMemoryOnceKeys.delete(oldestKey);
  }
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function localStorageOrNull(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

function sessionStorageOrNull(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}

function readJson<T>(storage: Storage | null, key: string): T | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    return value === null ? null : JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function readLocalValue(key: string): string | null {
  try { return localStorageOrNull()?.getItem(key) ?? null; }
  catch { return null; }
}

function writeLocalValue(key: string, value: string): void {
  try { localStorageOrNull()?.setItem(key, value); }
  catch { /* Preferences remain usable for the current page. */ }
}

function removeLocalValue(key: string): void {
  try { localStorageOrNull()?.removeItem(key); }
  catch { /* Analytics must never interrupt the app. */ }
}

function readSessionValue(key: string): string | null {
  try { return sessionStorageOrNull()?.getItem(key) ?? null; }
  catch { return null; }
}

function writeSessionValue(key: string, value: string): void {
  try { sessionStorageOrNull()?.setItem(key, value); }
  catch { /* In-memory timers remain available until reload. */ }
}

function removeSessionValue(key: string): void {
  try { sessionStorageOrNull()?.removeItem(key); }
  catch { /* Analytics must never interrupt the app. */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if ([
      ANALYTICS_CONSENT_STORAGE_KEY,
      ANALYTICS_PARTICIPANT_STORAGE_KEY,
      ANALYTICS_QA_STORAGE_KEY,
    ].includes(event.key ?? '')) {
      const previous = preferencesSnapshot;
      refreshPreferences();
      if (previous.participantCode !== preferencesSnapshot.participantCode) resetAnalyticsSession();
      else if (previous.consent !== preferencesSnapshot.consent || previous.qaMode !== preferencesSnapshot.qaMode) {
        analyticsEpoch += 1;
      }
      if (preferencesSnapshot.consent !== 'granted' || preferencesSnapshot.qaMode) {
        posthogClient?.opt_out_capturing();
      } else {
        void ensurePostHog();
      }
    }
  });
}

// Exported for dashboard documentation and deterministic tests.
export const MVP_SELECTION_TARGET_MS = FIVE_MINUTES_MS;
