import { useState } from 'react'

// ─── Tree utilities 

const uid = () => Math.random().toString(36).slice(2, 9)

const FILE_ICONS = {
  py: "/lang_icons/python.png",
  // c: "/icons/c.png",
  // h: "/icons/c.png",
  // cpp: "/icons/cpp.png",
  // cc: "/icons/cpp.png",
  // cxx: "/icons/cpp.png",
  // hpp: "/icons/cpp.png",

  // java: "/icons/java.png",
  // ts: "/icons/typescript.png",
  // tsx: "/icons/typescript.png",
  // cs: "/icons/csharp.png",
  // fs: "/icons/fsharp.png",
  // fsx: "/icons/fsharp.png",

  // php: "/icons/php.png",
  // rb: "/icons/ruby.png",
  // hs: "/icons/haskell.png",
  // lhs: "/icons/haskell.png",
  // go: "/icons/go.png",
  // rs: "/icons/rust.png",
  // txt: "/icons/text.png",

  // js: "/icons/javascript.png",
  // jsx: "/icons/react.png",
  // json: "/icons/json.png",
  // md: "/icons/markdown.png",
  // css: "/icons/css.png",
  // html: "/icons/html.png",
 
};


// const getIcon = (name) => FILE_ICONS[name.split('.').pop()?.toLowerCase()] ?? '📄'
const getIcon = (name) =>
  FILE_ICONS[name.split(".").pop()?.toLowerCase()] ?? "/icons/file.png";

function treeToggle(nodes, id) {
  return nodes.map((n) =>
    n.id === id        ? { ...n, isOpen: !n.isOpen }
    : n.children       ? { ...n, children: treeToggle(n.children, id) }
    : n
  )
}

// Only ever opens, never closes — safe to call on already-open folders
function treeOpen(nodes, id) {
  return nodes.map((n) =>
    n.id === id        ? { ...n, isOpen: true }
    : n.children       ? { ...n, children: treeOpen(n.children, id) }
    : n
  )
}

function treeAdd(nodes, parentId, child) {
  if (parentId === null) return [...nodes, child]
  return nodes.map((n) => {
    if (n.id === parentId)
      return { ...n, isOpen: true, children: [...(n.children ?? []), child] }
    if (n.children)
      return { ...n, children: treeAdd(n.children, parentId, child) }
    return n
  })
}

function treeDel(nodes, id) {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.children ? { ...n, children: treeDel(n.children, id) } : n))
}

// ─── Btn 
// WHY onMouseDown + preventDefault:
//   A normal onClick would fire after mousedown→mouseup. Between those two events
//   the browser moves focus to the button, which fires onBlur on the NameInput,
//   cancelling the creation. e.preventDefault() on mousedown stops focus from
//   moving, so the NameInput keeps focus. Then onClick fires the actual action.

function Btn({ title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
      onClick={(e)      => { e.stopPropagation(); onClick() }}
      style={{
        background: 'transparent', border: 'none', color: '#888',
        cursor: 'pointer', padding: '0 3px', fontSize: 11,
        lineHeight: 1, flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// ─── NameInput 
// No onBlur here on purpose — Btn's preventDefault keeps focus here while
// the user clicks action buttons. Press Enter to confirm, Escape to cancel.

function NameInput({ depth, type, onDone, onCancel }) {
  return (
    <div style={{ padding: `3px 6px 3px ${12 + depth * 14}px` }}>
      <input
        autoFocus
        placeholder={type === 'folder' ? 'folder-name' : 'filename.py'}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            const v = e.target.value.trim()
            if (v) onDone(v)
          }
          if (e.key === 'Escape') onCancel()
        }}
        style={{
          width: '100%', padding: '3px 6px',
          background: '#1a1a1a', border: '1px solid #4CAF50',
          borderRadius: 3, color: '#fff', fontSize: 12,
          outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ─── TreeRow (one node, recursive)

function TreeRow({
  node, depth,
  activeFileId, setActiveFileId,
  onToggle, onDelete, onAdd,
  pendingAdd, onDone, onCancel,
}) {
  const [hov, setHov] = useState(false)
  const isDir  = node.type === 'folder'
  const active = !isDir && node.id === activeFileId

  return (
    <div>
      {/* row */}
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onClick={() => (isDir ? onToggle(node.id) : setActiveFileId(node.id))}
        style={{
          paddingLeft: 10 + depth * 14, paddingRight: 4,
          paddingTop: 4, paddingBottom: 4,
          display: 'flex', alignItems: 'center', gap: 4,
          cursor: 'pointer', userSelect: 'none',
          background: active ? '#37373d' : hov ? '#2a2a2a' : 'transparent',
          borderLeft: active ? '2px solid #4CAF50' : '2px solid transparent',
          color: active ? '#fff' : '#ccc', fontSize: 13,
        }}
      >
        {/* chevron */}
        <span style={{ width: 10, fontSize: 9, opacity: 0.5, flexShrink: 0 }}>
          {isDir ? (node.isOpen ? '▾' : '▸') : ''}
        </span>

        {/* icon */}
        {/* <span style={{ flexShrink: 0 }}>
          {isDir ? (node.isOpen ? '📂' : '📁') : getIcon(node.name)}
        </span> */}
        <span style={{ flexShrink: 0 }}>
        {isDir ? (
          node.isOpen ? "📂" : "📁"
        ) : (
          <img
            src={getIcon(node.name)}
            alt="file"
            width={18}
            height={18}
            style={{ display: "block" }}
          />
        )}
      </span>

        {/* name */}
        <span style={{
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {node.name}
        </span>

        {/* action buttons — always in DOM so mouse can't "miss" them.
            Opacity hides them; they become visible on hover. */}
        <span style={{ display: 'flex', gap: 1, flexShrink: 0, opacity: hov ? 1 : 0 }}>
          {isDir && (
            <>
              <Btn title="New file"   onClick={() => onAdd(node.id, 'file')}>+📄</Btn>
              <Btn title="New folder" onClick={() => onAdd(node.id, 'folder')}>+📁</Btn>
            </>
          )}
          <Btn title="Delete" onClick={() => onDelete(node.id)}>🗑</Btn>
        </span>
      </div>

      {/* children — only renders when folder is open */}
      {isDir && node.isOpen && (
        <div>
          {(node.children ?? []).map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              setActiveFileId={setActiveFileId}
              onToggle={onToggle}
              onDelete={onDelete}
              onAdd={onAdd}
              pendingAdd={pendingAdd}
              onDone={onDone}
              onCancel={onCancel}
            />
          ))}

          {/* NameInput appears here when this folder is the pending target */}
          {pendingAdd !== null && pendingAdd.parentId === node.id && (
            <NameInput
              depth={depth + 1}
              type={pendingAdd.type}
              onDone={onDone}
              onCancel={onCancel}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── SidePanel

function SidePanel({
  activePanel,
  files,           // nested tree — see data format below
  setFiles,        // setState setter for the tree
  activeFileId,
  setActiveFileId,
  username,
  userList,
  SESSION_COLOR,
}) {
  const [pendingAdd, setPendingAdd] = useState(null)
  // pendingAdd shape: { parentId: string | null, type: 'file' | 'folder' }

  if (!activePanel) return null

  // ── handlers

  const onToggle = (id) => setFiles((t) => treeToggle(t, id))

  const onDelete = (id) => {
    if (id === activeFileId) setActiveFileId(null)
    setFiles((t) => treeDel(t, id))
  }

  const onAdd = (parentId, type) => {
    // Force-open the target folder so NameInput renders inside it.
    // Without this, a closed folder's children block never mounts.
    if (parentId !== null) setFiles((t) => treeOpen(t, parentId))
    setPendingAdd({ parentId, type })
  }

  const onDone = (name) => {
    const node =
      pendingAdd.type === 'folder'
        ? { id: uid(), name, type: 'folder', isOpen: true, children: [] }
        : { id: uid(), name, type: 'file', content: '' }
    setFiles((t) => treeAdd(t, pendingAdd.parentId, node))
    if (pendingAdd.type === 'file') setActiveFileId(node.id)
    setPendingAdd(null)
  }

  const onCancel = () => setPendingAdd(null)

  const rowProps = {
    activeFileId, setActiveFileId,
    onToggle, onDelete, onAdd,
    pendingAdd, onDone, onCancel,
  }

  // ── render 

  return (
    <div style={{
      width: 220,
      background: '#252526',
      borderRight: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>

      {/* header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 11,
        fontWeight: 'bold',
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: 1,
        flexShrink: 0,
      }}>
        <span>{activePanel === 'files' ? 'Explorer' : 'Users Online'}</span>
        {activePanel === 'files' && (
          <span style={{ display: 'flex', gap: 4 }}>
            <Btn title="New file at root"   onClick={() => onAdd(null, 'file')}>+📄</Btn>
            <Btn title="New folder at root" onClick={() => onAdd(null, 'folder')}>+📁</Btn>
          </span>
        )}
      </div>

      {/* ── files panel */}
      {activePanel === 'files' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* root-level name input */}
          {pendingAdd !== null && pendingAdd.parentId === null && (
            <NameInput depth={0} type={pendingAdd.type} onDone={onDone} onCancel={onCancel} />
          )}

          {/* tree */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {(files ?? []).map((node) => (
              <TreeRow key={node.id} node={node} depth={0} {...rowProps} />
            ))}
          </div>

        </div>
      )}

      {/* ── users panel (unchanged from your original)  */}
      {activePanel === 'users' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* you */}
          <div style={{
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: '1px solid #2a2a2a',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: SESSION_COLOR, color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 'bold', flexShrink: 0,
            }}>
              {username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>{username}</div>
              <div style={{ color: '#4CAF50', fontSize: 11 }}>you</div>
            </div>
            <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#4CAF50' }} />
          </div>

          {/* others */}
          {userList.filter((u) => u.name !== username).length === 0 ? (
            <div style={{ padding: '20px 14px', color: '#555', fontSize: 13, textAlign: 'center' }}>
              No one else yet...
              <br />
              <span style={{ fontSize: 11, color: '#444' }}>Share room code to invite</span>
            </div>
          ) : (
            userList.filter((u) => u.name !== username).map((user) => (
              <div key={user.name} style={{
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid #2a2a2a',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: user.color, color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 'bold', flexShrink: 0,
                }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ color: '#ccc', fontSize: 13 }}>{user.name}</div>
                <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#4CAF50' }} />
              </div>
            ))
          )}

        </div>
      )}

    </div>
  )
}

export default SidePanel

