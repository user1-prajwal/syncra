import { useState } from 'react';
import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';

const STATUS_LABEL = {
  idle: 'No output yet',
  running: 'Running',
  success: 'Finished',
  error: 'Failed',
  unavailable: 'Unavailable',
};

function formatDuration(ms) {
  if (ms == null) return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Result of the last run. Presentational. */
export default function OutputView({ run, onClear, onCopied }) {
  const [copied, setCopied] = useState(false);
  const hasText = run.status !== 'idle' && run.text.length > 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(run.text);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: nothing useful to do */ }
  };

  return (
    <div className="sx-output">
      <div className="sx-output__bar">
        <span className={`sx-output__status is-${run.status}`}>
          {run.status === 'running'
            ? <Icon name="spinner" size={13} className="sx-spin" />
            : <span className="sx-output__dot" aria-hidden="true" />}
          {STATUS_LABEL[run.status]}
        </span>
        {run.fileName && run.status !== 'idle' && (
          <span className="sx-output__meta" title={run.fileName}>
            {run.fileName}{run.durationMs != null ? ` · ${formatDuration(run.durationMs)}` : ''}
          </span>
        )}
        <span className="sx-output__actions">
          {hasText && <IconButton icon={copied ? 'check' : 'copy'} label="Copy output" tip={copied ? 'Copied' : 'Copy output'} tipPos="bottom" size={14} onClick={copy} />}
          {run.status !== 'idle' && run.status !== 'running' && <IconButton icon="trash" label="Clear output" tip="Clear" tipPos="bottom" size={14} onClick={onClear} />}
        </span>
      </div>

      <div className="sx-output__body">
        {run.status === 'idle' ? (
          <div className="sx-output__empty">
            <p>Run the active file to see its output here.</p>
            <p className="sx-output__tip">Shortcut: <kbd>Ctrl</kbd> + <kbd>Enter</kbd> inside the editor. Only the active file runs.</p>
          </div>
        ) : (
          <pre className={`sx-output__pre is-${run.status}`} role="log" aria-live="polite">
            {run.status === 'running' ? 'Running…' : (run.text || 'Finished with no output.')}
          </pre>
        )}
      </div>
    </div>
  );
}
