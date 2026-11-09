import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';
import LanguageIcon from '../language/LanguageIcon';
import NewEntryRow from './NewEntryRow';

/** Recursive list of folders and files. Presentational: all state lives in FileExplorer. */
export default function TreeNodes({ nodes, depth, ctx }) {
  return (
    <ul className="sx-tree">
      {nodes.map((node) => (
        <TreeNode key={`${node.type}:${node.path}`} node={node} depth={depth} ctx={ctx} />
      ))}
    </ul>
  );
}

function TreeNode({ node, depth, ctx }) {
  if (node.type === 'file') {
    const active = node.file.id === ctx.activeFileId;
    return (
      <li>
        <div className={`sx-row${active ? ' is-active' : ''}`} style={{ '--depth': depth }}>
          <button
            type="button"
            className="sx-row__main"
            aria-current={active ? 'true' : undefined}
            title={node.path}
            onClick={() => ctx.onOpenFile(node.file.id)}
          >
            <span className="sx-row__chev" />
            <span className="sx-row__icon"><LanguageIcon id={node.file.language} size={16} /></span>
            <span className="sx-row__name">{node.name}</span>
          </button>
          <span className="sx-row__actions">
            <IconButton
              icon="trash"
              label={`Delete ${node.name}`}
              tip={ctx.canDelete(1) ? 'Delete file' : 'A room needs at least one file'}
              tipPos="left"
              size={14}
              disabled={!ctx.canDelete(1)}
              onClick={() => ctx.onRequestDelete({ kind: 'file', label: node.path, ids: [node.file.id] })}
            />
          </span>
        </div>
      </li>
    );
  }

  const open = !ctx.collapsed.has(node.path);
  const isContext = ctx.contextFolder === node.path;
  const inside = ctx.filesIn(node.path);
  const pendingHere = ctx.pending && ctx.pending.parent === node.path;

  return (
    <li>
      <div className={`sx-row sx-row--folder${isContext ? ' is-context' : ''}`} style={{ '--depth': depth }}>
        <button
          type="button"
          className="sx-row__main"
          aria-expanded={open}
          title={node.path}
          onClick={() => ctx.onToggleFolder(node.path)}
        >
          <span className="sx-row__chev"><Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} /></span>
          <span className="sx-row__icon"><Icon name="folder" size={16} /></span>
          <span className="sx-row__name">{node.name}</span>
        </button>
        <span className="sx-row__actions">
          <IconButton icon="filePlus" label={`New file in ${node.name}`} tip="New file here" tipPos="left" size={14} onClick={() => ctx.onStartCreate('file', node.path)} />
          <IconButton
            icon="trash"
            label={`Delete folder ${node.name}`}
            tip={inside.length === 0 || ctx.canDelete(inside.length) ? 'Delete folder' : 'A room needs at least one file'}
            tipPos="left"
            size={14}
            disabled={inside.length > 0 && !ctx.canDelete(inside.length)}
            onClick={() => ctx.onRequestDelete({ kind: 'folder', label: node.path, ids: inside.map((f) => f.id), path: node.path })}
          />
        </span>
      </div>
      {open && (
        <>
          <TreeNodes nodes={node.children} depth={depth + 1} ctx={ctx} />
          {pendingHere && (
            <ul className="sx-tree">
              <NewEntryRow kind={ctx.pending.kind} depth={depth + 1} parentLabel={node.path} onSubmit={ctx.onSubmitCreate} onCancel={ctx.onCancelCreate} />
            </ul>
          )}
          {node.children.length === 0 && !pendingHere && (
            <p className="sx-empty-folder" style={{ '--depth': depth + 1 }}>Empty. Add a file to share this folder.</p>
          )}
        </>
      )}
    </li>
  );
}
