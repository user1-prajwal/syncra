import { useCallback, useMemo, useState } from 'react';

/**
 * Tabs are a local view over the room's files.
 * Closing a tab only hides it for this person. It never deletes the file for everyone
 * (in the previous editor the tab "×" deleted the file for the whole room).
 */
export function useOpenTabs(fileMeta, activeFileId, setActiveFileId) {
  const [openIds, setOpenIds] = useState([]);

  const ids = useMemo(() => {
    const existing = new Set(fileMeta.map((f) => f.id));
    const kept = openIds.filter((id) => existing.has(id));
    if (existing.has(activeFileId) && !kept.includes(activeFileId)) kept.push(activeFileId);
    return kept;
  }, [openIds, fileMeta, activeFileId]);

  // Keep the stored list equal to the validated one (a file was deleted, the active file isn't open yet).
  // Updating state while rendering is the documented way to derive state; it settles after one extra render.
  if (openIds.length !== ids.length || openIds.some((id, i) => id !== ids[i])) setOpenIds(ids);

  const tabs = useMemo(() => {
    const byId = new Map(fileMeta.map((f) => [f.id, f]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }, [ids, fileMeta]);

  const closeTab = useCallback((id) => {
    if (ids.length <= 1) return; // there is always at least one open file
    const index = ids.indexOf(id);
    const next = ids.filter((x) => x !== id);
    setOpenIds(next);
    if (id === activeFileId) setActiveFileId(next[Math.min(index, next.length - 1)]);
  }, [ids, activeFileId, setActiveFileId]);

  return { tabs, closeTab };
}