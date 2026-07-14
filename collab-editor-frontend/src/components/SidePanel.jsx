import { useState } from 'react'

// Language icon images from your public/lang_icons/ folder
const LANG_ICONS = {
  python:     '/lang_icons/python.png',
  c:          '/lang_icons/c.png',
  cpp:        '/lang_icons/c++.png',
  java:       '/lang_icons/java.png',
  typescript: '/lang_icons/typescript.png',
  csharp:     '/lang_icons/c-sharp.png',
  fsharp:     '/lang_icons/FSharp.png',
  php:        '/lang_icons/php.png',
  ruby:       '/lang_icons/Ruby.png',
  haskell:    '/lang_icons/haskell.png',
  go:         '/lang_icons/go.png',
  rust:       '/lang_icons/rust.png',
  plaintext:  '/lang_icons/text.png',
}

function SidePanel({
  activePanel,
  files,
  activeFileId,
  setActiveFileId,
  showNewFile,
  setShowNewFile,
  newFileName,
  setNewFileName,
  createNewFile,
  onDeleteFile,       // (fileId) => void
  username,
  userList,
  SESSION_COLOR,
}) {
  if (!activePanel) return null

  return (
    <div style={{
      width: '220px',
      background: '#252526',
      borderRight: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>

      {/* ── Panel Header  */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #333',
        fontSize: '11px',
        fontWeight: 'bold',
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: '1px',
      }}>
        {activePanel === 'files' ? 'Explorer' : 'Users Online'}
      </div>

      {/* ── Files Panel */}
      {activePanel === 'files' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* New File button row */}
          <div style={{
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #2a2a2a',
          }}>
            <span style={{ color: '#666', fontSize: '11px' }}>FILES</span>
            <button
              type="button"
              onClick={() => setShowNewFile(prev => !prev)}
              title="New file"
              style={{
                background: 'transparent', border: 'none',
                color: '#888', cursor: 'pointer', fontSize: '18px',
                lineHeight: 1, display: 'flex', alignItems: 'center',
                justifyContent: 'center', width: '20px', height: '20px',
                borderRadius: '3px',
              }}
            >
              +
            </button>
          </div>

          {/* New File Input */}
          {showNewFile && (
            <div style={{ padding: '6px 10px', borderBottom: '1px solid #2a2a2a' }}>
              <input
                type="text"
                placeholder="filename.py"
                autoFocus
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createNewFile()
                  if (e.key === 'Escape') setShowNewFile(false)
                }}
                style={{
                  width: '100%', padding: '4px 8px',
                  background: '#1e1e1e', border: '1px solid #4CAF50',
                  borderRadius: '4px', color: 'white',
                  fontSize: '12px', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* File List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {files.map(file => (
              <FileRow
                key={file.id}
                file={file}
                active={file.id === activeFileId}
                onSelect={() => setActiveFileId(file.id)}
                onDelete={() => onDeleteFile(file.id)}
                canDelete={files.length > 1}
              />
            ))}
          </div>

        </div>
      )}

      {/* ── Users Panel  */}
      {activePanel === 'users' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* You */}
          <div style={{
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: '10px',
            borderBottom: '1px solid #2a2a2a',
          }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: SESSION_COLOR,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 'bold', color: 'white', flexShrink: 0,
            }}>
              {username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ color: 'white', fontSize: '13px', fontWeight: '500' }}>{username}</div>
              <div style={{ color: '#4CAF50', fontSize: '11px' }}>you</div>
            </div>
            <div style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: '#4CAF50', flexShrink: 0 }} />
          </div>

          {/* Others */}
          {userList.filter(u => u.name !== username).length === 0 ? (
            <div style={{ padding: '20px 14px', color: '#555', fontSize: '13px', textAlign: 'center' }}>
              No one else yet...
              <br />
              <span style={{ fontSize: '11px', color: '#444' }}>Share room code to invite</span>
            </div>
          ) : (
            userList.filter(u => u.name !== username).map(user => (
              <div key={user.name} style={{
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: '10px',
                borderBottom: '1px solid #2a2a2a',
              }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: user.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 'bold', color: 'white', flexShrink: 0,
                }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ color: '#ccc', fontSize: '13px' }}>{user.name}</div>
                <div style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: '#4CAF50', flexShrink: 0 }} />
              </div>
            ))
          )}

        </div>
      )}

    </div>
  )
}

// ── Single file row with icon + delete on hover 

function FileRow({ file, active, onSelect, onDelete, canDelete }) {
  const [hov, setHov] = useState(false)
  const iconSrc = LANG_ICONS[file.language] || LANG_ICONS.plaintext

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onSelect}
      style={{
        padding: '6px 14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: active ? '#37373d' : hov ? '#2d2d2d' : 'transparent',
        borderLeft: active ? '2px solid #4CAF50' : '2px solid transparent',
        color: active ? 'white' : '#ccc',
        fontSize: '13px',
      }}
    >
      {/* Language icon */}
      <img
        src={iconSrc}
        alt={file.language}
        style={{ width: '16px', height: '16px', objectFit: 'contain', flexShrink: 0 }}
      />

      {/* Filename */}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.name}
      </span>

      {/* Delete button — visible on hover, hidden when only 1 file */}
      {hov && canDelete && (
        <button
          type="button"
          title="Delete file"
          onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            background: 'transparent', border: 'none',
            color: '#888', cursor: 'pointer',
            fontSize: '13px', lineHeight: 1,
            padding: '0 2px', flexShrink: 0,
            borderRadius: '3px',
          }}
        >
          🗑
        </button>
      )}
    </div>
  )
}

export default SidePanel