/**
 * Language registry: the single source of truth for every language Syncra knows.
 *
 *  id          Value sent over the WebSocket ("language" messages) and to POST /run. Do not rename.
 *  extensions  Accepted file extensions. The first one is used when a file is switched to this language.
 *  runnable    Whether the Run button is offered for it (what the backend, or the browser for JS, can execute).
 *  icon        Image in /public/lang_icons. If it fails to load, a coloured glyph is drawn instead,
 *              so a wrong file name can never leave a blank icon.
 */
export const LANGUAGES = Object.freeze([
  { id: 'python',     label: 'Python',     extensions: ['py'],        runnable: true,  icon: '/lang_icons/python.png',     glyph: 'PY',   color: '#3776AB' },
  { id: 'javascript', label: 'JavaScript', extensions: ['js'],        runnable: true,  icon: '/lang_icons/javascript.png', glyph: 'JS',   color: '#F7DF1E' },
  { id: 'typescript', label: 'TypeScript', extensions: ['ts'],        runnable: true,  icon: '/lang_icons/typescript.png', glyph: 'TS',   color: '#3178C6' },
  { id: 'java',       label: 'Java',       extensions: ['java'],      runnable: true,  icon: '/lang_icons/java.png',       glyph: 'JV',   color: '#ED8B00' },
  { id: 'c',          label: 'C',          extensions: ['c'],         runnable: true,  icon: '/lang_icons/c.png',          glyph: 'C',    color: '#A8B9CC' },
  { id: 'cpp',        label: 'C++',        extensions: ['cpp', 'cc'], runnable: true,  icon: '/lang_icons/c++.png',        glyph: 'C++',  color: '#00599C' },
  { id: 'csharp',     label: 'C#',         extensions: ['cs'],        runnable: true,  icon: '/lang_icons/c-sharp.png',    glyph: 'C#',   color: '#9B4F9B' },
  { id: 'fsharp',     label: 'F#',         extensions: ['fs'],        runnable: true,  icon: '/lang_icons/FSharp.png',     glyph: 'F#',   color: '#378BBA' },
  { id: 'go',         label: 'Go',         extensions: ['go'],        runnable: true,  icon: '/lang_icons/golang.png',     glyph: 'GO',   color: '#00ADD8' },
  { id: 'rust',       label: 'Rust',       extensions: ['rs'],        runnable: true,  icon: '/lang_icons/Rust.png',       glyph: 'RS',   color: '#CE422B' },
  { id: 'ruby',       label: 'Ruby',       extensions: ['rb'],        runnable: true,  icon: '/lang_icons/Ruby.png',       glyph: 'RB',   color: '#CC342D' },
  { id: 'php',        label: 'PHP',        extensions: ['php'],       runnable: true,  icon: '/lang_icons/php.png',        glyph: 'PHP',  color: '#777BB4' },
  { id: 'haskell',    label: 'Haskell',    extensions: ['hs'],        runnable: true,  icon: '/lang_icons/Haskell.png',    glyph: 'HS',   color: '#5D4F85' },

  // Editable, but there is nothing to execute.
  { id: 'plaintext',  label: 'Plain text', extensions: ['txt'],       runnable: false, icon: '/lang_icons/text.png',       glyph: 'TXT',  color: '#8B949E' },
  { id: 'html',       label: 'HTML',       extensions: ['html'],      runnable: false, icon: '/lang_icons/html.png',       glyph: 'HTML', color: '#E34F26' },
  { id: 'css',        label: 'CSS',        extensions: ['css'],       runnable: false, icon: '/lang_icons/css.png',        glyph: 'CSS',  color: '#1572B6' },
  { id: 'json',       label: 'JSON',       extensions: ['json'],      runnable: false, icon: '/lang_icons/json.png',       glyph: '{ }',  color: '#CBCB41' },
]);

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));
const BY_EXTENSION = new Map(LANGUAGES.flatMap((l) => l.extensions.map((ext) => [ext, l.id])));

export const PLAIN_TEXT = BY_ID.get('plaintext');
export const RUNNABLE_LANGUAGES = LANGUAGES.filter((l) => l.runnable);
export const EDIT_ONLY_LANGUAGES = LANGUAGES.filter((l) => !l.runnable);
export const SUPPORTED_EXTENSIONS = Object.freeze([...BY_EXTENSION.keys()]);

/** Unknown ids (e.g. sent by a newer client) fall back to plain text instead of crashing. */
export function getLanguage(id) {
  return BY_ID.get(id) ?? PLAIN_TEXT;
}

/** Returns a language id, or null when the extension is not supported. */
export function languageForExtension(ext) {
  return BY_EXTENSION.get(String(ext ?? '').toLowerCase()) ?? null;
}

export function extensionFor(languageId) {
  return getLanguage(languageId).extensions[0];
}

export function isRunnable(languageId) {
  return BY_ID.get(languageId)?.runnable === true;
}
