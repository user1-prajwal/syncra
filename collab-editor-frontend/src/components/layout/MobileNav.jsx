import { memo } from 'react';
import Icon from '../ui/Icon';

/**
 * Phone navigation: Files | Output | Run | Chat | People.
 * While the soft keyboard is open it collapses to Run / Output / Done so the editor keeps its space.
 */
function MobileNav({ keyboardOpen, onFiles, onOutput, onRun, onChat, onPeople, onDismissKeyboard, canRun, isRunning, unread, peopleCount }) {
  const runButton = (
    <button type="button" className="sx-mobilenav__run" onClick={onRun} disabled={!canRun || isRunning} aria-label={isRunning ? 'Running' : 'Run active file'}>
      <Icon name={isRunning ? 'spinner' : 'play'} size={18} className={isRunning ? 'sx-spin' : undefined} />
      <span>{isRunning ? 'Running' : 'Run'}</span>
    </button>
  );

  if (keyboardOpen) {
    return (
      <nav className="sx-mobilenav is-compact" aria-label="Quick actions">
        {runButton}
        <button type="button" className="sx-mobilenav__item" onClick={onOutput}><Icon name="terminal" size={18} /><span>Output</span></button>
        <button type="button" className="sx-mobilenav__item" onMouseDown={(e) => e.preventDefault()} onClick={onDismissKeyboard}><Icon name="keyboard" size={18} /><span>Hide keyboard</span></button>
      </nav>
    );
  }

  return (
    <nav className="sx-mobilenav" aria-label="Workspace">
      <button type="button" className="sx-mobilenav__item" onClick={onFiles}><Icon name="files" size={20} /><span>Files</span></button>
      <button type="button" className="sx-mobilenav__item" onClick={onOutput}><Icon name="terminal" size={20} /><span>Output</span></button>
      {runButton}
      <button type="button" className="sx-mobilenav__item" onClick={onChat}>
        <Icon name="chat" size={20} />
        <span>Chat</span>
        {unread > 0 && <span className="sx-count sx-count--float" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      <button type="button" className="sx-mobilenav__item" onClick={onPeople}>
        <Icon name="users" size={20} />
        <span>People</span>
        {peopleCount > 1 && <span className="sx-count sx-count--float is-neutral" aria-hidden="true">{peopleCount}</span>}
      </button>
    </nav>
  );
}

export default memo(MobileNav);
