import { useState } from 'react';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';

/** Everyone in the room. Collaboration state belongs in a calm list, not scattered colour. */
export default function PeopleList({ people, username }) {
  const [copied, setCopied] = useState(false);
  const others = people.filter((p) => p.name !== username);
  const everyone = [{ name: username, color: people.find((p) => p.name === username)?.color, isYou: true }, ...others];

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="sx-people">
      <ul className="sx-people__list" aria-label="People in this room">
        {everyone.map((person) => (
          <li key={person.isYou ? '__you' : person.name} className="sx-person">
            <Avatar name={person.name} color={person.color} size={24} />
            <span className="sx-person__name">{person.name}</span>
            {person.isYou && <span className="sx-person__tag">You</span>}
          </li>
        ))}
      </ul>
      {others.length === 0 && <p className="sx-people__empty">You’re the only one here. Share the link to invite someone.</p>}
      <div className="sx-people__footer">
        <button type="button" className="sx-btn sx-btn--secondary" onClick={copyInvite}>
          <Icon name={copied ? 'check' : 'link'} size={14} />
          {copied ? 'Link copied' : 'Copy invite link'}
        </button>
      </div>
    </div>
  );
}
