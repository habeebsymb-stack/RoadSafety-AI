// Road Safety AI — In-Memory TTL Cache Service
// Prevents redundant API calls for same location/route within TTL window

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class TTLCache {
  private store = new Map<string, CacheEntry<unknown>>();
  
  // Default TTL: 5 minutes
  private readonly DEFAULT_TTL_MS = 5 * 60 * 1000;

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number = this.DEFAULT_TTL_MS): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  // Show current cache size (for debugging)
  size(): number {
    return this.store.size;
  }

  // Purge all expired entries
  purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

// Singleton cache instance shared across all tools
export const cache = new TTLCache();

// Helper: build a normalized cache key for a location
export function locationCacheKey(prefix: string, lat: number, lng: number): string {
  // Round to 2 decimal places (~1km precision)
  return `${prefix}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
}

// Helper: build a route cache key
export function routeCacheKey(origin: string, destination: string): string {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '_');
  return `route:${normalize(origin)}:${normalize(destination)}`;
}
