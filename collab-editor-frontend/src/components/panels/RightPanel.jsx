import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';
import ChatView from './ChatView';
import OutputView from './OutputView';

/**
 * Output and chat share one panel (tabs) instead of a floating chat box on top of the output.
 * Both stay mounted so the chat draft and scroll position survive switching tabs.
 */
export default function RightPanel({ tab, onTabChange, run, onClearOutput, unread, messages, username, onSend, connected, onClose }) {
  const tabs = [
    { id: 'output', label: 'Output', icon: 'terminal' },
    { id: 'chat', label: 'Chat', icon: 'chat' },
  ];

  const onKeyDown = (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = tab === 'output' ? 'chat' : 'output';
    onTabChange(next);
    document.getElementById(`sx-rtab-${next}`)?.focus();
  };

  return (
    <div className="sx-right-panel">
      <div className="sx-right-panel__tabs" role="tablist" aria-label="Output and chat" onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`sx-rtab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`sx-rpane-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`sx-right-panel__tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
            {t.id === 'chat' && unread > 0 && <span className="sx-count" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</span>}
          </button>
        ))}
        {onClose && (
          <span className="sx-right-panel__close">
            <IconButton icon="close" label="Close panel" tip="Close panel" tipPos="left" size={14} onClick={onClose} />
          </span>
        )}
      </div>

      <div className="sx-right-panel__pane" id="sx-rpane-output" role="tabpanel" aria-labelledby="sx-rtab-output" hidden={tab !== 'output'}>
        <OutputView run={run} onClear={onClearOutput} />
      </div>
      <div className="sx-right-panel__pane" id="sx-rpane-chat" role="tabpanel" aria-labelledby="sx-rtab-chat" hidden={tab !== 'chat'}>
        <ChatView messages={messages} username={username} onSend={onSend} connected={connected} active={tab === 'chat'} />
      </div>
    </div>
  );
}
