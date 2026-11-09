import { useId, useState } from 'react';
import Icon from '../ui/Icon';

/**
 * Inline "new file / new folder" row. `onSubmit(value)` returns an error string to keep the row open,
 * or null when the entry was created. Enter confirms, Escape cancels; the buttons are for touch screens.
 */
export default function NewEntryRow({ kind, depth, parentLabel, onSubmit, onCancel }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const messageId = useId();

  const submit = () => {
    const problem = onSubmit(value);
    if (problem) setError(problem);
  };

  return (
    <li className="sx-newrow" style={{ '--depth': depth }}>
      <div className="sx-newrow__line">
        <span className="sx-row__icon"><Icon name={kind === 'folder' ? 'folder' : 'file'} size={14} /></span>
        <input
          className={`sx-newrow__field${error ? ' is-invalid' : ''}`}
          type="text"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={120}
          value={value}
          placeholder={kind === 'folder' ? 'folder-name' : 'main.py'}
          aria-label={kind === 'folder' ? 'New folder name' : 'New file name'}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          enterKeyHint="done"
          onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
          }}
          onBlur={() => { if (!value.trim() && !error) onCancel(); }}
        />
        <button type="button" className="sx-newrow__btn" aria-label="Create" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
          <Icon name="check" size={14} />
        </button>
        <button type="button" className="sx-newrow__btn" aria-label="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={onCancel}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <p id={messageId} className={error ? 'sx-newrow__error' : 'sx-newrow__hint'} role={error ? 'alert' : undefined}>
        {error || (kind === 'folder'
          ? `In ${parentLabel}. A folder is shared once it holds a file.`
          : `In ${parentLabel}. Use / to create folders, e.g. utils/math.py`)}
      </p>
    </li>
  );
}
