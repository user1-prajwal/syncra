import { useEffect, useState } from 'react';
import Icon from '../ui/Icon';

const TEXT = {
  reconnecting: 'Connection lost. Reconnecting… Edits you make meanwhile will sync once you are back.',
  connecting: 'Still connecting to the room…',
  'room-full': 'This room is full. Ask someone to leave, or open another room.',
  rejected: 'The server refused this connection (unknown room, or too many requests). Reload the page to try again.',
};

/** Appears only after the connection has been down for a moment, so short blips don't flash a banner. */
export default function ConnectionBanner({ connection, closeReason }) {
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);

  useEffect(() => {
    if (connection === 'connected' || connection === 'closed') return undefined;
    const timer = setTimeout(() => setWaitedLongEnough(true), 2500);
    return () => { clearTimeout(timer); setWaitedLongEnough(false); };
  }, [connection]);

  const show = connection === 'closed' || (connection !== 'connected' && waitedLongEnough);
  if (!show) return null;
  const text = connection === 'closed' ? TEXT[closeReason] ?? TEXT.rejected : TEXT[connection];
  return (
    <div className={`sx-banner${connection === 'closed' ? ' is-error' : ''}`} role="status">
      <Icon name="alert" size={14} />
      <span>{text}</span>
    </div>
  );
}