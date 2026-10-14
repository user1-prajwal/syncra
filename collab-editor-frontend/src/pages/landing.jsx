import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const GITHUB = "https://github.com/user1-prajwal/syncra";
// No 0/O/1/I so a code is easy to read out loud. 32 symbols divide 256 evenly, so every symbol is equally likely.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newRoomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
}

// Shared base rules, same id and contents as the previous landing page (minus its landing-only parts),
// left in place because other pages may rely on them.
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:#0a0a0a;font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;color:#ededed;overflow-x:hidden}
::selection{background:rgba(255,255,255,.15)}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#0a0a0a}::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:3px}
a{text-decoration:none;color:inherit}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes ping{0%{transform:scale(1);opacity:1}75%,100%{transform:scale(2);opacity:0}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;

// Everything below is scoped to .sx and removed when the page unmounts.
const CSS = `
.sx{--bg:#0a1020;--panel:#0f1730;--win:#0c1329;--line:#1d2847;--tx:#eaeef8;--mu:#93a0bd;--dim:#7685a8;--paper:#f3efe4;
  --you:#6ea8ff;--pri:#ff8a5b;--kai:#b58cff;
  position:relative;min-height:100vh;min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto;
  background:var(--bg);color:var(--tx);font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow-x:hidden;overflow-x:clip}
.sx::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(55% 55% at 72% 48%,rgba(110,168,255,.08),transparent 72%)}
.sx>*{position:relative}
.sx :focus-visible{outline:2px solid var(--you);outline-offset:3px}
body:has(.sx){background:#0a1020}

.sx-h{display:flex;align-items:center;justify-content:space-between;height:64px;padding:0 clamp(20px,4vw,40px)}
.sx-h img{display:block;height:28px;width:auto}
.sx-wm{font-weight:700;font-size:18px;letter-spacing:-.02em}
.sx-gh{display:flex;align-items:center;gap:7px;padding:6px 2px;color:var(--mu);font-size:14px;font-weight:500;transition:color .15s}
.sx-gh:hover{color:var(--tx)}

.sx-m{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(32px,5vw,72px);align-items:center;
  width:100%;max-width:1280px;margin:0 auto;padding:16px clamp(20px,4vw,40px) 24px}
.sx h1{font-size:clamp(36px,3.9vw,54px);line-height:1.06;letter-spacing:-.035em;font-weight:600;text-wrap:balance;margin-bottom:22px}
.sx .nw{white-space:nowrap}
.sx-p{font-size:17px;line-height:1.65;color:var(--mu);max-width:44ch;margin-bottom:28px;text-wrap:pretty}

.sx-act{display:grid;gap:14px;max-width:400px}
.sx-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:50px;border:0;border-radius:10px;
  background:var(--paper);color:#0a1020;font:600 15px 'Geist',sans-serif;cursor:pointer;transition:transform .12s,background .15s}
.sx-btn:hover{background:#fff;transform:translateY(-1px)}
.sx-btn:active{transform:none}
.sx-or{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--dim)}
.sx-or::before,.sx-or::after{content:"";flex:1;height:1px;background:var(--line)}
.sx-join{display:flex;border:1px solid var(--line);border-radius:10px;background:var(--panel);transition:border-color .15s}
.sx-join:focus-within{border-color:var(--you);box-shadow:0 0 0 1px var(--you)}
.sx-join input{flex:1;min-width:0;height:48px;padding:0 16px;background:none;border:0;border-radius:10px 0 0 10px;color:var(--tx);
  font:500 16px 'Geist Mono',ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase}
.sx-join input:focus-visible{outline:none}
.sx-join input::placeholder{color:var(--dim);font:400 15px 'Geist',sans-serif;letter-spacing:0;text-transform:none}
.sx-join button{padding:0 22px;border:0;border-left:1px solid var(--line);border-radius:0 9px 9px 0;background:none;color:var(--tx);
  font:600 14px 'Geist',sans-serif;cursor:pointer;transition:background .15s}
.sx-join button:hover{background:rgba(255,255,255,.05)}
.sx-join button:focus-visible{outline-offset:-3px}
.sx-err{font-size:13px;color:#ff9a9a}
.sx-note{font-size:14px;color:var(--dim)}

/* collaborator cursors, used in the headline and in the editor preview */
.sx .cur{position:absolute;width:2px;height:22px}
.sx .cur::after{content:"";position:absolute;inset:0;background:var(--c);animation:sx-blink 1.1s steps(1) infinite}
.sx .cur[data-name]::before{content:attr(data-name);position:absolute;left:0;bottom:100%;padding:0 6px;font:600 11px/17px 'Geist',sans-serif;letter-spacing:0;white-space:nowrap;
  background:var(--c);color:#0a1020;border-radius:4px 4px 4px 0}
.sx .cur.h{position:relative;display:inline-block;width:3px;height:.84em;margin:0 3px;vertical-align:-.04em}
@keyframes sx-blink{50%{opacity:0}}

.sx-pv{container-type:inline-size}
.sx-w{border:1px solid var(--line);border-radius:12px;background:var(--win);overflow:hidden;min-width:0;
  font:13px/22px 'Geist Mono',ui-monospace,monospace;font-size:min(13px,calc((100cqw - 68px)/24.4));text-rendering:geometricPrecision;box-shadow:0 40px 80px -24px rgba(0,0,0,.7)}
.sx-w .bar{display:flex;align-items:center;justify-content:space-between;gap:12px;height:42px;padding-right:12px;background:var(--panel);border-bottom:1px solid var(--line)}
.sx-w .tabs{display:flex;height:100%}
.sx-w .tab{display:flex;align-items:center;padding:0 16px;border-right:1px solid var(--line);color:var(--dim);font-size:12px}
.sx-w .tab.on{color:var(--tx);background:var(--win);box-shadow:inset 0 -2px 0 var(--you)}
.sx-w .who{display:flex;align-items:center;gap:12px;color:var(--dim);font-size:11px}
.sx-w .avs{display:flex;padding-left:6px}
.sx-w .av{display:grid;place-items:center;width:22px;height:22px;margin-left:-6px;border-radius:50%;border:2px solid var(--panel);
  background:var(--c);color:#0a1020;font:700 10px/1 'Geist',sans-serif;font-style:normal}
.sx-w .runb{display:flex;align-items:center;gap:6px;padding:3px 10px;border:1px solid var(--line);border-radius:6px;color:var(--tx);font:500 11px/18px 'Geist',sans-serif}
.sx-w .code{position:relative;display:flex;padding:16px 0;min-height:204px}
.sx-w .gut{flex:none;width:44px;padding-right:14px;text-align:right;color:#35415f;font-size:12px;user-select:none}
.sx-w .lines{position:relative;flex:1;min-width:0;margin-left:16px;white-space:pre}
.sx-w .ln{height:22px}
.sx-w .sel{position:absolute;height:22px;border-radius:2px;background:rgba(181,140,255,.24)}
.sx-w .t-k{color:#c4a7ff}.sx-w .t-f{color:#7cc4ff}.sx-w .t-b{color:#ffd479}.sx-w .t-s{color:#a5e08a}.sx-w .t-n{color:#ffb86b}.sx-w .t-c{color:#7685a8;font-style:italic}
.sx-w .chat{position:absolute;top:12px;right:12px;width:176px;display:grid;gap:6px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;
  background:rgba(15,23,48,.96);box-shadow:0 12px 30px rgba(0,0,0,.45);font:12px/1.45 'Geist',sans-serif;color:var(--mu)}
.sx-w .chat b{margin-right:6px;font-weight:600;color:var(--c)}
.sx-w .out{display:flex;align-items:baseline;gap:12px;padding:10px 16px;border-top:1px solid var(--line);background:#080d1c;font-size:12px}
.sx-w .out span{color:var(--dim);font:500 12px 'Geist',sans-serif}
.sx-w .out code{color:#a5e08a;font:inherit}

.sx-s{display:flex;flex-wrap:wrap;align-items:center;gap:6px 28px;padding:13px clamp(20px,4vw,40px);border-top:1px solid var(--line);
  background:rgba(8,13,28,.8);font-size:12.5px;color:var(--dim)}
.sx-s a{margin-left:auto;color:var(--mu);transition:color .15s}
.sx-s a:hover{color:var(--tx)}

@media(max-width:960px){
  .sx-m{grid-template-columns:minmax(0,1fr);gap:36px;padding-top:8px}
  .sx h1{font-size:clamp(36px,6.2vw,54px)}
  .sx-pv{max-width:720px}
  .sx-s a{margin-left:0}
}
@container (max-width:540px){.sx-w .chat{display:none}}
@container (max-width:430px){.sx-w .tab:nth-child(2),.sx-w .rm{display:none}}
@media(prefers-reduced-motion:reduce){
  .sx *,.sx *::before,.sx *::after{animation:none!important;transition:none!important}
}
`;

function useStyles() {
  useLayoutEffect(() => {
    if (!document.getElementById("s-css")) {
      const g = document.createElement("style");
      g.id = "s-css";
      g.textContent = GLOBAL_CSS;
      document.head.appendChild(g);
    }
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
}

const Github = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.4 7.86 10.94.57.1.79-.25.79-.55v-2.1c-3.2.7-3.87-1.36-3.87-1.36-.53-1.32-1.29-1.67-1.29-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.53-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.09 0 4.43-2.69 5.41-5.25 5.69.42.36.78 1.07.78 2.16v3.2c0 .31.21.65.8.55A10.99 10.99 0 0 0 23.5 12C23.5 5.74 18.27.5 12 .5z" />
  </svg>
);
const Plus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Play = () => (
  <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M1.5 0.8v8.4L9 5z" fill="#a5e08a" />
  </svg>
);

// ─── Editor preview ───────────────────────────────────────────────

const LH = 22; // line height in px, matches CSS
const PEOPLE = [
  { n: "You", c: "var(--you)" },
  { n: "Priya", c: "var(--pri)" },
  { n: "Kai", c: "var(--kai)" },
];
const CODE = [
  "from collections import Counter",
  "",
  "def top_words(text, k=3):",
  "    words = text.lower().split()",
  "    return Counter(words).most_common(k)",
  "",
  "", // row 6: Priya types here, under a blank row so her label hides no code
  'print(top_words("to be or not to be"))',
];
const TYPED = "# next: strip punctuation";
const TYPED_ROW = 6;

const KEYWORDS = /^(from|import|def|return)$/;
function highlight(src) {
  const re = /(#.*)|("[^"]*")|(\b\d+\b)|([A-Za-z_]\w*)|(\s+|.)/g;
  const out = [];
  let m;
  let i = 0;
  while ((m = re.exec(src))) {
    const [text, comment, str, num, word] = m;
    let cls = "";
    if (comment) cls = "c";
    else if (str) cls = "s";
    else if (num) cls = "n";
    else if (word) {
      if (KEYWORDS.test(word)) cls = "k";
      else if (src[re.lastIndex] === "(") cls = word === "print" ? "b" : "f";
    }
    out.push(cls ? <span key={i++} className={`t-${cls}`}>{text}</span> : text);
  }
  return out;
}

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Types the text, holds, backspaces quickly, pauses, repeats.
function useTyping(text) {
  const [n, setN] = useState(() => (reducedMotion() ? text.length : 0));
  useEffect(() => {
    if (reducedMotion()) return;
    const L = text.length;
    const cycle = L + 60;
    let s = 0;
    const id = setInterval(() => {
      s = (s + 1) % cycle;
      if (s < L) setN(s);
      else if (s < L + 40) setN(L);
      else setN(Math.max(0, Math.round(L * (1 - (s - L - 40) / 10))));
    }, 70);
    return () => clearInterval(id);
  }, [text]);
  return n;
}

function Cur({ row, col, color, name }) {
  return <span className="cur" data-name={name} aria-hidden="true" style={{ "--c": color, top: row * LH, left: `${col}ch` }} />;
}

function EditorPreview() {
  const typed = useTyping(TYPED);
  return (
    <div
      className="sx-pv"
      role="img"
      aria-label="Preview of a Syncra room: three people editing main.py together, with live cursors, chat and a Run button"
    >
      <div className="sx-w">
        <div className="bar">
          <div className="tabs">
            <span className="tab on">main.py</span>
            <span className="tab">tests.py</span>
          </div>
          <div className="who">
            <span className="rm">K3F9ZQ</span>
            <span className="avs">
              {PEOPLE.map((p) => (
                <i key={p.n} className="av" style={{ "--c": p.c }}>{p.n[0]}</i>
              ))}
            </span>
            <span className="runb"><Play /> Run</span>
          </div>
        </div>

        <div className="code">
          <div className="gut">
            {CODE.map((_, i) => <div key={i} className="ln">{i + 1}</div>)}
          </div>
          <div className="lines">
            {CODE.map((line, i) => (
              <div key={i} className="ln">{highlight(i === TYPED_ROW ? TYPED.slice(0, typed) : line)}</div>
            ))}
            <span className="sel" style={{ top: 0, left: "24ch", width: "7ch" }} />
            <Cur row={0} col={31} color="var(--kai)" name="Kai" />
            <Cur row={TYPED_ROW} col={typed} color="var(--pri)" name="Priya" />
            <Cur row={7} col={38} color="var(--you)" />
          </div>
          <div className="chat">
            <p><b style={{ "--c": "var(--kai)" }}>Kai</b>can you take the tests?</p>
            <p><b style={{ "--c": "var(--pri)" }}>Priya</b>on it</p>
          </div>
        </div>

        <div className="out">
          <span>Output</span>
          <code>[('to', 2), ('be', 2), ('or', 1)]</code>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────

function Header() {
  const [logo, setLogo] = useState(true);
  return (
    <header className="sx-h">
      {logo ? (
        <img src="/syncra-logo-dark.svg" alt="Syncra" onError={() => setLogo(false)} />
      ) : (
        <span className="sx-wm">Syncra</span>
      )}
      <a className="sx-gh" href={GITHUB} target="_blank" rel="noreferrer">
        <Github /> GitHub
      </a>
    </header>
  );
}

function Hero({ onCreate }) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  function onChange(e) {
    const v = e.target.value;
    const link = v.match(/\/room\/([A-Za-z0-9_-]+)/); // a pasted room link works too
    const clean = (link ? link[1] : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
    // Typed input stops at 6. A pasted link keeps its whole id so Join can reject it rather than open the wrong room.
    setCode(link ? clean.slice(0, 32) : clean.slice(0, 6));
    setErr("");
  }

  function onJoin(e) {
    e.preventDefault();
    if (code.length !== 6) {
      setErr(code ? "Room codes are 6 characters: letters and numbers." : "Enter a 6-character room code.");
      return;
    }
    navigate(`/room/${code}`);
  }

  return (
    <div>
      <h1>
        {"Code in the same "}
        <span className="nw">file,<span className="cur h" data-name="Priya" aria-hidden="true" style={{ "--c": "var(--pri)" }} /></span>{" "}
        <span className="nw">at the</span>{" "}
        <span className="nw">same time.<span className="cur h" data-name="Kai" aria-hidden="true" style={{ "--c": "var(--kai)" }} /></span>
      </h1>
      <p className="sx-p">
        Make a room, send the six-character code, and you are both typing in the same files. Live cursors, chat and a Run button are built in.
      </p>

      <div className="sx-act">
        <button type="button" className="sx-btn" onClick={onCreate}>
          <Plus /> Create a room
        </button>
        <div className="sx-or">or join with a code</div>
        <form className="sx-join" onSubmit={onJoin} noValidate>
          <input
            value={code}
            onChange={onChange}
            placeholder="Enter room code"
            aria-label="Room code"
            aria-invalid={!!err}
            aria-describedby={err ? "sx-err" : undefined}
            autoComplete="off"
            autoCapitalize="characters"
            enterKeyHint="go"
            spellCheck={false}
          />
          <button type="submit">Join</button>
        </form>
        {err && <p id="sx-err" className="sx-err" role="alert">{err}</p>}
        <p className="sx-note">No account, no install. A pasted room link works too.</p>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <footer className="sx-s">
      <span>Rooms close 10 minutes after the last person leaves</span>
      <span>13 languages. JavaScript runs in your browser, the rest through a hosted compiler</span>
      <span>Up to 50 people per room</span>
      <a href={GITHUB} target="_blank" rel="noreferrer">Open source on GitHub</a>
    </footer>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  useStyles();

  function createRoom() {
    navigate(`/room/${newRoomCode()}`);
  }

  return (
    <div className="sx">
      <Header />
      <main className="sx-m">
        <Hero onCreate={createRoom} />
        <EditorPreview />
      </main>
      <StatusBar />
    </div>
  );
}
