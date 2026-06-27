import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import ChatPanel from "../components/ChatPanel";
import ActivityBar from "../components/ActivityBar";
import SidePanel from "../components/SidePanel";
import { SESSION_COLOR, BACKEND_URL } from "../constants";

const CURSOR_IDLE_MS = 3500;

function applyRemoteCodeToModel(model, monaco, newText) {
  const oldText = model.getValue();
  if (oldText === newText) return;

  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) start++;

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const startPos   = model.getPositionAt(start);
  const endPos     = model.getPositionAt(oldEnd);
  const insertText = newText.slice(start, newEnd);

  model.pushEditOperations(
    [],
    [{ range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column), text: insertText }],
    () => null,
  );
}

function EditorPage() {
  const { roomId } = useParams();

  const [username,      setUsername]      = useState("");
  const [nameEntered,   setNameEntered]   = useState(false);
  const [output,        setOutput]        = useState("");
  const [connected,     setConnected]     = useState(false);
  const [users,         setUsers]         = useState(0);
  const [cursors,       setCursors]       = useState({});
  const [userList,      setUserList]      = useState([]);
  const [languageAlert, setLanguageAlert] = useState("");
  const [messages,      setMessages]      = useState([]);
  const [newMessage,    setNewMessage]    = useState("");
  const [showChat,      setShowChat]      = useState(false);
  const [activePanel,   setActivePanel]   = useState("files");

  // ── Flat file list (original structure) ──────────────────────────────────
  const [files, setFiles] = useState([
    {
      id: "1",
      name: "main.py",
      language: "python",
      code: "# Start coding here...\nprint('Your next big idea starts right here.')",
    },
  ]);
  const [activeFileId,  setActiveFileId]  = useState("1");
  const [showNewFile,   setShowNewFile]   = useState(false);
  const [newFileName,   setNewFileName]   = useState("");

  const wsRef             = useRef(null);
  const isRemoteChange    = useRef(false);
  const editorRef         = useRef(null);
  const monacoRef         = useRef(null);
  const editorFileIdRef   = useRef(null);
  const decorationsRef    = useRef({});
  const usernameRef       = useRef("");
  const cursorTimeoutsRef = useRef({});
  const sendIdleTimerRef  = useRef(null);
  // Keeps a live copy of files accessible inside the WS effect closure
  // without adding 'files' to [roomId] deps (that would reconnect the socket
  // every time a file changes).
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  const activeFile = files.find(f => f.id === activeFileId) || files[0];

  // ── WebSocket ─────────────────────────────────────────────────────────────

  function sendJoin(name) {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "join", name, color: SESSION_COLOR }));
    }
  }

  useEffect(() => {
    // roomId from useParams() can be undefined if the route doesn't match
    if (!roomId) return;

    const ws = new WebSocket(`wss://${BACKEND_URL.replace("https://", "")}/${roomId}`);
    wsRef.current = ws;

    ws.onopen  = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = async (event) => {
      const text = event.data instanceof Blob ? await event.data.text() : event.data;
      const data = JSON.parse(text);

      if (data.type === "code") {
        setFiles(prev => prev.map(f => f.id === data.fileId ? { ...f, code: data.code } : f));
        if (data.fileId === editorFileIdRef.current && editorRef.current && monacoRef.current) {
          const model = editorRef.current.getModel();
          if (model && model.getValue() !== data.code) {
            isRemoteChange.current = true;
            applyRemoteCodeToModel(model, monacoRef.current, data.code);
            isRemoteChange.current = false;
          }
        }
      }

      if (data.type === "init") {
        isRemoteChange.current = true;
        if (data.files) {
          setFiles(data.files);
          setActiveFileId(data.files[0].id);
        }
        isRemoteChange.current = false;
      }

      if (data.type === "newfile") {
        setFiles(prev => {
          const exists = prev.find(f => f.id === data.file.id);
          return exists ? prev : [...prev, data.file];
        });
      }

      // broadcast when someone deletes a file
      if (data.type === "deletefile") {
        setFiles(prev => {
          const next = prev.filter(f => f.id !== data.fileId);
          return next.length > 0 ? next : prev; // never delete last file
        });
        setActiveFileId(prev => {
          if (prev === data.fileId) {
            // filesRef.current always has the latest value without needing
            // 'files' in the useEffect dependency array
            const remaining = filesRef.current.filter(f => f.id !== data.fileId);
            return remaining[0]?.id || prev;
          }
          return prev;
        });
      }

      if (data.type === "language") {
        setFiles(prev => prev.map(f =>
          f.id === data.fileId ? { ...f, language: data.language } : f
        ));
        setLanguageAlert(`${data.changedBy} switched to ${data.language}`);
        setTimeout(() => setLanguageAlert(""), 4000);
      }

      if (data.type === "name-taken") {
        alert(data.message);
        setNameEntered(false);
        setUsername("");
        return;
      }

      if (data.type === "users")    setUsers(data.count);
      if (data.type === "userlist") setUserList(data.users);

      if (data.type === "chat") {
        setMessages(prev => [...prev, { name: data.name, color: data.color, text: data.text, time: data.time }]);
      }

      if (data.type === "cursor") {
        setCursors(prev => ({
          ...prev,
          [data.name]: { name: data.name, color: data.color, line: data.line, column: data.column },
        }));
        if (cursorTimeoutsRef.current[data.name]) clearTimeout(cursorTimeoutsRef.current[data.name]);
        cursorTimeoutsRef.current[data.name] = setTimeout(() => {
          setCursors(prev => { const next = { ...prev }; delete next[data.name]; return next; });
        }, CURSOR_IDLE_MS + 1500);
      }

      if (data.type === "cursor-stop") {
        if (cursorTimeoutsRef.current[data.name]) {
          clearTimeout(cursorTimeoutsRef.current[data.name]);
          delete cursorTimeoutsRef.current[data.name];
        }
        setCursors(prev => { const next = { ...prev }; delete next[data.name]; return next; });
      }

      if (data.type === "cursor-leave") {
        setCursors(prev => { const next = { ...prev }; delete next[data.name]; return next; });
        if (decorationsRef.current[data.name] && editorRef.current) {
          editorRef.current.deltaDecorations(decorationsRef.current[data.name], []);
          delete decorationsRef.current[data.name];
        }
      }
    };

    return () => ws.close();
  }, [roomId]);

  useEffect(() => {
    if (!editorRef.current) return;
    Object.values(cursors).forEach(cursor => {
      const className = `remote-cursor-${cursor.name.replace(/\s/g, "-")}`;
      const styleId   = `style-${className}`;
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `
        .${className} { border-left: 2px solid ${cursor.color} !important; margin-left: -1px; position: relative; }
        .${className}::before { content: '${cursor.name}'; position: absolute; top: -18px; left: 0px; background: ${cursor.color}; color: white; font-size: 10px; font-weight: bold; padding: 1px 5px; border-radius: 3px; white-space: nowrap; pointer-events: none; z-index: 999; }
      `;
      if (!decorationsRef.current[cursor.name]) decorationsRef.current[cursor.name] = [];
      decorationsRef.current[cursor.name] = editorRef.current.deltaDecorations(
        decorationsRef.current[cursor.name],
        [{ range: { startLineNumber: cursor.line, startColumn: cursor.column, endLineNumber: cursor.line, endColumn: cursor.column + 1 }, options: { beforeContentClassName: className, stickiness: 1 } }],
      );
    });
    Object.keys(decorationsRef.current).forEach(name => {
      if (!cursors[name]) {
        editorRef.current.deltaDecorations(decorationsRef.current[name], []);
        delete decorationsRef.current[name];
        document.getElementById(`style-remote-cursor-${name.replace(/\s/g, "-")}`)?.remove();
      }
    });
  }, [cursors]);

  useEffect(() => {
    const chatDiv = document.getElementById("chat-messages");
    if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight;
  }, [messages]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCodeChange(value) {
    if (isRemoteChange.current) return;
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, code: value } : f));
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "code", code: value, fileId: activeFileId }));
    }
  }

  function broadcastActiveCursor(line, column) {
    if (isRemoteChange.current || !usernameRef.current) return;
    if (wsRef.current?.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type: "cursor", name: usernameRef.current, color: SESSION_COLOR, line, column }));
    if (sendIdleTimerRef.current) clearTimeout(sendIdleTimerRef.current);
    sendIdleTimerRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === 1)
        wsRef.current.send(JSON.stringify({ type: "cursor-stop", name: usernameRef.current }));
    }, CURSOR_IDLE_MS);
  }

  function handleEditorMount(editor, monaco) {
    editorRef.current       = editor;
    monacoRef.current       = monaco;
    editorFileIdRef.current = activeFileId;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => {});
    editor.onDidChangeModelContent(() => {
      if (isRemoteChange.current) return;
      const pos = editor.getPosition();
      if (pos) broadcastActiveCursor(pos.lineNumber, pos.column);
    });
    editor.onDidChangeCursorSelection(e => {
      if (isRemoteChange.current || !usernameRef.current) return;
      const sel = e.selection;
      const isEmpty = sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn;
      if (!isEmpty) broadcastActiveCursor(sel.endLineNumber, sel.endColumn);
    });
  }

  function handleLanguageChange(newLang) {
    const extMap = { python:"py", c:"c", cpp:"cpp", java:"java", typescript:"ts", csharp:"cs", fsharp:"fs", php:"php", ruby:"rb", haskell:"hs", go:"go", rust:"rs", plaintext:"txt" };
    setFiles(prev => prev.map(f => {
      if (f.id !== activeFileId) return f;
      const base = f.name.includes(".") ? f.name.slice(0, f.name.lastIndexOf(".")) : f.name;
      return { ...f, language: newLang, name: `${base}.${extMap[newLang] || "txt"}` };
    }));
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "language", language: newLang, changedBy: usernameRef.current, fileId: activeFileId }));
    }
  }

  function createNewFile() {
    if (!newFileName.trim()) return;
    const ext = newFileName.split(".").pop();
    const extMap = { py:"python", c:"c", java:"java", cpp:"cpp", ts:"typescript", txt:"plaintext", html:"html", css:"css", json:"json", cs:"csharp", fs:"fsharp", php:"php", rb:"ruby", hs:"haskell", go:"go", rs:"rust" };
    const newFile = {
      id: Date.now().toString(),
      name: newFileName.trim(),
      language: extMap[ext] || "plaintext",
      code: "",
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setNewFileName("");
    setShowNewFile(false);
    if (wsRef.current?.readyState === 1)
      wsRef.current.send(JSON.stringify({ type: "newfile", file: newFile }));
  }

  // ── Delete file ───────────────────────────────────────────────────────────

  function handleDeleteFile(fileId) {
    if (files.length <= 1) return; // always keep at least one file
    const remaining = files.filter(f => f.id !== fileId);
    setFiles(remaining);
    if (activeFileId === fileId) setActiveFileId(remaining[0].id);
    // broadcast delete to collaborators (backend needs to handle "deletefile" type)
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "deletefile", fileId }));
    }
  }

  function handleRunCode() {
    if (document.activeElement) document.activeElement.blur();
    setTimeout(() => executeCode(), 100);
  }

  async function executeCode() {
    setOutput("Running...");
    if (activeFile.language === "javascript") {
      try {
        let result = "";
        const origLog = console.log;
        console.log = (...args) => { result += args.join(" ") + "\n"; };
        new Function(activeFile.code)();
        console.log = origLog;
        setOutput(result || "✅ Ran successfully (no output)");
      } catch (err) {
        setOutput("❌ Error: " + err.message);
      }
      return;
    }
    if (!activeFile.code?.trim()) { setOutput("Nothing to run!"); return; }
    try {
      const response = await fetch(`${BACKEND_URL}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: activeFile.language, code: activeFile.code }),
      });
      const result = await response.json();
      setOutput(result.output || "✅ Ran successfully (no output)");
    } catch {
      setOutput("⚠️ Code Execution Unavailable\n\nCollaboration features work fully ✅");
    }
  }

  function sendMessage() {
    if (!newMessage.trim() || wsRef.current?.readyState !== 1) return;
    const msg = { type: "chat", name: username, color: SESSION_COLOR, text: newMessage.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    setMessages(prev => [...prev, { name: msg.name, color: msg.color, text: msg.text, time: msg.time }]);
    wsRef.current.send(JSON.stringify(msg));
    setNewMessage("");
  }

  function importFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".py,.java,.cpp,.ts,.txt,.html,.css,.json,.c,.cs,.fs,.php,.rb,.hs,.go,.rs";
    input.onchange = e => {
      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = event => {
          const ext = file.name.split(".").pop();
          const extMap = { js:"javascript", py:"python", c:"c", java:"java", cpp:"cpp", ts:"typescript", txt:"plaintext", html:"html", css:"css", json:"json", cs:"csharp", fs:"fsharp", php:"php", rb:"ruby", hs:"haskell", go:"go", rs:"rust" };
          const newFile = { id: Date.now().toString() + Math.random(), name: file.name, language: extMap[ext] || "plaintext", code: event.target.result };
          setFiles(prev => [...prev, newFile]);
          setActiveFileId(newFile.id);
          if (wsRef.current?.readyState === 1)
            wsRef.current.send(JSON.stringify({ type: "newfile", file: newFile }));
        };
        reader.readAsText(file);
      });
    };
    input.click();
  }

  async function exportFiles() {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    files.forEach(file => zip.file(file.name, file.code || ""));
    const blob = await zip.generateAsync({ type: "blob" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `collab-project-${roomId}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1e1e1e", fontFamily: "Arial, sans-serif" }}>

      {/* Username Popup */}
      {!nameEntered && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: "20px" }}>
          <div style={{ width: "100%", maxWidth: "370px", background: "rgba(24,24,27,0.98)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", padding: "26px", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ width: "70px", height: "4px", borderRadius: "999px", background: "linear-gradient(90deg,#F59E0B,#EF4444)", marginBottom: "22px" }} />
            <h2 style={{ color: "white", margin: 0, fontSize: "26px", fontWeight: "800", letterSpacing: "-1px" }}>Join Room</h2>
            <p style={{ color: "#A1A1AA", fontSize: "14px", marginTop: "10px", marginBottom: "22px", lineHeight: 1.6 }}>Enter your name to start collaborating.</p>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", padding: "14px", borderRadius: "14px", marginBottom: "18px" }}>
              <div style={{ color: "#71717A", fontSize: "11px", marginBottom: "6px", letterSpacing: "1px" }}>ROOM CODE</div>
              <div style={{ color: "#F4F4F5", fontWeight: "800", fontSize: "24px", letterSpacing: "5px" }}>{roomId}</div>
            </div>
            <input
              type="text" placeholder="Your name..." maxLength={20} autoFocus
              value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && username.trim()) { usernameRef.current = username.trim(); setNameEntered(true); sendJoin(username.trim()); } }}
              style={{ width: "100%", padding: "14px 16px", background: "#111111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box", marginBottom: "14px" }}
            />
            <button
              type="button"
              onClick={() => { if (username.trim()) { usernameRef.current = username.trim(); setNameEntered(true); sendJoin(username.trim()); } }}
              style={{ width: "100%", padding: "14px", border: "none", borderRadius: "14px", background: "linear-gradient(135deg,#F59E0B,#EF4444)", color: "white", fontSize: "15px", fontWeight: "700", cursor: "pointer" }}
            >
              Join →
            </button>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px", background: "#2d2d2d", borderBottom: "1px solid #444", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src="/syncra-icon.svg" alt="Syncra" style={{ height: "32px" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#1e1e1e", border: "1px solid #444", borderRadius: "6px", padding: "3px 10px" }}>
          <span style={{ color: "#888", fontSize: "11px" }}>Room:</span>
          <span style={{ color: "#4CAF50", fontSize: "12px", fontWeight: "bold", letterSpacing: "2px" }}>{roomId}</span>
          <button type="button" onClick={() => { navigator.clipboard.writeText(roomId); alert("Copied!"); }} style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", fontSize: "12px", padding: "0 2px" }}>📋</button>
        </div>

        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: connected ? "#4CAF50" : "#f44336", display: "inline-block" }} />
        <span style={{ color: "#888", fontSize: "11px" }}>{connected ? "Connected" : "Disconnected"}</span>
        <span style={{ color: "#888", fontSize: "11px", marginLeft: "4px" }}>👥 {users} online</span>

        <div style={{ marginLeft: "auto", padding: "3px 10px", background: "#1e1e1e", border: "1px solid #444", borderRadius: "6px", color: "#4CAF50", fontSize: "12px", fontWeight: "bold" }}>
          {activeFile.language.toUpperCase()}
        </div>

        <button type="button" onClick={importFile}             style={{ padding: "5px 12px", background: "#3a3a3a", color: "white", border: "1px solid #555", borderRadius: "5px", cursor: "pointer", fontSize: "12px" }}>Import</button>
        <button type="button" onClick={exportFiles}            style={{ padding: "5px 12px", background: "#3a3a3a", color: "white", border: "1px solid #555", borderRadius: "5px", cursor: "pointer", fontSize: "12px" }}>Export</button>
        <button type="button" onClick={() => setShowChat(p => !p)} style={{ padding: "5px 12px", background: showChat ? "#2563EB" : "#3a3a3a", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "12px" }}>💬 Chat</button>
        <button type="button" onClick={handleRunCode}          style={{ padding: "5px 16px", background: "#4CAF50", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}>▶ Run</button>
      </div>

      {/* Language Alert */}
      {languageAlert && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", background: "#1e1e2e", border: "1px solid #4CAF50", borderLeft: "4px solid #4CAF50", color: "white", padding: "12px 20px", borderRadius: "8px", fontSize: "13px", zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          🔄 {languageAlert}
        </div>
      )}

      {/* Main Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        <ActivityBar
          activePanel={activePanel}
          setActivePanel={setActivePanel}
          activeLanguage={activeFile.language}
          onLanguageChange={handleLanguageChange}
          users={users}
          username={username}
          userList={userList}
          SESSION_COLOR={SESSION_COLOR}
        />

        <SidePanel
          activePanel={activePanel}
          files={files}
          activeFileId={activeFileId}
          setActiveFileId={setActiveFileId}
          showNewFile={showNewFile}
          setShowNewFile={setShowNewFile}
          newFileName={newFileName}
          setNewFileName={setNewFileName}
          createNewFile={createNewFile}
          onDeleteFile={handleDeleteFile}
          username={username}
          userList={userList}
          SESSION_COLOR={SESSION_COLOR}
        />

        <div style={{ flex: 1, overflow: "hidden" }}>
          <Editor
            key={activeFileId}
            height="100%"
            language={activeFile.language}
            defaultValue={activeFile.code}
            onChange={handleCodeChange}
            onMount={handleEditorMount}
            theme="vs-dark"
          />
        </div>

        <div style={{ width: "30%", background: "#1a1a1a", borderLeft: "1px solid #444", padding: "15px", overflowY: "auto" }}>
          <p style={{ color: "#888", margin: "0 0 10px", fontSize: "13px" }}>OUTPUT</p>
          <pre style={{ color: "#00ff88", margin: 0, fontSize: "13px", whiteSpace: "pre-wrap" }}>
            {output || "Click Run to see output..."}
          </pre>
        </div>

      </div>

      {showChat && (
        <ChatPanel
          messages={messages}
          newMessage={newMessage}
          setNewMessage={setNewMessage}
          sendMessage={sendMessage}
          username={username}
          setShowChat={setShowChat}
        />
      )}
    </div>
  );
}

export default EditorPage;