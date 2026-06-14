import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import FileTree from '../components/FileTree'
import ChatPanel from '../components/ChatPanel'
import UsersDropdown from '../components/UsersDropdown'
import { LANGUAGES, SESSION_COLOR, BACKEND_URL } from '../constants'

function EditorPage() {
  const { roomId } = useParams()

  const [username, setUsername] = useState('')
  const [nameEntered, setNameEntered] = useState(false)
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
        type: 'join', name, color: SESSION_COLOR
      }))
    }
  }

  useEffect(() => {
    // const ws = new WebSocket(`wss://${BACKEND_URL.replace('https://', '')}/${roomId}`)
    const ws = new WebSocket(`ws://localhost:4000/${roomId}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    ws.onmessage = async (event) => {
      const text = event.data instanceof Blob ? await event.data.text() : event.data
      const data = JSON.parse(text)

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
        setFiles(prev => {
          const exists = prev.find(f => f.id === data.file.id)
          if (exists) return prev
          return [...prev, data.file]
        })
      }

      if (data.type === 'language') {
        setFiles(prev => prev.map(f =>
          f.id === data.fileId ? { ...f, language: data.language } : f
        ))
        setLanguageAlert(`${data.changedBy} switched to ${data.language}`)
        setTimeout(() => setLanguageAlert(''), 4000)
      }

      if (data.type === 'users') setUsers(data.count)
      if (data.type === 'userlist') setUserList(data.users)

      if (data.type === 'chat') {
        setMessages(prev => [...prev, {
          name: data.name, color: data.color,
          text: data.text, time: data.time
        }])
      }

      if (data.type === 'cursor') {
        if (isRemoteChange.current) return
        setCursors(prev => ({
          ...prev,
          [data.name]: {
            name: data.name, color: data.color,
            line: data.line, column: data.column
          }
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

  useEffect(() => {
    if (!editorRef.current) return
    const newDecorations = Object.values(cursors).map((cursor) => ({
      range: {
        startLineNumber: cursor.line, startColumn: cursor.column,
        endLineNumber: cursor.line, endColumn: cursor.column + 1
      },
      options: {
        beforeContentClassName: `cursor-${cursor.name.replace(/\s/g, '-')}`,
        stickiness: 1
      }
    }))
    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current, newDecorations
    )
    Object.values(cursors).forEach((cursor) => {
      const id = `cursor-style-${cursor.name.replace(/\s/g, '-')}`
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = `.cursor-${cursor.name.replace(/\s/g, '-')} { border-left: 2px solid ${cursor.color} !important; margin-left: -1px; }`
    })
  }, [cursors])

  useEffect(() => {
    const chatDiv = document.getElementById('chat-messages')
    if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight
  }, [messages])

  function handleCodeChange(value) {
    if (isRemoteChange.current) return
    setFiles(prev => prev.map(f =>
      f.id === activeFileId ? { ...f, code: value } : f
    ))
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'code', code: value, fileId: activeFileId
      }))
    }
  }

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor

    // Disable print shortcut in Monaco
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP,
      () => { }
    )

    editor.onDidChangeCursorPosition((e) => {
      if (isRemoteChange.current || !username) return
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({
          type: 'cursor', name: username, color: SESSION_COLOR,
          line: e.position.lineNumber, column: e.position.column
        }))
      }
    })
  }

  // function handleRunCode() {
  //   executeCode()
  // }
  function handleRunCode() {
  // Remove focus from Monaco editor before running
  if (document.activeElement) {
    document.activeElement.blur()
  }
  setTimeout(() => {
    executeCode()
  }, 100)
}

  async function executeCode() {
    setOutput('Running...')

    // if (activeFile.language === 'javascript') {
    //   try {
    //     let result = ''
    //     const originalLog = console.log
    //     console.log = (...args) => { result += args.join(' ') + '\n' }
    //     // eslint-disable-next-line no-new-func
    //     new Function(activeFile.code)()
    //     console.log = originalLog
    //     setOutput(result || 'Ran successfully (no output)')
    //   } catch (err) {
    //     setOutput('Error: ' + err.message)
    //   }
    //   return
    // }
    if (activeFile.language === 'javascript') {
  try {
    let result = ''
    const originalLog = console.log
    const originalPrint = window.print

    // Override print() to show helpful message instead of print dialog
    window.print = () => {
      result += '⚠️ JavaScript uses console.log() not print()!\nReplace print("hello") with console.log("hello")\n'
    }

    console.log = (...args) => { result += args.join(' ') + '\n' }
    
    new Function(activeFile.code)()
    console.log = originalLog
    window.print = originalPrint

    setOutput(result || '✅ Ran successfully (no output)')
  } catch (err) {
    setOutput('❌ Error: ' + err.message)
  }
  return
}

    if (!activeFile.code.trim()) {
      setOutput('Nothing to run!')
      return
    }

    try {
      const response = await fetch(`${BACKEND_URL}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: activeFile.language, code: activeFile.code })
      })
      const result = await response.json()
      setOutput(result.output || 'Ran successfully (no output)')
    } catch {
      setOutput('Code Execution Unavailable\n\nRun locally by cloning the repo.\nCollaboration features work fully.')
    }
  }

  function sendMessage() {
    if (!newMessage.trim() || wsRef.current?.readyState !== 1) return
    const msg = {
      type: 'chat', name: username, color: SESSION_COLOR,
      text: newMessage.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    setMessages(prev => [...prev, { name: msg.name, color: msg.color, text: msg.text, time: msg.time }])
    wsRef.current.send(JSON.stringify(msg))
    setNewMessage('')
  }

  function createNewFile() {
    if (!newFileName.trim()) return
    const ext = newFileName.split('.').pop()
    const extMap = {
      js: 'javascript', py: 'python', java: 'java',
      cpp: 'cpp', ts: 'typescript', txt: 'plaintext',
      html: 'html', css: 'css', json: 'json'
    }
    const newFile = {
      id: Date.now().toString(),
      name: newFileName.trim(),
      language: extMap[ext] || 'plaintext',
      code: ''
    }
    setFiles(prev => [...prev, newFile])
    setActiveFileId(newFile.id)
    setNewFileName('')
    setShowNewFile(false)
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'newfile', file: newFile }))
    }
  }

  function importFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.js,.py,.java,.cpp,.ts,.txt,.html,.css,.json'
    input.onchange = (e) => {
      Array.from(e.target.files).forEach((file) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          const code = event.target.result
          const ext = file.name.split('.').pop()
          const extMap = {
            js: 'javascript', py: 'python', java: 'java',
            cpp: 'cpp', ts: 'typescript', txt: 'plaintext',
            html: 'html', css: 'css', json: 'json'
          }
          const newFile = {
            id: Date.now().toString() + Math.random(),
            name: file.name,
            language: extMap[ext] || 'plaintext',
            code
          }
          setFiles(prev => [...prev, newFile])
          setActiveFileId(newFile.id)
          if (wsRef.current?.readyState === 1) {
            wsRef.current.send(JSON.stringify({ type: 'newfile', file: newFile }))
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
    files.forEach((file) => zip.file(file.name, file.code))
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

      {!nameEntered && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.18)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 999, padding: '20px'
        }}>
          <div style={{
            width: '100%', maxWidth: '370px',
            background: 'rgba(24,24,27,0.92)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '18px', padding: '26px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.45)'
          }}>
            <div style={{
              width: '70px', height: '4px', borderRadius: '999px',
              background: 'linear-gradient(90deg,#F59E0B,#EF4444)',
              marginBottom: '22px'
            }} />
            <h2 style={{ color: 'white', margin: 0, fontSize: '26px', fontWeight: '800', letterSpacing: '-1px' }}>
              Join Room
            </h2>
            <p style={{ color: '#A1A1AA', fontSize: '14px', marginTop: '10px', marginBottom: '22px', lineHeight: 1.6 }}>
              Enter your name to start collaborating.
            </p>
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: '14px', borderRadius: '14px', marginBottom: '18px'
            }}>
              <div style={{ color: '#71717A', fontSize: '11px', marginBottom: '6px', letterSpacing: '1px' }}>
                ROOM CODE
              </div>
              <div style={{ color: '#F4F4F5', fontWeight: '800', fontSize: '24px', letterSpacing: '5px' }}>
                {roomId}
              </div>
            </div>
            <input
              type="text" placeholder="Your name..."
              maxLength={20} autoFocus value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && username.trim()) {
                  setNameEntered(true)
                  sendJoin(username.trim())
                }
              }}
              style={{
                width: '100%', padding: '14px 16px',
                background: '#111111', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px', color: 'white',
                fontSize: '15px', outline: 'none',
                boxSizing: 'border-box', marginBottom: '14px'
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (username.trim()) {
                  setNameEntered(true)
                  sendJoin(username.trim())
                }
              }}
              style={{
                width: '100%', padding: '14px', border: 'none',
                borderRadius: '14px',
                background: 'linear-gradient(135deg,#F59E0B,#EF4444)',
                color: 'white', fontSize: '15px', fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              Join
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
          Collab Editor
        </span>

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
            type="button"
            onClick={() => { navigator.clipboard.writeText(roomId); alert('Copied!') }}
            style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
          >
            📋
          </button>
        </div>

        <span style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: connected ? '#4CAF50' : '#f44336',
          display: 'inline-block'
        }} />

        <UsersDropdown
          users={users} username={username}
          userList={userList} showUsers={showUsers}
          setShowUsers={setShowUsers}
        />

        <select
          value={activeFile.language}
          onChange={(e) => {
            const newLang = e.target.value
            setFiles(prev => prev.map(f =>
              f.id === activeFileId ? { ...f, language: newLang } : f
            ))
            if (wsRef.current?.readyState === 1) {
              wsRef.current.send(JSON.stringify({
                type: 'language', language: newLang,
                changedBy: username, fileId: activeFileId
              }))
            }
          }}
          style={{
            padding: '5px 10px', background: '#3a3a3a',
            color: 'white', border: '1px solid #555',
            borderRadius: '5px', cursor: 'pointer'
          }}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>

        <button type="button" onClick={importFile} style={{
          marginLeft: 'auto', padding: '6px 14px', background: '#3a3a3a',
          color: 'white', border: '1px solid #555', borderRadius: '5px',
          cursor: 'pointer', fontSize: '13px'
        }}>
          Import
        </button>

        <button type="button" onClick={exportFiles} style={{
          padding: '6px 14px', background: '#3a3a3a',
          color: 'white', border: '1px solid #555', borderRadius: '5px',
          cursor: 'pointer', fontSize: '13px'
        }}>
          Export
        </button>

        <button
          type="button"
          onClick={() => setShowChat(prev => !prev)}
          style={{
            padding: '6px 14px',
            background: showChat ? '#2563EB' : '#3a3a3a',
            color: 'white', border: 'none',
            borderRadius: '5px', cursor: 'pointer', fontSize: '14px'
          }}
        >
          Chat
        </button>

        <button
          type="button"
          onClick={handleRunCode}
          style={{
            padding: '6px 20px', background: '#4CAF50',
            color: 'white', border: 'none', borderRadius: '5px',
            cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
          }}
        >
          Run
        </button>
      </div>

      {languageAlert && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px',
          background: '#1e1e2e', border: '1px solid #4CAF50',
          borderLeft: '4px solid #4CAF50', color: 'white',
          padding: '12px 20px', borderRadius: '8px',
          fontSize: '13px', fontWeight: '500', zIndex: 999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', maxWidth: '300px'
        }}>
          {languageAlert}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        <FileTree
          files={files} activeFileId={activeFileId}
          setActiveFileId={setActiveFileId}
          showNewFile={showNewFile} setShowNewFile={setShowNewFile}
          newFileName={newFileName} setNewFileName={setNewFileName}
          createNewFile={createNewFile}
        />

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
            {output || 'Click Run to see output...'}
          </pre>
        </div>

      </div>

      {showChat && (
        <ChatPanel
          messages={messages} newMessage={newMessage}
          setNewMessage={setNewMessage} sendMessage={sendMessage}
          username={username} setShowChat={setShowChat}
        />
      )}

    </div>
  )
}

export default EditorPage