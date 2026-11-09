import { useEffect, useId, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useOverlay';
import IconButton from './IconButton';

/**
 * One overlay primitive for every modal surface.
 *   variant="center"  centred dialog (join, confirm)
 *   variant="sheet"   bottom sheet (mobile panels); `size` sets its height
 * It renders inside the app root (position: absolute), so on phones it shrinks with the soft keyboard.
 */
export default function Dialog({ title, onClose, children, footer, variant = 'center', size = 'md', dismissible = true, initialFocusRef }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useFocusTrap(panelRef, true, initialFocusRef);

  useEffect(() => {
    if (!dismissible) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose?.(); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismissible, onClose]);

  return (
    <div className={`sx-overlay sx-overlay--${variant}`}>
      <div className="sx-overlay__scrim" onClick={dismissible ? onClose : undefined} />
      <div
        ref={panelRef}
        className={`sx-dialog sx-dialog--${variant} sx-dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {variant === 'sheet' && <div className="sx-dialog__grip" aria-hidden="true" />}
        <div className="sx-dialog__header">
          <h2 id={titleId} className="sx-dialog__title">{title}</h2>
          {dismissible && <IconButton icon="close" label="Close" tip="Close" tipPos="left" onClick={onClose} />}
        </div>
        <div className="sx-dialog__body">{children}</div>
        {footer && <div className="sx-dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}
