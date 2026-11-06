import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const GITHUB = "https://github.com/user1-prajwal/syncra";

// No 0/O/1/I so a code is easy to read out loud. 32 symbols divide 256 evenly, so `b % 32` has no modulo bias.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE = /^[A-Z0-9]{6}$/;

function newRoomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
}

// What the join field should show for whatever was typed or pasted.
// - A pasted room link shows the id taken from it, untouched. If that id is not a valid code, Join rejects it,
//   instead of the field quietly "cleaning" it into a different room.
// - Anything else that looks like a URL is kept as-is so Join can reject it (it used to be cut down to six
//   unrelated letters, e.g. "HTTPSS").
// - Typed or dictated codes drop spaces and dashes and stop at six characters.
function readRoomField(raw) {
  const link = raw.match(/\/room\/([^/?#\s]+)/i);
  if (link) return link[1].toUpperCase().slice(0, 32);
  if (/[/:.]/.test(raw)) return raw.trim().slice(0, 32);
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

// ─── Styles ───────────────────────────────────────────────────────

// Shared base rules, same id and contents as the previous landing page (minus its landing-only parts),
// left in place because other pages may rely on them. Better home: the app's global stylesheet.
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

// Everything below is scoped to .sx and is rendered inside the page, so it is removed when the page unmounts.
// Colour carries meaning here: the page is neutral, and the only hues are the people in the editor.
const CSS = `
.sx{--paper:#f4f5f4;--card:#fafbfa;--ink:#1d2321;--mu:#566059;--dim:#66706a;--line:#d9dcd9;--line2:#c5c9c5;
  --ed:#181b1a;--ed2:#1f2322;--edl:#2b302e;--edt:#d6dad7;--edm:#8a928e;--edg:#4a514e;
  --you:#e4e8e5;--pri:#e9a23b;--kai:#55c28a;
  --gx:clamp(20px,4vw,40px);
  min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;background:var(--paper);color:var(--ink);
  font:400 16px/1.5 'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;overflow-x:clip}
.sx,.sx *,.sx *::before,.sx *::after{box-sizing:border-box}
.sx :where(h1,p,form,input,button,label){margin:0}
.sx :focus-visible{outline:2px solid var(--ink);outline-offset:2px}
body:has(.sx){background:#f4f5f4}
html:has(.sx)::-webkit-scrollbar-track{background:#f4f5f4}
html:has(.sx)::-webkit-scrollbar-thumb{background:#c5c9c5}

.sx-h{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 var(--gx)}
.sx-wm{font-weight:600;font-size:18px;letter-spacing:-.015em}
.sx-gh{display:flex;align-items:center;gap:7px;padding:6px 0;color:var(--mu);font-size:14px;transition:color .12s}
.sx-gh:hover{color:var(--ink);text-decoration:underline;text-underline-offset:3px}

.sx-m{flex:1;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(32px,5vw,72px);align-items:center;
  width:100%;max-width:1320px;margin:0 auto;padding:16px var(--gx) 28px}
.sx h1{font-weight:600;font-size:clamp(32px,3.1vw,44px);line-height:1.1;letter-spacing:-.028em;text-wrap:balance;margin-bottom:18px}
.sx-p{font-size:17px;line-height:1.6;color:var(--mu);max-width:46ch;margin-bottom:28px;text-wrap:pretty}

.sx-btn{height:46px;padding:0 22px;border:0;border-radius:6px;background:var(--ink);color:var(--paper);
  font:500 15px 'IBM Plex Sans',sans-serif;cursor:pointer;transition:background-color .12s}
.sx-btn:hover{background:#353d3a}
.sx-btn:active{background:#000}
.sx-sub{margin-top:10px;font-size:13px;color:var(--dim)}

.sx-jn{max-width:400px;margin-top:26px;padding-top:22px;border-top:1px solid var(--line)}
.sx-jn label{display:block;margin-bottom:8px;font-size:13px;font-weight:500;color:var(--mu)}
.sx-f{display:flex;height:44px;border:1px solid var(--line2);border-radius:6px;background:var(--card);transition:border-color .12s}
.sx-f:focus-within{border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)}
.sx-f input{flex:1;min-width:0;padding:0 14px;border:0;border-radius:6px 0 0 6px;background:none;color:var(--ink);
  font:500 16px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}
.sx-f input:focus-visible{outline:none}
.sx-f input::placeholder{color:var(--dim);font-weight:400}
.sx-f button{padding:0 20px;border:0;border-left:1px solid var(--line2);border-radius:0 5px 5px 0;background:none;color:var(--ink);
  font:500 14px 'IBM Plex Sans',sans-serif;cursor:pointer;transition:background-color .12s}
.sx-f button:hover{background:rgba(29,35,33,.06)}
.sx-f button:focus-visible{outline-offset:-4px}
.sx-err{min-height:20px;margin-top:8px;font-size:13px;line-height:20px;color:#a8321f}

/* collaborator cursors */
.sx .cur{position:absolute;width:2px;height:22px}
.sx .cur::after{content:"";position:absolute;inset:0;background:var(--c);animation:sx-blink 1.1s steps(1) infinite}
.sx .cur[data-name]::before{content:attr(data-name);position:absolute;left:0;bottom:100%;padding:0 6px;
  font:600 10.5px/17px 'IBM Plex Sans',sans-serif;white-space:nowrap;background:var(--c);color:#121514;border-radius:3px 3px 3px 0}
@keyframes sx-blink{50%{opacity:0}}

/* editor preview */
.sx-pv{container-type:inline-size;min-width:0}
.sx-w{border:1px solid #0d0f0e;border-radius:8px;background:var(--ed);color:var(--edt);overflow:hidden;
  font:400 13px/22px 'IBM Plex Mono',ui-monospace,monospace;font-size:min(13px,calc((100cqw - 72px)/23.5))}
.sx-w .bar{display:flex;align-items:stretch;justify-content:space-between;height:40px;background:var(--ed2);border-bottom:1px solid var(--edl)}
.sx-w .tabs{display:flex}
.sx-w .tab{display:flex;align-items:center;padding:0 16px;border-right:1px solid var(--edl);color:var(--edm);font:400 12px 'IBM Plex Sans',sans-serif}
.sx-w .tab.on{background:var(--ed);color:var(--edt);box-shadow:inset 0 1px 0 var(--edm)}
.sx-w .who{display:flex;align-items:center;gap:14px;padding-right:10px;color:var(--edm);font:400 11px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.06em}
.sx-w .avs{display:flex;padding-left:5px}
.sx-w .av{display:grid;place-items:center;width:22px;height:22px;margin-left:-5px;border:2px solid var(--ed2);border-radius:50%;
  background:var(--c);color:#121514;font:600 9px/1 'IBM Plex Sans',sans-serif;font-style:normal}
.sx-w .runb{display:flex;align-items:center;gap:6px;height:24px;padding:0 10px;border:1px solid #444a47;border-radius:5px;color:var(--edt);
  font:500 12px 'IBM Plex Sans',sans-serif;letter-spacing:0}
.sx-w .body{display:flex}
.sx-w .ed{flex:1;min-width:0;position:relative;display:flex;padding:20px 0 16px}
.sx-w .gut{flex:none;width:44px;padding-right:14px;text-align:right;color:var(--edg);user-select:none}
.sx-w .lines{position:relative;flex:1;min-width:0;margin-left:16px;white-space:pre}
.sx-w .ln{height:22px}
.sx-w .sel{position:absolute;height:22px;border-radius:2px;background:rgba(85,194,138,.26)}
.sx-w .t-k{color:#c98b9b}.sx-w .t-f{color:#86aec7}.sx-w .t-b{color:#c9ab7e}.sx-w .t-s{color:#9fb88a}.sx-w .t-n{color:#c9ab7e}.sx-w .t-c{color:#6b7077;font-style:italic}
.sx-w .chat{flex:none;display:flex;flex-direction:column;width:208px;border-left:1px solid var(--edl);font:400 12px/1.45 'IBM Plex Sans',sans-serif}
.sx-w .chat h2{padding:10px 14px;border-bottom:1px solid var(--edl);color:var(--edm);font:500 11px/1.4 'IBM Plex Sans',sans-serif}
.sx-w .msgs{flex:1;display:grid;align-content:start;gap:12px;padding:14px}
.sx-w .msgs b{display:block;font-weight:600;font-size:11px;color:var(--c)}
.sx-w .msgs span{color:var(--edt)}
.sx-w .mi{margin:0 10px 10px;padding:7px 10px;border:1px solid var(--edl);border-radius:5px;color:var(--edm)}
.sx-w .out{padding:10px 16px 12px;border-top:1px solid var(--edl);background:#141716}
.sx-w .out span{display:block;margin-bottom:2px;color:var(--edm);font:500 11px/1.5 'IBM Plex Sans',sans-serif}
.sx-w .out code{display:block;color:#9fb88a;font:inherit;font-size:12px}

.sx-ft{display:flex;flex-wrap:wrap;gap:4px 32px;padding:14px var(--gx);border-top:1px solid var(--line);font-size:12.5px;color:var(--dim)}

@container (max-width:639px){.sx-w .chat{display:none}}
@container (max-width:430px){.sx-w .tab:nth-child(2),.sx-w .rm{display:none}}
@media(max-width:980px){
  .sx-m{grid-template-columns:minmax(0,1fr);gap:40px;align-items:start;padding-top:12px;padding-bottom:36px}
  .sx-pv{max-width:720px}
}
@media(max-width:480px){
  .sx h1{font-size:clamp(30px,8vw,36px)}
  .sx-btn{width:100%}
  .sx-jn{max-width:none}
}
@media(prefers-reduced-motion:reduce){
  .sx *,.sx *::before,.sx *::after{animation:none!important;transition:none!important}
}
`;

const FONTS =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap";

function useGlobalStyles() {
  useLayoutEffect(() => {
    if (!document.getElementById("s-css")) {
      const g = document.createElement("style");
      g.id = "s-css";
      g.textContent = GLOBAL_CSS;
      document.head.appendChild(g);
    }
  }, []);
}

// A <link> loads fonts without blocking rendering the way an @import inside injected CSS does.
// Ideally this lives in index.html, so the request starts before React runs.
function useFonts() {
  useEffect(() => {
    if (document.querySelector("link[data-sx-fonts]")) return;
    const pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = "https://fonts.gstatic.com";
    pre.crossOrigin = "";
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = FONTS;
    css.dataset.sxFonts = "";
    document.head.append(pre, css);
  }, []);
}

const GitHubMark = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.4 7.86 10.94.57.1.79-.25.79-.55v-2.1c-3.2.7-3.87-1.36-3.87-1.36-.53-1.32-1.29-1.67-1.29-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.53-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.09 0 4.43-2.69 5.41-5.25 5.69.42.36.78 1.07.78 2.16v3.2c0 .31.21.65.8.55A10.99 10.99 0 0 0 23.5 12C23.5 5.74 18.27.5 12 .5z" />
  </svg>
);

// ─── Editor preview ───────────────────────────────────────────────
// An illustration of a room. It only shows things the app does: file tabs, live cursors, chat, Run and its output.

const LH = 22; // line height in px, matches CSS
const PEOPLE = [
  { n: "You", c: "var(--you)" },
  { n: "Priya", c: "var(--pri)" },
  { n: "Kai", c: "var(--kai)" },
];
const CHAT = [
  { who: "Kai", c: "var(--kai)", text: "Can you handle punctuation too?" },
  { who: "Priya", c: "var(--pri)", text: "Yes, adding it below." },
  { who: "You", c: "var(--you)", text: "Running it now." },
];
const TYPED_ROW = 8; // Priya types here; the blank rows above keep her name label off the code
const TYPED = "# next: strip punctuation";
const CODE = [
  "from collections import Counter",
  "",
  "",
  "def top_words(text, k=3):",
  "    words = text.lower().split()",
  "    return Counter(words).most_common(k)",
  "",
  "",
  "",
  "",
  'print(top_words("to be or not to be"))',
];

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

// Types the text once, then stops. With reduced motion the finished text is shown straight away.
function useTypeOnce(text, delay = 1200) {
  const [n, setN] = useState(() => (reducedMotion() ? text.length : 0));
  useEffect(() => {
    if (reducedMotion()) return;
    let i = 0;
    let id;
    const tick = () => {
      i += 1;
      setN(i);
      if (i < text.length) id = setTimeout(tick, text[i] === " " ? 110 : 60);
    };
    id = setTimeout(tick, delay);
    return () => clearTimeout(id);
  }, [text, delay]);
  return n;
}

function Cur({ row, col, color, name }) {
  return <span className="cur" data-name={name} aria-hidden="true" style={{ "--c": color, top: row * LH, left: `${col}ch` }} />;
}

function EditorPreview() {
  const typed = useTypeOnce(TYPED);
  return (
    <div
      className="sx-pv"
      role="img"
      aria-label="Illustration of a Syncra room: main.py open with live cursors from two collaborators, a chat panel, a Run button and its output"
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
            <span className="runb">
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 .8v8.4L9 5z" fill="currentColor" /></svg>
              Run
            </span>
          </div>
        </div>

        <div className="body">
          <div className="ed">
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
              <Cur row={10} col={38} color="var(--you)" />
            </div>
          </div>
          <div className="chat">
            <h2>Chat</h2>
            <div className="msgs">
              {CHAT.map((m) => (
                <p key={m.who} style={{ "--c": m.c }}><b>{m.who}</b><span>{m.text}</span></p>
              ))}
            </div>
            <div className="mi">Message</div>
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
  return (
    <header className="sx-h">
      {/* Text wordmark: the existing /syncra-logo-dark.svg is made for dark backgrounds. */}
      <span className="sx-wm">Syncra</span>
      <a className="sx-gh" href={GITHUB} target="_blank" rel="noreferrer">
        <GitHubMark /> GitHub
      </a>
    </header>
  );
}

function Hero({ onCreate }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");

  function onChange(e) {
    setValue(readRoomField(e.target.value));
    setErr("");
  }

  function onJoin(e) {
    e.preventDefault();
    if (!value) {
      setErr("Enter a room code or paste a room link.");
      return;
    }
    if (!ROOM_CODE.test(value)) {
      setErr("Room codes are 6 letters and numbers. Check the code or link and try again.");
      return;
    }
    navigate(`/room/${value}`);
  }

  return (
    <div>
      <h1>A shared editor for pair programming and technical interviews.</h1>
      <p className="sx-p">
        Create a room, send the six-character code, and you are editing the same files together, with live cursors,
        chat and a Run button. No account or install.
      </p>

      <button type="button" className="sx-btn" onClick={onCreate}>Create a room</button>
      <p className="sx-sub">Opens a new room with its own code to share.</p>

      <form className="sx-jn" onSubmit={onJoin} noValidate>
        <label htmlFor="sx-code">Join with a room code or link</label>
        <div className="sx-f">
          <input
            id="sx-code"
            value={value}
            onChange={onChange}
            placeholder="K3F9ZQ"
            aria-invalid={!!err}
            aria-describedby="sx-err"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            enterKeyHint="go"
            spellCheck={false}
          />
          <button type="submit">Join</button>
        </div>
        <p id="sx-err" className="sx-err" role="alert">{err}</p>
      </form>
    </div>
  );
}

function Footer() {
  return (
    <footer className="sx-ft">
      <span>Rooms close 10 minutes after the last person leaves.</span>
      <span>13 languages. JavaScript runs in your browser, the rest through a hosted compiler.</span>
    </footer>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  useGlobalStyles();
  useFonts();

  function createRoom() {
    navigate(`/room/${newRoomCode()}`);
  }

  return (
    <div className="sx">
      <style>{CSS}</style>
      <Header />
      <main className="sx-m">
        <Hero onCreate={createRoom} />
        <EditorPreview />
      </main>
      <Footer />
    </div>
  );
}