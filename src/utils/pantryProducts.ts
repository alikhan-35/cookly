import { resolveIngredient } from '../catalog/ingredients';

/** Product labels retain the user's cuts and varieties. */
export function pantryProductName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  return name.charAt(0).toLocaleUpperCase('ru') + name.slice(1);
}
/** Explicit ingredient identities, with exact normalized text for unknown labels. */
export function matchingProductKey(value: string): string {
  const name = value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').replace(/[.,;:!?]+$/g, '').trim();
  if (!name) return '';
  const resolved = resolveIngredient(name);
  return resolved ? `id:${resolved.id}` : `name:${name}`;
}
export const pantryProductKey = matchingProductKey;
export function uniquePantryProducts(values: readonly string[], limit = 100): string[] {
  const names = new Map<string, string>();
  for (const value of values) { const name = pantryProductName(value); const key = pantryProductKey(name); if (key && !names.has(key)) names.set(key, name); }
  return [...names.values()].slice(0, limit);
}
