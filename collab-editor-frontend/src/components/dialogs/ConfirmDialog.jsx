import { useRef } from 'react';
import Dialog from '../ui/Dialog';

/** Deleting a file removes it for everyone in the room, so it always asks first. */
export default function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      size="sm"
      initialFocusRef={cancelRef}
      footer={(
        <>
          <button type="button" ref={cancelRef} className="sx-btn sx-btn--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="sx-btn sx-btn--danger" onClick={onConfirm}>{confirmLabel}</button>
        </>
      )}
    >
      <div className="sx-confirm">{children}</div>
    </Dialog>
  );
}
