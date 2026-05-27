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

const CONTEXT_BEHIND = 2;

const notationEl = document.getElementById("notation");
const scoreEl = document.getElementById("score");
const mistakesEl = document.getElementById("mistakes");
const streakEl = document.getElementById("streak");

let allNotes = [];
let currentIndex = 0;
let correct = 0;
let wrong = 0;
let streak = 0;

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

function renderNotation() {
  const visibleCount = getVisibleCount();
  const windowStart = Math.max(0, currentIndex - CONTEXT_BEHIND);
  const windowEnd = windowStart + visibleCount;
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
  context.setFillStyle(staffColor);
  context.setStrokeStyle(staffColor);

  const staveWidth = width - 20;
  const stave = new Stave(10, 30, staveWidth);
  stave.addClef("treble");
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

  const voice = new Voice({ num_beats: visibleNotes.length, beat_value: 4 });
  voice.addTickables(staveNotes);
  new Formatter().joinVoices([voice]).format([voice], staveWidth - 70);
  voice.draw(context, stave);
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
}

function handleGuess(key) {
  const note = allNotes[currentIndex];
  if (!note) return;

  const isCorrect = key === note.name || (note.name === "h" && key === "b");

  if (isCorrect) {
    playPianoNote(note.key);
    correct += 1;
    streak += 1;
    currentIndex += 1;
    triggerFeedback("correct");
    renderNotation();
    updateStatus();
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

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (!/^[a-z]$/.test(key)) return;
  handleGuess(key);
});

window.addEventListener("resize", () => {
  renderNotation();
});

const THEMES = [
  { id: "parchment", label: "Pergamentti", color: "#f4ede4", group: "light" },
  { id: "arctic", label: "Arktinen", color: "#f7fafd", group: "light" },
  { id: "sakura", label: "Sakura", color: "#fdf5f8", group: "light" },
  { id: "meadow", label: "Niitty", color: "#f5faf4", group: "light" },
  { id: "espresso", label: "Espresso", color: "#2a2520", group: "dark" },
  { id: "midnight", label: "Yö", color: "#1a2238", group: "dark" },
  { id: "nord", label: "Nord", color: "#3b4252", group: "dark" },
  { id: "forest", label: "Metsä", color: "#1e2a20", group: "dark" },
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

startGame();
