import { useSyncExternalStore } from 'react';
import {
  getAnalyticsPreferences,
  subscribeAnalyticsPreferences,
  type AnalyticsPreferences,
} from '../services/analytics';

const serverSnapshot: AnalyticsPreferences = {
  configured: false,
  consent: 'unknown',
  participantCode: '',
  qaMode: false,
};

export function useAnalyticsPreferences(): AnalyticsPreferences {
  return useSyncExternalStore(
    subscribeAnalyticsPreferences,
    getAnalyticsPreferences,
    () => serverSnapshot,
  );
}
