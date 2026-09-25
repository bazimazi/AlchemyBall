/**
 * Versioned, corruption-resistant local persistence.
 *
 * Layout: `<key>` holds the current envelope, `<key>.bak` the previous good one.
 * Envelope: { v: schemaVersion, sum: checksum(data JSON), data }.
 * On load we try main → backup → fresh profile, running migrations from the stored version.
 * Writes go to backup-then-main so an interrupted write always leaves one valid copy.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export function checksum(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export interface SaveSlotOptions<T> {
  key: string;
  version: number;
  /** migrations[n] upgrades data from version n to n+1. */
  migrations: Record<number, Migration>;
  fresh: () => T;
  /** Fill missing fields after migration so older saves always satisfy the current shape. */
  normalize: (data: Partial<T>) => T;
}

export type LoadSource = 'main' | 'backup' | 'fresh';

export class SaveSlot<T> {
  lastLoadSource: LoadSource = 'fresh';
  lastError?: string;

  constructor(private store: KeyValueStore, private opts: SaveSlotOptions<T>) {}

  load(): T {
    for (const [src, key] of [['main', this.opts.key], ['backup', this.opts.key + '.bak']] as const) {
      try {
        const raw = this.store.getItem(key);
        if (!raw) continue;
        const data = this.decode(raw);
        this.lastLoadSource = src;
        return data;
      } catch (e) {
        this.lastError = `${src}: ${(e as Error).message}`;
      }
    }
    this.lastLoadSource = 'fresh';
    return this.opts.fresh();
  }

  save(data: T): void {
    const json = JSON.stringify(data);
    const env = JSON.stringify({ v: this.opts.version, sum: checksum(json), data: JSON.parse(json) });
    const prev = this.store.getItem(this.opts.key);
    if (prev) {
      try {
        this.decode(prev);
        this.store.setItem(this.opts.key + '.bak', prev);
      } catch {
        /* never back up a corrupt copy */
      }
    }
    this.store.setItem(this.opts.key, env);
  }

  wipe(): void {
    this.store.removeItem(this.opts.key);
    this.store.removeItem(this.opts.key + '.bak');
  }

  private decode(raw: string): T {
    const env = JSON.parse(raw) as { v?: number; sum?: string; data?: Record<string, unknown> };
    if (typeof env !== 'object' || env === null || typeof env.v !== 'number' || !env.data) throw new Error('malformed envelope');
    if (env.sum !== checksum(JSON.stringify(env.data))) throw new Error('checksum mismatch');
    if (env.v > this.opts.version) throw new Error(`save from newer version ${env.v}`);
    let data = env.data;
    for (let v = env.v; v < this.opts.version; v++) {
      const m = this.opts.migrations[v];
      if (!m) throw new Error(`no migration from v${v}`);
      data = m(data);
    }
    return this.opts.normalize(data as Partial<T>);
  }
}
