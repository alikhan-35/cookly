/** Product labels retain cuts and varieties; broad legacy aliases are only for local matching. */
export function pantryProductName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  return name.charAt(0).toLocaleUpperCase('ru') + name.slice(1);
}
export function pantryProductKey(value: string): string { return pantryProductName(value).toLocaleLowerCase('ru').replace(/ё/g, 'е'); }
export function uniquePantryProducts(values: readonly string[], limit = 100): string[] {
  const names = new Map<string, string>();
  for (const value of values) { const name = pantryProductName(value); const key = pantryProductKey(name); if (key && !names.has(key)) names.set(key, name); }
  return [...names.values()].slice(0, limit);
}
