// Cache helper with fallback to in-memory store if Redis is absent
const inMemoryCache = new Map<string, { value: string; expiresAt: number }>();

export async function getCachedOrFetch<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = inMemoryCache.get(key);
  if (cached && now < cached.expiresAt) {
    try {
      return JSON.parse(cached.value) as T;
    } catch {
      // Ignore parse error and refetch
    }
  }

  const data = await fetcher();
  try {
    inMemoryCache.set(key, {
      value: JSON.stringify(data),
      expiresAt: now + ttlSeconds * 1000
    });
  } catch (e) {
    console.error("[Cache] write error:", e);
  }
  return data;
}

// Ces deux fonctions restent asynchrones dans leur signature : le cache est en mémoire
// aujourd’hui, mais l’appelant doit pouvoir les attendre sans changer d’API le jour où
// un Redis passera derrière. Elles ne sont pas déclarées `async` faute d’`await` à faire.
export function invalidateCache(pattern: string): Promise<void> {
  const prefix = pattern.replace(/\*/g, "");
  for (const key of inMemoryCache.keys()) {
    if (key.startsWith(prefix)) {
      inMemoryCache.delete(key);
    }
  }
  return Promise.resolve();
}

export function deleteCache(key: string): Promise<void> {
  inMemoryCache.delete(key);
  return Promise.resolve();
}
