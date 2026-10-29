interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): { value: T; hit: true } | { value: null; hit: false } {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) this.store.delete(key);
      return { value: null, hit: false };
    }
    return { value: entry.value, hit: true };
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  clear(): void {
    this.store.clear();
  }
}
