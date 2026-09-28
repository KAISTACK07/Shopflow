// JSON in localStorage, guarded: storage can be missing (tests, some embedded views) or throw (private mode, blocked
// site data). Every feature built on it (wishlist, sizes, theme) keeps working for the current visit either way.

function resolve(storage?: Storage): Storage | null {
  try {
    return storage ?? globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readJson<T>(key: string, fallback: T, storage?: Storage): T {
  try {
    const raw = resolve(storage)?.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown, storage?: Storage): void {
  try {
    resolve(storage)?.setItem(key, JSON.stringify(value))
  } catch {
    // unavailable or full: the in-memory state still works until the page is closed
  }
}
