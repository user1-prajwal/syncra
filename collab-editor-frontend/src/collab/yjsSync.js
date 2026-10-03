import * as Y from "yjs";

// Every file is one Yjs document holding a single Y.Text. Yjs is a CRDT: edits made by different
// people at the same moment merge to the same result on every client, so nobody's typing is lost.
// The server relays binary updates (base64 over the existing WebSocket) and keeps its own copy so
// late joiners can be sent the full state.

export const TEXT_KEY = "code";
// Transaction origin for changes that came FROM the server (or are not to be sent): never re-broadcast.
export const REMOTE = "remote";

export function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Owns the per-file documents of one room on this client.
export class YDocRegistry {
  // send(obj) -> boolean : sends a JSON message if the socket is open
  // onRemoteText(fileId, text) : called after a change that came from the server
  constructor({ send, onRemoteText }) {
    this.docs = new Map();
    this.pending = new Map(); // fileId -> server state we merged; local-only edits are uploaded after join is confirmed
    this.reupload = new Set(); // files the server no longer has (it restarted) that we must send again
    this.send = send;
    this.onRemoteText = onRemoteText;
  }

  has(id) { return this.docs.has(id); }
  ytext(id) { return this.docs.get(id)?.getText(TEXT_KEY); }
  text(id) { return this.ytext(id)?.toString() ?? ""; }

  _create(id) {
    const doc = new Y.Doc();
    doc.on("update", (update, origin) => {
      // Any change not marked REMOTE is a local edit: send it. If the socket is closed it is not lost;
      // it stays in the document and is uploaded as a diff after reconnecting.
      if (origin !== REMOTE) this.send({ type: "yupdate", fileId: id, update: bytesToBase64(update) });
    });
    doc.getText(TEXT_KEY).observe((_event, tr) => {
      if (tr.origin === REMOTE) this.onRemoteText?.(id, doc.getText(TEXT_KEY).toString());
    });
    this.docs.set(id, doc);
    return doc;
  }

  // A file created on this client: this client owns its initial history. Returns the state to announce.
  createLocal(id, code) {
    const doc = this._create(id);
    if (code) doc.transact(() => doc.getText(TEXT_KEY).insert(0, code), REMOTE); // announced via `newfile`, not `yupdate`
    return bytesToBase64(Y.encodeStateAsUpdate(doc));
  }

  stateOf(id) {
    return bytesToBase64(Y.encodeStateAsUpdate(this.docs.get(id)));
  }

  // Merge a full state from the server into a (possibly existing) document. Returns true if it was new.
  applyState(id, ystate) {
    let doc = this.docs.get(id);
    const isNew = !doc;
    if (isNew) doc = this._create(id);
    if (ystate) {
      const state = base64ToBytes(ystate);
      Y.applyUpdate(doc, state, REMOTE);
      if (!isNew) this.pending.set(id, state);
    }
    return isNew;
  }

  applyUpdate(id, update) {
    const doc = this.docs.get(id);
    if (doc) Y.applyUpdate(doc, base64ToBytes(update), REMOTE);
  }

  remove(id) {
    this.docs.get(id)?.destroy();
    this.docs.delete(id);
    this.pending.delete(id);
    this.reupload.delete(id);
  }

  // Merge the server's snapshot after (re)connecting. Returns ids of local files the server does not have.
  mergeSnapshot(files) {
    const seen = new Set(files.map((f) => f.id));
    for (const f of files) this.applyState(f.id, f.ystate);
    return [...this.docs.keys()].filter((id) => !seen.has(id));
  }

  // Called once the server has accepted our join. Uploads (a) files the server lost and (b) edits made
  // while we were offline, computed as a diff against the snapshot we merged.
  flushPending(getMeta) {
    for (const id of this.reupload) {
      const meta = getMeta(id);
      if (meta && this.docs.has(id)) this.send({ type: "newfile", file: { id, name: meta.name, language: meta.language, ystate: this.stateOf(id) } });
    }
    this.reupload.clear();
    for (const [id, state] of this.pending) {
      const doc = this.docs.get(id);
      if (!doc) continue;
      const diff = Y.encodeStateAsUpdate(doc, Y.encodeStateVectorFromUpdate(state));
      if (diff.length > 2) this.send({ type: "yupdate", fileId: id, update: bytesToBase64(diff) });
    }
    this.pending.clear();
  }

  get hasPending() { return this.pending.size > 0 || this.reupload.size > 0; }

  destroyAll() {
    for (const doc of this.docs.values()) doc.destroy();
    this.docs.clear();
    this.pending.clear();
    this.reupload.clear();
  }
}

// Two-way binding between one Y.Text and one Monaco editor:
//   Monaco edits   -> Y.Text transaction (sent to the server by the registry's update listener)
//   Y.Text changes -> minimal Monaco edits (cursor and scroll of the local user are preserved)
// `remoteFlag` is a ref whose `.current` is true while remote changes are being applied, so the page's
// cursor-broadcast handlers can ignore them. Undo/redo only undo THIS user's own edits.
export function bindYTextToMonaco(ytext, editor, monaco, remoteFlag) {
  const model = editor.getModel();
  model.setEOL(monaco.editor.EndOfLineSequence.LF); // Y.Text offsets assume one-character line breaks

  const origin = {}; // identifies transactions created by this binding
  let applying = false;
  const asRemote = (fn) => {
    applying = true;
    if (remoteFlag) remoteFlag.current = true;
    try { fn(); } finally { applying = false; if (remoteFlag) remoteFlag.current = false; }
  };

  // Make the model match the document before wiring anything up.
  const initial = ytext.toString();
  if (model.getValue() !== initial) asRemote(() => model.setValue(initial));

  const undoManager = new Y.UndoManager(ytext, { trackedOrigins: new Set([origin]) });
  const ctrl = monaco.KeyMod.CtrlCmd;
  editor.addCommand(ctrl | monaco.KeyCode.KeyZ, () => undoManager.undo());
  editor.addCommand(ctrl | monaco.KeyCode.KeyY, () => undoManager.redo());
  editor.addCommand(ctrl | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () => undoManager.redo());

  const onModelChange = editor.onDidChangeModelContent((event) => {
    if (applying) return;
    ytext.doc.transact(() => {
      // changes are expressed against the pre-edit text: apply from the end so earlier offsets stay valid
      [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset).forEach((c) => {
        if (c.rangeLength) ytext.delete(c.rangeOffset, c.rangeLength);
        if (c.text) ytext.insert(c.rangeOffset, c.text);
      });
    }, origin);
  });

  const observer = (event, tr) => {
    if (tr.origin === origin || model.isDisposed()) return; // our own edit, or the editor is already gone
    asRemote(() => {
      // Apply the delta one operation at a time against the live model. `index` is the position in the
      // model as it is right now, so an insert and a delete at the same spot (a replace) cannot overlap.
      let index = 0;
      for (const op of event.delta) {
        if (op.retain != null) {
          index += op.retain;
        } else if (op.insert != null) {
          const text = String(op.insert);
          const p = model.getPositionAt(index);
          model.applyEdits([{ range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column), text }]);
          index += text.length;
        } else if (op.delete != null) {
          const from = model.getPositionAt(index);
          const to = model.getPositionAt(index + op.delete);
          model.applyEdits([{ range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: "" }]);
        }
      }
    });
  };
  ytext.observe(observer);

  return {
    destroy() {
      ytext.unobserve(observer);
      onModelChange.dispose();
      undoManager.destroy();
    },
  };
}
