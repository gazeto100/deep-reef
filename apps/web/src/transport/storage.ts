/** The part of window.localStorage the client uses (injectable for tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * window.localStorage if it can be used, otherwise null (blocked storage, some private
 * modes). Kept apart from the mock so that importing it does not pull the game engine
 * into the main bundle.
 */
export function browserStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage;
    const probe = '__deep_reef_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
