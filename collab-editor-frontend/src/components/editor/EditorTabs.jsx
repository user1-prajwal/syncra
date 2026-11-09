import { memo, useEffect, useRef } from 'react';
import Icon from '../ui/Icon';
import LanguageIcon from '../language/LanguageIcon';
import { baseName, dirName } from '../../lib/filePaths';

/**
 * Open files. Closing a tab hides it for this person only; deleting a file is done in the explorer.
 * `trailing` holds the language button on phones (the explorer rail is not available there).
 */
function EditorTabs({ tabs, activeId, onSelect, onClose, trailing }) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const onKeyDown = (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = tabs.findIndex((t) => t.id === activeId);
    const next = tabs[index + (event.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    onSelect(next.id);
    requestAnimationFrame(() => document.getElementById(`sx-tab-${next.id}`)?.focus());
  };

  return (
    <div className="sx-tabs">
      <div className="sx-tabs__scroll" role="tablist" aria-label="Open files" onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const dir = dirName(tab.name);
          return (
            <div key={tab.id} className={`sx-tab${active ? ' is-active' : ''}`} ref={active ? activeRef : undefined}>
              <button
                id={`sx-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className="sx-tab__main"
                title={tab.name}
                onClick={() => onSelect(tab.id)}
              >
                <LanguageIcon id={tab.language} size={14} />
                <span className="sx-tab__label">{baseName(tab.name)}</span>
                {dir && <span className="sx-tab__dir">{dir}</span>}
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="sx-tab__close"
                  aria-label={`Close ${tab.name}`}
                  tabIndex={-1}
                  onClick={() => onClose(tab.id)}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {trailing && <div className="sx-tabs__trailing">{trailing}</div>}
    </div>
  );
}

export default memo(EditorTabs);
