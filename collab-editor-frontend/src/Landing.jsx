import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function Landing() {
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function createRoom() {
    const roomId = generateRoomId()
    navigate(`/room/${roomId}`)
  }

  function joinRoom() {
    if (!joinCode.trim()) {
      setError('Please enter a room code!')
      return
    }
    navigate(`/room/${joinCode.trim().toUpperCase()}`)
  }

  return (
    <div style={{
      height: '100vh',
      background: '#1e1e1e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '40px',
        width: '100%',
        maxWidth: '480px',
        padding: '0 20px'
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            color: 'white',
            fontSize: '42px',
            margin: '0 0 8px',
            fontWeight: 'bold'
          }}>
            ⚡ Collab Editor
          </h1>
          <p style={{ color: '#888', fontSize: '16px', margin: 0 }}>
            Real-time collaborative code editor
          </p>
        </div>

        {/* Create Room */}
        <div style={{
          background: '#2d2d2d',
          border: '1px solid #444',
          borderRadius: '12px',
          padding: '30px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <h2 style={{ color: 'white', margin: '0 0 8px', fontSize: '18px' }}>
            🚀 Start a new room
          </h2>
          <p style={{ color: '#888', margin: '0 0 20px', fontSize: '13px' }}>
            Create a room and share the code with friends
          </p>
          <button
            onClick={createRoom}
            style={{
              width: '100%',
              padding: '12px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
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
          background: '#2d2d2d',
          border: '1px solid #444',
          borderRadius: '12px',
          padding: '30px',
          width: '100%',
          boxSizing: 'border-box'
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
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase())
                setError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              style={{
                flex: 1,
                padding: '10px 14px',
                background: '#1e1e1e',
                border: '1px solid #555',
                borderRadius: '8px',
                color: 'white',
                fontSize: '15px',
                outline: 'none',
                letterSpacing: '2px',
                fontWeight: 'bold'
              }}
            />
            <button
              onClick={joinRoom}
              style={{
                padding: '10px 20px',
                background: '#2563EB',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Join →
            </button>
          </div>
          {error && (
            <p style={{ color: '#f87171', margin: '8px 0 0', fontSize: '13px' }}>
              {error}
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

export default Landing