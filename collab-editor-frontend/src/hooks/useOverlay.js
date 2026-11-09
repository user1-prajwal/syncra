import { useEffect } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `ref` while active, moves focus in on open and gives it back on close. */
export function useFocusTrap(ref, active, initialFocusRef) {
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return undefined;
    const previous = document.activeElement;
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => !el.closest('[hidden]'));

    if (!node.contains(document.activeElement)) { // an autoFocus child may already hold focus
      (initialFocusRef?.current ?? focusables()[0] ?? node).focus?.();
    }

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      if (previous && document.contains(previous)) previous.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/** Closes a popover on Escape or on a pointer press outside `ref`. */
export function useDismiss(ref, open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => { if (ref.current && !ref.current.contains(event.target)) onClose(); };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
      ref.current?.querySelector('button')?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, open, onClose]);
}
