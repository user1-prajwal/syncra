import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SESSION_COLOR, BACKEND_URL, CLIENT_ID } from '../constants';
import { YDocRegistry } from '../collab/yjsSync';
import { getLanguage } from '../config/languages';

/*
 * Everything that talks to the room server lives here: the WebSocket, reconnects, the Yjs registry
 * (one Y.Doc per file) and the room state derived from server messages.
 *
 * The message handling is the previous EditorPage logic moved over as-is. The wire protocol is unchanged
 * (join, init, yupdate, newfile, deletefile, language, chat, cursor, cursor-stop, cursor-leave, users, userlist).
 */

const CURSOR_IDLE_MS = 3500;

const DEFAULT_FILES = [
  { id: '1', name: 'main.py', language: 'python', code: "# Start coding here\nprint('Your next big idea starts right here.')" },
];

export function useRoomConnection(roomId, events = {}) {
  const [files, setFiles] = useState(DEFAULT_FILES);
  const [activeFileId, setActiveFileId] = useState('1');
  const [initReceived, setInitReceived] = useState(0); // bumps on the first server snapshot so Monaco mounts with the room's text
  const [connection, setConnection] = useState('connecting'); // connecting | connected | reconnecting | closed
  const [closeReason, setCloseReason] = useState(null);       // 'room-full' | 'rejected' | null
  const [userCount, setUserCount] = useState(0);
  const [userList, setUserList] = useState([]);
  const [cursors, setCursors] = useState({});
  const [messages, setMessages] = useState([]);

  const wsRef = useRef(null);
  const registryRef = useRef(null);         // YDocRegistry: one Yjs document per file
  const epochRef = useRef(null);            // room epoch from the server; a change means the server lost its state
  const usernameRef = useRef('');
  const filesRef = useRef(files);
  const isRemoteChangeRef = useRef(false);  // set by the Monaco binding while it applies remote edits
  const cursorTimeouts = useRef({});
  const idleTimer = useRef(null);
  const eventsRef = useRef(events);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { eventsRef.current = events; });

  useEffect(() => {
    if (!roomId) return undefined;
    let stopped = false;
    let attempt = 0;
    let retryTimer = null;

    const reg = new YDocRegistry({
      send: (obj) => {
        const w = wsRef.current;
        if (w?.readyState !== 1) return false;
        w.send(JSON.stringify(obj));
        return true;
      },
      onRemoteText: (id, text) => setFiles((prev) => prev.map((f) => (f.id === id && f.code !== text ? { ...f, code: text } : f))),
    });
    registryRef.current = reg;
    epochRef.current = null;

    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/${roomId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnection('connected');
        setCloseReason(null);
        // After a reconnect the server has forgotten this socket's identity: join again.
        if (usernameRef.current) ws.send(JSON.stringify({ type: 'join', name: usernameRef.current, color: SESSION_COLOR, clientId: CLIENT_ID }));
      };

      ws.onclose = (ev) => {
        if (stopped) return;
        // 1008 = rejected by server policy (bad room / origin / rate limit), 1013 = room full: retrying will not help.
        if (ev.code === 1008 || ev.code === 1013) {
          setConnection('closed');
          setCloseReason(ev.code === 1013 ? 'room-full' : 'rejected');
          return;
        }
        setConnection('reconnecting');
        const delay = Math.min(1000 * 2 ** attempt, 15000) + Math.random() * 500; // exponential backoff + jitter
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };

      ws.onmessage = async (event) => {
        const text = event.data instanceof Blob ? await event.data.text() : event.data;
        let data;
        try { data = JSON.parse(text); } catch { return; }

        if (data.type === 'yupdate') {
          reg.applyUpdate(data.fileId, data.update); // the Monaco binding (observer) applies it to the editor
        }
        if (data.type === 'init') {
          const firstInit = epochRef.current === null;
          const serverLostState = !firstInit && !!data.epoch && data.epoch !== epochRef.current;
          epochRef.current = data.epoch ?? 'legacy';
          const localOnly = reg.mergeSnapshot(data.files || []);
          const prevFiles = filesRef.current;
          const kept = [];
          for (const id of localOnly) {
            if (serverLostState) { reg.reupload.add(id); const f = prevFiles.find((x) => x.id === id); if (f) kept.push(f); }
            else reg.remove(id); // the server's list is authoritative: the file was deleted while we were away
          }
          const merged = [
            ...(data.files || []).map((f) => ({ id: f.id, name: f.name, language: f.language, code: reg.text(f.id) })),
            ...kept.map((f) => ({ ...f, code: reg.text(f.id) })),
          ];
          if (merged.length) {
            setFiles(merged);
            if (firstInit) { setActiveFileId(merged[0].id); setInitReceived((n) => n + 1); } // mount Monaco with the room's text
            else setActiveFileId((prev) => (merged.some((f) => f.id === prev) ? prev : merged[0].id));
          }
          if (data.users) setUserList(data.users);
        }
        if (data.type === 'newfile') {
          const f = data.file;
          if (!reg.has(f.id)) {
            reg.applyState(f.id, f.ystate);
            setFiles((prev) => (prev.find((x) => x.id === f.id) ? prev : [...prev, { id: f.id, name: f.name, language: f.language, code: reg.text(f.id) }]));
          }
        }
        if (data.type === 'deletefile') {
          reg.remove(data.fileId);
          setFiles((prev) => { const n = prev.filter((f) => f.id !== data.fileId); return n.length > 0 ? n : prev; });
          setActiveFileId((prev) => {
            if (prev !== data.fileId) return prev;
            const rem = filesRef.current.filter((f) => f.id !== data.fileId);
            return rem[0]?.id || prev;
          });
        }
        if (data.type === 'language') {
          setFiles((prev) => prev.map((f) => (f.id === data.fileId ? { ...f, language: data.language, ...(data.name ? { name: data.name } : {}) } : f)));
          eventsRef.current.notify?.(`${data.changedBy} switched ${data.name ?? 'a file'} to ${getLanguage(data.language).label}`);
        }
        if (data.type === 'name-taken') {
          usernameRef.current = '';
          eventsRef.current.onNameTaken?.(data.message);
          return;
        }
        if (data.type === 'error') {
          if (data.code === 'file-limit') eventsRef.current.notify?.('This room has reached its file limit.', 'error');
          else console.warn('Server rejected a message:', data.code);
          return;
        }
        if (data.type === 'users') setUserCount(data.count);
        if (data.type === 'userlist') {
          setUserList(data.users);
          // Our join is confirmed: now upload edits made while offline / files the server lost.
          if (reg.hasPending && data.users.some((u) => u.name === usernameRef.current)) {
            reg.flushPending((id) => filesRef.current.find((f) => f.id === id));
          }
        }
        if (data.type === 'join') setUserList((prev) => (prev.find((u) => u.name === data.name) ? prev : [...prev, { name: data.name, color: data.color }]));
        if (data.type === 'leave') setUserList((prev) => prev.filter((u) => u.name !== data.name));
        if (data.type === 'chat') setMessages((prev) => [...prev, { name: data.name, color: data.color, text: data.text, time: data.time }]);
        if (data.type === 'cursor') {
          setCursors((prev) => ({ ...prev, [data.name]: { name: data.name, color: data.color, line: data.line, column: data.column } }));
          if (cursorTimeouts.current[data.name]) clearTimeout(cursorTimeouts.current[data.name]);
          cursorTimeouts.current[data.name] = setTimeout(() => {
            setCursors((prev) => { const n = { ...prev }; delete n[data.name]; return n; });
          }, CURSOR_IDLE_MS + 1500);
        }
        if (data.type === 'cursor-stop') {
          if (cursorTimeouts.current[data.name]) { clearTimeout(cursorTimeouts.current[data.name]); delete cursorTimeouts.current[data.name]; }
          setCursors((prev) => { const n = { ...prev }; delete n[data.name]; return n; });
        }
        if (data.type === 'cursor-leave') {
          setCursors((prev) => { const n = { ...prev }; delete n[data.name]; return n; }); // decorations are removed by useRemoteCursors
        }
      };
    };

    connect();
    const timeouts = cursorTimeouts.current;
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(idleTimer.current);
      Object.values(timeouts).forEach(clearTimeout);
      wsRef.current?.close();
      reg.destroyAll();
      registryRef.current = null;
    };
  }, [roomId]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws?.readyState !== 1) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }, []);

  const join = useCallback((name) => {
    usernameRef.current = name;
    send({ type: 'join', name, color: SESSION_COLOR, clientId: CLIENT_ID }); // if not open yet, ws.onopen sends it
  }, [send]);

  const sendCursor = useCallback((line, column) => {
    if (isRemoteChangeRef.current || !usernameRef.current) return;
    if (!send({ type: 'cursor', name: usernameRef.current, color: SESSION_COLOR, line, column })) return;
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => send({ type: 'cursor-stop', name: usernameRef.current }), CURSOR_IDLE_MS);
  }, [send]);

  /** Mirror what the person typed into React state (used by Run/Export). Syncing is done by the Yjs binding. */
  const setLocalCode = useCallback((fileId, code) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId && f.code !== code ? { ...f, code } : f)));
  }, []);

  const createFile = useCallback(({ id, name, language, code = '' }) => {
    const reg = registryRef.current;
    if (!reg) return false;
    const ystate = reg.createLocal(id, code); // this client owns the new file's initial history
    setFiles((prev) => [...prev, { id, name, language, code }]);
    setActiveFileId(id);
    send({ type: 'newfile', file: { id, name, language, ystate } });
    return true;
  }, [send]);

  /** Delete several files (a folder). Refuses to delete everything: a room always keeps one file. */
  const removeFiles = useCallback((ids) => {
    const current = filesRef.current;
    const doomed = new Set(ids);
    const remaining = current.filter((f) => !doomed.has(f.id));
    if (remaining.length === 0 || remaining.length === current.length) return false;
    doomed.forEach((id) => {
      registryRef.current?.remove(id);
      send({ type: 'deletefile', fileId: id });
    });
    setFiles(remaining);
    setActiveFileId((prev) => (doomed.has(prev) ? remaining[0].id : prev));
    return true;
  }, [send]);

  const changeLanguage = useCallback((fileId, language, name) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, language, name } : f)));
    send({ type: 'language', language, name, fileId });
  }, [send]);

  const sendChat = useCallback((text) => {
    const name = usernameRef.current;
    const body = String(text).trim();
    if (!body || !name || wsRef.current?.readyState !== 1) return false;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [...prev, { name, color: SESSION_COLOR, text: body, time }]);
    send({ type: 'chat', name, color: SESSION_COLOR, text: body, time });
    return true;
  }, [send]);

  /** Freshest text of a file: straight from Yjs when available, else the mirrored React state. */
  const getFileText = useCallback((id) => {
    try {
      const text = registryRef.current?.text(id);
      if (typeof text === 'string') return text;
    } catch { /* fall through */ }
    return filesRef.current.find((f) => f.id === id)?.code ?? '';
  }, []);

  // Components that only need names/languages must not re-render on every keystroke.
  const metaKey = files.map((f) => `${f.id}\u0000${f.name}\u0000${f.language}`).join('\u0001');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fileMeta = useMemo(() => files.map(({ id, name, language }) => ({ id, name, language })), [metaKey]);

  return {
    files, fileMeta, activeFileId, setActiveFileId,
    editorKey: `${activeFileId}-${initReceived}`,
    connection, closeReason, userCount, userList, cursors, messages,
    registryRef, isRemoteChangeRef,
    join, sendCursor, setLocalCode, createFile, removeFiles, changeLanguage, sendChat, getFileText,
  };
}
