import { Routes, Route, useParams } from 'react-router-dom'
import Landing from './Landing'
import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'

const LANGUAGES = ['javascript', 'python', 'cpp', 'java', 'typescript']
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD']
const NAMES = ['Panda', 'Tiger', 'Eagle', 'Shark', 'Wolf', 'Fox']

const MY_NAME = NAMES[Math.floor(Math.random() * NAMES.length)]
const MY_COLOR = COLORS[Math.floor(Math.random() * COLORS.length)]

// function getRoomId() {
//   const path = window.location.pathname.replace('/', '')
//   return path || 'room1'
// }

// function App() {
function EditorPage() {
  const { roomId } = useParams()  
  const [language, setLanguage] = useState('javascript')
  const [output, setOutput] = useState('')
  const [code, setCode] = useState('// Start coding here...')
  const [connected, setConnected] = useState(false)
  const [users, setUsers] = useState(1)
  const [cursors, setCursors] = useState({})

  const wsRef = useRef(null)
  const isRemoteChange = useRef(false)
  const editorRef = useRef(null)
  const decorationsRef = useRef([])

  useEffect(() => {
    // const roomId = getRoomId()
    // const { roomId } = useParams()
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

      if (data.type === 'code' || data.type === 'init') {
        isRemoteChange.current = true
        setCode(data.code)
        isRemoteChange.current = false
      }

      if (data.type === 'users') {
        setUsers(data.count)
      }

      if (data.type === 'cursor') {
        setCursors((prev) => ({
          ...prev,
          [data.name]: {
            name: data.name,
            color: data.color,
            line: data.line,
            column: data.column
          }
        }))
      }
    }

    return () => ws.close()
  }, [])

  // Update cursor decorations whenever cursors state changes
  useEffect(() => {
    if (!editorRef.current) return

    const newDecorations = Object.values(cursors).map((cursor) => ({
      range: {
        startLineNumber: cursor.line,
        startColumn: cursor.column,
        endLineNumber: cursor.line,
        endColumn: cursor.column + 1
      },
      options: {
        beforeContentClassName: 'remote-cursor',
        hoverMessage: { value: `👤 ${cursor.name}` }
      }
    }))

    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      newDecorations
    )
  }, [cursors])

  function handleCodeChange(value) {
    if (isRemoteChange.current) return
    setCode(value)
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'code', code: value }))
    }
  }

  function handleCursorChange(e) {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor',
        name: MY_NAME,
        color: MY_COLOR,
        line: e.position.lineNumber,
        column: e.position.column
      }))
    }
  }

  function handleEditorMount(editor) {
    editorRef.current = editor
    editor.onDidChangeCursorPosition(handleCursorChange)
  }

  function runCode() {
    if (language !== 'javascript') {
      setOutput('⚠️ Browser can only run JavaScript for now!')
      return
    }
    try {
      let result = ''
      const originalLog = console.log
      console.log = (...args) => { result += args.join(' ') + '\n' }
      new Function(code)()
      console.log = originalLog
      setOutput(result || '✅ Ran successfully (no output)')
    } catch (error) {
      setOutput('❌ Error: ' + error.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1e1e1e' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 20px',
        background: '#2d2d2d',
        borderBottom: '1px solid #444'
      }}>
        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>
          ⚡ Collab Editor
        </span>

        {/* Room Code Display */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#1e1e1e',
          border: '1px solid #555',
          borderRadius: '6px',
          padding: '4px 12px',
        }}>
          <span style={{ color: '#888', fontSize: '12px' }}>Room:</span>
          <span style={{ 
            color: '#4CAF50', 
            fontSize: '13px', 
            fontWeight: 'bold',
            letterSpacing: '2px'
          }}>
            {roomId}
          </span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(roomId)
              alert('Room code copied! Share it with your friends 🎉')
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '0 4px'
            }}
            title="Copy room code"
            >
            📋
          </button>
        </div>

        <span style={{
          width: '8px', height: '8px',
          borderRadius: '50%',
          background: connected ? '#4CAF50' : '#f44336',
          display: 'inline-block'
        }} />

        <span style={{ color: '#888', fontSize: '12px' }}>
          {connected ? `Connected — ${users} user(s) online` : 'Disconnected'}
        </span>

        {/* My name badge */}
        <span style={{
          fontSize: '12px',
          padding: '2px 8px',
          borderRadius: '999px',
          background: MY_COLOR,
          color: 'white',
          fontWeight: 'bold'
        }}>
          {MY_NAME} (you)
        </span>

        {/* Other users' cursors */}
        {Object.values(cursors).map((cursor) => (
          <span key={cursor.name} style={{
            fontSize: '12px',
            padding: '2px 8px',
            borderRadius: '999px',
            background: cursor.color,
            color: 'white',
            fontWeight: 'bold'
          }}>
            {cursor.name}
          </span>
        ))}

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{
            marginLeft: '20px',
            padding: '5px 10px',
            background: '#3a3a3a',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>

        <button
          onClick={runCode}
          style={{
            marginLeft: 'auto',
            padding: '6px 20px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          ▶ Run
        </button>
      </div>

      {/* Editor + Output */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        <div style={{ flex: 1 }}>
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={handleCodeChange}
            onMount={handleEditorMount}
            theme="vs-dark"
          />
        </div>

        <div style={{
          width: '35%',
          background: '#1a1a1a',
          borderLeft: '1px solid #444',
          padding: '15px',
          overflowY: 'auto'
        }}>
          <p style={{ color: '#888', margin: '0 0 10px', fontSize: '13px' }}>OUTPUT</p>
          <pre style={{ color: '#00ff88', margin: 0, fontSize: '14px', whiteSpace: 'pre-wrap' }}>
            {output || 'Click ▶ Run to see output...'}
          </pre>
        </div>

      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/room/:roomId" element={<EditorPage />} />
    </Routes>
  )
}

export default App