import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

let sqlite: typeof import('node:sqlite') | undefined;
try { sqlite = await import('node:sqlite'); }
catch { /* Older Node runtimes can still run the remaining application tests. */ }

const source = await readFile(new URL('./fridge-assistant.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('./migrations/0001-intake-limits.sql', import.meta.url), 'utf8');

function openProductionLimiter() {
  if (!sqlite) throw new Error('node:sqlite is unavailable');
  // Exercise the exact statement used by the handler, never a rewritten test SQL.
  const sql = source.match(/\.prepare\(`(INSERT INTO intake_limits[\s\S]*?)`\)/)?.[1];
  if (!sql) throw new Error('Could not find the production intake_limits UPSERT');
  const database = new sqlite.DatabaseSync(':memory:');
  try {
    database.exec(migration);
    return {
      database,
      consume: database.prepare(sql),
      inspect: database.prepare('SELECT period, requests FROM intake_limits WHERE bucket = ?'),
    };
  } catch (error) { database.close(); throw error; }
}

describe.skipIf(!sqlite)('production SQLite rate-limit statement', () => {
  it.each([3, 20, 200])('admits exactly %i requests in one fixed window', cap => {
    const { database, consume, inspect } = openProductionLimiter();
    try {
      let accepted = 0;
      for (let index = 0; index < cap + 10; index++) {
        if (consume.get('test-bucket', 100, cap)) accepted++;
      }
      expect(accepted).toBe(cap);
      expect(inspect.get('test-bucket')).toEqual({ period: 100, requests: cap });
    } finally { database.close(); }
  });

  it('rejects a stale window before the new window is full without resetting its counter', () => {
    const { database, consume, inspect } = openProductionLimiter();
    try {
      expect(consume.get('test-bucket', 100, 3)).toEqual({ requests: 1 });
      expect(consume.get('test-bucket', 100, 3)).toEqual({ requests: 2 });
      expect(consume.get('test-bucket', 101, 3)).toEqual({ requests: 1 });
      expect(consume.get('test-bucket', 100, 3)).toBeUndefined();
      expect(consume.get('test-bucket', 99, 3)).toBeUndefined();
      expect(inspect.get('test-bucket')).toEqual({ period: 101, requests: 1 });
      expect(consume.get('test-bucket', 101, 3)).toEqual({ requests: 2 });
      expect(consume.get('test-bucket', 101, 3)).toEqual({ requests: 3 });
      expect(consume.get('test-bucket', 101, 3)).toBeUndefined();
    } finally { database.close(); }
  });

  it('cannot reopen an exhausted window through a delayed request and resets only forwards', () => {
    const { database, consume, inspect } = openProductionLimiter();
    try {
      for (let index = 0; index < 3; index++) expect(consume.get('test-bucket', 101, 3)).toBeDefined();
      expect(consume.get('test-bucket', 101, 3)).toBeUndefined();
      expect(consume.get('test-bucket', 100, 3)).toBeUndefined();
      expect(consume.get('test-bucket', 101, 3)).toBeUndefined();
      expect(inspect.get('test-bucket')).toEqual({ period: 101, requests: 3 });
      expect(consume.get('test-bucket', 102, 3)).toEqual({ requests: 1 });
      expect(inspect.get('test-bucket')).toEqual({ period: 102, requests: 1 });
    } finally { database.close(); }
  });
});
