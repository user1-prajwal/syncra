import { useEffect, useState } from 'react';

export function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback; // storage disabled (private mode) or corrupt JSON
  }
}

export function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled: preferences just won't persist */
  }
}

/** useState whose value is an object persisted to localStorage and merged over `defaults`. */
export function useStoredState(key, defaults) {
  const [value, setValue] = useState(() => ({ ...defaults, ...readStored(key, {}) }));
  useEffect(() => { writeStored(key, value); }, [key, value]);
  return [value, setValue];
}
