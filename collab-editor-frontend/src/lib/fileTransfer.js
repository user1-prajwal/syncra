import { SUPPORTED_EXTENSIONS, languageForExtension } from '../config/languages';
import { extensionOf, uniquePath, validateNewFilePath } from './filePaths';

export const MAX_IMPORT_BYTES = 512 * 1024;
export const IMPORT_ACCEPT = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',');

/** Opens the system file picker. Resolves with the chosen files, or [] when cancelled. */
export function pickFiles() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = IMPORT_ACCEPT;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/**
 * Turns picked files into new room files. `accept` only filters the picker UI, so every file is checked again:
 * supported extension, size, valid name, and a free name (clashes become "name (1).ext").
 * @returns {Promise<{accepted: {name:string, language:string, code:string}[], skipped: {name:string, reason:string}[]}>}
 */
export async function readImports(fileList, existingNames) {
  const taken = new Set(existingNames);
  const accepted = [];
  const skipped = [];

  for (const file of fileList) {
    const language = languageForExtension(extensionOf(file.name));
    if (!language) { skipped.push({ name: file.name, reason: 'unsupported file type' }); continue; }
    if (file.size > MAX_IMPORT_BYTES) { skipped.push({ name: file.name, reason: `larger than ${MAX_IMPORT_BYTES / 1024} KB` }); continue; }

    const name = uniquePath(file.name, taken);
    const check = validateNewFilePath(name, [...taken].map((n) => ({ name: n })));
    if (!check.ok) { skipped.push({ name: file.name, reason: 'invalid name' }); continue; }

    let text;
    try { text = await file.text(); } catch { skipped.push({ name: file.name, reason: 'could not be read' }); continue; }
    taken.add(check.path);
    accepted.push({ name: check.path, language: check.language, code: text.replace(/\r\n?/g, '\n') }); // the editor model uses \n
  }
  return { accepted, skipped };
}

/** Zips `files` ([{ name, code }]) keeping folders, then triggers a download. */
export async function downloadZip(files, archiveName) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  files.forEach((f) => zip.file(f.name, f.code || ''));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = archiveName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000); // revoking immediately can cancel the download in Safari
}
