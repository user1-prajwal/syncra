import { useRef } from 'react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Vertical splitter between a fixed-width panel and the flexible editor.
 *   edge="end"    the panel is on the LEFT of the handle (dragging right grows it)
 *   edge="start"  the panel is on the RIGHT of the handle (dragging left grows it)
 *
 * While dragging, the width is written straight to a CSS variable on the nearest [data-resize-host],
 * so React does not re-render once per mouse move. The final value is committed through onCommit.
 * Keyboard: arrows (Shift = bigger steps), Home/End, double-click resets.
 */
export default function ResizeHandle({ label, value, min, max, defaultValue, cssVar, edge = 'end', onCommit }) {
  const drag = useRef(null);
  const direction = edge === 'end' ? 1 : -1;

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startValue: value,
      current: value,
      host: event.currentTarget.closest('[data-resize-host]'),
    };
    document.body.classList.add('sx-resizing');
  };

  const onPointerMove = (event) => {
    const d = drag.current;
    if (!d) return;
    d.current = clamp(d.startValue + direction * (event.clientX - d.startX), min, max);
    d.host?.style.setProperty(cssVar, `${d.current}px`);
  };

  const endDrag = (event) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    document.body.classList.remove('sx-resizing');
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (d.current !== value) onCommit(d.current);
  };

  const onKeyDown = (event) => {
    const step = event.shiftKey ? 64 : 16;
    let next = null;
    if (event.key === 'ArrowLeft') next = value + direction * -step;
    else if (event.key === 'ArrowRight') next = value + direction * step;
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    if (next === null) return;
    event.preventDefault();
    onCommit(clamp(next, min, max));
  };

  return (
    <div
      className="sx-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(defaultValue)}
    />
  );
}
