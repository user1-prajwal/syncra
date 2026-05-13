import { useEffect, useRef, useState } from 'react'
import { Routes, Route, useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'

const LANGUAGES = ['javascript', 'python', 'cpp', 'java', 'typescript']
const COLORS = ['#FF6B6B', '#4ECDC4', '#42F527', '#ffffff', '#fc15fc']
const MY_COLOR = COLORS[Math.floor(Math.random() * COLORS.length)]

// ─── LANDING PAGE ───────────────────────────────────────────────
function Landing() {
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function createRoom() {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    navigate(`/room/${roomId}`)
  }

  function joinRoom() {
    if (!joinCode.trim()) { setError('Please enter a room code!'); return }
    navigate(`/room/${joinCode.trim().toUpperCase()}`)
  }

  return (
    <div style={{
      height: '100vh', background: '#1e1e1e',
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '40px',
        width: '100%', maxWidth: '480px', padding: '0 20px'
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: 'white', fontSize: '42px', margin: '0 0 8px' }}>
            ⚡ Collab Editor
          </h1>
          <p style={{ color: '#888', fontSize: '16px', margin: 0 }}>
            Real-time collaborative code editor
          </p>
        </div>

        {/* Create Room */}
        <div style={{
          background: '#2d2d2d', border: '1px solid #444',
          borderRadius: '12px', padding: '30px',
          width: '100%', boxSizing: 'border-box'
        }}>
          <h2 style={{ color: 'white', margin: '0 0 8px', fontSize: '18px' }}>
            🚀 Start a new room
          </h2>
          <p style={{ color: '#888', margin: '0 0 20px', fontSize: '13px' }}>
            Create a room and share the code with friends
          </p>
          <button onClick={createRoom} style={{
            width: '100%', padding: '12px',
            background: '#4CAF50', color: 'white',
            border: 'none', borderRadius: '8px',
            fontSize: '16px', fontWeight: 'bold', cursor: 'pointer'
          }}>
            Create New Room
          </button>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
          <div style={{ flex: 1, height: '1px', background: '#444' }} />
          <span style={{ color: '#666', fontSize: '14px' }}>or join existing</span>
          <div style={{ flex: 1, height: '1px', background: '#444' }} />
        </div>

        {/* Join Room */}
        <div style={{
          background: '#2d2d2d', border: '1px solid #444',
          borderRadius: '12px', padding: '30px',
          width: '100%', boxSizing: 'border-box'
        }}>
          <h2 style={{ color: 'white', margin: '0 0 8px', fontSize: '18px' }}>
            🔗 Join a room
          </h2>
          <p style={{ color: '#888', margin: '0 0 20px', fontSize: '13px' }}>
            Enter the room code shared by your friend
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Room code e.g. ABC123"
              value={joinCode}
              maxLength={6}
              onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              style={{
                flex: 1, padding: '10px 14px',
                background: '#1e1e1e', border: '1px solid #555',
                borderRadius: '8px', color: 'white',
                fontSize: '15px', outline: 'none',
                letterSpacing: '2px', fontWeight: 'bold'
              }}
            />
            <button onClick={joinRoom} style={{
              padding: '10px 20px', background: '#2563EB',
              color: 'white', border: 'none',
              borderRadius: '8px', fontSize: '15px',
              fontWeight: 'bold', cursor: 'pointer'
            }}>
              Join →
            </button>
          </div>
          {error && <p style={{ color: '#f87171', margin: '8px 0 0', fontSize: '13px' }}>{error}</p>}
        </div>

      </div>
    </div>
  )
}

// ─── EDITOR PAGE ─────────────────────────────────────────────────
function EditorPage() {
  const { roomId } = useParams()

  const [username, setUsername] = useState('')
  const [nameEntered, setNameEntered] = useState(false)
  // const [language, setLanguage] = useState('javascript')
  // const [code, setCode] = useState('// Start coding here...')
  const [output, setOutput] = useState('')
  const [connected, setConnected] = useState(false)
  const [users, setUsers] = useState(0)
  const [cursors, setCursors] = useState({})
  const [userList, setUserList] = useState([])
  const [showUsers, setShowUsers] = useState(false)
  const [languageAlert, setLanguageAlert] = useState('')
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [showChat, setShowChat] = useState(false)
  const [files, setFiles] = useState([
    { id: '1', name: 'index.js', language: 'javascript', code: '// Start coding here...' }
    ])
  const [activeFileId, setActiveFileId] = useState('1')
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')

  const wsRef = useRef(null)
  const isRemoteChange = useRef(false)
  const editorRef = useRef(null)
  const decorationsRef = useRef([])

  const activeFile = files.find(f => f.id === activeFileId) || files[0]

  function sendJoin(name) {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'join',
        name: name,
        color: MY_COLOR
      }))
    }
  }

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:4000/${roomId}`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Connected! 🟢')
      setConnected(true)
    }

    ws.onclose = () => {
      console.log('Disconnected 🔴')
      setConnected(false)
    }

    ws.onmessage = async (event) => {
      const text = event.data instanceof Blob ? await event.data.text() : event.data
      const data = JSON.parse(text)

      // if (data.type === 'code' || data.type === 'init') {
      //   isRemoteChange.current = true
      //   setCode(data.code)
      //   isRemoteChange.current = false
      // }

      if (data.type === 'code') {
        isRemoteChange.current = true
        setFiles(prev => prev.map(f =>
          f.id === data.fileId ? { ...f, code: data.code } : f
        ))
        isRemoteChange.current = false
      }

      if (data.type === 'init') {
        isRemoteChange.current = true
        if (data.files) {
          setFiles(data.files)
          setActiveFileId(data.files[0].id)
        }
        isRemoteChange.current = false
      }

      if (data.type === 'newfile') {
        setFiles(prev => [...prev, data.file])
      }

      if (data.type === 'language') {
        setFiles(prev => prev.map(f =>
          f.id === data.fileId ? { ...f, language: data.language } : f
        ))
        setLanguageAlert(`${data.changedBy} switched ${data.fileId} to ${data.language}`)
        setTimeout(() => setLanguageAlert(''), 4000)
      }

      if (data.type === 'users') setUsers(data.count)
      if (data.type === 'userlist') setUserList(data.users)


        if (data.type === 'chat') {
        setMessages((prev) => [...prev, {
        name: data.name,
        color: data.color,
        text: data.text,
        time: data.time
        }])
        }   

        // if (data.type === 'language') {
        // setLanguageAlert(`${data.changedBy} is using ${data.language} — you are using ${language}`)
        // setTimeout(() => setLanguageAlert(''), 4000)
        // }


        if (data.type === 'language') {
          setLanguageAlert(`${data.changedBy} switched to ${data.language}`)
          setTimeout(() => setLanguageAlert(''), 4000)
}

      if (data.type === 'cursor') {
        setCursors((prev) => ({
          ...prev,
          [data.name]: { name: data.name, color: data.color, line: data.line, column: data.column }
        }))
      }
    }

    const handleClickOutside = () => setShowUsers(false)
    document.addEventListener('click', handleClickOutside)

    return () => {
      ws.close()
      document.removeEventListener('click', handleClickOutside)
    }
  }, [roomId])

  // Draw remote cursors
  useEffect(() => {
    if (!editorRef.current) return
    const newDecorations = Object.values(cursors).map((cursor) => ({
      range: {
        startLineNumber: cursor.line, startColumn: cursor.column,
        endLineNumber: cursor.line, endColumn: cursor.column + 1
      },
      options: {
        beforeContentClassName: 'remote-cursor',
        hoverMessage: { value: `👤 ${cursor.name}` }
      }
    }))
    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current, newDecorations
    )
  }, [cursors])


  useEffect(() => {
  const chatDiv = document.getElementById('chat-messages')
  if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight
}, [messages])

  function handleCodeChange(value) {
  if (isRemoteChange.current) return

  // Update active file's code
  setFiles(prev => prev.map(f =>
    f.id === activeFileId ? { ...f, code: value } : f
  ))

  if (wsRef.current?.readyState === 1) {
    wsRef.current.send(JSON.stringify({
      type: 'code',
      code: value,
      fileId: activeFileId
    }))
  }
}

  function handleCursorChange(e) {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor', name: username, color: MY_COLOR,
        line: e.position.lineNumber, column: e.position.column
      }))
    }
  }

  function handleEditorMount(editor) {
    editorRef.current = editor
    editor.onDidChangeCursorPosition(handleCursorChange)
  }

  async function runCode() {
  setOutput('⏳ Running...')
  if (activeFile.language === 'typescript') {
    setOutput('⚠️ TypeScript execution coming soon!')
    return
  }
  try {
    const response = await fetch('http://localhost:4000/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        language: activeFile.language, 
        code: activeFile.code 
      })
    })
    const result = await response.json()
    setOutput(result.output)
  } catch {
    setOutput('❌ Could not connect to server')
  }
}


  function sendMessage() {
  if (!newMessage.trim()) return
  if (wsRef.current?.readyState !== 1) return

  const msg = {
    type: 'chat',
    name: username,
    color: MY_COLOR,
    text: newMessage.trim(),
    time: new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  // Add to own messages immediately
  setMessages((prev) => [...prev, {
    name: msg.name,
    color: msg.color,
    text: msg.text,
    time: msg.time
  }])

  // Send to everyone else
  wsRef.current.send(JSON.stringify(msg))
  setNewMessage('')
}


function createNewFile() {
  if (!newFileName.trim()) return

  // Auto detect language from extension
  const ext = newFileName.split('.').pop()
  const extMap = {
    js: 'javascript', py: 'python',
    java: 'java', cpp: 'cpp',
    ts: 'typescript', txt: 'plaintext'
  }
  const language = extMap[ext] || 'javascript'

  const newFile = {
    id: Date.now().toString(),
    name: newFileName.trim(),
    language,
    code: ''
  }

  setFiles(prev => [...prev, newFile])
  setActiveFileId(newFile.id)
  setNewFileName('')
  setShowNewFile(false)

  // Broadcast to others
  if (wsRef.current?.readyState === 1) {
    wsRef.current.send(JSON.stringify({
      type: 'newfile',
      file: newFile
    }))
  }
}


function importFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = '.js,.py,.java,.cpp,.ts,.txt,.html,.css,.json'

  input.onchange = (e) => {
    const selectedFiles = Array.from(e.target.files)

    selectedFiles.forEach((file) => {
      const reader = new FileReader()

      reader.onload = (event) => {
        const code = event.target.result

        // detect language from extension
        const ext = file.name.split('.').pop()
        const extMap = {
          js: 'javascript', py: 'python',
          java: 'java', cpp: 'cpp',
          ts: 'typescript', txt: 'plaintext',
          html: 'html', css: 'css', json: 'json'
        }
        const language = extMap[ext] || 'plaintext'

        const newFile = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          language,
          code
        }

        // Add to local files
        setFiles(prev => [...prev, newFile])
        setActiveFileId(newFile.id)

        // Broadcast to everyone in room
        if (wsRef.current?.readyState === 1) {
          wsRef.current.send(JSON.stringify({
            type: 'newfile',
            file: newFile
          }))
        }
      }

      reader.readAsText(file)
    })
  }

  input.click()
}


async function exportFiles() {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // Add each file to zip
  files.forEach((file) => {
    zip.file(file.name, file.code)
  })

  // Generate and download zip
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `collab-project-${roomId}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1e1e1e' }}>

      {/* Username Popup */}
      {!nameEntered && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#2d2d2d', padding: '40px', borderRadius: '12px',
            border: '1px solid #444', display: 'flex',
            flexDirection: 'column', gap: '16px', minWidth: '320px'
          }}>
            <h2 style={{ color: 'white', margin: 0, fontSize: '22px' }}>
              ⚡ Welcome to Collab Editor
            </h2>
            <p style={{ color: '#888', margin: 0, fontSize: '14px' }}>
              Room: <span style={{ color: '#4CAF50', fontWeight: 'bold', letterSpacing: '2px' }}>{roomId}</span>
            </p>
            <input
              type="text"
              placeholder="Enter your name..."
              maxLength={20}
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && username.trim()) {
                  setNameEntered(true)
                  sendJoin(username.trim())
                }
              }}
              style={{
                padding: '10px 14px', background: '#1e1e1e',
                border: '1px solid #555', borderRadius: '6px',
                color: 'white', fontSize: '15px', outline: 'none'
              }}
            />
            <button
              onClick={() => {
                if (username.trim()) {
                  setNameEntered(true)
                  sendJoin(username.trim())
                }
              }}
              style={{
                padding: '10px', background: '#4CAF50',
                color: 'white', border: 'none', borderRadius: '6px',
                fontSize: '15px', fontWeight: 'bold', cursor: 'pointer'
              }}
            >
              Join Room →
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 20px', background: '#2d2d2d',
        borderBottom: '1px solid #444', flexWrap: 'wrap'
      }}>

        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>
          ⚡ Collab Editor
        </span>

        {/* Room Code */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: '#1e1e1e', border: '1px solid #555',
          borderRadius: '6px', padding: '4px 12px'
        }}>
          <span style={{ color: '#888', fontSize: '12px' }}>Room:</span>
          <span style={{ color: '#4CAF50', fontSize: '13px', fontWeight: 'bold', letterSpacing: '2px' }}>
            {roomId}
          </span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(roomId)
              alert('Room code copied! 🎉')
            }}
            style={{
              background: 'transparent', border: 'none',
              color: '#888', cursor: 'pointer', fontSize: '14px', padding: '0 4px'
            }}
            title="Copy room code"
          >
            📋
          </button>
        </div>

        {/* Connection dot */}
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: connected ? '#4CAF50' : '#f44336',
          display: 'inline-block'
        }} />

        {/* Users Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowUsers(prev => !prev) }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '5px 12px', background: '#3a3a3a',
              border: '1px solid #555', borderRadius: '6px',
              color: 'white', cursor: 'pointer', fontSize: '13px'
            }}
          >
            👥 {users} online ▾
          </button>

          {showUsers && (
            <div style={{
              position: 'absolute', top: '36px', left: 0,
              background: '#2d2d2d', border: '1px solid #444',
              borderRadius: '8px', minWidth: '180px',
              zIndex: 999, overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
            }}>
              {/* You */}
              <div style={{
                padding: '10px 14px', display: 'flex',
                alignItems: 'center', gap: '8px',
                borderBottom: '1px solid #444'
              }}>
                <span style={{
                  width: '10px', height: '10px',
                  borderRadius: '50%', background: MY_COLOR, flexShrink: 0
                }} />
                <span style={{ color: 'white', fontSize: '13px' }}>{username}</span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#4CAF50', fontWeight: 'bold' }}>you</span>
              </div>

              {/* Others */}
              {userList.filter(u => u.name !== username).length === 0 ? (
                <div style={{ padding: '10px 14px', color: '#666', fontSize: '12px' }}>
                  No one else yet...
                </div>
              ) : (
                userList.filter(u => u.name !== username).map((user) => (
                  <div key={user.name} style={{
                    padding: '10px 14px', display: 'flex',
                    alignItems: 'center', gap: '8px',
                    borderBottom: '1px solid #333'
                  }}>
                    <span style={{
                      width: '10px', height: '10px',
                      borderRadius: '50%', background: user.color, flexShrink: 0
                    }} />
                    <span style={{ color: 'white', fontSize: '13px' }}>{user.name}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Language Selector */}
        <select
          // value={language}
          value={activeFile.language}
            onChange={(e) => {
            const newLang = e.target.value
            setFiles(prev => prev.map(f =>
              f.id === activeFileId ? { ...f, language: newLang } : f
            ))
            if (wsRef.current?.readyState === 1) {
              wsRef.current.send(JSON.stringify({
                type: 'language',
                language: newLang,
                changedBy: username,
                fileId: activeFileId
              }))
            }
          }}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>



        {/* Import Button */}
        <button
          onClick={importFile}
          style={{
            marginLeft: 'auto',
            padding: '6px 14px',
            background: '#3a3a3a',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
          title="Import files from your computer"
        >
          📂 Import
        </button>

        {/* Export Button */}
        <button
          onClick={exportFiles}
          style={{
            marginLeft: '8px',
            padding: '6px 14px',
            background: '#3a3a3a',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
          title="Download all files as ZIP"
        >
          💾 Export
        </button>


        {/* Chat Toggle */}
        <button
          onClick={() => setShowChat(prev => !prev)}
          style={{
            marginLeft: 'auto',
            padding: '6px 14px',
            background: showChat ? '#2563EB' : '#3a3a3a',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px'
            }}
          >
          💬 Chat
          </button>

        {/* Run Button */}
        <button
          onClick={runCode}
          style={{
            marginLeft: 'auto', padding: '6px 20px',
            background: '#4CAF50', color: 'white',
            border: 'none', borderRadius: '5px',
            cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
          }}
        >
          ▶ Run
        </button>
      </div>

          {languageAlert && (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        background: '#1e1e2e',
        border: '1px solid #4CAF50',
        borderLeft: '4px solid #4CAF50',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '500',
        zIndex: 999,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        maxWidth: '300px',
        animation: 'fadeIn 0.3s ease'
        }}>
      🔄 {languageAlert}
      </div>
      )}


      {/* Editor + Output + Chat */}
      {/* <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1 }}>
          <Editor */}
        {/* Editor + Output */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

            {/* File Tree */}
            <div style={{
              width: '200px',
              background: '#252526',
              borderRight: '1px solid #444',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0
            }}>

              {/* File Tree Header */}
              <div style={{
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #444'
              }}>
                <span style={{ color: '#888', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  Files
                </span>
                <button
                  onClick={() => setShowNewFile(prev => !prev)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: '#888', cursor: 'pointer',
                    fontSize: '18px', lineHeight: 1, padding: '0'
                  }}
                  title="New file"
                >
                  +
                </button>
              </div>

              {/* New File Input */}
              {showNewFile && (
                <div style={{ padding: '8px' }}>
                  <input
                    type="text"
                    placeholder="filename.py"
                    autoFocus
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createNewFile()
                      if (e.key === 'Escape') setShowNewFile(false)
                    }}
                    style={{
                      width: '100%', padding: '4px 8px',
                      background: '#1e1e1e', border: '1px solid #4CAF50',
                      borderRadius: '4px', color: 'white',
                      fontSize: '12px', outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              {/* File List */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {files.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    style={{
                      padding: '7px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: file.id === activeFileId ? '#2d2d2d' : 'transparent',
                      borderLeft: file.id === activeFileId ? '2px solid #4CAF50' : '2px solid transparent',
                      color: file.id === activeFileId ? 'white' : '#888',
                      fontSize: '13px',
                    }}
                  >
                    <span>📄</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file.name}
                    </span>
                  </div>
                ))}
              </div>

            </div>

            <div style={{ flex: 1 }}>
          <Editor


          height="100%"
          language={activeFile.language}
          value={activeFile.code}
          onChange={handleCodeChange}
          onMount={handleEditorMount}
          theme="vs-dark"
          key={activeFileId}
        />
        </div>

        <div style={{
          width: '35%', background: '#1a1a1a',
          borderLeft: '1px solid #444',
          padding: '15px', overflowY: 'auto'
        }}>
          <p style={{ color: '#888', margin: '0 0 10px', fontSize: '13px' }}>OUTPUT</p>
          <pre style={{ color: '#00ff88', margin: 0, fontSize: '14px', whiteSpace: 'pre-wrap' }}>
            {output || 'Click ▶ Run to see output...'}
          </pre>
        </div>
      </div>

    {/* Floating Chat Popup */}
    {showChat && (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '340px',
        height: '460px',
        background: '#181818',
        border: '1px solid #2f2f2f',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.65)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 998,
        overflow: 'hidden',
        backdropFilter: 'blur(12px)'
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 18px',
          background: '#202020',
          borderBottom: '1px solid #303030',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <span style={{
            color: '#f5f5f5',
            fontSize: '15px',
            fontWeight: '600',
            letterSpacing: '0.3px'
          }}>
            💬 Room Chat
          </span>

          <button
            onClick={() => setShowChat(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: '18px',
              transition: '0.2s'
            }}
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div
          id="chat-messages"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            background: '#181818'
          }}
        >
          {messages.length === 0 ? (
            <div style={{
              margin: 'auto',
              textAlign: 'center',
              color: '#666',
              fontSize: '13px',
              lineHeight: '1.8'
            }}>
              No messages yet 👋
              <br />
              Start the conversation
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = msg.name === username

              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start',
                    gap: '5px'
                  }}
                >

                  {/* Username + time */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    flexDirection: isMe ? 'row-reverse' : 'row'
                  }}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      color: msg.color
                    }}>
                      {isMe ? 'You' : msg.name}
                    </span>

                    <span style={{
                      fontSize: '10px',
                      color: '#777'
                    }}>
                      {msg.time}
                    </span>
                  </div>

                  {/* Message bubble */}
                  <div style={{
                    background: isMe
                      ? '#2563EB'
                      : '#242424',
                    color: '#f3f4f6',
                    padding: '10px 14px',
                    borderRadius: isMe
                      ? '14px 14px 4px 14px'
                      : '14px 14px 14px 4px',
                    fontSize: '13.5px',
                    maxWidth: '240px',
                    wordBreak: 'break-word',
                    lineHeight: '1.6',
                    border: isMe
                      ? 'none'
                      : '1px solid #333',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.25)'
                  }}>
                    {msg.text}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Input */}
        <div style={{
          padding: '12px',
          borderTop: '1px solid #2f2f2f',
          display: 'flex',
          gap: '10px',
          background: '#202020'
        }}>
          <input
            type="text"
            placeholder="Message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            style={{
              flex: 1,
              padding: '10px 14px',
              background: '#121212',
              border: '1px solid #333',
              borderRadius: '10px',
              color: '#f5f5f5',
              fontSize: '13px',
              outline: 'none'
            }}
          />

          <button
            onClick={sendMessage}
            style={{
              padding: '10px 14px',
              background: '#2563EB',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            ➤
          </button>
        </div>

      </div>
    )}

    </div>
  )
}

// ─── APP ROUTER 
function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/room/:roomId" element={<EditorPage />} />
    </Routes>
  )
}

export default App