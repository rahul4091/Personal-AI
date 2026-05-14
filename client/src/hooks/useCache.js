import { useMemo } from 'react';

export function useCache(defaultKey, ttlMs) {
  return useMemo(() => {
    function get(key = defaultKey) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { data, at } = JSON.parse(raw);
        if (Date.now() - at > ttlMs) return null;
        return data;
      } catch {
        return null;
      }
    }

    function set(data, key = defaultKey) {
      try {
        localStorage.setItem(key, JSON.stringify({ data, at: Date.now() }));
      } catch {}
    }

    function clear(key = defaultKey) {
      localStorage.removeItem(key);
    }

    return { get, set, clear };
  }, [defaultKey, ttlMs]);
}
