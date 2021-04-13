import { Html } from "./html";

export namespace RenderCache {
  export type CacheFile = {
    type: string;
    content: string;
    sha256: string;
  };

  export type RenderCacheStrategy = () => {
    get: (path: string) => CacheFile | undefined;
    allKeys: () => string[];
    has: (path: string) => boolean;
    set: (path: string, cache: CacheFile) => Operations;
    getAllVendor: () => string[];
  };

  export type Operations = ReturnType<RenderCacheStrategy>;

  const InMemory: RenderCacheStrategy = () => {
    const cache = new Map<string, CacheFile>();

    const allKeys = () => [...cache.keys()];
    const x: Operations = {
      allKeys,
      getAllVendor: () => allKeys().filter((x) => x.startsWith(Html.DependencyPath)),
      has: (s) => cache.has(s),
      get: (s) => cache.get(s),
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
