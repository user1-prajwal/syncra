import ResizeHandle from '../ui/ResizeHandle';
import { SIDE_LIMITS } from './panelLimits';

const TITLES = { files: 'Files', languages: 'Language', people: 'People' };

/**
 * Hosts the explorer / language / people panels. All three stay mounted (hidden when inactive) so the tree's
 * expanded folders and the language filter survive switching panels.
 * On tablets the dock floats over the editor (`overlay`) instead of squeezing it.
 */
export default function SideDock({ panel, overlay, width, onResize, onDismiss, panels }) {
  const open = Boolean(panel);
  return (
    <>
      {open && overlay && <div className="sx-scrim" onClick={onDismiss} />}
      <div className={`sx-dock${overlay ? ' is-overlay' : ''}`} hidden={!open}>
        <aside className="sx-side" aria-label={TITLES[panel] ?? 'Side panel'}>
          <div className="sx-side__header">
            <h2 className="sx-side__title">{TITLES[panel]}</h2>
          </div>
          {Object.keys(TITLES).map((id) => (
            <div key={id} className="sx-side__slot" hidden={id !== panel}>{panels[id]}</div>
          ))}
        </aside>
        <ResizeHandle
          label="Resize side panel"
          edge="end"
          cssVar="--sx-side-w"
          value={width}
          min={SIDE_LIMITS.min}
          max={SIDE_LIMITS.max}
          defaultValue={SIDE_LIMITS.default}
          onCommit={onResize}
        />
      </div>
    </>
  );
}