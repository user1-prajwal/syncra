import { SUPPORTED_EXTENSIONS, extensionFor, languageForExtension } from '../config/languages';

/*
 * Folders without a protocol change.
 *
 * The server only knows flat files ({ id, name, language, ystate }). A folder is therefore just a
 * "/" inside `name` ("src/utils/math.py"); the tree shown in the explorer is derived from those paths.
 * Consequence: a folder exists for everyone only while it contains at least one file.
 */

export const MAX_SEGMENT_LENGTH = 64;
export const MAX_PATH_LENGTH = 120;

// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f\\:*?"<>|]/;

const fail = (error) => ({ ok: false, error });

// Two people can create a file in the same millisecond; ids must never collide.
export function newFileId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function baseName(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

export function dirName(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** Lower-case extension of the last path segment; dotfiles (".env") and "name." have none. */
export function extensionOf(path) {
  const name = baseName(path);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function isInside(path, folder) {
  return folder === '' || path === folder || path.startsWith(`${folder}/`);
}

const supportedList = () => SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(' ');

function checkSegments(segments) {
  if (segments.some((s) => s === '')) return 'Remove the empty folder name (a doubled “/”).';
  if (segments.some((s) => s === '.' || s === '..')) return '“.” and “..” can’t be used in names.';
  if (segments.some((s) => s !== s.trim())) return 'Names can’t start or end with a space.';
  if (segments.some((s) => s.length > MAX_SEGMENT_LENGTH)) return `Each name can be at most ${MAX_SEGMENT_LENGTH} characters.`;
  return null;
}

function checkTree(full, segments, existing) {
  const lower = full.toLowerCase();
  const names = existing.map((f) => f.name.toLowerCase());
  for (let i = 1; i < segments.length; i += 1) {
    const prefix = segments.slice(0, i).join('/').toLowerCase();
    if (names.includes(prefix)) return `“${segments.slice(0, i).join('/')}” is a file, so it can’t contain other files.`;
  }
  if (names.some((n) => n.startsWith(`${lower}/`))) return `A folder named “${full}” already exists.`;
  return null;
}

/**
 * Validate the text typed into "New file".
 * @param {string} raw      what the user typed ("helpers.py" or "utils/helpers.py")
 * @param {{name:string}[]} existing  current files
 * @param {string} parent   folder the entry is created in ('' = root)
 * @returns {{ok:true, path:string, language:string} | {ok:false, error:string}}
 */
export function validateNewFilePath(raw, existing, parent = '') {
  const typed = String(raw ?? '').trim();
  if (!typed) return fail('Enter a file name, for example main.py.');
  if (FORBIDDEN_CHARS.test(typed)) return fail('Names can’t contain \\ : * ? " < > | or control characters.');
  const relative = typed.replace(/^\/+/, '');
  if (relative.endsWith('/')) return fail('A file name can’t end with “/”.');

  const full = parent ? `${parent}/${relative}` : relative;
  if (full.length > MAX_PATH_LENGTH) return fail(`The full path can be at most ${MAX_PATH_LENGTH} characters.`);
  const segments = full.split('/');
  const segmentError = checkSegments(segments);
  if (segmentError) return fail(segmentError);

  const name = segments[segments.length - 1];
  const ext = extensionOf(name);
  if (!ext) {
    return fail(name.endsWith('.') ? 'Add the extension after the dot, for example .py.' : `Add a file extension, for example ${name}.py.`);
  }
  const language = languageForExtension(ext);
  if (!language) return fail(`“.${ext}” isn’t a supported file type. Supported: ${supportedList()}`);

  if (existing.some((f) => f.name.toLowerCase() === full.toLowerCase())) return fail(`“${full}” already exists.`);
  const treeError = checkTree(full, segments, existing);
  if (treeError) return fail(treeError);

  return { ok: true, path: full, language };
}

/** Validate the text typed into "New folder". Folders are local until they hold a file. */
export function validateNewFolderPath(raw, existing, parent = '') {
  const typed = String(raw ?? '').trim();
  if (!typed) return fail('Enter a folder name, for example utils.');
  if (FORBIDDEN_CHARS.test(typed)) return fail('Names can’t contain \\ : * ? " < > | or control characters.');
  const relative = typed.replace(/^\/+/, '').replace(/\/+$/, '');
  const full = parent ? `${parent}/${relative}` : relative;
  if (full.length > MAX_PATH_LENGTH) return fail(`The full path can be at most ${MAX_PATH_LENGTH} characters.`);
  const segments = full.split('/');
  const segmentError = checkSegments(segments);
  if (segmentError) return fail(segmentError);

  const names = existing.map((f) => f.name.toLowerCase());
  const lower = full.toLowerCase();
  if (names.includes(lower)) return fail(`“${full}” is already a file.`);
  if (names.some((n) => n.startsWith(`${lower}/`))) return fail(`The folder “${full}” already exists.`);
  const treeError = checkTree(full, segments.concat('x'), existing);
  if (treeError) return fail(treeError);
  return { ok: true, path: full };
}

/** "a/b/main.py" + "cpp" -> "a/b/main.cpp". Only the last segment changes. */
export function renameForLanguage(path, languageId) {
  const dir = dirName(path);
  const name = baseName(path);
  const i = name.lastIndexOf('.');
  const stem = i > 0 ? name.slice(0, i) : name;
  const next = `${stem}.${extensionFor(languageId)}`;
  return dir ? `${dir}/${next}` : next;
}

/** Returns `path`, or "stem (1).ext", "stem (2).ext"… when `path` is already taken (case-insensitive). */
export function uniquePath(path, taken) {
  const takenLower = new Set([...taken].map((p) => p.toLowerCase()));
  if (!takenLower.has(path.toLowerCase())) return path;
  const dir = dirName(path);
  const name = baseName(path);
  const i = name.lastIndexOf('.');
  const stem = i > 0 ? name.slice(0, i) : name;
  const ext = i > 0 ? name.slice(i) : '';
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    const full = dir ? `${dir}/${candidate}` : candidate;
    if (!takenLower.has(full.toLowerCase())) return full;
  }
  return path;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortNode(node) {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return collator.compare(a.name, b.name);
  });
  node.children.forEach((child) => child.type === 'folder' && sortNode(child));
}

/**
 * Build the explorer tree from flat file paths.
 * @param {{id:string,name:string}[]} files
 * @param {string[]} extraFolders folders to show even though they are empty (local-only)
 */
export function buildTree(files, extraFolders = []) {
  const root = { type: 'folder', name: '', path: '', children: [] };
  const folders = new Map([['', root]]);

  const ensureFolder = (path) => {
    const known = folders.get(path);
    if (known) return known;
    const node = { type: 'folder', name: baseName(path), path, children: [] };
    ensureFolder(dirName(path)).children.push(node);
    folders.set(path, node);
    return node;
  };

  extraFolders.forEach(ensureFolder);
  files.forEach((file) => {
    ensureFolder(dirName(file.name)).children.push({ type: 'file', name: baseName(file.name), path: file.name, file });
  });
  sortNode(root);
  return root;
}

/** Every folder path implied by the files ("a/b/c.py" -> "a", "a/b"). */
export function folderPathsOf(files) {
  const out = new Set();
  files.forEach((f) => {
    for (let dir = dirName(f.name); dir; dir = dirName(dir)) out.add(dir);
  });
  return out;
}

export function filesInFolder(files, folder) {
  return files.filter((f) => f.name.startsWith(`${folder}/`));
}
