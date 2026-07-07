#  Syncra — Real-Time Collaborative Code Editor

Code together, in real time. Share a 6-character room code — no signup, no install required.

🌐 **Live Demo:** [syncra-collab.vercel.app](https://syncra-collab.vercel.app/)

---

## Overview

Syncra is a browser-based collaborative code editor. Multiple users join the same room using a 6-character code and write code together — every keystroke syncs instantly across all screens, with live cursors showing exactly where each person is working.

---

## Features

###  Real-Time Code Sync
Every keystroke syncs instantly across all users in the same room. Built on persistent WebSocket connections for under 50ms latency. Room-based isolation — only people with your room code can join.

### 🖱️ Live Colored Cursors
Each user gets a unique color and name label above their cursor position in the editor. Cursors auto-hide after 3.5 seconds of inactivity using a sender-side idle timer.

### 💬 Built-in Chat
A floating chat panel sits alongside the editor. Messages show sender name, color, and timestamp. Auto-scrolls to latest message.

### 📁 VS Code-Style File Tree
A VS Code-inspired Activity Bar on the left — click the file icon to open the explorer, click the users icon to see who is online. Create multiple files per room, language auto-detected from file extension. All files sync in real time.

### ▶ Code Execution — 12 Languages
Run code via a sandboxed execution API. Supported languages:

| | | | |
|---|---|---|---|
| Python | C | C++ | Java |
| TypeScript | C# | F# | PHP |
| Ruby | Haskell | Go | Rust |

### 📂 Import & Export
Upload files from your laptop directly into the editor. Download all files as a ZIP. Imported files sync to all users instantly.

### 🔐 Room System
Every room gets a unique 6-character code. Late joiners receive full file state immediately. Duplicate usernames are rejected within a room.

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + Vite | UI framework |
| Monaco Editor | VS Code editor engine |
| React Router v6 | Client-side routing |
| WebSocket API | Real-time communication |
| JSZip | ZIP export |

### Backend
| Technology | Purpose |
|---|---|
| Node.js + Express | HTTP server and REST API |
| ws | WebSocket server |
| onlinecompiler.io | Sandboxed code execution |

### Deployment
| Service | Purpose |
|---|---|
| Vercel | Frontend |
| Render | Backend |

---

## Project Structure

```
syncra/
├── collab-editor-frontend/
│   └── src/
│       ├── App.jsx              ← Router
│       ├── constants.js         ← Config (languages, colors, URLs)
│       ├── pages/
│       │   ├── Landing.jsx      ← Landing page
│       │   └── EditorPage.jsx   ← Editor + all logic
│       └── components/
│           ├── ActivityBar.jsx  ← VS Code-style icon sidebar
│           ├── SidePanel.jsx    ← File explorer + users panel
│           └── ChatPanel.jsx    ← Chat popup
│
└── collab-backend/
    ├── server.js                ← WebSocket server + room management
    └── executor.js              ← Code execution via API
```

---

## Architecture

```
Browser (React)
  │
  ├── WebSocket (wss://) ──► Node.js Backend
  │                              │
  │                              ├── Room Manager (Map + Set)
  │                              ├── File State (per room)
  │                              └── User List (per room)
  │
  └── HTTP POST /run ──────► Node.js Backend
                                 │
                                 └── onlinecompiler.io API
                                       (isolated sandboxes)
```

### Sync flow:
```
User types
  → WebSocket sends { type: 'code', code, fileId }
  → Backend saves to room memory
  → Backend broadcasts to all others in room
  → Monaco model updated via minimal diff (not full replace)
  → Changes appear in under 50ms
```

---

## Key Technical Decisions

### 1. Minimal diff model updates
Instead of replacing the entire Monaco document on each remote change (which resets cursor position), a common-prefix/suffix diff is applied — only the changed range is replaced. This keeps every user's cursor stable when someone else edits elsewhere.

### 2. Preventing infinite sync loops
When remote code arrives, Monaco's `onChange` would fire and resend the code — creating an infinite loop. Solved with an `isRemoteChange` ref set synchronously around every remote model update.

### 3. Late user synchronization
When a new user connects, the backend immediately sends the full file state (`init`) and current user list — so late joiners see everything without anyone resending.

### 4. Duplicate username prevention
Before accepting a join, the backend checks all existing names in the room. If taken, a `name-taken` message is sent back and the user is prompted to choose a different name.

### 5. Cursor idle detection
Remote cursors auto-hide after 3.5s using a sender-side idle timer that emits `cursor-stop`, with a receiver-side safety timeout as backup.

---

## Run Locally

### Prerequisites
- Node.js 18+
- Git

### Setup

```bash
git clone https://github.com/user1-prajwal/collab-editor.git
cd collab-editor
```

**Backend:**
```bash
cd collab-backend
npm install
# Create .env file:
# ONLINECOMPILER_API_KEY=your_key_here
node server.js
```

**Frontend:**
```bash
cd collab-editor-frontend
npm install
npm run dev
```

Open `http://localhost:5173`

### Environment Variables

`collab-backend/.env`
```
ONLINECOMPILER_API_KEY=your_key_here
PORT=4000
```

Get a free API key at [onlinecompiler.io](https://onlinecompiler.io)

---

## Planned

- [ ] AI code analysis (Gemini API)
- [ ] Teacher/Student mode — read-only access for viewers
- [ ] Session playback
- [ ] Persistent rooms (database)
- [ ] WebRTC voice chat

---

## License

MIT — see [LICENSE](LICENSE)

---

## About

Built by [Prajwal Poojari](https://github.com/user1-prajwal) · [LinkedIn](https://www.linkedin.com/in/user1-prajwal451/) · [Report a Bug](https://github.com/user1-prajwal/collab-editor/issues)
