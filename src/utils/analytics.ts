export type AnalyticsEventName =
  | 'ingredient_added'
  | 'recommendations_requested'
  | 'recommendations_shown'
  | 'recipe_opened'
  | 'cook_confirmed';
  
export type ExtendedAnalyticsEventName = AnalyticsEventName
  | 'profile_updated'
  | 'servings_selected'
  | 'ingredient_substitution_viewed'
  | 'cooking_started'
  | 'cooking_step_changed'
  | 'cooking_completed'
  | 'recipe_liked'
  | 'recipe_disliked'
  | 'fridge_opened' | 'fridge_item_added' | 'fridge_item_updated' | 'fridge_item_removed' | 'fridge_used_for_search'
  | 'nutrition_viewed' | 'substitution_selected'
  | 'mock_store_opened' | 'mock_store_item_added' | 'mock_store_checkout_started' | 'mock_store_order_completed'
  | 'test_data_reset';

type AnalyticsPayload = Record<string, unknown>;

export interface AnalyticsEvent {
  name: ExtendedAnalyticsEventName;
  timestamp: string;
  payload?: AnalyticsPayload;
}

export const ANALYTICS_STORAGE_KEY = 'cookly:analytics';
const MAX_EVENTS = 200;

/** UI callers stay independent of the storage/provider used for product analytics. */
export function trackEvent(name: ExtendedAnalyticsEventName, payload?: AnalyticsPayload): void {
  const event: AnalyticsEvent = { name, timestamp: new Date().toISOString(), ...(payload ? { payload } : {}) };

  try {
    if (typeof window === 'undefined') return;
    let events: unknown[] = [];
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(ANALYTICS_STORAGE_KEY) ?? '[]');
      if (Array.isArray(stored)) events = stored;
    } catch {
      // Reset malformed saved data on the next event; blocked storage is caught below.
    }
    window.localStorage.setItem(
      ANALYTICS_STORAGE_KEY,
      JSON.stringify([...events.slice(-(MAX_EVENTS - 1)), event]),
    );
  } catch {
    // Blocked storage, invalid JSON or a full quota must never interrupt cooking.
  }
}
