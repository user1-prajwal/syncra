import { BACKEND_URL } from '../constants';
import { getLanguage, isRunnable } from '../config/languages';
import { runJavaScript } from './runJavaScript';

const REMOTE_TIMEOUT_MS = 30_000;

/**
 * Runs ONE file. The request body is unchanged from the previous editor: POST /run { language, code }.
 * Multi-file projects need backend support (the server must receive every file and an entry point).
 *
 * @returns {Promise<{status:'success'|'error'|'unavailable', text:string}>}
 */
export async function runCode({ language, code, signal }) {
  if (!isRunnable(language)) {
    return { status: 'error', text: `${getLanguage(language).label} files can’t be run.` };
  }
  if (!code?.trim()) return { status: 'error', text: 'Nothing to run: this file is empty.' };
  if (language === 'javascript') return runJavaScript(code, { signal });

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REMOTE_TIMEOUT_MS);
  const onOuterAbort = () => timeout.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const res = await fetch(`${BACKEND_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, code }),
      signal: timeout.signal,
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON error page */ }
    if (!res.ok) {
      return { status: 'error', text: body?.error || body?.output || `The execution service answered with HTTP ${res.status}.` };
    }
    return { status: 'success', text: String(body?.output ?? '') };
  } catch (err) {
    if (signal?.aborted) return { status: 'error', text: 'Run cancelled.' };
    if (err?.name === 'AbortError') return { status: 'error', text: `No response after ${REMOTE_TIMEOUT_MS / 1000}s. The run was cancelled.` };
    return { status: 'unavailable', text: 'Code execution is unavailable right now.\nEditing, chat and collaboration are not affected.' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}
