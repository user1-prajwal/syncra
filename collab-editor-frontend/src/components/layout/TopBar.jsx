import { memo, useState } from 'react';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';

const CONNECTION_LABEL = {
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  closed: 'Disconnected',
};

function RoomChip({ roomId, connection, onCopied }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomId || '');
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };
  return (
    <button type="button" className="sx-room" onClick={copy} aria-label={`Room ${roomId}. ${CONNECTION_LABEL[connection]}. Copy room code`} data-tip="Copy room code" data-tip-pos="bottom">
      <span className="sx-room__dot" data-state={connection} aria-hidden="true" />
      <span className="sx-room__code">{roomId}</span>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
    </button>
  );
}

function Presence({ people, onClick }) {
  const visible = people.slice(0, 4);
  const extra = people.length - visible.length;
  return (
    <button type="button" className="sx-presence" onClick={onClick} aria-label={`${people.length} ${people.length === 1 ? 'person' : 'people'} in this room`} data-tip="People in this room" data-tip-pos="bottom">
      {visible.map((p) => <Avatar key={p.name} name={p.name} color={p.color} size={22} />)}
      {extra > 0 && <span className="sx-presence__more">+{extra}</span>}
    </button>
  );
}

/**
 * run = { canRun, blockedReason, isRunning, onRun, shortcut }
 * `languageControl` is rendered on tablet/desktop only (phones use the chip in the tab strip).
 */
function TopBar({
  layout, roomId, connection, people, theme, onToggleTheme, onShowPeople, onCopied,
  languageControl, onImport, onExport, rightOpen, onToggleRight, unread, run,
}) {
  const mobile = layout === 'mobile';
  const runTip = run.isRunning ? 'Running…' : run.canRun ? `Run active file (${run.shortcut})` : run.blockedReason;

  return (
    <header className="sx-topbar">
      <img className="sx-logo" src="/syncra-icon.svg" alt="Syncra" height="20" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      <RoomChip roomId={roomId} connection={connection} onCopied={onCopied} />
      <Presence people={people} onClick={onShowPeople} />

      <div className="sx-topbar__spacer" />

      {!mobile && languageControl}
      <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} tipPos="bottom" onClick={onToggleTheme} />
      <IconButton icon="upload" label="Import files" tipPos="bottom" onClick={onImport} />
      <IconButton icon="download" label="Export all files as zip" tip="Export as zip" tipPos="bottom" onClick={onExport} />

      {!mobile && (
        <>
          <IconButton icon="panelRight" label={rightOpen ? 'Hide output and chat' : 'Show output and chat'} tipPos="bottom" active={rightOpen} aria-pressed={rightOpen} onClick={onToggleRight}>
            {!rightOpen && unread > 0 && <span className="sx-badge-dot" aria-label={`${unread} unread messages`} />}
          </IconButton>
          <span className="sx-run-wrap" data-tip={runTip} data-tip-pos="bottom-end">
            <button type="button" className="sx-btn sx-btn--primary" onClick={run.onRun} disabled={!run.canRun || run.isRunning} aria-keyshortcuts="Control+Enter Meta+Enter">
              <Icon name={run.isRunning ? 'spinner' : 'play'} size={13} className={run.isRunning ? 'sx-spin' : undefined} />
              {run.isRunning ? 'Running' : 'Run'}
            </button>
          </span>
        </>
      )}
    </header>
  );
}

export default memo(TopBar);
