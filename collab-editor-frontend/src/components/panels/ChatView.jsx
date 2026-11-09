import { useEffect, useRef, useState } from 'react';
import { safeColor } from '../../lib/colors';
import Icon from '../ui/Icon';

/** Room chat. Flat message list (not bubbles) so it stays compact next to the code. */
export default function ChatView({ messages, username, onSend, connected, active }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stick = useRef(true);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el || !active) return;
    const mine = messages[messages.length - 1]?.name === username;
    if (stick.current || mine) el.scrollTop = el.scrollHeight;
  }, [messages, active, username]);

  const submit = () => {
    if (!draft.trim() || !connected) return;
    if (onSend(draft)) {
      setDraft('');
      stick.current = true;
      if (inputRef.current) inputRef.current.style.height = '';
    }
  };

  const grow = (el) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  return (
    <div className="sx-chat">
      <div className="sx-chat__list" ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Room chat">
        {messages.length === 0 ? (
          <div className="sx-chat__empty">
            <Icon name="chat" size={20} />
            <p>No messages yet.</p>
            <p className="sx-chat__hint">Messages are visible to everyone in this room.</p>
          </div>
        ) : messages.map((msg, i) => {
          const prev = messages[i - 1];
          const grouped = prev && prev.name === msg.name && prev.time === msg.time; // same sender, same minute
          return (
            <div key={i} className={`sx-chat__msg${grouped ? ' is-grouped' : ''}`}>
              {!grouped && (
                <div className="sx-chat__head">
                  <span className="sx-chat__dot" style={{ background: safeColor(msg.color) }} aria-hidden="true" />
                  <span className="sx-chat__name">{msg.name === username ? 'You' : msg.name}</span>
                  <span className="sx-chat__time">{msg.time}</span>
                </div>
              )}
              <p className="sx-chat__text">{msg.text}</p>
            </div>
          );
        })}
      </div>

      <div className="sx-chat__composer">
        <textarea
          ref={inputRef}
          className="sx-chat__input"
          rows={1}
          maxLength={1000}
          value={draft}
          placeholder={connected ? 'Message the room' : 'Offline: messages can’t be sent'}
          aria-label="Message"
          enterKeyHint="send"
          onChange={(e) => { setDraft(e.target.value); grow(e.target); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }}
        />
        <button type="button" className="sx-btn sx-btn--primary sx-chat__send" onClick={submit} disabled={!draft.trim() || !connected} aria-label="Send message">
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  );
}
