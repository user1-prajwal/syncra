import { useCallback, useEffect, useRef, useState } from 'react';
import { runCode } from '../lib/runCode';

const IDLE = { status: 'idle', text: '', fileName: '', durationMs: null };

export function useCodeRunner() {
  const [run, setRun] = useState(IDLE);
  const abortRef = useRef(null);

  const execute = useCallback(async ({ fileName, language, code }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = performance.now();
    setRun({ status: 'running', text: '', fileName, durationMs: null });

    const result = await runCode({ language, code, signal: controller.signal });
    if (abortRef.current !== controller) return; // superseded or unmounted
    setRun({ ...result, fileName, durationMs: Math.round(performance.now() - startedAt) });
  }, []);

  const clear = useCallback(() => setRun(IDLE), []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { run, isRunning: run.status === 'running', execute, clear };
}
