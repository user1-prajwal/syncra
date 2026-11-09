import { useCallback, useMemo, useState } from 'react';
import { buildTree, dirName, filesInFolder, validateNewFilePath, validateNewFolderPath } from '../../lib/filePaths';
import IconButton from '../ui/IconButton';
import NewEntryRow from './NewEntryRow';
import TreeNodes from './TreeNode';

/**
 * Hierarchical file explorer.
 * Folders come from "/" in file names (see lib/filePaths.js). A folder created here stays local
 * until the first file is created inside it.
 *
 * Props
 *   files             [{ id, name, language }]  (no code: the explorer must not re-render per keystroke)
 *   activeFileId
 *   onOpenFile(id)
 *   onCreateFile(path, language)
 *   onRequestDelete({ kind, label, ids })   the page shows the confirmation
 */
export default function FileExplorer({ files, activeFileId, onOpenFile, onCreateFile, onRequestDelete }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [contextFolder, setContextFolder] = useState('');
  const [pending, setPending] = useState(null);          // { kind: 'file' | 'folder', parent: string }
  const [localFolders, setLocalFolders] = useState([]);  // empty folders that exist only on this screen

  // Opening a different file (tab, remote change…) reveals it in the tree: expand its folders, make its folder the context.
  const [revealedId, setRevealedId] = useState(null);
  if (revealedId !== activeFileId) {
    setRevealedId(activeFileId);
    const active = files.find((f) => f.id === activeFileId);
    if (active) {
      setContextFolder(dirName(active.name));
      setCollapsed((prev) => {
        const next = new Set(prev);
        for (let dir = dirName(active.name); dir; dir = dirName(dir)) next.delete(dir);
        return next.size === prev.size ? prev : next;
      });
    }
  }

  // A local folder that already holds a file is a real folder: no need to also draw it as "empty".
  const emptyLocalFolders = useMemo(
    () => localFolders.filter((p) => !files.some((f) => f.name.startsWith(`${p}/`))),
    [files, localFolders],
  );
  const tree = useMemo(() => buildTree(files, emptyLocalFolders), [files, emptyLocalFolders]);

  const onToggleFolder = useCallback((path) => {
    setContextFolder(path);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);

  const onStartCreate = useCallback((kind, parent) => {
    setCollapsed((prev) => {
      if (!prev.has(parent)) return prev;
      const next = new Set(prev);
      next.delete(parent);
      return next;
    });
    setContextFolder(parent);
    setPending({ kind, parent });
  }, []);

  const onSubmitCreate = useCallback((value) => {
    if (!pending) return null;
    if (pending.kind === 'folder') {
      const result = validateNewFolderPath(value, files, pending.parent);
      if (!result.ok) return result.error;
      setLocalFolders((prev) => (prev.includes(result.path) ? prev : [...prev, result.path]));
      setContextFolder(result.path);
    } else {
      const result = validateNewFilePath(value, files, pending.parent);
      if (!result.ok) return result.error;
      onCreateFile(result.path, result.language);
      setLocalFolders((prev) => prev.filter((p) => !result.path.startsWith(`${p}/`))); // that folder is now shared
    }
    setPending(null);
    return null;
  }, [pending, files, onCreateFile]);

  const ctx = useMemo(() => ({
    activeFileId,
    collapsed,
    contextFolder,
    pending,
    onOpenFile,
    onToggleFolder,
    onStartCreate,
    onSubmitCreate,
    onCancelCreate: () => setPending(null),
    onRequestDelete: (target) => {
      if (target.kind === 'folder' && target.ids.length === 0) {
        setLocalFolders((prev) => prev.filter((p) => p !== target.path)); // nothing to delete on the server
        return;
      }
      onRequestDelete(target);
    },
    filesIn: (folder) => filesInFolder(files, folder),
    canDelete: (count) => files.length - count >= 1,
  }), [activeFileId, collapsed, contextFolder, pending, files, onOpenFile, onToggleFolder, onStartCreate, onSubmitCreate, onRequestDelete]);

  const rootPending = pending && pending.parent === '';
  const contextLabel = contextFolder || 'the project root';

  return (
    <div className="sx-explorer">
      <div className="sx-explorer__bar">
        <span className="sx-explorer__hint" title={contextFolder || 'Project root'}>
          {contextFolder ? contextFolder : 'Project root'}
        </span>
        <span className="sx-explorer__actions">
          <IconButton icon="filePlus" label={`New file in ${contextLabel}`} tip="New file" tipPos="bottom" onClick={() => onStartCreate('file', contextFolder)} />
          <IconButton icon="folderPlus" label={`New folder in ${contextLabel}`} tip="New folder" tipPos="bottom" onClick={() => onStartCreate('folder', contextFolder)} />
        </span>
      </div>
      <nav className="sx-explorer__tree" aria-label="Files">
        {rootPending && (
          <ul className="sx-tree">
            <NewEntryRow kind={pending.kind} depth={0} parentLabel="the project root" onSubmit={onSubmitCreate} onCancel={ctx.onCancelCreate} />
          </ul>
        )}
        <TreeNodes nodes={tree.children} depth={0} ctx={ctx} />
      </nav>
    </div>
  );
}