#  Syncra — Real-Time Collaborative Code Editor

Code together, in real time. Share a 6-character room code — no signup, no install required.

🌐 **Live Demo:** [syncra-collab.vercel.app](https://syncra-collab.vercel.app/)

---

## Overview

Syncra is a browser-based collaborative code editor. Multiple users join the same room using a 6-character code and write code together. Edits sync live across all screens, with live cursors showing exactly where each person is working. Everyone can run the code and chat in the same window. No account and no installation needed.

---

## Features

###  Real-Time Code Sync
Edits sync live over persistent WebSocket connections using **Yjs, a CRDT**, so people typing at the same moment never overwrite each other and every client converges to the same text. Room-based isolation: only people in your room receive its messages. Measured propagation latency is in [Benchmarks](#benchmarks).

### 🖱️ Live Colored Cursors
Each user gets a unique color and name label above their cursor position in the editor. Cursors auto-hide after 3.5 seconds of inactivity using a sender-side idle timer.

### 💬 Built-in Chat
A floating chat panel sits alongside the editor. Messages show sender name, color, and timestamp. Auto-scrolls to latest message.

### 📁 VS Code-Style File Tree
A VS Code-inspired Activity Bar on the left — click the file icon to open the explorer, click the users icon to see who is online. Create multiple files per room, language auto-detected from file extension. All files sync in real time.

### ▶ Code Execution — 12 Languages
Run code through an execution provider (see [Running code and its cost](#running-code-and-its-cost)). Supported languages:

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
| Yjs | CRDT: conflict-free shared text (one document per file) |
| JSZip | ZIP export |

### Backend
| Technology | Purpose |
|---|---|
| Node.js + Express | HTTP server and REST API |
| ws | WebSocket server |
| Yjs | Server-side copy of each file's document |
| express-rate-limit | Rate limiting for `POST /run` |
| onlinecompiler.io / Piston | Code execution (pluggable providers: hosted API, or your own Piston server) |
| Jest | Unit and integration tests |

### Testing and CI
| Technology | Purpose |
|---|---|
| Jest | Backend unit and integration tests |
| Puppeteer | Real-browser end-to-end tests |
| GitHub Actions | Runs all tests on every push |

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
│       ├── constants.js         ← Config (backend URL, colors, per-tab ids)
│       ├── collab/
│       │   └── yjsSync.js       ← Yjs documents + Monaco binding
│       ├── pages/
│       │   ├── landing.jsx      ← Landing page
│       │   └── EditorPage.jsx   ← Editor + connection logic
│       └── components/
│           ├── ActivityBar.jsx  ← VS Code-style icon sidebar
│           ├── SidePanel.jsx    ← File explorer + users panel
│           └── ChatPanel.jsx    ← Chat popup
│
├── collab-backend/
│   ├── server.js                ← Entry point (config, graceful shutdown)
│   ├── app.js                   ← Express + WebSocket server factory
│   ├── validate.js              ← Whitelist validation of every client message
│   ├── roomStore.js             ← Per-room users, files, limits, empty-room cleanup
│   ├── tokenBucket.js           ← Per-connection rate limiter
│   ├── executor.js              ← Code execution: providers, fallback, limits
│   ├── test/                    ← Jest unit + integration tests
│   ├── bench/latency.js         ← Load / latency benchmark
│   └── scripts/check-execution.js ← Tries each language on each provider
│
├── e2e/                         ← Real-browser tests (Puppeteer)
└── .github/workflows/ci.yml     ← CI: runs all tests on every push
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
                                 └── Execution provider
                                       (onlinecompiler.io, or your own Piston)
```

### Sync flow:
```
User types
  → the edit is applied to that file's Yjs document (one Y.Text per file)
  → Yjs emits a small binary update (~30 bytes for a keystroke)
  → WebSocket sends { type: 'yupdate', fileId, update (base64) }
  → Backend validates it, applies it to its own copy of the document, relays it to the others
  → Each client applies the update to its Yjs document; the Monaco binding turns it into a minimal edit
```

---

## Key Technical Decisions

### 1. A CRDT (Yjs) instead of last-write-wins
The first version sent the whole file on every keystroke and the last message won. Two people typing in the same place lost characters and the tabs ended up with different text (reproduced by the browser test in `e2e/tests/concurrent.test.mjs`). Each file is now a Yjs document: concurrent edits merge deterministically on every client, so all of them end with the same text and nobody's typing is lost. Edits are tiny updates (about 30 bytes per keystroke) instead of the whole file.

### 2. A small custom Monaco binding
`y-monaco` imports the whole `monaco-editor` package, which clashes with the CDN-loaded Monaco used here, so `src/collab/yjsSync.js` binds a `Y.Text` to Monaco directly: local edits become Yjs transactions, and remote changes are applied as minimal edits one operation at a time, so a user's cursor and scroll never jump. Remote changes carry a flag so they are never re-sent or broadcast as cursor movement. Undo/redo uses `Y.UndoManager`, so Ctrl+Z only undoes your own edits.

### 3. Late joiners, reconnects and offline edits
The server keeps one Yjs document per file and sends every connecting client the full state. On reconnect the browser merges that state into its documents instead of replacing them, and once the server has accepted its join, uploads whatever the server lacks, so edits made while offline are merged, not lost. The upload waits for the join to be confirmed so a refused re-join cannot strand them.

### 4. Surviving a server restart
Rooms live in memory, so a restart wipes them. The default file is created with a fixed Yjs client id, so every server produces byte-identical history for it and it merges without duplicating text. Each room has a random `epoch`; a client that sees the epoch change knows the server lost its state and re-uploads the files it holds. The browser test restarts the server and checks that no text is lost and the default file is not duplicated.

### 5. Duplicate username prevention
Before accepting a join, the backend checks all existing names in the room. If taken, a `name-taken` message is sent back and the user is prompted to choose another. A per-tab `clientId` lets a reconnecting tab reclaim its own name while a different user with the same name is still refused.

### 6. Cursor idle detection
Remote cursors auto-hide after 3.5s using a sender-side idle timer that emits `cursor-stop`, with a receiver-side safety timeout as backup.

---

## Reliability and Security

- **Every client message is validated** against a whitelist (type, field types, sizes) and re-serialized before it is stored or relayed. Malformed JSON, unknown types and oversized payloads are rejected without affecting other users. Clients cannot spoof server-only message types or other users' names.
- **Limits:** 2 MiB per WebSocket frame, 700,000 base64 characters per Yjs update, 200,000 characters per file (enforced on the server by trimming the excess and sending everyone the combined update), 50 files and 50 clients per room, a per-connection token-bucket rate limit (60 msgs/s sustained, burst 120), and 10 `POST /run` requests per IP per minute.
- **Late joiners and reconnects** receive the room's authoritative workspace, including deleted files and language changes. The browser reconnects with exponential backoff and re-joins; a per-tab `clientId` lets a returning tab reclaim its own name while another user with the same name is still rejected. A malformed Yjs update is rejected without touching the document, and a refused file creation is followed by a snapshot so the creator's file list cannot drift from the server's.
- **Housekeeping:** heartbeat pings drop dead connections, and empty rooms are removed 10 minutes after the last user leaves.
- **CORS and WebSocket origins** are restricted to `ALLOWED_ORIGINS` when set.

## Running code and its cost

Running user code is the one feature that costs money per use, and Syncra does not run that code itself. So it is isolated behind a small provider interface in `collab-backend/executor.js`:

- **Providers.** `onlinecompiler.io` (hosted, free quota) and **Piston** (open source). Set `PISTON_URL` to your own Piston server and it is tried first; `ONLINECOMPILER_API_KEY` enables the hosted one. `EXEC_PROVIDERS` sets the order. The public Piston API has been whitelist-only since 2026-02-15, so Piston here means a server you run.
- **Fallback and circuit breaker.** If a provider fails (network, timeout, quota, auth, 5xx), the next one is tried. After 3 failures in a row a provider is skipped for 30 seconds, so a dead service costs nothing per request. A mistake in the user's own program (syntax error, crash) is a normal result, never a failure.
- **Back-pressure.** At most 4 runs execute at once, 20 may wait, and the rest get a friendly "busy" message. A daily budget (`EXEC_DAILY_LIMIT`) protects a free quota; when it is used up, users are told so, instead of the service silently failing.
- **Per-user limits.** 10 runs per IP per minute, 200,000 characters per run, 30 second timeout, output capped at 100,000 characters.

What this does and does not give you: it keeps the app working and the bill predictable, and it lets you move execution to your own server without touching the rest of the code. It does not make execution free or unlimited. Nothing is. Self-hosting Piston removes per-run fees and the quota, but you pay for a server: Piston needs a host where Docker can run a privileged container, which free hosting tiers do not offer.

To try your own Piston (needs Docker on a machine you control):

```bash
docker run --privileged -v $PWD/piston:/piston -p 2000:2000 -d ghcr.io/engineer-man/piston
# install the runtimes you want (Piston's CLI): python, gcc, java, typescript, ... see https://github.com/engineer-man/piston
# then, in collab-backend/.env:  PISTON_URL=http://localhost:2000
npm run check:exec     # runs "hello" in each of the 12 languages and shows which ones work
```

## Testing

```bash
# backend: unit + integration tests (real WebSocket clients against a real server)
cd collab-backend && npm install && npm test

# browser end-to-end tests (real Chromium: several tabs editing together through the real server)
cd e2e && npm install && npm test
```

**Backend (Jest, 125 tests):** message validation, the rate limiter, room store, and integration tests for broadcast and room isolation, late-join state, duplicate names, reconnect and offline-merge, malformed and oversized input, rate limiting, origin checks `POST /run`, and the code-execution layer (provider fallback, circuit breaker, queue and daily budget, tested against real local HTTP servers). Includes concurrent-edit convergence tests and a seeded fuzz test (4 clients, 200 random inserts and deletes, all replicas and the server must agree).

**Browser (10 tests):** typing syncs between tabs, simultaneous typing by two and three users in the same spot converges without losing a character, a deleted file stays deleted for late joiners, tabs reconnect after the server drops them, edits made while offline merge on reconnect, clients repopulate a restarted server, and undo only undoes your own edits. The tests build the frontend, run the backend in-process and drive Chromium with Puppeteer.

Both run in GitHub Actions on every push (`.github/workflows/ci.yml`).

## Benchmarks

`npm run bench` (in `collab-backend`) starts the server in a separate process and drives it with simulated clients that are real Yjs replicas. A typist inserts one character at a random position per edit (or pastes a block) at 10 edits/s, 100 edits each. Latency is send-to-receive time, measured after the receiver has applied the update to its own document, on one monotonic clock, so it is free of clock skew. After each run every replica of every file is compared; `Diverged` must be 0. Run on an Intel Core i5-8265U laptop (Windows, Node 22.19.0); server and clients share that machine and talk over **loopback**, so this measures the server's relay overhead and **not** real network latency. For a deployed server run `TARGET=https://your-backend npm run bench -- --quick` from your machine.

| Scenario | Clients | Typists | Edit | Deliveries/s | Loss | Diverged | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|---|---|---|
| baseline: 1 room, 2 users | 2 | 1 | 1 char | 10 | 0% | 0 | 2.44 | 3.36 | 5.37 |
| 10 rooms x 5 users, 1 typist/room | 50 | 10 | 1 char | 396 | 0% | 0 | 2.81 | 5.32 | 6.75 |
| 10 rooms x 5 users, ALL typing | 50 | 50 | 1 char | 1,980 | 0% | 0 | 5.54 | 14.09 | 19.2 |
| 20 rooms x 10 users, 1 typist/room | 200 | 20 | 1 char | 1,782 | 0% | 0 | 5.5 | 15.51 | 20.12 |
| 1 room, 20 users, 1 typist | 20 | 1 | 1 char | 189 | 0% | 0 | 3.46 | 6.3 | 8.53 |
| 10 rooms x 5 users, 100 KB file | 50 | 10 | 1 char | 396 | 0% | 0 | 2.39 | 4.83 | 6.5 |
| 10 rooms x 5 users, 1 KB pastes | 50 | 10 | paste 1 KB | 396 | 0% | 0 | 2.58 | 4.64 | 6.55 |

Late join of a 21-file workspace (10 KB per file): p50 19 ms, p95 33.37 ms, including connecting, downloading the 474 KB snapshot and building every document (median of 30 joins).

## Known Limitations

- **Rooms live in server memory.** A restart loses the server's copy; connected clients repopulate it (see decision 4), but a room nobody has open is gone. There is no database.
- **Remote cursors are positioned by line and column,** not by Yjs relative positions, so a colored cursor label can be a character off for a moment during heavy concurrent typing. Text itself always converges.
- **File names and languages are last-write-wins.** Only file text is a CRDT. A file created while offline is not synced.
- **No authentication.** Anyone with the room code can join. The room code is the only access control.
- **Code execution is not run by this project.** A provider does it (onlinecompiler.io by default, or a Piston server you host). Quotas, speed and isolation are the provider's. See [Running code and its cost](#running-code-and-its-cost). JavaScript files run in the browser.
- Chat history is not stored.

## Run Locally

### Prerequisites
- Node.js 18+
- Git

### Setup

```bash
git clone https://github.com/user1-prajwal/syncra.git
cd syncra
```

**Backend:**
```bash
cd collab-backend
npm install
cp .env.example .env     # then put your ONLINECOMPILER_API_KEY in .env
npm run dev              # loads .env (needs Node 20.6+). Plain `node server.js` does NOT load .env
```

**Frontend:**
```bash
cd collab-editor-frontend
npm install
# create collab-editor-frontend/.env.local containing:  VITE_BACKEND_URL=http://localhost:4000
npm run dev
```

Open `http://localhost:5173`

### Environment Variables

`collab-backend/.env` (see `.env.example` for every option)
```
PORT=4000
ONLINECOMPILER_API_KEY=your_key_here
ALLOWED_ORIGINS=https://syncra-collab.vercel.app,http://localhost:5173
```

- `ONLINECOMPILER_API_KEY`: free key from [onlinecompiler.io](https://onlinecompiler.io).
- `ALLOWED_ORIGINS`: which websites may call the API and open WebSockets. Leave it empty locally; set it in production.
- Optional code-execution settings (`PISTON_URL`, `EXEC_PROVIDERS`, `EXEC_DAILY_LIMIT`, `EXEC_MAX_CONCURRENT`, `EXEC_MAX_QUEUE`) are explained in [Running code and its cost](#running-code-and-its-cost).

`collab-editor-frontend/.env.local` (local development only)
```
VITE_BACKEND_URL=http://localhost:4000
```

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

Built by [Prajwal Poojari](https://github.com/user1-prajwal) · [LinkedIn](https://www.linkedin.com/in/user1-prajwal451/) · [Report a Bug](https://github.com/user1-prajwal/syncra/issues)
