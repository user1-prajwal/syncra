import { useCallback, useEffect, useRef, useState } from 'react';

const LIFETIME_MS = 4500;

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** notify('Saved') or notify('Could not save', 'error') */
  const notify = useCallback((message, tone = 'info') => {
    counter.current += 1;
    const id = counter.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]); // never more than 3 on screen
    timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME_MS));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return { toasts, notify, dismiss };
}
