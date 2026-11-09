import { useEffect, useRef } from 'react';
import { readableTextColor, safeColor } from '../lib/colors';

const MAX_LABEL = 24;

// Strings go into a CSS `content: '…'`, so quote, backslash and line breaks must be neutralised.
const cssString = (text) => String(text).slice(0, MAX_LABEL).replace(/[\\']/g, '\\$&').replace(/[\r\n\u2028\u2029]/g, ' ');

/**
 * Draws other people's carets as Monaco decorations.
 * One <style> element holds all per-person colours; class names are generated here, never taken from the network.
 */
export function useRemoteCursors(editor, cursors) {
  const decorationIds = useRef({});          // name -> ids returned by deltaDecorations
  const classNames = useRef(new Map());      // name -> "sx-rc-N"
  const styleEl = useRef(null);

  useEffect(() => {
    const el = document.createElement('style');
    el.setAttribute('data-syncra-cursors', '');
    document.head.appendChild(el);
    styleEl.current = el;
    return () => el.remove();
  }, []);

  // A new editor instance has a new model: ids from the old one are meaningless.
  useEffect(() => { decorationIds.current = {}; }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const rules = [];
    const live = new Set();

    Object.values(cursors).forEach((cursor) => {
      const name = String(cursor.name);
      live.add(name);
      if (!classNames.current.has(name)) classNames.current.set(name, `sx-rc-${classNames.current.size}`);
      const cls = classNames.current.get(name);
      const color = safeColor(cursor.color);
      rules.push(
        `.${cls}{border-left:2px solid ${color}!important;margin-left:-1px;position:relative}`,
        `.${cls}::before{content:'${cssString(name)}';position:absolute;bottom:100%;left:-2px;background:${color};color:${readableTextColor(color)};font:600 10px/14px var(--sx-font-ui,sans-serif);padding:0 5px;border-radius:2px;white-space:nowrap;pointer-events:none;z-index:10}`,
      );

      const line = Math.max(1, Math.floor(Number(cursor.line)) || 1);
      const column = Math.max(1, Math.floor(Number(cursor.column)) || 1);
      decorationIds.current[name] = editor.deltaDecorations(decorationIds.current[name] ?? [], [{
        range: { startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column + 1 },
        options: { beforeContentClassName: cls, stickiness: 1 },
      }]);
    });

    Object.keys(decorationIds.current).forEach((name) => {
      if (live.has(name)) return;
      editor.deltaDecorations(decorationIds.current[name], []);
      delete decorationIds.current[name];
    });

    if (styleEl.current) styleEl.current.textContent = rules.join('\n');
  }, [editor, cursors]);
}
