import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import '../styles/index.css';

import { SESSION_COLOR } from '../constants';
import { getLanguage, isRunnable } from '../config/languages';
import { newFileId, renameForLanguage } from '../lib/filePaths';
import { downloadZip, pickFiles, readImports } from '../lib/fileTransfer';
import { useStoredState } from '../lib/storage';

import { useTheme } from '../hooks/useTheme';
import { layoutFor, useLockPageScroll, useViewport } from '../hooks/useViewport';
import { useToasts } from '../hooks/useToasts';
import { useRoomConnection } from '../hooks/useRoomConnection';
import { useRemoteCursors } from '../hooks/useRemoteCursors';
import { useCodeRunner } from '../hooks/useCodeRunner';
import { useOpenTabs } from '../hooks/useOpenTabs';

import TopBar from '../components/layout/TopBar';
import ActivityBar from '../components/layout/ActivityBar';
// import SideDock, { SIDE_LIMITS } from '../components/layout/SideDock';
// import RightDock, { RIGHT_LIMITS } from '../components/layout/RightDock';
import SideDock from '../components/layout/SideDock';
import RightDock from '../components/layout/RightDock';
import { RIGHT_LIMITS, SIDE_LIMITS } from '../components/layout/panelLimits';

import StatusBar from '../components/layout/StatusBar';
import MobileNav from '../components/layout/MobileNav';
import ConnectionBanner from '../components/layout/ConnectionBanner';
import CodeEditor from '../components/editor/CodeEditor';
import EditorTabs from '../components/editor/EditorTabs';
import FileExplorer from '../components/explorer/FileExplorer';
import LanguageList from '../components/language/LanguageList';
import LanguagePicker, { LanguageTrigger } from '../components/language/LanguagePicker';
import PeopleList from '../components/panels/PeopleList';
import RightPanel from '../components/panels/RightPanel';
import JoinDialog from '../components/dialogs/JoinDialog';
import ConfirmDialog from '../components/dialogs/ConfirmDialog';
import Dialog from '../components/ui/Dialog';
import ToastHost from '../components/ui/ToastHost';

const DEFAULT_PREFS = { sideWidth: SIDE_LIMITS.default, rightWidth: RIGHT_LIMITS.default, rightOpen: true };
const clamp = (n, { min, max, default: fallback }) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);
const SHORTCUT = /Mac|iPhone|iPad/i.test(globalThis.navigator?.platform ?? '') ? '⌘ Enter' : 'Ctrl Enter';

function EditorPage() {
  const { roomId } = useParams();
  const { theme, toggleTheme } = useTheme();
  const { layout, keyboardOpen } = useViewport();
  useLockPageScroll();
  const { toasts, notify, dismiss } = useToasts();
  const isMobile = layout === 'mobile';
  const isTablet = layout === 'tablet';

  // ── Identity ───────────────────────────────────────────────────────────────
  const [username, setUsername] = useState('');
  const [joinedName, setJoinedName] = useState('');
  const [joinError, setJoinError] = useState('');

  // ── Layout state ───────────────────────────────────────────────────────────
  const [prefs, setPrefs] = useStoredState('syncra:layout:v1', DEFAULT_PREFS);
  const [sidePanel, setSidePanel] = useState(() => (layoutFor(window.innerWidth) === 'desktop' ? 'files' : null));
  const [rightTab, setRightTab] = useState('output');
  const [sheet, setSheet] = useState(null);            // phones: 'files' | 'languages' | 'people' | 'panel'
  const [editor, setEditor] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [seenMessages, setSeenMessages] = useState(0);

  const sideWidth = clamp(prefs.sideWidth, SIDE_LIMITS);
  const rightWidth = clamp(prefs.rightWidth, RIGHT_LIMITS);

  // ── Room, files, run ───────────────────────────────────────────────────────
  const roomEvents = useMemo(() => ({
    notify,
    onNameTaken: (message) => { setJoinedName(''); setJoinError(message || 'That name is already used in this room. Pick another one.'); },
  }), [notify]);
  const room = useRoomConnection(roomId, roomEvents);
  const runner = useCodeRunner();
  const { tabs, closeTab } = useOpenTabs(room.fileMeta, room.activeFileId, room.setActiveFileId);
  useRemoteCursors(editor, room.cursors);

  const activeMeta = room.fileMeta.find((f) => f.id === room.activeFileId) ?? room.fileMeta[0];
  const activeLanguage = activeMeta?.language ?? 'plaintext';
  const canRun = Boolean(activeMeta) && isRunnable(activeLanguage);
  const blockedReason = activeMeta && !canRun ? `${getLanguage(activeLanguage).label} files can’t be run` : '';

  const people = useMemo(
    () => (joinedName
      ? [{ name: joinedName, color: SESSION_COLOR }, ...room.userList.filter((u) => u.name !== joinedName)]
      : room.userList),
    [joinedName, room.userList],
  );

  // Monaco only needs the text when it mounts; after that Yjs owns it. Keeping it out of the props
  // means typing does not re-render the editor component.
  const [initial, setInitial] = useState({ key: null, code: '' });
  if (initial.key !== room.editorKey) {
    setInitial({ key: room.editorKey, code: room.files.find((f) => f.id === room.activeFileId)?.code ?? '' });
  }

  // ── Panels ─────────────────────────────────────────────────────────────────
  const openOutput = useCallback(() => {
    setRightTab('output');
    if (isMobile) setSheet('panel');
    else setPrefs((p) => (p.rightOpen ? p : { ...p, rightOpen: true }));
  }, [isMobile, setPrefs]);

  const openChat = useCallback(() => {
    setRightTab('chat');
    if (isMobile) setSheet('panel');
    else setPrefs((p) => (p.rightOpen ? p : { ...p, rightOpen: true }));
  }, [isMobile, setPrefs]);

  const toggleRight = useCallback(() => setPrefs((p) => ({ ...p, rightOpen: !p.rightOpen })), [setPrefs]);
  const closeRight = useCallback(() => setPrefs((p) => ({ ...p, rightOpen: false })), [setPrefs]);
  const closeSheet = useCallback(() => setSheet(null), []);
  const showPeople = useCallback(() => { if (isMobile) setSheet('people'); else setSidePanel('people'); }, [isMobile]);

  if (!isMobile && sheet !== null) setSheet(null); // phone sheets don't exist on larger screens

  const chatVisible = rightTab === 'chat' && (isMobile ? sheet === 'panel' : prefs.rightOpen);
  if (chatVisible && seenMessages !== room.messages.length) setSeenMessages(room.messages.length);
  const unread = chatVisible ? 0 : Math.max(0, room.messages.length - seenMessages);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleJoin = () => {
    const name = username.trim();
    if (!name) return;
    setJoinError('');
    setJoinedName(name);
    room.join(name);
  };

  const runRef = useRef(null);
  useEffect(() => {
    runRef.current = () => {
      if (!activeMeta || !canRun || runner.isRunning) return;
      document.activeElement?.blur?.();
      openOutput();
      runner.execute({ fileName: activeMeta.name, language: activeMeta.language, code: room.getFileText(activeMeta.id) });
    };
  });
  const handleRun = useCallback(() => runRef.current(), []);

  const handleCodeChange = useCallback((code) => room.setLocalCode(room.activeFileId, code), [room.setLocalCode, room.activeFileId]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleCaret = useCallback((line, column) => room.sendCursor(line, column), [room.sendCursor]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleEditorReady = useCallback((ed) => {
    setEditor(ed);
    ed.onDidDispose(() => setEditor((current) => (current === ed ? null : current)));
  }, []);

  const afterNavigate = () => {
    if (isMobile) setSheet(null);
    else if (isTablet) setSidePanel(null); // the tablet dock floats over the editor
  };

  const handleOpenFile = useCallback((id) => {
    room.setActiveFileId(id);
    afterNavigate();
  }, [room.setActiveFileId, isMobile, isTablet]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateFile = useCallback((path, language) => {
    room.createFile({ id: newFileId(), name: path, language, code: '' });
    afterNavigate();
  }, [room.createFile, isMobile, isTablet]); // eslint-disable-line react-hooks/exhaustive-deps

  const languageBlockedReason = useCallback((languageId) => {
    if (!activeMeta || languageId === activeMeta.language) return null;
    const next = renameForLanguage(activeMeta.name, languageId).toLowerCase();
    const clash = room.fileMeta.some((f) => f.id !== activeMeta.id && f.name.toLowerCase() === next);
    return clash ? `${renameForLanguage(activeMeta.name, languageId)} already exists` : null;
  }, [activeMeta, room.fileMeta]);

  const handleLanguageChange = useCallback((languageId) => {
    if (!activeMeta || languageId === activeMeta.language) return;
    const reason = languageBlockedReason(languageId);
    if (reason) { notify(`Can’t switch language: ${reason}.`, 'error'); return; }
    room.changeLanguage(activeMeta.id, languageId, renameForLanguage(activeMeta.name, languageId));
    if (isMobile) setSheet(null);
  }, [activeMeta, languageBlockedReason, room.changeLanguage, notify, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const ok = room.removeFiles(pendingDelete.ids);
    notify(ok ? `Deleted ${pendingDelete.label}` : 'A room needs at least one file, so nothing was deleted.', ok ? 'info' : 'error');
    setPendingDelete(null);
  };

  const handleImport = useCallback(async () => {
    const picked = await pickFiles();
    if (picked.length === 0) return;
    const { accepted, skipped } = await readImports(picked, room.fileMeta.map((f) => f.name));
    accepted.forEach((f) => room.createFile({ id: newFileId(), name: f.name, language: f.language, code: f.code }));
    const parts = [];
    if (accepted.length) parts.push(`Imported ${accepted.length} file${accepted.length > 1 ? 's' : ''}`);
    if (skipped.length) parts.push(`skipped ${skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}`);
    notify(parts.join('. '), accepted.length ? 'info' : 'error');
  }, [room.fileMeta, room.createFile, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = useCallback(async () => {
    try {
      await downloadZip(room.fileMeta.map((f) => ({ name: f.name, code: room.getFileText(f.id) })), `syncra-${roomId}.zip`);
    } catch {
      notify('Export failed. Check your connection and try again.', 'error');
    }
  }, [room.fileMeta, room.getFileText, roomId, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Panel contents (shared by the desktop dock and the phone sheets) ───────
  const filesPanel = (
    <FileExplorer
      files={room.fileMeta}
      activeFileId={room.activeFileId}
      onOpenFile={handleOpenFile}
      onCreateFile={handleCreateFile}
      onRequestDelete={setPendingDelete}
    />
  );
  const languagesPanel = (
    <div className="sx-side__languages">
      <p className="sx-lang__context">Language for <strong>{activeMeta?.name}</strong>. Changing it renames the file’s extension for everyone.</p>
      <LanguageList value={activeLanguage} onSelect={handleLanguageChange} getDisabledReason={languageBlockedReason} />
    </div>
  );
  const peoplePanel = <PeopleList people={people} username={joinedName} />;
  const rightPanel = (
    <RightPanel
      tab={rightTab}
      onTabChange={setRightTab}
      run={runner.run}
      onClearOutput={runner.clear}
      unread={unread}
      messages={room.messages}
      username={joinedName}
      onSend={room.sendChat}
      connected={room.connection === 'connected'}
      onClose={isMobile ? undefined : closeRight}
    />
  );

  const runControls = { canRun, blockedReason, isRunning: runner.isRunning, onRun: handleRun, shortcut: SHORTCUT };
  const showRight = !isMobile && prefs.rightOpen;
  const sheetTitle = { files: 'Files', languages: 'Language', people: 'People', panel: 'Output and chat' }[sheet];

  return (
    <div
      className="sx-app"
      data-theme={theme}
      data-layout={layout}
      data-kbd={keyboardOpen ? 'open' : 'closed'}
    >
      <TopBar
        layout={layout}
        roomId={roomId}
        connection={room.connection}
        people={people}
        theme={theme}
        onToggleTheme={toggleTheme}
        onShowPeople={showPeople}
        onCopied={() => notify('Room code copied')}
        languageControl={(
          <LanguagePicker languageId={activeLanguage} onSelect={handleLanguageChange} getDisabledReason={languageBlockedReason} />
        )}
        onImport={handleImport}
        onExport={handleExport}
        rightOpen={prefs.rightOpen}
        onToggleRight={toggleRight}
        unread={unread}
        run={runControls}
      />

      <ConnectionBanner connection={room.connection} closeReason={room.closeReason} />

      <div
        className="sx-workspace"
        data-resize-host
        style={{ '--sx-side-w': `${sideWidth}px`, '--sx-right-w': `${rightWidth}px` }}
      >
        {!isMobile && (
          <>
            <ActivityBar activePanel={sidePanel} onSelect={setSidePanel} activeLanguage={activeLanguage} peopleCount={people.length} />
            <SideDock
              panel={sidePanel}
              overlay={isTablet}
              width={sideWidth}
              onResize={(w) => setPrefs((p) => ({ ...p, sideWidth: w }))}
              onDismiss={() => setSidePanel(null)}
              panels={{ files: filesPanel, languages: languagesPanel, people: peoplePanel }}
            />
          </>
        )}

        <main className="sx-editor-col">
          <EditorTabs
            tabs={tabs}
            activeId={room.activeFileId}
            onSelect={room.setActiveFileId}
            onClose={closeTab}
            trailing={isMobile ? (
              <LanguageTrigger languageId={activeLanguage} compact onClick={() => setSheet('languages')} />
            ) : null}
          />
          <div className="sx-editor-host">
            <div className="sx-editor-fill">
              <CodeEditor
                fileId={room.activeFileId}
                language={activeLanguage}
                initialCode={initial.code}
                editorKey={room.editorKey}
                theme={theme}
                layout={layout}
                registryRef={room.registryRef}
                isRemoteChangeRef={room.isRemoteChangeRef}
                onChange={handleCodeChange}
                onEditorReady={handleEditorReady}
                onRun={handleRun}
                onCaret={handleCaret}
              />
            </div>
          </div>
        </main>

        {showRight && (
          <RightDock width={rightWidth} onResize={(w) => setPrefs((p) => ({ ...p, rightWidth: w }))}>
            {rightPanel}
          </RightDock>
        )}
      </div>

      {!isMobile && (
        <StatusBar editor={editor} connection={room.connection} userCount={room.userCount} file={activeMeta} />
      )}

      {isMobile && (
        <MobileNav
          keyboardOpen={keyboardOpen}
          onFiles={() => setSheet('files')}
          onOutput={openOutput}
          onRun={handleRun}
          onChat={openChat}
          onPeople={() => setSheet('people')}
          onDismissKeyboard={() => document.activeElement?.blur?.()}
          canRun={canRun}
          isRunning={runner.isRunning}
          unread={unread}
          peopleCount={people.length}
        />
      )}

      {isMobile && sheet && (
        <Dialog title={sheetTitle} variant="sheet" size="lg" onClose={closeSheet}>
          {sheet === 'files' && filesPanel}
          {sheet === 'languages' && languagesPanel}
          {sheet === 'people' && peoplePanel}
          {sheet === 'panel' && rightPanel}
        </Dialog>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === 'folder' ? 'Delete folder?' : 'Delete file?'}
          confirmLabel="Delete"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        >
          <p>
            <strong>{pendingDelete.label}</strong>
            {pendingDelete.kind === 'folder' ? ` and its ${pendingDelete.ids.length} file${pendingDelete.ids.length > 1 ? 's' : ''}` : ''} will be removed for everyone in this room.
          </p>
        </ConfirmDialog>
      )}

      {!joinedName && (
        <JoinDialog roomId={roomId} username={username} setUsername={setUsername} onJoin={handleJoin} error={joinError} />
      )}

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default EditorPage;