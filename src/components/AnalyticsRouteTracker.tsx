import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAnalyticsPreferences } from '../hooks/useAnalyticsPreferences';
import { trackEvent, trackPageView } from '../services/analytics';

export function AnalyticsRouteTracker() {
  const { pathname, key } = useLocation();
  const { consent } = useAnalyticsPreferences();

  useEffect(() => {
    if (trackPageView(pathname, key) && pathname === '/fridge') trackEvent('fridge_opened');
  }, [consent, key, pathname]);

  return null;
}
