import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function injectGlobal() {
  if (document.getElementById("s-css")) return;
  const el = document.createElement("style");
  el.id = "s-css";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: #0a0a0a;
      font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #ededed;
      overflow-x: hidden;
    }
    ::selection { background: rgba(255,255,255,0.15); }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #0a0a0a; }
    ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
    a { text-decoration: none; color: inherit; }
    @keyframes blink { 0%,49%{opacity:1}50%,100%{opacity:0} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn { from{opacity:0}to{opacity:1} }
    @keyframes marquee { from{transform:translateX(0)}to{transform:translateX(-50%)} }
    @keyframes ping { 0%{transform:scale(1);opacity:1}75%,100%{transform:scale(2);opacity:0} }
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important}
    }
    @media(max-width:860px){
      .nav-links { display: none !important; }
      .hero-grid { grid-template-columns: 1fr !important; }
      .editor-panel { display: none !important; }
      .hero-left { max-width: 100% !important; }
      .feat-grid { grid-template-columns: 1fr 1fr !important; }
      .mob-stack { flex-direction: column !important; }
    }
    @media(max-width:540px){
      .feat-grid { grid-template-columns: 1fr !important; }
      .footer-grid { grid-template-columns: 1fr 1fr !important; }
    }
  `;
  document.head.appendChild(el);
}

// ─── Minimal icon set 
const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14m-7-7 7 7-7 7" />
  </svg>
);
const Github = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.4 7.86 10.94.57.1.79-.25.79-.55v-2.1c-3.2.7-3.87-1.36-3.87-1.36-.53-1.32-1.29-1.67-1.29-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.53-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.09 0 4.43-2.69 5.41-5.25 5.69.42.36.78 1.07.78 2.16v3.2c0 .31.21.65.8.55A10.99 10.99 0 0 0 23.5 12C23.5 5.74 18.27.5 12 .5z" />
  </svg>
);

// ─── The live editor demo — this is the actual product ─────
const DEMO_PEERS = [
  { name: "you",   color: "#3b82f6", initials: "Y" },
  { name: "priya", color: "#f97316", initials: "P" },
  { name: "kai",   color: "#a855f7", initials: "K" },
];

const CODE_FRAMES = [
  // Frame 0 — starting state
  [
    { text: "def",      color: "#c792ea" },
    { text: " fibonacci",color: "#82aaff" },
    { text: "(n):",     color: "#d4d4d4" },
  ],
  [
    { text: "    if",   color: "#c792ea" },
    { text: " n <= ",   color: "#d4d4d4" },
    { text: "1",        color: "#f78c6c" },
    { text: ":",        color: "#d4d4d4" },
  ],
  [
    { text: "        return ", color: "#c792ea" },
    { text: "n",        color: "#d4d4d4" },
  ],
  [
    { text: "    return ", color: "#c792ea" },
    { text: "fibonacci(",color: "#82aaff" },
    { text: "n",        color: "#d4d4d4" },
    { text: "-",        color: "#89ddff" },
    { text: "1",        color: "#f78c6c" },
    { text: ") + fibonacci(", color: "#82aaff" },
    { text: "n",        color: "#d4d4d4" },
    { text: "-",        color: "#89ddff" },
    { text: "2",        color: "#f78c6c" },
    { text: ")",        color: "#82aaff" },
  ],
  [],
  [
    { text: "# peter is writing tests...", color: "#546e7a" },
  ],
  [
    { text: "print",    color: "#82aaff" },
    { text: "(",        color: "#d4d4d4" },
    { text: "fibonacci(", color: "#82aaff" },
    { text: "10",       color: "#f78c6c" },
    { text: "))",       color: "#d4d4d4" },
  ],
];

function EditorDemo() {
  // Simulate "priya" cursor moving between lines periodically
  const [priyaLine, setPriyaLine] = useState(5);
  const [outputVisible, setOutputVisible] = useState(false);
  // const [runPulse, setRunPulse] = useState(false);
  const [, setRunPulse] = useState(false);


  useEffect(() => {
    // Priya moves between lines
    const iv = setInterval(() => {
      setPriyaLine(prev => {
        const lines = [4, 5, 6, 5];
        const idx = lines.indexOf(prev);
        return lines[(idx + 1) % lines.length];
      });
    }, 1800);
    return () => clearInterval(iv);
  }, []);

  // useEffect(() => {
  //   // Output flickers on/off
  //   const iv = setInterval(() => {
  //     setRunPulse(true);
  //     setTimeout(() => setRunPulse(false), 400);
  //     setTimeout(() => setOutputVisible(true), 600);
  //     setTimeout(() => setOutputVisible(false), 3000);
  //   }, 5000);
  //   setOutputVisible(true); // start visible
  //   return () => clearInterval(iv);
  // }, []);

  useEffect(() => {
  const timers = [];

  const iv = setInterval(() => {
    setRunPulse(true);

    timers.push(setTimeout(() => setRunPulse(false), 400));
    timers.push(setTimeout(() => setOutputVisible(true), 600));
    timers.push(setTimeout(() => setOutputVisible(false), 3000));
  }, 5000);

  return () => {
    clearInterval(iv);
    timers.forEach(clearTimeout);
  };
}, []);

  return (
    <div style={{
      background: "#111",
      border: "1px solid #222",
      borderRadius: 10,
      overflow: "hidden",
      fontFamily: "'Geist Mono', 'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: "22px",
      boxShadow: "0 32px 64px rgba(0,0,0,0.6)",
    }}>
      {/* Window chrome */}
      <div style={{
        background: "#161616",
        borderBottom: "1px solid #222",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff5f57","#febc2e","#28c840"].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <span style={{ color: "#444", fontSize: 11, flex: 1, textAlign: "center" }}>
          fibonacci.py
        </span>
        {/* Online peers */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {DEMO_PEERS.map(p => (
            <div key={p.name} title={p.name} style={{
              width: 20, height: 20, borderRadius: "50%",
              background: p.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700, color: "#fff",
              border: "1.5px solid #111",
            }}>
              {p.initials}
            </div>
          ))}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", marginLeft: 4, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e", animation: "ping 2s cubic-bezier(0,0,0.2,1) infinite" }} />
          </div>
          <span style={{ color: "#555", fontSize: 10, marginLeft: 2 }}>3 online</span>
        </div>
      </div>

      {/* Code area */}
      <div style={{ display: "flex", background: "#0f0f0f" }}>
        {/* Line numbers */}
        <div style={{ padding: "16px 0", minWidth: 44, textAlign: "right", paddingRight: 14, borderRight: "1px solid #1a1a1a", userSelect: "none" }}>
          {CODE_FRAMES.map((_, i) => (
            <div key={i} style={{ color: "#333", fontSize: 12, lineHeight: "22px" }}>{i + 1}</div>
          ))}
        </div>

        {/* Lines with cursors */}
        <div style={{ padding: "16px 0 16px 16px", flex: 1, overflow: "hidden" }}>
          {CODE_FRAMES.map((tokens, li) => (
            <div key={li} style={{ position: "relative", lineHeight: "22px", display: "flex", alignItems: "center" }}>
              {/* Priya's line highlight */}
              {li === priyaLine && (
                <div style={{
                  position: "absolute", left: -16, right: 0, top: 0, bottom: 0,
                  background: "rgba(249,115,22,0.05)",
                  borderLeft: "2px solid rgba(249,115,22,0.4)",
                }} />
              )}
              <span style={{ whiteSpace: "pre" }}>
                {tokens.map((tok, ti) => (
                  <span key={ti} style={{ color: tok.color }}>{tok.text}</span>
                ))}
                {/* Priya cursor */}
                {li === priyaLine && (
                  <span style={{
                    display: "inline-flex", flexDirection: "column", alignItems: "flex-start",
                    marginLeft: 1, verticalAlign: "middle",
                  }}>
                    <span style={{
                      display: "block",
                      background: DEMO_PEERS[1].color,
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "0 4px",
                      borderRadius: "3px 3px 3px 0",
                      lineHeight: "14px",
                      fontFamily: "'Geist', sans-serif",
                      whiteSpace: "nowrap",
                    }}>
                      peter
                    </span>
                    <span style={{
                      width: 2, height: 18,
                      background: DEMO_PEERS[1].color,
                      display: "block",
                      animation: "blink 1.1s steps(1) infinite",
                    }} />
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Output */}
      <div style={{
        borderTop: "1px solid #1a1a1a",
        background: "#0a0a0a",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 36,
      }}>
        <span style={{ color: "#333", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>output</span>
        <span style={{ color: outputVisible ? "#22c55e" : "#1f1f1f", fontSize: 13, transition: "color 0.4s", fontWeight: 500 }}>
          {outputVisible ? "55" : "—"}
        </span>
        {outputVisible && (
          <span style={{ color: "#3b82f6", fontSize: 11, marginLeft: "auto", animation: "fadeIn 0.3s ease" }}>
            synced to all 3 users
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Marquee strip 
function Marquee() {
  const langs = [
    "Python", "·", "Java", "·", "C++", "·", "TypeScript", "·",
    "Go", "·", "Rust", "·", "Ruby", "·", "Haskell", "·",
    "PHP", "·", "C#", "·", "F#", "·", "JavaScript", "·",
  ];
  const items = [...langs, ...langs];
  return (
    <div style={{
      borderTop: "1px solid #161616",
      borderBottom: "1px solid #161616",
      background: "#0a0a0a",
      overflow: "hidden",
      padding: "12px 0",
    }}>
      <div style={{
        display: "flex",
        gap: 24,
        width: "max-content",
        animation: "marquee 30s linear infinite",
      }}>
        {items.map((lang, i) => (
          <span key={i} style={{
            fontSize: 12,
            fontWeight: 500,
            color: lang === "·" ? "#2a2a2a" : "#444",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            fontFamily: lang === "·" ? undefined : "'Geist Mono', monospace",
          }}>
            {lang}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Navbar 
function Navbar({ onCreate }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const fn = () => setStuck(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      height: 56,
      borderBottom: stuck ? "1px solid #1a1a1a" : "1px solid transparent",
      background: stuck ? "rgba(10,10,10,0.92)" : "transparent",
      backdropFilter: stuck ? "blur(12px)" : "none",
      transition: "all 0.2s",
      display: "flex", alignItems: "center",
      padding: "0 32px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto" }}>
        <img src="/syncra-logo-dark.svg" alt="Syncra" style={{ height: 30 }} onError={e => { e.target.style.display='none'; }} />
        {/* <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.5px", color: "#ededed" }}>Syncra</span> */}
      </div>

      <nav className="nav-links" style={{ display: "flex", gap: 28, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
        {[["#features","Features"],["#how","How it works"],["#faq","FAQ"]].map(([href, label]) => (
          <a key={href} href={href} style={{
            color: "#666", fontSize: 14, fontWeight: 500,
            transition: "color 0.15s",
          }}
            onMouseEnter={e => e.target.style.color = "#ededed"}
            onMouseLeave={e => e.target.style.color = "#666"}
          >{label}</a>
        ))}
      </nav>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <a
          href="https://github.com/user1-prajwal/syncra"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px",
            background: "transparent",
            border: "1px solid #222",
            borderRadius: 7,
            color: "#888",
            fontSize: 13, fontWeight: 500,
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#ededed"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.color = "#888"; }}
        >
          <Github size={13} />
          GitHub
        </a>
        <button
          onClick={onCreate}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px",
            background: "#ededed",
            border: "none",
            borderRadius: 7,
            color: "#0a0a0a",
            fontSize: 13, fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#fff"}
          onMouseLeave={e => e.currentTarget.style.background = "#ededed"}
        >
          Open editor
        </button>
      </div>
    </header>
  );
}

// ─── Hero ──
function Hero({ onCreate }) {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("");
  const [err, setErr] = useState("");

  function join() {
    const v = roomCode.trim().toUpperCase();
    if (!v) { setErr("Enter a 6-character room code"); return; }
    if (!/^[A-Z0-9]{6}$/.test(v)) { setErr("Room codes are 6 characters — letters and numbers only"); return; }
    navigate(`/room/${v}`);
  }

  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", padding: "80px 0 0" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", width: "100%", padding: "0 32px" }}>
        <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>

          {/* Left */}
          <div className="hero-left" style={{ animation: "fadeUp 0.5s ease both" }}>
            {/* Simple label — no badge, no glow dot */}
            <p style={{ fontSize: 12, fontWeight: 600, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20, fontFamily: "'Geist Mono', monospace" }}>
              Real-time collaborative editor
            </p>

            <h1 style={{
              fontSize: "clamp(42px, 5.5vw, 66px)",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-3px",
              color: "#ededed",
              marginBottom: 24,
            }}>
              Your teammate<br />
              types here too.
            </h1>

            <p style={{
              fontSize: 17,
              lineHeight: 1.75,
              color: "#555",
              marginBottom: 36,
              maxWidth: 400,
              fontWeight: 400,
            }}>
              Six characters. That's all it takes. Share a room code — your collaborator joins, their cursor appears, and you're both in the same file. Live.
            </p>

            {/* Actions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <button
                onClick={onCreate}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 24px",
                  background: "#ededed",
                  border: "none", borderRadius: 8,
                  color: "#0a0a0a",
                  fontSize: 15, fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.15s, transform 0.1s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#ededed"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                Create a room <Chevron />
              </button>

              {/* Join input — inline, unboxed */}
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #222" }}>
                <input
                  value={roomCode}
                  onChange={e => { setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setErr(""); }}
                  onKeyDown={e => e.key === "Enter" && join()}
                  maxLength={6}
                  placeholder="ABCD12"
                  style={{
                    width: 110,
                    padding: "12px 14px",
                    background: "#111",
                    border: "none",
                    color: "#ededed",
                    fontSize: 14,
                    fontFamily: "'Geist Mono', monospace",
                    letterSpacing: "0.2em",
                    fontWeight: 500,
                    outline: "none",
                  }}
                  onFocus={e => e.target.parentElement.style.borderColor = "#333"}
                  onBlur={e => e.target.parentElement.style.borderColor = "#222"}
                />
                <button
                  onClick={join}
                  style={{
                    padding: "12px 16px",
                    background: "#161616",
                    border: "none",
                    borderLeft: "1px solid #222",
                    color: "#888",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 5,
                    transition: "color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#1e1e1e"; e.currentTarget.style.color = "#ededed"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#161616"; e.currentTarget.style.color = "#888"; }}
                >
                  Join <Chevron />
                </button>
              </div>
            </div>

            {err && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{err}</p>}

            <p style={{ fontSize: 13, color: "#333" }}>
              No account. No install. Open source.
            </p>
          </div>

          {/* Right — the demo */}
          <div className="editor-panel" style={{ animation: "fadeUp 0.5s ease 0.1s both" }}>
            <EditorDemo />
          </div>

        </div>
      </div>
    </section>
  );
}

// ─── Features 
function Features() {
  const list = [
    {
      title: "Named cursors, live",
      body: "Every person in the room gets a color and a name tag on their cursor. You see exactly where they are and what they're doing as it happens.",
    },
    {
      title: "Run code together",
      body: "Hit run and the output appears for everyone — not just you. No copy-pasting terminal output into chat. Supported: Python, Java, C, C++, JavaScript.",
    },
    {
      title: "Sub-50ms sync",
      body: "Edits go over a persistent WebSocket. There's no polling loop, no debounce, no artificial delay. Your keystrokes feel local for both people.",
    },
    {
      title: "Chat inside the editor",
      body: "A chat panel lives right in the editor window. Flag a bug, ask a question, drop a snippet — without switching to another app.",
    },
    {
      title: "13 languages",
      body: "Full syntax highlighting in Monaco for Python, TypeScript, Java, C, C++, Go, Rust, Ruby, Haskell, PHP, C#, F#, and JavaScript.",
    },
    {
      title: "Nothing stored",
      body: "Sessions live in memory. When the last person leaves, the room is gone. Export a ZIP any time. No database, no account, no data trail.",
    },
  ];

  return (
    <section id="features" style={{ padding: "120px 0", borderTop: "1px solid #161616" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px" }}>
        <div style={{ marginBottom: 64 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16, fontFamily: "'Geist Mono', monospace" }}>
            Features
          </p>
          <h2 style={{ fontSize: "clamp(30px,4vw,48px)", fontWeight: 800, letterSpacing: "-2px", color: "#ededed", maxWidth: 500, lineHeight: 1.1 }}>
            Everything a pair-programming session needs.
          </h2>
        </div>

        <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, border: "1px solid #161616" }}>
          {list.map((f, i) => (
            <div
              key={i}
              style={{
                padding: "32px 28px",
                borderRight: (i + 1) % 3 !== 0 ? "1px solid #161616" : "none",
                borderBottom: i < 3 ? "1px solid #161616" : "none",
                background: "#0a0a0a",
                transition: "background 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#0f0f0f"}
              onMouseLeave={e => e.currentTarget.style.background = "#0a0a0a"}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: "#161616",
                border: "1px solid #222",
                marginBottom: 20,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: "#555", fontSize: 13, fontFamily: "'Geist Mono', monospace" }}>{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#dedede", marginBottom: 10, letterSpacing: "-0.3px" }}>{f.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: "#555" }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How it works — three honest steps 
function HowItWorks() {
  const steps = [
    { n: "01", title: "Create a room", body: "Click the button. A 6-character code is generated. No form, no email, no wait." },
    { n: "02", title: "Share the code", body: "Text it, paste it in Slack, say it out loud. Your teammate enters it and lands straight in your editor." },
    { n: "03", title: "Both of you are in", body: "Their cursor shows up. You're in the same file, the same editor, in real time. Start coding." },
  ];

  return (
    <section id="how" style={{ padding: "120px 0", borderTop: "1px solid #161616", background: "#080808" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px" }}>
        <div style={{ marginBottom: 64 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16, fontFamily: "'Geist Mono', monospace" }}>
            How it works
          </p>
          <h2 style={{ fontSize: "clamp(30px,4vw,48px)", fontWeight: 800, letterSpacing: "-2px", color: "#ededed", lineHeight: 1.1 }}>
            Three steps.<br />Fifteen seconds.
          </h2>
        </div>

        <div className="mob-stack" style={{ display: "flex", gap: 0, position: "relative" }}>
          {/* Connecting line */}
          <div style={{
            position: "absolute", top: 24, left: 22, right: 22, height: 1,
            background: "linear-gradient(90deg, #222, #222 33%, transparent 33%, transparent 34%, #222 34%, #222 66%, transparent 66%, transparent 67%, #222 67%)",
            zIndex: 0,
          }} className="hide-mob" />

          {steps.map((step, i) => (
            <div key={i} style={{ flex: 1, padding: "0 24px 0 0", position: "relative", zIndex: 1 }}>
              <div style={{
                width: 48, height: 48,
                borderRadius: 8,
                background: "#0a0a0a",
                border: "1px solid #222",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 24,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 13, fontWeight: 600, color: "#555",
              }}>
                {step.n}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#dedede", marginBottom: 10, letterSpacing: "-0.4px" }}>
                {step.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: "#555" }}>{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonial / social proof bar 
function SocialProof() {
  const quotes = [
    { text: "This is exactly the tool I wanted for my CS homework sessions.", author: "— a student", color: "#3b82f6" },
    { text: "Simpler than anything else I've tried. We were coding together in under a minute.", author: "— a developer", color: "#f97316" },
    { text: "Love that there's no login. I just send the code and my partner is in.", author: "— a bootcamp student", color: "#a855f7" },
  ];

  return (
    <section style={{ padding: "80px 0", borderTop: "1px solid #161616", borderBottom: "1px solid #161616" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px" }}>
        <div className="mob-stack" style={{ display: "flex", gap: 48 }}>
          {quotes.map((q, i) => (
            <div key={i} style={{ flex: 1 }}>
              <div style={{ width: 28, height: 2, background: q.color, marginBottom: 20, borderRadius: 1 }} />
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "#888", marginBottom: 16, fontStyle: "italic" }}>
                "{q.text}"
              </p>
              <p style={{ fontSize: 12, color: "#444", fontFamily: "'Geist Mono', monospace" }}>{q.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ───
function FAQ() {
  const [open, setOpen] = useState(null);
  const items = [
    // { q: "Is it free?", a: "Yes. No paid plan, no trial limit, no credit card. Open source under the MIT license." },
    { q: "Do I need an account?", a: "No. Open the site, create a room, share the code. Nothing stored, no sign-up." },
    { q: "Which languages can I run?", a: "Execution works for Python, Java, C, C++, and JavaScript. Syntax highlighting covers 13 languages including TypeScript, Go, Rust, Ruby, Haskell, PHP, C#, and F#." },
    { q: "What happens when everyone leaves?", a: "The session is cleared from memory. Nothing is written to a database. Export a ZIP before closing if you want to keep the files." },
    { q: "How many people can join?", a: "No enforced limit. Two to six works best for focused sessions. Larger rooms work fine but feel busier." },
    { q: "Can I self-host it?", a: "Yes. Frontend is React + Vite, backend is Node.js + Express + WebSocket. The source is on GitHub and it's straightforward to deploy on any VPS." },
  ];

  return (
    <section id="faq" style={{ padding: "120px 0", borderTop: "1px solid #161616", background: "#080808" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 32px" }}>
        <div style={{ marginBottom: 56 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16, fontFamily: "'Geist Mono', monospace" }}>
            FAQ
          </p>
          <h2 style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 800, letterSpacing: "-2px", color: "#ededed" }}>
            Questions
          </h2>
        </div>

        {items.map((item, i) => (
          <div key={i} style={{ borderTop: "1px solid #161616" }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: "100%", background: "none", border: "none",
                padding: "20px 0",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                cursor: "pointer",
                color: open === i ? "#ededed" : "#888",
                fontSize: 15, fontWeight: 500,
                fontFamily: "'Geist', sans-serif",
                textAlign: "left", gap: 16,
                transition: "color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#ededed"}
              onMouseLeave={e => { if (open !== i) e.currentTarget.style.color = "#888"; }}
            >
              <span>{item.q}</span>
              <span style={{
                color: "#333", fontSize: 18, lineHeight: 1, flexShrink: 0,
                transform: open === i ? "rotate(45deg)" : "none",
                transition: "transform 0.2s", display: "block",
              }}>+</span>
            </button>
            {open === i && (
              <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, paddingBottom: 20, animation: "fadeUp 0.15s ease" }}>
                {item.a}
              </p>
            )}
          </div>
        ))}
        <div style={{ borderTop: "1px solid #161616" }} />
      </div>
    </section>
  );
}

// ─── Final CTA 
function FinalCTA({ onCreate }) {
  return (
    <section style={{ padding: "120px 32px", borderTop: "1px solid #161616", textAlign: "center" }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20, fontFamily: "'Geist Mono', monospace" }}>
        Ready?
      </p>
      <h2 style={{ fontSize: "clamp(36px,6vw,72px)", fontWeight: 800, letterSpacing: "-3px", color: "#ededed", marginBottom: 16, lineHeight: 1 }}>
        Start coding together.
      </h2>
      <p style={{ fontSize: 16, color: "#555", marginBottom: 40 }}>
        No account. No install. Your teammate is one code away.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button
          onClick={onCreate}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 28px",
            background: "#ededed",
            border: "none", borderRadius: 8,
            color: "#0a0a0a",
            fontSize: 15, fontWeight: 600, cursor: "pointer",
            transition: "background 0.15s, transform 0.1s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#ededed"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          Create a room <Chevron />
        </button>
        <a
          href="https://github.com/user1-prajwal/syncra"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 22px",
            background: "transparent",
            border: "1px solid #222",
            borderRadius: 8,
            color: "#888",
            fontSize: 15, fontWeight: 500,
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#ededed"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.color = "#888"; }}
        >
          <Github size={14} /> View source
        </a>
      </div>
    </section>
  );
}

// ─── Footer 
function Footer({ onCreate }) {
  return (
    <footer style={{ borderTop: "1px solid #161616", padding: "40px 32px 32px" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 40 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <img src="/syncra-logo-dark.svg" alt="Syncra" style={{ height: 25 }} onError={e => e.target.style.display='none'} />
              {/* <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.5px", color: "#ededed" }}>Syncra</span> */}
            </div>
            <p style={{ color: "#333", fontSize: 13, lineHeight: 1.7, maxWidth: 200 }}>
              Real-time collaborative code editor. Free and open source.
            </p>
          </div>

          {[
            { title: "Product", items: [["Create room", null, onCreate],["GitHub","https://github.com/user1-prajwal/syncra"],["Report bug","https://github.com/user1-prajwal/syncra/issues"]] },
            { title: "Features", items: [["Live cursors",null],["Code execution",null],["Built-in chat",null],["13 languages",null],["Import & Export",null]] },
            { title: "Languages", items: [["Python · C · C++",null],["Java · Go · Rust",null],["TypeScript · JS",null],["Ruby · Haskell",null],["PHP · C# · F#",null]] },
          ].map(col => (
            <div key={col.title}>
              <h4 style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: "'Geist Mono',monospace" }}>
                {col.title}
              </h4>
              {col.items.map(([label, href, fn]) => fn ? (
                <button key={label} onClick={fn} style={{ display: "block", background: "none", border: "none", color: "#333", fontSize: 13, cursor: "pointer", padding: "0 0 8px", fontFamily: "'Geist',sans-serif", transition: "color 0.15s", textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#ededed"}
                  onMouseLeave={e => e.currentTarget.style.color = "#333"}
                >{label}</button>
              ) : href ? (
                <a key={label} href={href} target="_blank" rel="noreferrer" style={{ display: "block", color: "#333", fontSize: 13, marginBottom: 8, transition: "color 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#ededed"}
                  onMouseLeave={e => e.currentTarget.style.color = "#333"}
                >{label}</a>
              ) : (
                <div key={label} style={{ color: "#2a2a2a", fontSize: 13, marginBottom: 8 }}>{label}</div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #161616", paddingTop: 24, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ color: "#2a2a2a", fontSize: 12 }}>© 2025 Syncra · MIT License · No data stored · Free forever</span>
          <span style={{ color: "#2a2a2a", fontSize: 12 }}>React + WebSocket + Monaco Editor</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Root ──
export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => { injectGlobal(); }, []);

  function createRoom() {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/room/${id}`);
  }

  return (
    <div style={{ background: "#0a0a0a", color: "#ededed", minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}>
      <Navbar onCreate={createRoom} />
      <Hero onCreate={createRoom} />
      <Marquee />
      <Features />
      <HowItWorks />
      <SocialProof />
      <FAQ />
      <FinalCTA onCreate={createRoom} />
      <Footer onCreate={createRoom} />
    </div>
  );
}
