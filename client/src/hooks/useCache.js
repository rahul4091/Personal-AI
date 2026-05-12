// Simple localStorage cache with TTL.
// get() returns cached data if still fresh, null if stale/missing.
// set(data) writes data + timestamp.
// clear() removes the entry.

export function useCache(key, ttlMs) {
  function get() {
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

  function set(data) {
    try {
      localStorage.setItem(key, JSON.stringify({ data, at: Date.now() }));
    } catch {}
  }

  function clear() {
    localStorage.removeItem(key);
  }

  return { get, set, clear };
}
