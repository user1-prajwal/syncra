// function FileTree({ files, activeFileId, setActiveFileId, showNewFile, setShowNewFile, newFileName, setNewFileName, createNewFile }) {
//   return (
//     <div style={{
//       width: '200px',
//       background: '#252526',
//       borderRight: '1px solid #444',
//       display: 'flex',
//       flexDirection: 'column',
//       flexShrink: 0
//     }}>

//       {/* Header */}
//       <div style={{
//         padding: '8px 12px',
//         display: 'flex',
//         alignItems: 'center',
//         justifyContent: 'space-between',
//         borderBottom: '1px solid #444'
//       }}>
//         <span style={{ color: '#888', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
//           Files
//         </span>
//         <button
//           onClick={() => setShowNewFile(prev => !prev)}
//           style={{
//             background: 'transparent', border: 'none',
//             color: '#888', cursor: 'pointer',
//             fontSize: '18px', lineHeight: 1, padding: 0
//           }}
//           title="New file"
//         >
//           +
//         </button>
//       </div>

//       {/* New File Input */}
//       {showNewFile && (
//         <div style={{ padding: '8px' }}>
//           <input
//             type="text"
//             placeholder="filename.py"
//             autoFocus
//             value={newFileName}
//             onChange={(e) => setNewFileName(e.target.value)}
//             onKeyDown={(e) => {
//               if (e.key === 'Enter') createNewFile()
//               if (e.key === 'Escape') setShowNewFile(false)
//             }}
//             style={{
//               width: '100%', padding: '4px 8px',
//               background: '#1e1e1e', border: '1px solid #4CAF50',
//               borderRadius: '4px', color: 'white',
//               fontSize: '12px', outline: 'none',
//               boxSizing: 'border-box'
//             }}
//           />
//         </div>
//       )}

//       {/* File List */}
//       <div style={{ overflowY: 'auto', flex: 1 }}>
//         {files.map((file) => (
//           <div
//             key={file.id}
//             onClick={() => setActiveFileId(file.id)}
//             style={{
//               padding: '7px 12px',
//               cursor: 'pointer',
//               display: 'flex',
//               alignItems: 'center',
//               gap: '6px',
//               background: file.id === activeFileId ? '#2d2d2d' : 'transparent',
//               borderLeft: file.id === activeFileId ? '2px solid #4CAF50' : '2px solid transparent',
//               color: file.id === activeFileId ? 'white' : '#888',
//               fontSize: '13px',
//             }}
//           >
//             <span>📄</span>
//             <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//               {file.name}
//             </span>
//           </div>
//         ))}
//       </div>

//     </div>
//   )
// }

// export default FileTree



import { useState } from "react";

// ─── Tree utilities (immutable) ───────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const EXT_ICONS = {
  py: "🐍", js: "🟨", jsx: "⚛️", ts: "🔷", tsx: "⚛️",
  json: "📋", md: "📝", css: "🎨", html: "🌐",
  yml: "⚙️", yaml: "⚙️", sh: "💻", txt: "📄", env: "🔐",
};
const fileIcon = (name) => EXT_ICONS[name.split(".").pop()?.toLowerCase()] ?? "📄";

const treeToggle = (nodes, id) =>
  nodes.map((n) =>
    n.id === id ? { ...n, isOpen: !n.isOpen }
    : n.children ? { ...n, children: treeToggle(n.children, id) }
    : n
  );

const treeInsert = (nodes, parentId, child) => {
  if (parentId === null) return [...nodes, child];
  return nodes.map((n) => {
    if (n.id === parentId)
      return { ...n, isOpen: true, children: [...(n.children ?? []), child] };
    if (n.children)
      return { ...n, children: treeInsert(n.children, parentId, child) };
    return n;
  });
};

const treeRemove = (nodes, id) =>
  nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.children ? { ...n, children: treeRemove(n.children, id) } : n));

// ─── Sample data ──────────────────────────────────────────────────────────────

const INITIAL_FILES = [
  {
    id: "f1", name: "src", type: "folder", isOpen: true,
    children: [
      {
        id: "f2", name: "components", type: "folder", isOpen: true,
        children: [
          { id: "a1", name: "App.jsx",    type: "file" },
          { id: "a2", name: "Header.jsx", type: "file" },
          { id: "a3", name: "Footer.jsx", type: "file" },
        ],
      },
      {
        id: "f3", name: "utils", type: "folder", isOpen: false,
        children: [
          { id: "b1", name: "helpers.js", type: "file" },
          { id: "b2", name: "api.js",     type: "file" },
        ],
      },
      { id: "c1", name: "main.jsx",  type: "file" },
      { id: "c2", name: "index.css", type: "file" },
    ],
  },
  { id: "d1", name: "README.md",       type: "file" },
  { id: "d2", name: "package.json",    type: "file" },
  { id: "d3", name: "vite.config.js",  type: "file" },
];

// ─── IconBtn ──────────────────────────────────────────────────────────────────

function IconBtn({ title, onClick, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "#3c3c3c" : "transparent",
        border: "none",
        color: hov ? "#fff" : "#999",
        cursor: "pointer",
        padding: "1px 5px",
        fontSize: 11,
        borderRadius: 3,
        lineHeight: "16px",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ─── InlineInput ──────────────────────────────────────────────────────────────

function InlineInput({ depth, placeholder, onConfirm, onCancel }) {
  return (
    <div style={{ padding: `3px 8px 3px ${14 + depth * 16}px` }}>
      <input
        autoFocus
        placeholder={placeholder}
        onBlur={(e) => { if (!e.target.value.trim()) onCancel(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = e.target.value.trim();
            v ? onConfirm(v) : onCancel();
          }
          if (e.key === "Escape") onCancel();
        }}
        style={{
          width: "100%",
          padding: "3px 7px",
          background: "#1a1a1a",
          border: "1px solid #4CAF50",
          borderRadius: 4,
          color: "#fff",
          fontSize: 12,
          outline: "none",
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

// ─── TreeNode ─────────────────────────────────────────────────────────────────

function TreeNode({
  node, depth,
  activeId, setActiveId,
  onToggle, onDelete, onAdd,
  pendingAdd, onConfirm, onCancelAdd,
}) {
  const [hov, setHov] = useState(false);
  const isDir   = node.type === "folder";
  const isActive = !isDir && node.id === activeId;

  return (
    <div>
      {/* Row */}
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onClick={() => (isDir ? onToggle(node.id) : setActiveId(node.id))}
        style={{
          paddingLeft: 14 + depth * 16,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 5,
          cursor: "pointer",
          userSelect: "none",
          background: isActive ? "#37373d" : hov ? "#2d2d2d" : "transparent",
          borderLeft: isActive ? "2px solid #4CAF50" : "2px solid transparent",
          color: isActive ? "#fff" : "#ccc",
          fontSize: 13,
        }}
      >
        {/* Chevron */}
        <span style={{ width: 10, flexShrink: 0, opacity: 0.5, fontSize: 9 }}>
          {isDir ? (node.isOpen ? "▾" : "▸") : ""}
        </span>

        {/* Icon */}
        <span style={{ flexShrink: 0 }}>
          {isDir ? (node.isOpen ? "📂" : "📁") : fileIcon(node.name)}
        </span>

        {/* Name */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.name}
        </span>

        {/* Hover actions */}
        {hov && (
          <span
            style={{ display: "flex", gap: 1, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {isDir && (
              <>
                <IconBtn title="New file"   onClick={() => onAdd(node.id, "file")}>  +📄</IconBtn>
                <IconBtn title="New folder" onClick={() => onAdd(node.id, "folder")}>+📁</IconBtn>
              </>
            )}
            <IconBtn title="Delete" onClick={() => onDelete(node.id)}>🗑</IconBtn>
          </span>
        )}
      </div>

      {/* Children + inline input */}
      {isDir && node.isOpen && (
        <div>
          {(node.children ?? []).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              setActiveId={setActiveId}
              onToggle={onToggle}
              onDelete={onDelete}
              onAdd={onAdd}
              pendingAdd={pendingAdd}
              onConfirm={onConfirm}
              onCancelAdd={onCancelAdd}
            />
          ))}

          {/* Input appears inside this folder */}
          {pendingAdd?.parentId === node.id && (
            <InlineInput
              depth={depth + 1}
              placeholder={pendingAdd.type === "folder" ? "new-folder" : "new-file.py"}
              onConfirm={onConfirm}
              onCancel={onCancelAdd}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── FileTree ─────────────────────────────────────────────────────────────────

function FileTree({ files, setFiles, activeId, setActiveId }) {
  const [pendingAdd, setPendingAdd] = useState(null);
  // pendingAdd: { parentId: string | null, type: "file" | "folder" }

  const handleToggle = (id) => setFiles((t) => treeToggle(t, id));

  const handleDelete = (id) => {
    if (id === activeId) setActiveId(null);
    setFiles((t) => treeRemove(t, id));
  };

  const handleAdd = (parentId, type) => setPendingAdd({ parentId, type });

  const handleConfirm = (name) => {
    const node =
      pendingAdd.type === "folder"
        ? { id: uid(), name, type: "folder", isOpen: true, children: [] }
        : { id: uid(), name, type: "file" };
    setFiles((t) => treeInsert(t, pendingAdd.parentId, node));
    if (pendingAdd.type === "file") setActiveId(node.id);
    setPendingAdd(null);
  };

  const handleCancel = () => setPendingAdd(null);

  const sharedProps = {
    onToggle: handleToggle,
    onDelete: handleDelete,
    onAdd: handleAdd,
    pendingAdd,
    onConfirm: handleConfirm,
    onCancelAdd: handleCancel,
  };

  return (
    <div
      style={{
        width: 220,
        background: "#252526",
        borderRight: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        fontSize: 13,
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "7px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #333",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "#888",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Explorer
        </span>
        <span style={{ display: "flex", gap: 2 }}>
          <IconBtn title="New file at root"   onClick={() => handleAdd(null, "file")}>  +📄</IconBtn>
          <IconBtn title="New folder at root" onClick={() => handleAdd(null, "folder")}>+📁</IconBtn>
        </span>
      </div>

      {/* Root-level inline input */}
      {pendingAdd?.parentId === null && (
        <InlineInput
          depth={0}
          placeholder={pendingAdd.type === "folder" ? "new-folder" : "new-file.py"}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {/* Tree */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {files.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            activeId={activeId}
            setActiveId={setActiveId}
            {...sharedProps}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Demo wrapper ─────────────────────────────────────────────────────────────

function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
}

export default function App() {
  const [files, setFiles]     = useState(INITIAL_FILES);
  const [activeId, setActiveId] = useState("a1");

  const active = activeId ? findNode(files, activeId) : null;

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#1e1e1e",
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <FileTree
        files={files}
        setFiles={setFiles}
        activeId={activeId}
        setActiveId={setActiveId}
      />

      {/* Mock editor area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Tab bar */}
        {active && (
          <div
            style={{
              background: "#2d2d2d",
              borderBottom: "1px solid #333",
              display: "flex",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: "6px 16px",
                background: "#1e1e1e",
                color: "#fff",
                borderTop: "1px solid #4CAF50",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{fileIcon(active.name)}</span>
              <span>{active.name}</span>
            </div>
          </div>
        )}

        {/* Editor placeholder */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {active ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>
                {fileIcon(active.name)}
              </div>
              <div style={{ color: "#ccc", fontSize: 15 }}>{active.name}</div>
              <div style={{ color: "#555", fontSize: 12, marginTop: 6 }}>
                Hover any file/folder row to see actions
              </div>
            </div>
          ) : (
            <div style={{ color: "#555", fontSize: 14 }}>No file selected</div>
          )}
        </div>
      </div>
    </div>
  );
}