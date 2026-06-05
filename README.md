# ⚡ Collab Editor — Real-Time Collaborative Code Editor

> Code together, in real time. No signup. No install. Just share a room code and start collaborating.

🌐 **Live Demo:** [collab-editor-blond.vercel.app](https://collab-editor-blond.vercel.app)

---

## What is Collab Editor?

Collab Editor is a real-time collaborative code editor built from scratch. Multiple users can join the same room and write code together — with every keystroke syncing instantly across all screens. Think of it as a shared coding environment where your whole team can see, edit, and run code at the same time.

Built entirely by a 6th semester CSE student as a passion project to solve a real problem: **there is no simple, free, no-signup tool for coding together online.**

---

## Features

### 👥 Real-Time Collaboration
- Every keystroke syncs **instantly** across all users in the same room
- No delay, no refresh needed — changes appear as you type
- Built using **WebSockets** for persistent, low-latency communication
- Room-based isolation — only people with your room code can join

### 🖱️ Live Cursors
- See **exactly where** every teammate is typing
- Each user gets a unique color and name label
- Cursor positions broadcast in real time using WebSocket messages

### 💬 Built-in Chat
- WhatsApp-style floating chat panel
- Send messages without leaving the editor
- Messages show sender name, color, and timestamp
- Auto-scrolls to latest message

### 📁 File Tree
- Create **multiple files** per room — just like VS Code
- Supports `.js`, `.py`, `.java`, `.cpp`, `.ts`, `.html`, `.css`, `.json`
- Language auto-detected from file extension
- Switch between files — all synced in real time across users

### 📂 Import & Export
- **Import** any file from your laptop directly into the editor
- **Export** all files as a single ZIP download
- Imported files sync instantly to all users in the room

### ▶ Code Execution
- Run **JavaScript, Python, Java, C++** right in the browser
- Secure Docker-sandboxed execution environment
- Output panel shows results instantly
- Memory and CPU limits per execution for safety

### 🔐 Room System
- Every room gets a unique **6-character code**
- Share the code — teammates join instantly
- Late joiners automatically receive all existing code and files
- Users panel shows everyone currently in the room

### 🌐 Language Support
- JavaScript, Python, Java, C++, TypeScript
- Syntax highlighting powered by **Monaco Editor** (same engine as VS Code)
- Language change notification — see when teammates switch languages

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React (Vite) | UI framework |
| Monaco Editor | VS Code-grade code editor in browser |
| React Router | Client-side routing |
| WebSocket API | Real-time communication |
| JSZip | Export files as ZIP |

### Backend
| Technology | Purpose |
|---|---|
| Node.js | Server runtime |
| Express | HTTP server + API routes |
| WebSocket (ws) | Real-time bidirectional communication |
| Docker | Sandboxed code execution |

### Deployment
| Service | Purpose |
|---|---|
| Vercel | Frontend hosting |
| Render | Backend hosting |
| GitHub | Version control |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (React)                  │
│  Monaco Editor + File Tree + Chat + Users Panel     │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket (wss://)
                       │ HTTP (https://)
┌──────────────────────▼──────────────────────────────┐
│              Node.js + Express Backend              │
│  Room Management + WebSocket Server + Code Executor │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Docker Containers                      │
│  node:18 | python:3.11 | openjdk:17 | gcc:latest    │
└─────────────────────────────────────────────────────┘
```

### How real-time sync works:
```
User A types code
    ↓
Frontend sends WebSocket message
    { type: 'code', code: '...', fileId: '...' }
    ↓
Backend receives → saves to room memory
    ↓
Backend broadcasts to all other users in room
    ↓
User B and C see the change instantly
```

---

## Run Locally

### Prerequisites
- Node.js 18+
- Docker Desktop
- Git

### Clone the repo
```bash
git clone https://github.com/YOURUSERNAME/collab-editor.git
cd collab-editor
```

### Start the backend
```bash
cd collab-backend
npm install
node server.js
```

### Start the frontend
```bash
cd collab-editor-frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser!

---

## How to Use

1. Open the app and click **"Create New Room"**
2. A unique 6-letter room code is generated
3. Share the code with your teammates
4. They go to the app, enter the code, and click **"Join Room"**
5. Everyone enters their name and starts coding together!

---

## Planned Features

- [ ] TypeScript execution support
- [ ] Teacher/Student mode (admin controls editor, others view only)
- [ ] Session playback — replay how code was written
- [ ] Persistent rooms with database storage
- [ ] Voice/video chat integration
- [ ] GitHub integration — push code directly to a repo

---

## Key Technical Challenges Solved

### 1. Preventing infinite sync loops
When User B receives code from the server and the editor updates, Monaco's `onChange` fires again — which would send the code back to the server, creating an infinite loop. Solved using an `isRemoteChange` ref flag that skips sending when the update came from the server.

### 2. Late user synchronization
When a new user joins a room where others are already coding, they need to see all existing code and files immediately. Solved by making the backend store the complete file state per room and sending it as an `init` message to every new connection.

### 3. Multi-file real-time sync
Each file has its own ID. Code changes are tagged with `fileId` so the backend and all clients know which file to update — allowing multiple files to sync independently in real time.

### 4. WebSocket Blob handling
WebSocket messages sometimes arrive as binary Blob instead of plain text. Solved using `async/await` to convert Blob to text before JSON parsing.

---
