import ResizeHandle from '../ui/ResizeHandle';
import { RIGHT_LIMITS } from './panelLimits';

/** Resizable docked column on the right of the editor (desktop and tablet). */
export default function RightDock({ width, onResize, children }) {
  return (
    <>
      <ResizeHandle
        label="Resize output and chat panel"
        edge="start"
        cssVar="--sx-right-w"
        value={width}
        min={RIGHT_LIMITS.min}
        max={RIGHT_LIMITS.max}
        defaultValue={RIGHT_LIMITS.default}
        onCommit={onResize}
      />
      <aside className="sx-right" aria-label="Output and chat">{children}</aside>
    </>
  );
}