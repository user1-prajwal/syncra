import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { bindYTextToMonaco } from '../../collab/yjsSync';
import { MONACO_THEME, defineSyncraThemes } from '../../lib/monacoThemes';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Monaco bound to the file's Y.Text. It is remounted per file / per server snapshot via `editorKey`
 * (same behaviour as before), but NOT when the theme changes: the theme is applied in place.
 */
function CodeEditor({
  fileId, language, initialCode, editorKey, theme, layout,
  registryRef, isRemoteChangeRef,
  onChange, onEditorReady, onRun, onCaret,
}) {
  const bindingRef = useRef(null);
  // Monaco calls back long after render, so it must always see the latest props. They are copied into refs in a
  // layout effect (not during render), which runs before Monaco mounts and reports `onMount`.
  const fileIdRef = useRef(fileId);
  const callbacks = useRef({ onChange, onEditorReady, onRun, onCaret });
  useLayoutEffect(() => {
    fileIdRef.current = fileId;
    callbacks.current = { onChange, onEditorReady, onRun, onCaret };
  });

  const handleChange = useCallback((value) => {
    if (isRemoteChangeRef.current) return;
    callbacks.current.onChange?.(value ?? '');
  }, [isRemoteChangeRef]);

  const handleMount = useCallback((editor, monaco) => {
    try { bindingRef.current?.destroy(); } catch { /* already gone */ }
    bindingRef.current = null;
    const ytext = registryRef.current?.ytext(fileIdRef.current);
    if (ytext) bindingRef.current = bindYTextToMonaco(ytext, editor, monaco, isRemoteChangeRef);

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => {}); // keep the browser's print dialog out of the editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => callbacks.current.onRun?.());

    editor.onDidChangeModelContent(() => {
      if (isRemoteChangeRef.current) return;
      const pos = editor.getPosition();
      if (pos) callbacks.current.onCaret?.(pos.lineNumber, pos.column);
    });
    editor.onDidChangeCursorSelection((e) => {
      const s = e.selection;
      if (s.startLineNumber === s.endLineNumber && s.startColumn === s.endColumn) return;
      callbacks.current.onCaret?.(s.endLineNumber, s.endColumn);
    });

    callbacks.current.onEditorReady?.(editor);
  }, [registryRef, isRemoteChangeRef]);

  const handleBeforeMount = useCallback((monaco) => defineSyncraThemes(monaco), []);

  const compact = layout === 'mobile';
  const options = useMemo(() => {
    const calm = reduceMotion();
    return {
      automaticLayout: true,                 // panels are resizable; the editor must follow its container
      fontSize: 14,
      fontFamily: "'JetBrains Mono','Fira Code',Consolas,ui-monospace,monospace",
      fontLigatures: true,
      lineHeight: compact ? 21 : 22,
      minimap: { enabled: layout === 'desktop', renderCharacters: false, maxColumn: 80 },
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      cursorBlinking: calm ? 'solid' : 'smooth',
      cursorSmoothCaretAnimation: 'off',
      smoothScrolling: !calm,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      padding: { top: 8, bottom: 8 },
      renderLineHighlight: 'line',
      wordWrap: compact ? 'on' : 'off',
      folding: !compact,
      glyphMargin: false,
      lineNumbersMinChars: compact ? 3 : 4,
      lineDecorationsWidth: compact ? 6 : 10,
      formatOnPaste: true,
      fixedOverflowWidgets: true,            // suggestion popups may cross a panel edge
      suggest: { showIcons: true },
      scrollbar: { alwaysConsumeMouseWheel: false },
    };
  }, [compact, layout]);

  return (
    <Editor
      key={editorKey}
      height="100%"
      language={language}
      defaultValue={initialCode}
      theme={MONACO_THEME[theme]}
      beforeMount={handleBeforeMount}
      onChange={handleChange}
      onMount={handleMount}
      loading={<div className="sx-editor-loading">Loading editor…</div>}
      options={options}
    />
  );
}

export default memo(CodeEditor);