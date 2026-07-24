import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import ChatPanel from "../components/ChatPanel";
import ActivityBar from "../components/ActivityBar";
import SidePanel from "../components/SidePanel";
import { SESSION_COLOR, BACKEND_URL } from "../constants";

const CURSOR_IDLE_MS = 3500;

const LANG_ICONS = {
  python:"/lang_icons/python.png", c:"/lang_icons/c.png", cpp:"/lang_icons/cpp.png",
  java:"/lang_icons/java.png", typescript:"/lang_icons/typescript.png",
  javascript:"/lang_icons/javascript.png", csharp:"/lang_icons/csharp.png",
  fsharp:"/lang_icons/fsharp.png", php:"/lang_icons/php.png", ruby:"/lang_icons/ruby.png",
  haskell:"/lang_icons/haskell.png", go:"/lang_icons/go.png", rust:"/lang_icons/rust.png",
  plaintext:"/lang_icons/text.png",
};
const EXT_TO_LANG = {
  py:"python",c:"c",java:"java",cpp:"cpp",cc:"cpp",ts:"typescript",js:"javascript",
  txt:"plaintext",html:"html",css:"css",json:"json",cs:"csharp",fs:"fsharp",
  php:"php",rb:"ruby",hs:"haskell",go:"go",rs:"rust",
};
const LANG_TO_EXT = {
  python:"py",c:"c",cpp:"cpp",java:"java",typescript:"ts",javascript:"js",
  csharp:"cs",fsharp:"fs",php:"php",ruby:"rb",haskell:"hs",go:"go",rust:"rs",plaintext:"txt",
};

function applyRemoteCodeToModel(model, monaco, newText) {
  const oldText = model.getValue();
  if (oldText === newText) return;
  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) start++;
  let oldEnd = oldText.length, newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd-1] === newText[newEnd-1]) { oldEnd--; newEnd--; }
  const sp = model.getPositionAt(start), ep = model.getPositionAt(oldEnd);
  model.pushEditOperations([],[{range:new monaco.Range(sp.lineNumber,sp.column,ep.lineNumber,ep.column),text:newText.slice(start,newEnd)}],()=>null);
}

function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mob;
}

// ─── Desktop Tab Bar 
function TabBar({ files, activeFileId, setActiveFileId, onClose }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-end", background:"#252526", overflowX:"auto", overflowY:"hidden", borderBottom:"1px solid #1a1a1a", flexShrink:0, height:36, scrollbarWidth:"none" }}>
      {files.map(file => {
        const active = file.id === activeFileId;
        const icon = LANG_ICONS[file.language] || LANG_ICONS.plaintext;
        return (
          <div key={file.id} onClick={() => setActiveFileId(file.id)} title={file.name}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"0 12px", height:35, cursor:"pointer", fontSize:12, whiteSpace:"nowrap", userSelect:"none", borderRight:"1px solid #1a1a1a", flexShrink:0, borderTop:active?"2px solid #4CAF50":"2px solid transparent", background:active?"#1e1e1e":"#2d2d2d", color:active?"#fff":"#888", transition:"background .1s" }}
            onMouseEnter={e => { if(!active) e.currentTarget.style.background="#323232"; }}
            onMouseLeave={e => { if(!active) e.currentTarget.style.background="#2d2d2d"; }}>
            <img src={icon} alt="" style={{ width:12,height:12,objectFit:"contain",flexShrink:0,opacity:active?1:0.6 }} onError={e=>e.currentTarget.style.display="none"}/>
            <span style={{ maxWidth:90,overflow:"hidden",textOverflow:"ellipsis" }}>{file.name}</span>
            {files.length > 1 && (
              <span onClick={e=>{e.stopPropagation();onClose(file.id);}}
                style={{ marginLeft:2,width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:3,fontSize:14,color:"#555",lineHeight:1,flexShrink:0 }}
                onMouseEnter={e=>{e.currentTarget.style.background="#555";e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#555";}}>
                ×
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Desktop Status Bar 
function StatusBar({ connected, users, activeFile, cursorPos, roomId }) {
  return (
    <div style={{ display:"flex", alignItems:"center", height:22, background:"#007acc", flexShrink:0, fontSize:11, color:"rgba(255,255,255,.85)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"0 8px", height:"100%", background:connected?"rgba(0,0,0,.15)":"#c0392b", borderRight:"1px solid rgba(255,255,255,.1)", flexShrink:0 }}>
        <span style={{ width:6,height:6,borderRadius:"50%",background:connected?"#a8f5a8":"#ff8080",display:"inline-block" }}/>
        {connected?"Connected":"Disconnected"}
      </div>
      <div style={{ padding:"0 8px", borderRight:"1px solid rgba(255,255,255,.1)", fontFamily:"monospace", letterSpacing:2, fontWeight:700, flexShrink:0 }}>{roomId}</div>
      <div style={{ padding:"0 8px", borderRight:"1px solid rgba(255,255,255,.1)", flexShrink:0 }}>👥 {users}</div>
      <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", height:"100%" }}>
        {activeFile && <div style={{ padding:"0 8px", borderLeft:"1px solid rgba(255,255,255,.1)" }}>{activeFile.language}</div>}
        {cursorPos && <div style={{ padding:"0 8px", borderLeft:"1px solid rgba(255,255,255,.1)" }}>Ln {cursorPos.line}, Col {cursorPos.col}</div>}
      </div>
    </div>
  );
}

// ─── Desktop Output Panel 
function DesktopOutputPanel({ output, onClear, isRunning }) {
  const isError = output.startsWith("❌");
  return (
    <div style={{ width:"28%", minWidth:200, display:"flex", flexDirection:"column", background:"#141414", borderLeft:"1px solid #2a2a2a" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 14px", height:36, background:"#1a1a1a", borderBottom:"1px solid #222", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:isRunning?"#f39c12":isError?"#e74c3c":output?"#4CAF50":"#3a3a3a" }}/>
          <span style={{ color:"#666", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>Output</span>
        </div>
        {output && <button onClick={onClear} style={{ background:"transparent", border:"none", color:"#555", cursor:"pointer", fontSize:11, padding:"2px 6px", borderRadius:3 }}>Clear</button>}
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"14px 16px", fontFamily:"'JetBrains Mono',monospace", fontSize:12.5, lineHeight:1.65 }}>
        {!output
          ? <div style={{ color:"#3a3a3a", fontSize:12, lineHeight:1.9 }}>
              <div style={{ marginBottom:8 }}>▶  Run to see output here.</div>
              <div style={{ color:"#2e2e2e", fontSize:11 }}>Python · C · C++ · Java<br/>TypeScript · Go · Rust<br/>Ruby · Haskell · PHP · C# · F#</div>
            </div>
          : <pre style={{ margin:0, whiteSpace:"pre-wrap", wordBreak:"break-word", color:isError?"#ff6b6b":isRunning?"#f39c12":"#00e676" }}>{output}</pre>
        }
      </div>
    </div>
  );
}

// ─── Mobile: full-screen bottom sheet overlay 
// Used for Files, Output, Chat on mobile.
// title, onClose, children
function MobileSheet({ title, onClose, children, height="85vh" }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:800, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      {/* dim backdrop */}
      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.6)" }} onClick={onClose}/>
      {/* sheet */}
      <div style={{ position:"relative", background:"#1e1e1e", borderRadius:"14px 14px 0 0", height, display:"flex", flexDirection:"column", overflow:"hidden", border:"1px solid #2a2a2a" }}>
        {/* drag handle + header */}
        <div style={{ flexShrink:0, background:"#252526", borderBottom:"1px solid #333" }}>
          <div style={{ display:"flex", justifyContent:"center", padding:"8px 0 4px" }}>
            <div style={{ width:36, height:4, borderRadius:2, background:"#444" }}/>
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px 10px" }}>
            <span style={{ color:"#ccc", fontSize:13, fontWeight:600 }}>{title}</span>
            <button onClick={onClose} style={{ background:"transparent", border:"none", color:"#666", cursor:"pointer", fontSize:22, lineHeight:1, padding:0 }}>×</button>
          </div>
        </div>
        {/* content fills remaining space */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Output Sheet content 
function MobileOutputContent({ output, onClear, isRunning }) {
  const isError = output.startsWith("❌");
  return (
    <div style={{ flex:1, overflowY:"auto", padding:"14px 16px", WebkitOverflowScrolling:"touch", fontFamily:"'JetBrains Mono',monospace", fontSize:13, lineHeight:1.7 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
        <div style={{ width:8,height:8,borderRadius:"50%",background:isRunning?"#f39c12":isError?"#e74c3c":output?"#4CAF50":"#3a3a3a" }}/>
        <span style={{ color:"#666", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>Output</span>
        {output && <button onClick={onClear} style={{ marginLeft:"auto", background:"transparent", border:"none", color:"#555", cursor:"pointer", fontSize:12 }}>Clear</button>}
      </div>
      {!output
        ? <div style={{ color:"#3a3a3a", fontSize:13 }}>▶ Run your code to see output here.</div>
        : <pre style={{ margin:0, whiteSpace:"pre-wrap", wordBreak:"break-word", color:isError?"#ff6b6b":isRunning?"#f39c12":"#00e676" }}>{output}</pre>
      }
    </div>
  );
}

// ─── Mobile Bottom Tab Bar 
// 5 tabs: Files | Chat | RUN (center, prominent) | Output | Users
function MobileTabBar({ onFiles, onChat, onRun, onOutput, onUsers, isRunning, chatBadge, hasOutput }) {
  return (
    <div style={{ display:"flex", background:"#181818", borderTop:"1px solid #2a2a2a", flexShrink:0, height:52 }}>

      {/* Files */}
      <button onClick={onFiles} style={{ flex:1, background:"transparent", border:"none", color:"#888", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, fontSize:9, fontFamily:"inherit", fontWeight:500, letterSpacing:.3 }}>
        <span style={{ fontSize:20 }}>📁</span>
        Files
      </button>

      {/* Chat */}
      <button onClick={onChat} style={{ flex:1, background:"transparent", border:"none", color:"#888", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, fontSize:9, fontFamily:"inherit", fontWeight:500, letterSpacing:.3, position:"relative" }}>
        <span style={{ fontSize:20 }}>💬</span>
        Chat
        {chatBadge > 0 && (
          <span style={{ position:"absolute", top:6, right:"calc(50% - 14px)", background:"#e74c3c", color:"#fff", borderRadius:10, fontSize:8, padding:"1px 5px", minWidth:16, textAlign:"center", fontWeight:700 }}>
            {chatBadge}
          </span>
        )}
      </button>

      {/* RUN — center, big green */}
      <button onClick={onRun} disabled={isRunning}
        style={{ flex:1.4, background:isRunning?"#2e7d32":"#4CAF50", border:"none", color:"#fff", cursor:isRunning?"default":"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, fontSize:10, fontFamily:"inherit", fontWeight:700, letterSpacing:.5, opacity:isRunning?0.75:1, transition:"background .15s" }}>
        <span style={{ fontSize:22 }}>{isRunning?"⏳":"▶"}</span>
        {isRunning?"Running":"Run"}
      </button>

      {/* Output */}
      <button onClick={onOutput} style={{ flex:1, background:"transparent", border:"none", color: hasOutput?"#4CAF50":"#888", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, fontSize:9, fontFamily:"inherit", fontWeight:500, letterSpacing:.3 }}>
        <span style={{ fontSize:20 }}>📤</span>
        Output
      </button>

      {/* Users — just opens a small info sheet */}
      <button onClick={onUsers} style={{ flex:1, background:"transparent", border:"none", color:"#888", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, fontSize:9, fontFamily:"inherit", fontWeight:500, letterSpacing:.3 }}>
        <span style={{ fontSize:20 }}>👥</span>
        Users
      </button>
    </div>
  );
}

// ─── Mobile Users Sheet content ─
function MobileUsersContent({ username, userList, SESSION_COLOR }) {
  const all = [{ name:username, color:SESSION_COLOR, isYou:true }, ...userList.filter(u=>u.name!==username)];
  return (
    <div style={{ flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
      {all.map(u => (
        <div key={u.name} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:"1px solid #252525" }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:u.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#fff", flexShrink:0 }}>
            {u.name[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ color:"#ddd", fontSize:14, fontWeight:600 }}>{u.name}</div>
            {u.isYou && <div style={{ color:"#4CAF50", fontSize:11 }}>you</div>}
          </div>
          <div style={{ marginLeft:"auto", width:8, height:8, borderRadius:"50%", background:"#4CAF50" }}/>
        </div>
      ))}
    </div>
  );
}

// ─── Join modal 
function JoinModal({ roomId, username, setUsername, onJoin }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.8)", backdropFilter:"blur(10px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:20 }}>
      <div style={{ width:"100%", maxWidth:400, background:"#18181b", border:"1px solid #27272a", borderRadius:20, padding:28, boxShadow:"0 40px 100px rgba(0,0,0,.9)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
          <img src="/syncra-icon.svg" alt="Syncra" style={{ height:28 }} onError={e=>e.target.style.display="none"}/>
          <div style={{ flex:1, height:1, background:"linear-gradient(90deg,#4CAF50,transparent)" }}/>
        </div>
        <h2 style={{ color:"#f4f4f5", margin:"0 0 6px", fontSize:21, fontWeight:800 }}>Join Room</h2>
        <p style={{ color:"#52525b", fontSize:13, margin:"0 0 20px", lineHeight:1.6 }}>Enter your name to start collaborating.</p>
        <div style={{ background:"#111", border:"1px solid #27272a", borderRadius:10, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ color:"#3f3f46", fontSize:10, letterSpacing:2, textTransform:"uppercase", marginBottom:3 }}>Room Code</div>
            <div style={{ color:"#4CAF50", fontWeight:800, fontSize:20, letterSpacing:6, fontFamily:"monospace" }}>{roomId}</div>
          </div>
          <button type="button" onClick={()=>navigator.clipboard.writeText(roomId||"")}
            style={{ background:"#1e1e1e", border:"1px solid #333", color:"#888", cursor:"pointer", borderRadius:6, padding:"5px 10px", fontSize:11, fontFamily:"inherit" }}>
            Copy
          </button>
        </div>
        <input type="text" placeholder="Your display name..." maxLength={20} autoFocus
          value={username} onChange={e=>setUsername(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"&&username.trim()) onJoin(); }}
          style={{ width:"100%", padding:"12px 14px", marginBottom:12, background:"#111", border:"1px solid #27272a", borderRadius:10, color:"white", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
          onFocus={e=>{e.target.style.borderColor="#4CAF50";e.target.style.boxShadow="0 0 0 2px rgba(76,175,80,.15)";}}
          onBlur={e=>{e.target.style.borderColor="#27272a";e.target.style.boxShadow="none";}}
        />
        <button type="button" onClick={onJoin}
          style={{ width:"100%", padding:13, border:"none", borderRadius:10, background:"linear-gradient(135deg,#4CAF50,#2e7d32)", color:"white", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 20px rgba(76,175,80,.35)" }}>
          Join Session →
        </button>
      </div>
    </div>
  );
}

// ─── EditorPage 
function EditorPage() {
  const { roomId } = useParams();
  const isMobile   = useIsMobile();

  const [username,      setUsername]      = useState("");
  const [nameEntered,   setNameEntered]   = useState(false);
  const [output,        setOutput]        = useState("");
  const [isRunning,     setIsRunning]     = useState(false);
  const [connected,     setConnected]     = useState(false);
  const [users,         setUsers]         = useState(0);
  const [cursors,       setCursors]       = useState({});
  const [userList,      setUserList]      = useState([]);
  const [languageAlert, setLanguageAlert] = useState("");
  const [messages,      setMessages]      = useState([]);
  const [newMessage,    setNewMessage]    = useState("");
  const [showChat,      setShowChat]      = useState(false);
  const [activePanel,   setActivePanel]   = useState("files");
  const [cursorPos,     setCursorPos]     = useState(null);
  const [initReceived,  setInitReceived]  = useState(false);

  // Mobile sheet visibility
  const [mobSheet, setMobSheet] = useState(null); // "files"|"output"|"users"|null

  const [files,        setFiles]        = useState([{ id:"1", name:"main.py", language:"python", code:"# Start coding here\nprint('Your next big idea starts right here.')" }]);
  const [activeFileId, setActiveFileId] = useState("1");
  const [showNewFile,  setShowNewFile]  = useState(false);
  const [newFileName,  setNewFileName]  = useState("");

  const wsRef             = useRef(null);
  const isRemoteChange    = useRef(false);
  const editorRef         = useRef(null);
  const monacoRef         = useRef(null);
  const editorFileIdRef   = useRef(null);
  const decorationsRef    = useRef({});
  const usernameRef       = useRef("");
  const cursorTimeoutsRef = useRef({});
  const sendIdleTimerRef  = useRef(null);
  const filesRef          = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  const activeFile  = files.find(f => f.id === activeFileId) || files[0];
  const onlineUsers = [{ name:username, color:SESSION_COLOR }, ...userList.filter(u => u.name !== username)];

  // ── WebSocket ─────
  // Prevent mobile body scroll (the editor should handle all scrolling internally)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  function sendJoin(name) {
    if (wsRef.current?.readyState === 1)
      wsRef.current.send(JSON.stringify({ type:"join", name, color:SESSION_COLOR }));
  }

  useEffect(() => {
    if (!roomId) return;
    const ws = new WebSocket(`wss://${BACKEND_URL.replace("https://","")}/${roomId}`);
    wsRef.current = ws;
    ws.onopen  = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = async (event) => {
      const text = event.data instanceof Blob ? await event.data.text() : event.data;
      const data = JSON.parse(text);

      if (data.type==="code") {
        if (data.sentAt) console.log(`Latency: ${Date.now()-data.sentAt}ms`);
        setFiles(prev=>prev.map(f=>f.id===data.fileId?{...f,code:data.code}:f));
        if (data.fileId===editorFileIdRef.current&&editorRef.current&&monacoRef.current) {
          const model=editorRef.current.getModel();
          if (model&&model.getValue()!==data.code) {
            isRemoteChange.current=true;
            applyRemoteCodeToModel(model,monacoRef.current,data.code);
            isRemoteChange.current=false;
          }
        }
      }
      if (data.type==="init") {
        isRemoteChange.current=true;
        if (data.files) { setFiles(data.files); setActiveFileId(data.files[0].id); setInitReceived(true); }
        if (data.users) setUserList(data.users);
        isRemoteChange.current=false;
      }
      if (data.type==="newfile") setFiles(prev=>prev.find(f=>f.id===data.file.id)?prev:[...prev,data.file]);
      if (data.type==="deletefile") {
        setFiles(prev=>{const n=prev.filter(f=>f.id!==data.fileId);return n.length>0?n:prev;});
        setActiveFileId(prev=>{
          if (prev!==data.fileId) return prev;
          const rem=filesRef.current.filter(f=>f.id!==data.fileId);
          return rem[0]?.id||prev;
        });
      }
      if (data.type==="language") {
        setFiles(prev=>prev.map(f=>f.id===data.fileId?{...f,language:data.language}:f));
        setLanguageAlert(`${data.changedBy} switched to ${data.language}`);
        setTimeout(()=>setLanguageAlert(""),4000);
      }
      if (data.type==="name-taken") { alert(data.message); setNameEntered(false); setUsername(""); return; }
      if (data.type==="users")    setUsers(data.count);
      if (data.type==="userlist") setUserList(data.users);
      if (data.type==="join")     setUserList(prev=>prev.find(u=>u.name===data.name)?prev:[...prev,{name:data.name,color:data.color}]);
      if (data.type==="leave")    setUserList(prev=>prev.filter(u=>u.name!==data.name));
      if (data.type==="chat")     setMessages(prev=>[...prev,{name:data.name,color:data.color,text:data.text,time:data.time}]);
      if (data.type==="cursor") {
        setCursors(prev=>({...prev,[data.name]:{name:data.name,color:data.color,line:data.line,column:data.column}}));
        if (cursorTimeoutsRef.current[data.name]) clearTimeout(cursorTimeoutsRef.current[data.name]);
        cursorTimeoutsRef.current[data.name]=setTimeout(()=>{
          setCursors(prev=>{const n={...prev};delete n[data.name];return n;});
        },CURSOR_IDLE_MS+1500);
      }
      if (data.type==="cursor-stop") {
        if (cursorTimeoutsRef.current[data.name]){clearTimeout(cursorTimeoutsRef.current[data.name]);delete cursorTimeoutsRef.current[data.name];}
        setCursors(prev=>{const n={...prev};delete n[data.name];return n;});
      }
      if (data.type==="cursor-leave") {
        setCursors(prev=>{const n={...prev};delete n[data.name];return n;});
        if (decorationsRef.current[data.name]&&editorRef.current) {
          editorRef.current.deltaDecorations(decorationsRef.current[data.name],[]);
          delete decorationsRef.current[data.name];
        }
      }
    };
    return () => ws.close();
  }, [roomId]);

  useEffect(() => {
    if (!editorRef.current) return;
    Object.values(cursors).forEach(cursor=>{
      const cls=`rc-${cursor.name.replace(/\W/g,"-")}`,sid=`rs-${cls}`;
      let el=document.getElementById(sid);
      if (!el){el=document.createElement("style");el.id=sid;document.head.appendChild(el);}
      el.textContent=[
        `.${cls}{border-left:2px solid ${cursor.color}!important;margin-left:-1px;position:relative}`,
        `.${cls}::before{content:'${CSS.escape(cursor.name)}';position:absolute;top:-18px;left:0;background:${cursor.color};color:#fff;font-size:10px;font-weight:bold;padding:1px 5px;border-radius:3px;white-space:nowrap;pointer-events:none;z-index:999}`,
      ].join("");
      if (!decorationsRef.current[cursor.name]) decorationsRef.current[cursor.name]=[];
      decorationsRef.current[cursor.name]=editorRef.current.deltaDecorations(
        decorationsRef.current[cursor.name],
        [{range:{startLineNumber:cursor.line,startColumn:cursor.column,endLineNumber:cursor.line,endColumn:cursor.column+1},options:{beforeContentClassName:cls,stickiness:1}}],
      );
    });
    Object.keys(decorationsRef.current).forEach(name=>{
      if (!cursors[name]) {
        editorRef.current.deltaDecorations(decorationsRef.current[name],[]);
        delete decorationsRef.current[name];
        document.getElementById(`rs-rc-${name.replace(/\W/g,"-")}`)?.remove();
      }
    });
  }, [cursors]);

  useEffect(() => {
    const el=document.getElementById("chat-messages");
    if (el) el.scrollTop=el.scrollHeight;
  }, [messages]);

  // ── Handlers ─────
  const handleCodeChange = useCallback((value) => {
    if (isRemoteChange.current) return;
    setFiles(prev=>prev.map(f=>f.id===activeFileId?{...f,code:value}:f));
    if (wsRef.current?.readyState===1)
      wsRef.current.send(JSON.stringify({type:"code",code:value,fileId:activeFileId,sentAt:Date.now()}));
  }, [activeFileId]);

  function broadcastCursor(line, column) {
    if (isRemoteChange.current||!usernameRef.current||wsRef.current?.readyState!==1) return;
    wsRef.current.send(JSON.stringify({type:"cursor",name:usernameRef.current,color:SESSION_COLOR,line,column}));
    if (sendIdleTimerRef.current) clearTimeout(sendIdleTimerRef.current);
    sendIdleTimerRef.current=setTimeout(()=>{
      if (wsRef.current?.readyState===1) wsRef.current.send(JSON.stringify({type:"cursor-stop",name:usernameRef.current}));
    },CURSOR_IDLE_MS);
  }

  function handleEditorMount(editor, monaco) {
    editorRef.current=editor; monacoRef.current=monaco; editorFileIdRef.current=activeFileId;
    editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyP,()=>{});
    editor.onDidChangeCursorPosition(e=>setCursorPos({line:e.position.lineNumber,col:e.position.column}));
    editor.onDidChangeModelContent(()=>{
      if (isRemoteChange.current) return;
      const pos=editor.getPosition(); if(pos) broadcastCursor(pos.lineNumber,pos.column);
    });
    editor.onDidChangeCursorSelection(e=>{
      if (isRemoteChange.current||!usernameRef.current) return;
      const s=e.selection;
      if (s.startLineNumber===s.endLineNumber&&s.startColumn===s.endColumn) return;
      broadcastCursor(s.endLineNumber,s.endColumn);
    });
  }

  function handleLanguageChange(newLang) {
    setFiles(prev=>prev.map(f=>{
      if (f.id!==activeFileId) return f;
      const base=f.name.includes(".")?f.name.slice(0,f.name.lastIndexOf(".")):f.name;
      return {...f,language:newLang,name:`${base}.${LANG_TO_EXT[newLang]||"txt"}`};
    }));
    if (wsRef.current?.readyState===1)
      wsRef.current.send(JSON.stringify({type:"language",language:newLang,changedBy:usernameRef.current,fileId:activeFileId}));
  }

  function createNewFile() {
    if (!newFileName.trim()) return;
    const ext=newFileName.split(".").pop();
    const nf={id:Date.now().toString(),name:newFileName.trim(),language:EXT_TO_LANG[ext]||"plaintext",code:""};
    setFiles(prev=>[...prev,nf]); setActiveFileId(nf.id);
    setNewFileName(""); setShowNewFile(false);
    if (wsRef.current?.readyState===1) wsRef.current.send(JSON.stringify({type:"newfile",file:nf}));
  }

  function handleDeleteFile(fileId) {
    if (files.length<=1) return;
    const rem=files.filter(f=>f.id!==fileId); setFiles(rem);
    if (activeFileId===fileId) setActiveFileId(rem[0].id);
    if (wsRef.current?.readyState===1) wsRef.current.send(JSON.stringify({type:"deletefile",fileId}));
  }

  function handleRunCode() {
    if (document.activeElement) document.activeElement.blur();
    // On mobile auto-open output sheet so user can see result
    if (isMobile) setMobSheet("output");
    setTimeout(executeCode, 100);
  }

  async function executeCode() {
    setIsRunning(true); setOutput("Running...");
    if (activeFile.language==="javascript") {
      try {
        let result=""; const orig=console.log;
        console.log=(...a)=>{result+=a.join(" ")+"\n";};
        new Function(activeFile.code)(); console.log=orig;
        setOutput(result||"✅ Ran successfully (no output)");
      } catch(err){setOutput("❌ Error: "+err.message);}
      setIsRunning(false); return;
    }
    if (!activeFile.code?.trim()){setOutput("Nothing to run!");setIsRunning(false);return;}
    try {
      const res=await fetch(`${BACKEND_URL}/run`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({language:activeFile.language,code:activeFile.code})});
      const result=await res.json();
      setOutput(result.output||"✅ Ran successfully (no output)");
    } catch {setOutput("⚠️ Code Execution Unavailable\n\nCollaboration features work fully ✅");}
    setIsRunning(false);
  }

  function sendMessage() {
    if (!newMessage.trim()||wsRef.current?.readyState!==1) return;
    const msg={type:"chat",name:username,color:SESSION_COLOR,text:newMessage.trim(),time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};
    setMessages(prev=>[...prev,{name:msg.name,color:msg.color,text:msg.text,time:msg.time}]);
    wsRef.current.send(JSON.stringify(msg)); setNewMessage("");
  }

  function importFile() {
    const input=document.createElement("input"); input.type="file"; input.multiple=true;
    input.accept=".py,.java,.cpp,.ts,.js,.txt,.html,.css,.json,.c,.cs,.fs,.php,.rb,.hs,.go,.rs";
    input.onchange=e=>Array.from(e.target.files).forEach(file=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        const ext=file.name.split(".").pop();
        const nf={id:Date.now()+Math.random()+"",name:file.name,language:EXT_TO_LANG[ext]||"plaintext",code:ev.target.result};
        setFiles(prev=>[...prev,nf]); setActiveFileId(nf.id);
        if (wsRef.current?.readyState===1) wsRef.current.send(JSON.stringify({type:"newfile",file:nf}));
      };
      reader.readAsText(file);
    }); input.click();
  }

  async function exportFiles() {
    const JSZip=(await import("jszip")).default;
    const zip=new JSZip(); files.forEach(f=>zip.file(f.name,f.code||""));
    const blob=await zip.generateAsync({type:"blob"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`syncra-${roomId}.zip`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleJoin() {
    if (!username.trim()) return;
    usernameRef.current=username.trim(); setNameEntered(true); sendJoin(username.trim());
  }

  // ── Render ─
  // Use 100dvh so mobile browsers (with address bar) don't overflow
  // Lock the app height to the INITIAL innerHeight on mount.
  // This prevents the layout from jumping when mobile browser address bar
  // appears/disappears. We only update on orientationchange (real resize).
  useEffect(() => {
    const lock = () => {
      document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
    };
    lock(); // set once on mount
    window.addEventListener('orientationchange', () => setTimeout(lock, 300));
  }, []);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"var(--app-h, 100vh)", background:"#1e1e1e", fontFamily:"'Inter','Segoe UI',Arial,sans-serif", overflow:"hidden" }}>

      {/* Join modal */}
      {!nameEntered && <JoinModal roomId={roomId} username={username} setUsername={setUsername} onJoin={handleJoin}/>}

      {/* ── Top Navbar  */}
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 10px", height:40, background:"#252526", borderBottom:"1px solid #1a1a1a", flexShrink:0, overflow:"hidden" }}>
        {/* Logo */}
        <img src="/syncra-icon.svg" alt="" style={{ height:22, flexShrink:0 }} onError={e=>e.target.style.display="none"}/>
        <div style={{ width:1, height:16, background:"#383838", margin:"0 2px", flexShrink:0 }}/>

        {/* Room code */}
        <div style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", background:"#1e1e1e", border:"1px solid #333", borderRadius:5, flexShrink:0 }}>
          <span style={{ color:"#4a4a4a", fontSize:9, textTransform:"uppercase", letterSpacing:.8 }}>Room</span>
          <span style={{ color:"#4CAF50", fontSize:11, fontWeight:800, letterSpacing:isMobile?1:3, fontFamily:"monospace" }}>{roomId}</span>
          <button type="button" onClick={()=>navigator.clipboard.writeText(roomId||"")} style={{ background:"transparent", border:"none", color:"#555", cursor:"pointer", fontSize:10, padding:0 }}>📋</button>
        </div>

        {/* Language badge */}
        <div style={{ padding:"2px 6px", borderRadius:4, border:"1px solid rgba(76,175,80,.3)", background:"rgba(76,175,80,.07)", color:"#4CAF50", fontSize:9, fontWeight:700, letterSpacing:.5, flexShrink:0 }}>
          {activeFile.language.toUpperCase()}
        </div>

        {/* Avatars */}
        <div style={{ display:"flex", alignItems:"center", gap:2, overflow:"hidden", flexShrink:1, minWidth:0 }}>
          {onlineUsers.slice(0, isMobile?2:6).map(u=>(
            <div key={u.name} title={u.name}
              style={{ width:isMobile?18:22, height:isMobile?18:22, borderRadius:"50%", background:u.color, border:"1.5px solid #252526", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:800, color:"white", flexShrink:0 }}>
              {u.name[0]?.toUpperCase()}
            </div>
          ))}
          {users>(isMobile?2:6) && <span style={{ color:"#555", fontSize:10, marginLeft:2, flexShrink:0 }}>+{users-(isMobile?2:6)}</span>}
        </div>

        <div style={{ flex:1 }}/>

        {/* ── Desktop-only buttons ───── */}
        {!isMobile && (
          <>
            {[{label:"⬆ Import",fn:importFile},{label:"⬇ Export",fn:exportFiles}].map(({label,fn})=>(
              <button key={label} type="button" onClick={fn}
                style={{ padding:"5px 10px", background:"#2a2a2a", color:"#aaa", border:"1px solid #383838", borderRadius:5, cursor:"pointer", fontSize:12, fontFamily:"inherit" }}
                onMouseEnter={e=>{e.currentTarget.style.background="#333";e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.background="#2a2a2a";e.currentTarget.style.color="#aaa";}}>
                {label}
              </button>
            ))}
            <button type="button" onClick={()=>setShowChat(p=>!p)}
              style={{ padding:"5px 10px", borderRadius:5, cursor:"pointer", fontSize:12, background:showChat?"#1d3455":"#2a2a2a", color:showChat?"#74b9ff":"#aaa", border:`1px solid ${showChat?"#2d4a7a":"#383838"}`, fontFamily:"inherit" }}>
              💬 Chat{messages.length>0&&<span style={{ marginLeft:4, background:"#e74c3c", color:"#fff", borderRadius:8, fontSize:9, padding:"1px 3px", verticalAlign:"middle" }}>{messages.length}</span>}
            </button>
            <button type="button" onClick={handleRunCode} disabled={isRunning}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", border:"none", borderRadius:6, background:isRunning?"#2e7d32":"linear-gradient(135deg,#4CAF50,#2e7d32)", color:"white", fontWeight:700, fontSize:13, cursor:isRunning?"default":"pointer", opacity:isRunning?0.75:1, boxShadow:isRunning?"none":"0 2px 10px rgba(76,175,80,.35)", fontFamily:"inherit" }}>
              {isRunning?"⏳ Running...":"▶  Run"}
            </button>
          </>
        )}

        {/* ── Mobile: import + export in navbar  */}
        {isMobile && (
          <div style={{ display:"flex", gap:5, flexShrink:0 }}>
            <button type="button" onClick={importFile}
              style={{ padding:"5px 8px", background:"#2a2a2a", color:"#aaa", border:"1px solid #383838", borderRadius:5, cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>⬆</button>
            <button type="button" onClick={exportFiles}
              style={{ padding:"5px 8px", background:"#2a2a2a", color:"#aaa", border:"1px solid #383838", borderRadius:5, cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>⬇</button>
          </div>
        )}
      </div>

      {/* ── Main content  */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Desktop sidebar */}
        {!isMobile && (
          <>
            <ActivityBar activePanel={activePanel} setActivePanel={setActivePanel} activeLanguage={activeFile.language} onLanguageChange={handleLanguageChange} users={users} username={username} userList={userList} SESSION_COLOR={SESSION_COLOR}/>
            <SidePanel activePanel={activePanel} files={files} activeFileId={activeFileId} setActiveFileId={setActiveFileId} showNewFile={showNewFile} setShowNewFile={setShowNewFile} newFileName={newFileName} setNewFileName={setNewFileName} createNewFile={createNewFile} onDeleteFile={handleDeleteFile} username={username} userList={userList} SESSION_COLOR={SESSION_COLOR}/>
          </>
        )}

        {/* Editor */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
          <TabBar files={files} activeFileId={activeFileId} setActiveFileId={setActiveFileId} onClose={handleDeleteFile}/>
          {/* Monaco needs explicit height on mobile — flex:1 alone overflows on WebKit */}
          <div style={{
            flex:1,
            overflow:"hidden",
            position:"relative",
            ...(isMobile ? { height: "calc(var(--app-h, 100vh) - 40px - 36px - 52px)" } : {}),
          }}>
            <Editor
              key={`${activeFileId}-${initReceived}`}
              height="100%"
              language={activeFile.language}
              defaultValue={activeFile.code}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize: isMobile ? 12 : 14,
                fontFamily:"'JetBrains Mono','Fira Code','Consolas',monospace",
                fontLigatures: true,
                lineHeight: isMobile ? 20 : 22,
                minimap:{ enabled:!isMobile },
                scrollBeyondLastLine: false,
                renderWhitespace: "selection",
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                smoothScrolling: true,
                bracketPairColorization:{ enabled:true },
                guides:{ bracketPairs:true, indentation:true },
                padding:{ top:8, bottom:8 },
                renderLineHighlight: "all",
                wordWrap: isMobile?"on":"off",
                formatOnPaste: true,
                suggest:{ showIcons:true },
                scrollbar:{ alwaysConsumeMouseWheel:false },
              }}
            />
          </div>
          {/* StatusBar: show on desktop, hide on mobile to save space */}
          {!isMobile && <StatusBar connected={connected} users={users} activeFile={activeFile} cursorPos={cursorPos} roomId={roomId}/>}
        </div>

        {/* Desktop output */}
        {!isMobile && (
          <DesktopOutputPanel output={output} onClear={()=>setOutput("")} isRunning={isRunning}/>
        )}
      </div>

      {/* ── Mobile bottom tab bar ─── */}
      {isMobile && (
        <MobileTabBar
          onFiles={() => setMobSheet("files")}
          onChat={() => setShowChat(p=>!p)}
          onRun={handleRunCode}
          onOutput={() => setMobSheet("output")}
          onUsers={() => setMobSheet("users")}
          isRunning={isRunning}
          chatBadge={messages.length}
          hasOutput={!!output}
        />
      )}

      {/* ── Mobile: Files sheet ───── */}
      {isMobile && mobSheet==="files" && (
        <MobileSheet title="Files" onClose={()=>setMobSheet(null)} height="80vh">
          <SidePanel
            activePanel="files"
            files={files}
            activeFileId={activeFileId}
            setActiveFileId={id=>{setActiveFileId(id);setMobSheet(null);}}
            showNewFile={showNewFile}
            setShowNewFile={setShowNewFile}
            newFileName={newFileName}
            setNewFileName={setNewFileName}
            createNewFile={()=>{createNewFile();setMobSheet(null);}}
            onDeleteFile={handleDeleteFile}
            username={username}
            userList={userList}
            SESSION_COLOR={SESSION_COLOR}
          />
        </MobileSheet>
      )}

      {/* ── Mobile: Output sheet ──── */}
      {isMobile && mobSheet==="output" && (
        <MobileSheet title="Output" onClose={()=>setMobSheet(null)} height="70vh">
          <MobileOutputContent output={output} onClear={()=>setOutput("")} isRunning={isRunning}/>
        </MobileSheet>
      )}

      {/* ── Mobile: Users sheet ───── */}
      {isMobile && mobSheet==="users" && (
        <MobileSheet title={`Users online (${onlineUsers.length})`} onClose={()=>setMobSheet(null)} height="60vh">
          <MobileUsersContent username={username} userList={userList} SESSION_COLOR={SESSION_COLOR}/>
        </MobileSheet>
      )}

      {/* Language alert */}
      {languageAlert && (
        <div style={{ position:"fixed", bottom:isMobile?64:28, right:16, display:"flex", alignItems:"center", gap:10, background:"#1a1f2e", border:"1px solid #2d4a2d", borderLeft:"3px solid #4CAF50", color:"#e8f5e9", padding:"10px 14px", borderRadius:8, fontSize:12, zIndex:9999, boxShadow:"0 8px 30px rgba(0,0,0,.5)" }}>
          🔄 {languageAlert}
        </div>
      )}

      {/* Desktop Chat */}
      {showChat && !isMobile && (
        <ChatPanel messages={messages} newMessage={newMessage} setNewMessage={setNewMessage} sendMessage={sendMessage} username={username} setShowChat={setShowChat}/>
      )}

      {/* Mobile Chat — full sheet */}
      {showChat && isMobile && (
        <MobileSheet title="Chat" onClose={()=>setShowChat(false)} height="85vh">
          <ChatPanel messages={messages} newMessage={newMessage} setNewMessage={setNewMessage} sendMessage={sendMessage} username={username} setShowChat={setShowChat}/>
        </MobileSheet>
      )}
    </div>
  );
}

export default EditorPage;