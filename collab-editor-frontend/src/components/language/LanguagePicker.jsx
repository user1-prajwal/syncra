import { useCallback, useRef, useState } from 'react';
import { getLanguage } from '../../config/languages';
import { useDismiss } from '../../hooks/useOverlay';
import Icon from '../ui/Icon';
import LanguageIcon from './LanguageIcon';
import LanguageList from './LanguageList';

/** The button that shows the current language. Used on its own on phones (opens a sheet). */
export function LanguageTrigger({ languageId, onClick, expanded, compact = false }) {
  const lang = getLanguage(languageId);
  return (
    <button
      type="button"
      className={`sx-lang-trigger${compact ? ' is-compact' : ''}`}
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={`Language: ${lang.label}. Change language`}
    >
      <LanguageIcon id={languageId} size={16} />
      <span className="sx-lang-trigger__label">{lang.label}</span>
      <Icon name="chevronDown" size={14} />
    </button>
  );
}

/** Trigger + popover (desktop and tablet top bar). */
export default function LanguagePicker({ languageId, onSelect, getDisabledReason }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close);

  return (
    <div className="sx-popover-anchor" ref={wrapRef}>
      <LanguageTrigger languageId={languageId} expanded={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="sx-popover" role="dialog" aria-label="Select language">
          <LanguageList
            value={languageId}
            autoFocus
            getDisabledReason={getDisabledReason}
            onSelect={(id) => { onSelect(id); close(); }}
          />
        </div>
      )}
    </div>
  );
}
