import { useId, useMemo, useState } from 'react';
import { EDIT_ONLY_LANGUAGES, RUNNABLE_LANGUAGES } from '../../config/languages';
import Icon from '../ui/Icon';
import LanguageIcon from './LanguageIcon';

function matches(lang, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase().replace(/^\./, '');
  return lang.label.toLowerCase().includes(q) || lang.id.includes(q) || lang.extensions.some((e) => e.startsWith(q));
}

/**
 * Searchable language list (combobox + listbox). Used in the side panel, the top-bar popover and the mobile sheet.
 *   value               current language id
 *   onSelect(id)        called when a language is chosen
 *   getDisabledReason   (id) => string | null; disabled rows explain why
 */
export default function LanguageList({ value, onSelect, getDisabledReason, autoFocus = false }) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const groups = useMemo(() => ([
    { title: 'Languages you can run', items: RUNNABLE_LANGUAGES.filter((l) => matches(l, query)) },
    { title: 'Other file types', items: EDIT_ONLY_LANGUAGES.filter((l) => matches(l, query)) },
  ]).filter((g) => g.items.length > 0), [query]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [cursorIndex, setCursorIndex] = useState(() => Math.max(0, flat.findIndex((l) => l.id === value)));
  const safeIndex = Math.min(cursorIndex, Math.max(0, flat.length - 1));
  const optionId = (id) => `${uid}-${id}`;

  const choose = (lang) => {
    if (getDisabledReason?.(lang.id)) return;
    onSelect(lang.id);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursorIndex(Math.min(flat.length - 1, safeIndex + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursorIndex(Math.max(0, safeIndex - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (flat[safeIndex]) choose(flat[safeIndex]);
    }
  };

  const activeId = flat[safeIndex] ? optionId(flat[safeIndex].id) : undefined;

  return (
    <div className="sx-lang">
      <div className="sx-lang__search">
        <Icon name="search" size={14} />
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-activedescendant={activeId}
          aria-label="Filter languages"
          placeholder="Filter languages"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursorIndex(0); }}
          onKeyDown={onKeyDown}
        />
      </div>

      <div className="sx-lang__list" id={`${uid}-list`} role="listbox" aria-label="Languages">
        {flat.length === 0 && <p className="sx-lang__empty">No language matches “{query}”.</p>}
        {groups.map((group) => (
          <div key={group.title} role="presentation">
            <div className="sx-lang__group" role="presentation">{group.title}</div>
            {group.items.map((lang) => {
              const reason = getDisabledReason?.(lang.id);
              const current = lang.id === value;
              const highlighted = flat[safeIndex]?.id === lang.id;
              return (
                <div
                  key={lang.id}
                  id={optionId(lang.id)}
                  role="option"
                  aria-selected={current}
                  aria-disabled={reason ? true : undefined}
                  className={`sx-lang__opt${current ? ' is-current' : ''}${highlighted ? ' is-cursor' : ''}${reason ? ' is-disabled' : ''}`}
                  title={reason || undefined}
                  onClick={() => choose(lang)}
                  onMouseMove={() => { if (!highlighted) setCursorIndex(flat.findIndex((l) => l.id === lang.id)); }}
                  ref={highlighted ? (el) => el?.scrollIntoView?.({ block: 'nearest' }) : undefined}
                >
                  <LanguageIcon id={lang.id} size={18} />
                  <span className="sx-lang__name">{lang.label}</span>
                  <span className="sx-lang__ext">.{lang.extensions[0]}</span>
                  <span className="sx-lang__check">{current && <Icon name="check" size={14} />}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
