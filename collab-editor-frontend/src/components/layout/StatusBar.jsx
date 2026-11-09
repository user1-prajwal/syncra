import { memo, useEffect, useState } from 'react';
import { getLanguage } from '../../config/languages';

const CONNECTION_TEXT = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
};

/** The caret position lives here (not in the page) so moving the cursor re-renders nothing else. */
function StatusBar({ editor, connection, userCount, file }) {
  const [caret, setCaret] = useState(null);

  useEffect(() => {
    if (!editor) return undefined;
    const read = () => {
      const p = editor.getPosition();
      if (p) setCaret({ line: p.lineNumber, col: p.column });
    };
    read();
    const sub = editor.onDidChangeCursorPosition(read);
    return () => sub.dispose();
  }, [editor]);

  return (
    <footer className="sx-statusbar">
      <span className={`sx-status__item sx-status__conn is-${connection}`}>
        <span className="sx-room__dot" data-state={connection} aria-hidden="true" />
        {CONNECTION_TEXT[connection]}
      </span>
      <span className="sx-status__item">{userCount} online</span>
      <span className="sx-status__spacer" />
      {file && <span className="sx-status__item sx-status__path" title={file.name}>{file.name}</span>}
      {editor && caret && <span className="sx-status__item">Ln {caret.line}, Col {caret.col}</span>}
      {file && <span className="sx-status__item">{getLanguage(file.language).label}</span>}
    </footer>
  );
}

export default memo(StatusBar);