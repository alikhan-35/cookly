export function readJson<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value === null ? fallback : value as T;
  } catch { return fallback; }
}

export function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ }
}

/** Only Cookly owns these keys; unrelated browser data is never touched. */
export function clearCooklyData(): boolean {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('cookly:') || key.startsWith('cookly_'));
    keys.forEach(key => localStorage.removeItem(key));
    return true;
  } catch { return false; }
}
