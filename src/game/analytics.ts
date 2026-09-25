import type { KeyValueStore } from './save';

/**
 * Privacy-first, opt-in analytics. Only aggregate counters are kept, locally, and nothing is
 * sent anywhere. The Settings screen can export them for playtest sessions. Designed so a
 * network sink can be added later behind the same opt-in without touching gameplay code.
 */
export class Analytics {
  private counters: Record<string, number> = {};
  enabled = false;
  private key = 'alchemyball.analytics';

  constructor(private store: KeyValueStore) {
    try {
      this.counters = JSON.parse(store.getItem(this.key) ?? '{}');
    } catch {
      this.counters = {};
    }
  }

  track(name: string, detail?: string): void {
    if (!this.enabled) return;
    const k = detail ? `${name}:${detail}` : name;
    this.counters[k] = (this.counters[k] ?? 0) + 1;
  }

  flush(): void {
    if (this.enabled) this.store.setItem(this.key, JSON.stringify(this.counters));
  }

  export(): string {
    return JSON.stringify(this.counters, null, 2);
  }

  reset(): void {
    this.counters = {};
    this.store.removeItem(this.key);
  }
}
