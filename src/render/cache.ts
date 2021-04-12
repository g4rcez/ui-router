export namespace RenderCache {
  export type CacheFile = {
    type: string;
    content: string;
    sha256: string;
  };

  export type RenderCacheStrategy = () => {
    get: (path: string) => CacheFile;
    allKeys: () => string[];
    allFiles: () => CacheFile[];
    has: (path: string) => boolean;
    set: (path: string, cache: CacheFile) => Operations;
  };

  export type Operations = ReturnType<RenderCacheStrategy>;

  const InMemory: RenderCacheStrategy = () => {
    const cache = new Map<string, CacheFile>();
    const x: Operations = {
      allKeys: () => [...cache.keys()],
      allFiles: () => [...cache.values()],
      has: (path) => cache.has(path),
      get: (path) => cache.get(path),
      set: (path, saved) => {
        cache.set(path, saved);
        return x;
      },
    };
    return x;
  };

  const cacheStrategies: Record<string, RenderCacheStrategy> = {
    "in-memory": InMemory,
  };

  export const getCacheStrategy = (name: string) => cacheStrategies[name]?.() ?? InMemory();
}
