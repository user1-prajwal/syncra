import { memo } from 'react';
import { getLanguage } from '../../config/languages';
import LanguageIcon from '../language/LanguageIcon';
import Icon from '../ui/Icon';

/** Left rail: choose which panel the side dock shows. Clicking the open item collapses the dock. */
function ActivityBar({ activePanel, onSelect, activeLanguage, peopleCount }) {
  const language = getLanguage(activeLanguage);
  const items = [
    { id: 'files', label: 'Files', tip: 'Files', icon: <Icon name="files" size={20} /> },
    { id: 'languages', label: `Language: ${language.label}`, tip: `Language: ${language.label}`, icon: <LanguageIcon id={activeLanguage} size={20} /> },
    { id: 'people', label: `People (${peopleCount})`, tip: 'People', icon: <Icon name="users" size={20} />, badge: peopleCount > 1 ? peopleCount : 0 },
  ];

  return (
    <nav className="sx-activity" aria-label="Side panels">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sx-activity__item${activePanel === item.id ? ' is-active' : ''}`}
          aria-label={item.label}
          aria-pressed={activePanel === item.id}
          data-tip={item.tip}
          data-tip-pos="right"
          onClick={() => onSelect(activePanel === item.id ? null : item.id)}
        >
          {item.icon}
          {item.badge > 0 && <span className="sx-activity__badge" aria-hidden="true">{item.badge > 9 ? '9+' : item.badge}</span>}
        </button>
      ))}
    </nav>
  );
}

export default memo(ActivityBar);
