const { Renderer, Stave, StaveNote, Voice, Formatter } = Vex.Flow;

// --- Piano audio synthesis ---
const NOTE_FREQUENCIES = {
  "g/3": 196.0,
  "a/3": 220.0,
  "b/3": 246.94,
  "c/4": 261.63,
  "d/4": 293.66,
  "e/4": 329.63,
  "f/4": 349.23,
  "g/4": 392.0,
  "a/4": 440.0,
  "b/4": 493.88,
  "c/5": 523.25,
  "d/5": 587.33,
  "e/5": 659.26,
  "f/5": 698.46,
  "g/5": 783.99,
  "a/5": 880.0,
  "b/5": 987.77,
  "c/6": 1046.5,
};

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playPianoNote(noteKey, duration = 1.2) {
  const freq = NOTE_FREQUENCIES[noteKey];
  if (!freq) return;

  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const harmonics = [
    { ratio: 1, gain: 0.4 },
    { ratio: 2, gain: 0.15 },
    { ratio: 3, gain: 0.06 },
    { ratio: 4, gain: 0.03 },
  ];

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.5, now);
  master.connect(ctx.destination);

  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * h.ratio, now);

    env.gain.setValueAtTime(h.gain, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(env);
    env.connect(master);
    osc.start(now);
    osc.stop(now + duration);
  }
}

function playErrorTone(duration = 0.35) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.18, now);
  master.gain.exponentialRampToValueAtTime(0.001, now + duration);
  master.connect(ctx.destination);

  for (const freq of [185, 196]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(master);
    osc.start(now);
    osc.stop(now + duration);
  }
}

const NOTE_POOL = [
  { key: "g/3", name: "g" },
  { key: "a/3", name: "a" },
  { key: "b/3", name: "h" },
  { key: "c/4", name: "c" },
  { key: "d/4", name: "d" },
  { key: "e/4", name: "e" },
  { key: "f/4", name: "f" },
  { key: "g/4", name: "g" },
  { key: "a/4", name: "a" },
  { key: "b/4", name: "h" },
  { key: "c/5", name: "c" },
  { key: "d/5", name: "d" },
  { key: "e/5", name: "e" },
  { key: "f/5", name: "f" },
  { key: "g/5", name: "g" },
  { key: "a/5", name: "a" },
  { key: "b/5", name: "h" },
  { key: "c/6", name: "c" },
];

const notationEl = document.getElementById("notation");
const scoreEl = document.getElementById("score");
const mistakesEl = document.getElementById("mistakes");
const streakEl = document.getElementById("streak");
const progressEl = document.getElementById("progress");
const setupScreen = document.getElementById("setup-screen");
const gameScreen = document.getElementById("game-screen");
const resultsScreen = document.getElementById("results-screen");
const noteCountOptionsEl = document.getElementById("note-count-options");
const resultsStatsEl = document.getElementById("results-stats");
const playAgainBtn = document.getElementById("play-again");
const notePadEl = document.getElementById("note-pad");

const NOTE_COUNT_PRESETS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
// Note names for the on-screen answer pad (mobile), in scale order.
const NOTE_PAD_KEYS = ["c", "d", "e", "f", "g", "a", "h"];

let allNotes = [];
let currentIndex = 0;
let correct = 0;
let wrong = 0;
let streak = 0;
let totalNotes = 0;
let gameActive = false;

function randomNote() {
  return NOTE_POOL[Math.floor(Math.random() * NOTE_POOL.length)];
}

function ensureBuffer(upTo) {
  while (allNotes.length <= upTo) {
    allNotes.push(randomNote());
  }
}

function getVisibleCount() {
  const width = notationEl.clientWidth || 700;
  return Math.max(5, Math.min(12, Math.floor((width - 80) / 55)));
}

// Notes are shown one "line" (page) at a time. The player works through the
// whole line, and only when every note on it has been answered does the next
// line appear. getPageStart snaps the absolute index of the current note down
// to the start of its page, so the visible window jumps a full line at a time
// instead of scrolling one note at a time.
function getPageStart(index, pageSize) {
  return Math.floor(index / pageSize) * pageSize;
}

function renderNotation() {
  const pageSize = getVisibleCount();
  const windowStart = getPageStart(currentIndex, pageSize);
  let windowEnd = windowStart + pageSize;
  if (totalNotes > 0) windowEnd = Math.min(windowEnd, totalNotes);
  ensureBuffer(windowEnd - 1);

  const visibleNotes = allNotes.slice(windowStart, windowEnd);
  const currentPos = currentIndex - windowStart;

  notationEl.innerHTML = "";

  const width = notationEl.clientWidth || 700;
  const height = 180;

  const renderer = new Renderer(notationEl, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();

  const styles = getComputedStyle(document.documentElement);
  const staffColor = styles.getPropertyValue("--staff-color").trim();
  const ledgerColor = styles.getPropertyValue("--text").trim();
  context.setFillStyle(staffColor);
  context.setStrokeStyle(staffColor);

  const staveWidth = width - 20;
  const stave = new Stave(10, 30, staveWidth);
  stave.addClef("treble");
  // Ledger lines default to a fixed dark grey (#444) that vanishes on dark
  // themes. The muted staff color was still too faint for these short
  // segments, so use the high-contrast text ink and a bolder stroke.
  stave.setDefaultLedgerLineStyle({
    strokeStyle: ledgerColor,
    fillStyle: ledgerColor,
    lineWidth: 2,
  });
  stave.setContext(context).draw();

  const staveNotes = visibleNotes.map((note, i) => {
    const octave = parseInt(note.key.split("/")[1], 10);
    const letter = note.key[0];
    const stemDown = octave >= 5 || (octave === 4 && letter === "b");
    const sn = new StaveNote({
      keys: [note.key],
      duration: "q",
      stem_direction: stemDown ? -1 : 1,
    });

    let color;
    if (i < currentPos) {
      color = styles.getPropertyValue("--note-past").trim();
    } else if (i === currentPos) {
      color = styles.getPropertyValue("--note-current").trim();
    } else {
      color = styles.getPropertyValue("--note-future").trim();
    }

    sn.setStyle({ fillStyle: color, strokeStyle: color });
    return sn;
  });

  if (staveNotes.length > 0) {
    const voice = new Voice({ num_beats: visibleNotes.length, beat_value: 4 });
    voice.addTickables(staveNotes);
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 70);
    voice.draw(context, stave);
  }
}

function triggerFeedback(type) {
  notationEl.classList.remove("anim-correct", "anim-wrong");
  void notationEl.offsetWidth;
  notationEl.classList.add(type === "correct" ? "anim-correct" : "anim-wrong");
}

notationEl.addEventListener("animationend", () => {
  notationEl.classList.remove("anim-correct", "anim-wrong");
});

function updateStatus() {
  scoreEl.textContent = String(correct);
  mistakesEl.textContent = String(wrong);
  streakEl.textContent = String(streak);
  const noteNumber = Math.min(currentIndex + 1, totalNotes);
  progressEl.textContent = `Nuotti ${noteNumber} / ${totalNotes}`;
}

function handleGuess(key) {
  if (!gameActive) return;

  const note = allNotes[currentIndex];
  if (!note) return;

  const isCorrect = key === note.name || (note.name === "h" && key === "b");

  if (isCorrect) {
    playPianoNote(note.key);
    correct += 1;
    streak += 1;
    currentIndex += 1;
    triggerFeedback("correct");
    updateStatus();
    if (currentIndex >= totalNotes) {
      endGame();
    } else {
      renderNotation();
    }
  } else {
    playErrorTone();
    wrong += 1;
    streak = 0;
    triggerFeedback("wrong");
    updateStatus();
  }
}

function startGame() {
  allNotes = [];
  currentIndex = 0;
  correct = 0;
  wrong = 0;
  streak = 0;
  renderNotation();
  updateStatus();
}

function buildNoteCountOptions() {
  noteCountOptionsEl.replaceChildren();
  for (const n of NOTE_COUNT_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "note-count-btn";
    btn.dataset.count = String(n);
    btn.textContent = String(n);
    noteCountOptionsEl.appendChild(btn);
  }
}

function buildNotePad() {
  if (!notePadEl) return;
  notePadEl.replaceChildren();
  for (const name of NOTE_PAD_KEYS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "note-pad-btn";
    btn.dataset.note = name;
    btn.textContent = name.toUpperCase();
    notePadEl.appendChild(btn);
  }
}

function showScreen(screen) {
  for (const s of [setupScreen, gameScreen, resultsScreen]) {
    s.hidden = s !== screen;
  }
}

function showSetup() {
  gameActive = false;
  showScreen(setupScreen);
}

function beginGame(noteCount) {
  totalNotes = noteCount;
  showScreen(gameScreen);
  startGame();
  gameActive = true;
}

function endGame() {
  gameActive = false;

  const total = correct + wrong;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const stats = [
    ["Oikein", correct],
    ["Väärin", wrong],
    ["Tarkkuus", `${accuracy} %`],
  ];

  resultsStatsEl.replaceChildren();
  for (const [label, value] of stats) {
    const row = document.createElement("div");
    row.className = "status-row";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    row.append(span, strong);
    resultsStatsEl.appendChild(row);
  }

  showScreen(resultsScreen);
}

window.addEventListener("keydown", (event) => {
  // On the results screen, Tab quickly replays the same number of notes.
  if (event.key === "Tab" && !resultsScreen.hidden) {
    event.preventDefault();
    beginGame(totalNotes);
    return;
  }
  const key = event.key.toLowerCase();
  if (!/^[a-z]$/.test(key)) return;
  handleGuess(key);
});

noteCountOptionsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-count]");
  if (!btn) return;
  beginGame(Number(btn.dataset.count));
});

playAgainBtn.addEventListener("click", showSetup);

notePadEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-note]");
  if (!btn) return;
  handleGuess(btn.dataset.note);
});

window.addEventListener("resize", () => {
  renderNotation();
});

const THEMES = [
  { id: "parchment", label: "Pergamentti", color: "#f4ede4", group: "light" },
  { id: "arctic", label: "Arktinen", color: "#f7fafd", group: "light" },
  { id: "espresso", label: "Espresso", color: "#271d14", group: "dark" },
  { id: "midnight", label: "Yö", color: "#1a2238", group: "dark" },
  { id: "nord", label: "Nord", color: "#3b4252", group: "dark" },
];

const themeToggle = document.getElementById("theme-toggle");
const themeMenu = document.getElementById("theme-menu");
const themeSwatch = document.getElementById("theme-swatch");
const themeLabel = document.getElementById("theme-label");

function buildThemeMenu() {
  themeMenu.replaceChildren();
  for (const [groupLabel, groupId] of [["Vaalea", "light"], ["Tumma", "dark"]]) {
    const section = document.createElement("div");
    section.className = "theme-menu-section";
    section.dataset.group = groupId;

    const header = document.createElement("div");
    header.className = "theme-menu-group";
    header.textContent = groupLabel;
    section.appendChild(header);

    for (const t of THEMES.filter((t) => t.group === groupId)) {
      const btn = document.createElement("button");
      btn.className = "theme-menu-item";
      btn.dataset.theme = t.id;
      btn.setAttribute("role", "option");

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = t.color;
      btn.appendChild(swatch);

      btn.appendChild(document.createTextNode(t.label));
      section.appendChild(btn);
    }
    themeMenu.appendChild(section);
  }
}

function applyTheme(themeId) {
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  document.documentElement.setAttribute("data-theme", theme.id);
  themeSwatch.style.background = theme.color;
  themeLabel.textContent = theme.label;
  themeMenu.querySelectorAll(".theme-menu-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme.id);
  });
  renderNotation();
}

buildThemeMenu();

const savedTheme = localStorage.getItem("theme");
const initialTheme =
  savedTheme === "dark"
    ? "espresso"
    : THEMES.find((t) => t.id === savedTheme)
      ? savedTheme
      : "parchment";
applyTheme(initialTheme);

themeToggle.addEventListener("click", () => {
  themeMenu.classList.toggle("open");
});

themeMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-theme]");
  if (!btn) return;
  const id = btn.dataset.theme;
  localStorage.setItem("theme", id);
  applyTheme(id);
  themeMenu.classList.remove("open");
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#theme-picker")) {
    themeMenu.classList.remove("open");
  }
});

buildNoteCountOptions();
buildNotePad();
showSetup();

// --- Ambient background: rising note particles + pointer parallax ---
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function buildNoteParticles(count = 9) {
  const layer = document.querySelector(".notes-layer");
  if (!layer) return;
  const glyphs = ["♪", "♫", "♩", "♬"];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "note-particle";
    el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    el.style.setProperty("--x", `${Math.random() * 100}%`);
    el.style.setProperty("--size", `${(1.2 + Math.random() * 2.2).toFixed(2)}rem`);
    el.style.setProperty("--dur", `${(14 + Math.random() * 12).toFixed(1)}s`);
    // Negative delay starts each note mid-flight, so the screen is never empty.
    el.style.setProperty("--delay", `${(-Math.random() * 26).toFixed(1)}s`);
    el.style.setProperty("--spin", `${Math.round(Math.random() * 80 - 40)}deg`);
    el.style.setProperty("--peak", (0.1 + Math.random() * 0.12).toFixed(2));
    layer.appendChild(el);
  }
}

if (!prefersReducedMotion) {
  buildNoteParticles();
  window.addEventListener("pointermove", (event) => {
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    document.documentElement.style.setProperty("--px", x.toFixed(3));
    document.documentElement.style.setProperty("--py", y.toFixed(3));
  });
}
