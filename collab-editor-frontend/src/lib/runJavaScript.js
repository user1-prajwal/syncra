/*
 * Runs JavaScript in a throw-away Web Worker instead of `new Function` on the page:
 *  - a collaborator's `while(true){}` can be stopped (the worker is terminated after the timeout),
 *  - the code has no access to the page's DOM, cookies or localStorage.
 */

const WORKER_SOURCE = String.raw`
const lines = [];
const show = (v) => {
  if (typeof v === 'string') return v;
  if (typeof v === 'function') return String(v);
  try {
    if (typeof v !== 'object' || v === null) return String(v);
    const compact = JSON.stringify(v);
    return compact.length <= 80 ? compact : JSON.stringify(v, null, 2);
  } catch (e) { return String(v); }
};
for (const level of ['log', 'info', 'debug', 'warn', 'error']) {
  const tag = level === 'warn' || level === 'error' ? level.toUpperCase() + ': ' : '';
  console[level] = (...args) => { lines.push(tag + args.map(show).join(' ')); };
}
self.onmessage = (event) => {
  try {
    new Function(event.data)();
    self.postMessage({ ok: true, out: lines.join('\n') });
  } catch (err) {
    const message = err && err.message ? (err.name || 'Error') + ': ' + err.message : String(err);
    self.postMessage({ ok: false, out: lines.join('\n'), error: message });
  }
};
`;

const MAX_OUTPUT_CHARS = 200_000;
const clip = (text) => (text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… output truncated` : text);

export function runJavaScript(code, { timeoutMs = 5000, signal } = {}) {
  return new Promise((resolve) => {
    let worker;
    let url;
    let timer;

    const finish = (result) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(result);
    };
    const onAbort = () => finish({ status: 'error', text: 'Run cancelled.' });

    try {
      url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      worker = new Worker(url);
    } catch {
      finish({ status: 'unavailable', text: 'This browser blocked the sandbox that runs JavaScript.' });
      return;
    }

    worker.onmessage = ({ data }) => {
      const out = clip(String(data.out ?? ''));
      if (data.ok) finish({ status: 'success', text: out });
      else finish({ status: 'error', text: [out, data.error].filter(Boolean).join('\n') });
    };
    worker.onerror = (event) => finish({ status: 'error', text: event.message || 'The script failed to start.' });
    timer = setTimeout(
      () => finish({ status: 'error', text: `Stopped after ${timeoutMs / 1000}s. Check for an infinite loop.` }),
      timeoutMs,
    );
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.postMessage(code);
  });
}
