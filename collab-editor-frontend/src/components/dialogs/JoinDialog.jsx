import { useRef, useState } from 'react';
import Dialog from '../ui/Dialog';
import Icon from '../ui/Icon';

/**
 * Shown over the live editor until a display name is chosen.
 * The name is used for presence, cursor labels and chat.
 */
export default function JoinDialog({ roomId, username, setUsername, onJoin, error }) {
  const inputRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const canJoin = username.trim().length > 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomId || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  const submit = (event) => {
    event.preventDefault();
    if (canJoin) onJoin();
  };

  return (
    <Dialog title="Join room" dismissible={false} initialFocusRef={inputRef} size="sm">
      <form className="sx-join" onSubmit={submit}>
        <p className="sx-join__lead">Choose the name collaborators will see on your cursor and in chat.</p>

        <div className="sx-join__room">
          <div>
            <div className="sx-join__label">Room code</div>
            <div className="sx-join__code">{roomId}</div>
          </div>
          <button type="button" className="sx-btn sx-btn--secondary" onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <label className="sx-field">
          <span className="sx-field__label">Display name</span>
          <input
            ref={inputRef}
            className={`sx-input${error ? ' is-invalid' : ''}`}
            type="text"
            maxLength={20}
            autoComplete="nickname"
            autoCapitalize="words"
            spellCheck={false}
            value={username}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'sx-join-error' : undefined}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        {error && <p id="sx-join-error" className="sx-field__error" role="alert">{error}</p>}

        <button type="submit" className="sx-btn sx-btn--primary sx-btn--block" disabled={!canJoin}>Join session</button>
      </form>
    </Dialog>
  );
}
