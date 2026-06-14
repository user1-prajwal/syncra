import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Landing() {
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function createRoom() {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    navigate(`/room/${roomId}`)
  }

  function joinRoom() {
    const code = joinCode.trim().toUpperCase()
    if (!code) { setError('Please enter a room code'); return }
    if (!/^[A-Z0-9]{6}$/.test(code)) { setError('Invalid room code'); return }
    navigate(`/room/${code}`)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top center, rgba(255,255,255,1) 0%, rgba(255,255,255,0.9) 35%, #93cad1 70%, #777f9b 100%)',
      color: 'white',
      fontFamily: 'Inter, sans-serif',
      overflow: 'hidden',
    }}>

      {/* NAVBAR */}
      <div style={{
        padding: '22px 60px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(2,6,23,0.7)',
      }}>
        <div style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-1px' }}>
          ⚡ Collab Editor
        </div>
        <div style={{
          padding: '8px 16px', borderRadius: '999px',
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.4)',
          color: '#A5B4FC', fontSize: '13px', fontWeight: '600',
        }}>
          Free and No Signup Needed
        </div>
      </div>

      {/* HERO */}
      <div style={{ padding: '100px 20px 80px', textAlign: 'center', position: 'relative' }}>

        <div style={{
          width: '300px', height: '300px', background: '#4e46e5',
          position: 'absolute', borderRadius: '50%', filter: 'blur(140px)',
          top: '-80px', left: '-100px', opacity: 0.25,
        }} />

        <div style={{
          width: '300px', height: '300px', background: '#06B6D4',
          position: 'absolute', borderRadius: '50%', filter: 'blur(140px)',
          bottom: '-100px', right: '-100px', opacity: 0.2,
        }} />

        <h1 style={{
          fontSize: '72px', fontWeight: '900', lineHeight: 1,
          maxWidth: '950px', margin: '0 auto', letterSpacing: '-3px',
          background: 'linear-gradient(90deg, #072464, #2c687a, #4daab1)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>
          Code Together Like You are On The Same Screen
        </h1>

        <p style={{
          color: '#0000009a', fontSize: '20px',
          maxWidth: '720px', margin: '28px auto 42px', lineHeight: 1.7,
        }}>
          Create instant coding rooms, collaborate live with teammates,
          run code together, and build projects faster — all inside your browser.
        </p>

        {/* BUTTONS */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button
            onClick={createRoom}
            style={{
              padding: '16px 34px', border: 'none', borderRadius: '14px',
              background: 'linear-gradient(135deg, #74f163 10%, #8B5CF6 100%)',
              color: 'white', fontSize: '17px', fontWeight: '700', cursor: 'pointer',
            }}
          >
            Create New Room
          </button>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <input
              type="text" placeholder="ABC123" maxLength={6} value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              style={{
                width: '180px', padding: '16px', borderRadius: '14px',
                background: 'rgba(7,4,4,0.87)',
                border: error ? '1px solid #EF4444' : '1px solid rgba(255,255,255,0.08)',
                outline: 'none', color: 'white', fontSize: '16px',
                textAlign: 'center', letterSpacing: '4px', fontWeight: '700',
              }}
            />
            <button
              onClick={joinRoom}
              style={{
                padding: '16px 28px', borderRadius: '14px',
                border: '1px solid rgb(156,192,145)',
                background: 'rgba(43,143,56,0.62)',
                color: 'white', fontSize: '16px', fontWeight: '700', cursor: 'pointer',
              }}
            >
              Join →
            </button>
          </div>
        </div>

        {error && <p style={{ color: '#F87171', marginTop: '10px', fontSize: '14px' }}>⚠ {error}</p>}

        {/* TRUST */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '26px', flexWrap: 'wrap', marginTop: '40px', fontSize: '14px' }}>
          <span style={{ color: '#9e7e16' }}>✓ No signup needed</span>
          <span style={{ color: '#16249ea9' }}>✓ Instant room creation</span>
          <span style={{ color: '#319e16c5' }}>✓ Real-time sync</span>
          <span style={{ color: '#9e1616bb' }}>✓ Free forever</span>
        </div>

        {/* EDITOR PREVIEW */}
        <div style={{
          maxWidth: '950px', margin: '90px auto 0', borderRadius: '26px',
          overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(16px)',
          boxShadow: '0 0 80px rgba(99,102,241,0.15)', textAlign: 'left',
        }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)',
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#EF4444' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#F59E0B' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22C55E' }} />
            </div>
            <div style={{ color: '#94A3B8', fontSize: '14px' }}>room / realtime-editor.js</div>
            <div style={{ color: '#22C55E', fontSize: '13px', fontWeight: '700' }}>● 3 users online</div>
          </div>
          <div style={{ padding: '34px', fontFamily: 'monospace', fontSize: '15px', lineHeight: 2, color: '#E2E8F0' }}>
            <div><span style={{ color: '#8B5CF6' }}>const</span> room = createCollabRoom()</div>
            <div><span style={{ color: '#06B6D4' }}>socket</span>.on(<span style={{ color: '#22C55E' }}>'code-change'</span>)</div>
            <div style={{ marginTop: '18px' }}>👤 Alex is typing...</div>
            <div style={{ color: '#64748B' }}>// Changes sync instantly across all users</div>
            <div style={{ marginTop: '18px', color: '#FACC15' }}>💬 Sarah: "Push the API update"</div>
            <div style={{
              marginTop: '24px', display: 'inline-block', padding: '8px 14px',
              borderRadius: '10px', background: 'rgba(34,197,94,0.15)',
              color: '#4ADE80', fontSize: '13px', fontWeight: '700',
            }}>
              ✓ Live synced successfully
            </div>
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <div style={{ padding: '100px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '70px' }}>
          <h2 style={{
            fontSize: '48px', marginBottom: '18px', fontWeight: '900', letterSpacing: '-2px',
            background: 'linear-gradient(90deg, #072464, #2c687a, #4daab1)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
            Built For Real Collaboration
          </h2>
          <p style={{ color: '#5984c0', fontSize: '18px' }}>
            Everything you need for collaborative coding sessions
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '24px' }}>
          {[
            { icon: '⚡', title: 'Instant Sync', desc: 'Every keystroke updates live for everyone in the room.' },
            { icon: '▶️', title: 'Run Code', desc: 'Execute JavaScript, Python, Java and C++ instantly.' },
            { icon: '👥', title: 'Multiplayer Editing', desc: 'See teammates typing in real time with live cursors.' },
            { icon: '💬', title: 'Built-in Chat', desc: 'Communicate with your team without leaving the editor.' },
            { icon: '📂', title: 'Multi File Support', desc: 'Organize projects with multiple synced files.' },
            { icon: '🌩️', title: 'Cloud Ready', desc: 'Open rooms instantly from anywhere in the world.' },
          ].map((f) => (
            <div key={f.title} style={{
              padding: '34px', borderRadius: '24px',
              background: 'rgb(255,255,255)',
              boxShadow: '0 0px 40px rgb(255,255,255)',
              border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(14px)',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '18px' }}>{f.icon}</div>
              <h3 style={{ fontSize: '22px', color: 'black', marginBottom: '12px' }}>{f.title}</h3>
              <p style={{ color: '#6b91c5', lineHeight: 1.7, fontSize: '15px' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FINAL CTA */}
      <div style={{ padding: '120px 20px', textAlign: 'center' }}>
        <h2 style={{
          fontSize: '48px', marginBottom: '18px', fontWeight: '900', letterSpacing: '-2px',
          background: 'linear-gradient(90deg, #072464, #2c687a, #4daab1)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>
          Ready to Code Together?
        </h2>
        <p style={{ color: '#000000a9', marginTop: '24px', fontSize: '20px' }}>
          No login. No setup. Just share a room code.
        </p>
        <button
          onClick={createRoom}
          style={{
            marginTop: '32px', padding: '16px 34px', border: 'none', borderRadius: '14px',
            background: 'linear-gradient(135deg, #74f163 0%, #2d1564 100%)',
            color: 'white', fontSize: '17px', fontWeight: '700', cursor: 'pointer',
            boxShadow: '0 0 40px rgba(218,224,218,0.73)',
          }}
        >
          Create Room Now
        </button>
      </div>

      {/* FOOTER */}
      <div style={{ background: '#0d1117', borderTop: '1px solid #1f2937', padding: '48px 48px 24px', color: '#6B7280' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '40px', marginBottom: '40px' }}>

            {/* Brand */}
            <div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'white', marginBottom: '12px' }}>
                ⚡ Collab Editor
              </div>
              <p style={{ fontSize: '14px', lineHeight: 1.8, margin: '0 0 20px' }}>
                A free real-time collaborative code editor. No signup. No install. Just code together.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <a href="https://github.com/user1-prajwal" target="_blank" rel="noreferrer" style={{ width: '36px', height: '36px', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                  <img src="https://cdn.simpleicons.org/github/9CA3AF" width="18" height="18" alt="GitHub" />
                </a>
                <a href="https://www.linkedin.com/in/user1-prajwal451/" target="_blank" rel="noreferrer" style={{ width: '36px', height: '36px', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                  <svg role="img" viewBox="0 0 24 24" width="18" height="18" fill="#9CA3AF" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />
                  </svg>
                </a>
                <a href="https://www.instagram.com/prajwal_poojari01?igsh=eW1jbmluenlnbDhi" target="_blank" rel="noreferrer" style={{ width: '36px', height: '36px', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                  <img src="https://cdn.simpleicons.org/instagram/9CA3AF" width="18" height="18" alt="Instagram" />
                </a>
              </div>
            </div>

            {/* Features */}
            <div>
              <h4 style={{ color: 'white', fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px' }}>Features</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
                <span>Real-time Collaboration</span>
                <span>Live Cursors</span>
                <span>Built-in Chat</span>
                <span>File Tree</span>
                <span>Code Execution</span>
                <span>Import and Export</span>
              </div>
            </div>

            {/* Languages */}
            <div>
              <h4 style={{ color: 'white', fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px' }}>Languages</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
                <span>JavaScript</span>
                <span>Python</span>
                <span>Java</span>
                <span>C++</span>
                <span>TypeScript</span>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 style={{ color: 'white', fontSize: '15px', fontWeight: 'bold', margin: '0 0 16px' }}>Quick Links</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
                <button onClick={createRoom} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: '14px', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Create Room
                </button>
                <a href="https://github.com/user1-prajwal/collab-editor" target="_blank" rel="noreferrer" style={{ color: '#6B7280', textDecoration: 'none' }}>Star on GitHub ⭐</a>
                <a href="https://github.com/user1-prajwal/collab-editor/issues" target="_blank" rel="noreferrer" style={{ color: '#6B7280', textDecoration: 'none' }}>Report a Bug</a>
              </div>
            </div>

          </div>

          <div style={{ borderTop: '1px solid #1f2937', paddingTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <span style={{ fontSize: '13px' }}>© 2025 ⚡ Collab Editor · Free forever · No data stored</span>
            <a href="https://github.com/user1-prajwal/collab-editor" target="_blank" rel="noreferrer" style={{ color: '#4B5563', fontSize: '13px', textDecoration: 'none' }}>
              MIT License · GitHub
            </a>
          </div>
        </div>
      </div>

    </div>
  )
}

export default Landing