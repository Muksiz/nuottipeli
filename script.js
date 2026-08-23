const { Renderer, Stave, StaveNote, Voice, Formatter, TickContext } = Vex.Flow;

// --- Piano audio synthesis ---
// Frequencies are derived from the note key (e.g. "c/4") in equal temperament
// rather than stored in a table, so any note added to any clef gets audio for
// free. A4 ("a/4") = 440 Hz is the reference; each semitone multiplies by
// 2^(1/12). MIDI note 69 is A4, which anchors the formula.
const SEMITONE_FROM_C = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function noteFrequency(noteKey) {
  const [letter, octaveStr] = noteKey.split("/");
  const midi = (parseInt(octaveStr, 10) + 1) * 12 + SEMITONE_FROM_C[letter];
  return 440 * 2 ** ((midi - 69) / 12);
}

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playPianoNote(noteKey, duration = 1.2) {
  const freq = noteFrequency(noteKey);
  if (!Number.isFinite(freq)) return;

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

// --- Clefs ---
// Each note key maps to a rung on the diatonic ladder (7 letters per octave).
// diatonicStep turns "c/4" into an absolute rung number, so we can ask "is this
// note at or above the clef's middle line?" — the rule that decides stem
// direction, independent of which clef is showing.
const LETTER_STEP = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };

function diatonicStep(noteKey) {
  const [letter, octaveStr] = noteKey.split("/");
  return parseInt(octaveStr, 10) * 7 + LETTER_STEP[letter];
}

// --- Language ---
// Finnish is the default; Swedish is a full translation of the same UI. Note
// names are shared, not translated: both languages use the Nordic convention
// where the note B is called "H".
const LANGUAGES = [
  { id: "fi", label: "Suomi", code: "FI" },
  { id: "sv", label: "Svenska", code: "SV" },
];

const DEFAULT_LANGUAGE_ID = "fi";
const LANG_STORAGE_KEY = "language";

// Every user-visible string lives here, keyed the same way in both languages.
// Markup-free: the one sentence that wraps a <kbd> is split into the halves
// around it (results.hintBefore / results.hintAfter).
const STRINGS = {
  fi: {
    "app.title": "Nuottien tunnistaminen",
    "settings.title": "Asetukset",
    "settings.reset": "Palauta oletukset",
    "settings.done": "Valmis",
    "settings.language": "Kieli",
    "settings.clef": "Nuottiavain",
    "settings.theme": "Teema",
    "settings.ranges": "Nuottialueet",
    "settings.noNotes": "T\u00e4ll\u00e4 avaimella ei ole viel\u00e4 nuotteja.",
    "setup.title": "Valitse vaikeustaso ja nuottien m\u00e4\u00e4r\u00e4.",
    "setup.difficulty": "Vaikeustaso",
    "setup.noteCount": "Nuottien m\u00e4\u00e4r\u00e4",
    "game.correct": "Oikein",
    "game.wrong": "V\u00e4\u00e4rin",
    "game.streak": "Putki",
    "game.notePad": "Nuottipainikkeet",
    "game.progress": "Nuotti {index} / {total}",
    "game.emptyPool": "Lis\u00e4\u00e4 t\u00e4m\u00e4n avaimen nuotit (CLEFS, script.js).",
    "results.title": "Peli ohi!",
    "results.playAgain": "Pelaa uudelleen",
    "results.hintBefore": "Paina",
    "results.hintAfter": "pelataksesi uudelleen samalla nuottim\u00e4\u00e4r\u00e4ll\u00e4.",
    "results.accuracy": "Tarkkuus",
    "clef.treble": "G-avain",
    "clef.alto": "C-avain",
    "clef.bass": "F-avain",
    "difficulty.easy": "Helppo",
    "difficulty.medium": "Keskitaso",
    "difficulty.hard": "Vaikea",
    "theme.groupLight": "Vaalea",
    "theme.groupDark": "Tumma",
    "theme.parchment": "Pergamentti",
    "theme.arctic": "Arktinen",
    "theme.espresso": "Espresso",
    "theme.midnight": "Y\u00f6",
    "theme.storm": "Myrsky",
  },
  sv: {
    "app.title": "Notl\u00e4sning",
    "settings.title": "Inst\u00e4llningar",
    "settings.reset": "Standardinst\u00e4llningar",
    "settings.done": "Klar",
    "settings.language": "Spr\u00e5k",
    "settings.clef": "Klav",
    "settings.theme": "Tema",
    "settings.ranges": "Notomr\u00e5den",
    "settings.noNotes": "Den h\u00e4r klaven har inga noter \u00e4nnu.",
    "setup.title": "V\u00e4lj sv\u00e5righetsgrad och antal noter.",
    "setup.difficulty": "Sv\u00e5righetsgrad",
    "setup.noteCount": "Antal noter",
    "game.correct": "R\u00e4tt",
    "game.wrong": "Fel",
    "game.streak": "I rad",
    "game.notePad": "Notknappar",
    "game.progress": "Not {index} / {total}",
    "game.emptyPool": "L\u00e4gg till noter f\u00f6r den h\u00e4r klaven (CLEFS, script.js).",
    "results.title": "Spelet \u00e4r slut!",
    "results.playAgain": "Spela igen",
    "results.hintBefore": "Tryck p\u00e5",
    "results.hintAfter": "f\u00f6r att spela igen med samma antal noter.",
    "results.accuracy": "Tr\u00e4ffs\u00e4kerhet",
    "clef.treble": "G-klav",
    "clef.alto": "C-klav",
    "clef.bass": "F-klav",
    "difficulty.easy": "L\u00e4tt",
    "difficulty.medium": "Medel",
    "difficulty.hard": "Sv\u00e5r",
    "theme.groupLight": "Ljus",
    "theme.groupDark": "M\u00f6rk",
    "theme.parchment": "Pergament",
    "theme.arctic": "Arktisk",
    "theme.espresso": "Espresso",
    "theme.midnight": "Natt",
    "theme.storm": "Storm",
  },
};

function findLanguage(langId) {
  return (
    LANGUAGES.find((l) => l.id === langId) ??
    LANGUAGES.find((l) => l.id === DEFAULT_LANGUAGE_ID)
  );
}

// Resolved before anything is drawn: the clef, theme and difficulty labels are
// all looked up through t() while their menus are built.
let currentLanguage = findLanguage(localStorage.getItem(LANG_STORAGE_KEY));

// A missing key falls back to Finnish rather than blanking the UI, so a
// half-finished translation still leaves a usable page.
function t(key, vars) {
  const table = STRINGS[currentLanguage.id] ?? STRINGS[DEFAULT_LANGUAGE_ID];
  const template = table[key] ?? STRINGS[DEFAULT_LANGUAGE_ID][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

const CLEFS = [
  {
    id: "treble",
    glyph: "𝄞",
    // The middle (3rd) staff line is B4. Notes at or above it stem downward.
    middleLine: "b/4",
    notePool: [
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
    ],
  },
  {
    id: "alto",
    glyph: "𝄡",
    // The middle (3rd) line of the alto (C) clef is middle C itself.
    middleLine: "c/4",
    // Mirrors the treble pool's geometry on the alto staff: 5 steps below the
    // bottom line (F3) through 4 above the top line (G4), i.e. a/2 to d/5,
    // centered on middle C with two ledger lines either side.
    notePool: [
      { key: "a/2", name: "a" },
      { key: "b/2", name: "h" },
      { key: "c/3", name: "c" },
      { key: "d/3", name: "d" },
      { key: "e/3", name: "e" },
      { key: "f/3", name: "f" },
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
    ],
  },
  {
    id: "bass",
    glyph: "𝄢",
    // The middle (3rd) staff line of the bass clef is D3.
    middleLine: "d/3",
    // Kept in range of the staff: from e/2 (one ledger line below) up through
    // e/4 (two ledger lines above), passing middle C (c/4) on the first ledger
    // line above. Leans slightly upward, where bass-clef reading actually
    // lives, rather than diving into the rarely-read low ledger notes.
    notePool: [
      { key: "e/2", name: "e" },
      { key: "f/2", name: "f" },
      { key: "g/2", name: "g" },
      { key: "a/2", name: "a" },
      { key: "b/2", name: "h" },
      { key: "c/3", name: "c" },
      { key: "d/3", name: "d" },
      { key: "e/3", name: "e" },
      { key: "f/3", name: "f" },
      { key: "g/3", name: "g" },
      { key: "a/3", name: "a" },
      { key: "b/3", name: "h" },
      { key: "c/4", name: "c" },
      { key: "d/4", name: "d" },
      { key: "e/4", name: "e" },
    ],
  },
];

let currentClef = CLEFS[0];

// --- Difficulty ---
// Difficulty only narrows *which* notes can appear: every level draws from the
// active clef's pool, cropped to a band centered on the clef's middle staff
// line. `spread` is that band's half-width in diatonic steps (see
// diatonicStep). A staff spans 4 steps either side of its middle line, so
// spread 4 keeps every note on the staff itself, 6 allows one ledger line
// above and below, and `null` means the whole pool — ledger lines included.
const DIFFICULTIES = [
  { id: "easy", spread: 4 },
  { id: "medium", spread: 6 },
  { id: "hard", spread: null },
];

const DEFAULT_DIFFICULTY_ID = "medium";

function findDifficulty(difficultyId) {
  return (
    DIFFICULTIES.find((d) => d.id === difficultyId) ??
    DIFFICULTIES.find((d) => d.id === DEFAULT_DIFFICULTY_ID)
  );
}

// Restored here rather than in the init block at the bottom of the file: the
// theme and clef setup both render the staff on load, and those renders draw
// from this pool. Resolving the saved level up front keeps the first notes
// drawn consistent with the highlighted button, whatever runs first.
let currentDifficulty = findDifficulty(localStorage.getItem("difficulty"));

// --- Note ranges ---
// `spread` above is only the *default*. The player can widen or narrow any
// level from the setup screen, and those choices are stored per clef and per
// level (a range that makes sense in the treble clef would be nonsense in the
// bass one) under localStorage key "noteRanges", as
// { "<clefId>:<difficultyId>": { low, high } } note keys.
const RANGE_STORAGE_KEY = "noteRanges";

function loadRanges() {
  try {
    const saved = JSON.parse(localStorage.getItem(RANGE_STORAGE_KEY));
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    // Corrupt or hand-edited storage shouldn't take the game down with it.
    return {};
  }
}

let noteRanges = loadRanges();

function rangeKey(clefId, difficultyId) {
  return `${clefId}:${difficultyId}`;
}

// The level's built-in range: the clef's pool cropped to a band centered on the
// middle staff line, expressed as its lowest and highest note. Pools are listed
// low to high, so the band's ends are its first and last entries.
function defaultRange(clef, difficulty) {
  const pool = clef.notePool;
  if (pool.length === 0) return null;
  const { spread } = difficulty;
  if (spread === null) return { low: pool[0].key, high: pool.at(-1).key };
  const middle = diatonicStep(clef.middleLine);
  const inBand = pool.filter(
    (note) => Math.abs(diatonicStep(note.key) - middle) <= spread,
  );
  // A clef whose pool sits entirely outside the band would leave nothing to
  // draw; fall back to the full pool rather than an empty staff.
  const band = inBand.length > 0 ? inBand : pool;
  return { low: band[0].key, high: band.at(-1).key };
}

// The range in force for a clef/level pair: the saved one when it still names
// notes this clef has, otherwise the default. Reversed ends are swapped rather
// than rejected, so an out-of-order pick still yields a playable range.
function rangeFor(clef, difficulty) {
  const fallback = defaultRange(clef, difficulty);
  const saved = noteRanges[rangeKey(clef.id, difficulty.id)];
  if (!fallback || !saved) return fallback;
  const keys = clef.notePool.map((note) => note.key);
  if (!keys.includes(saved.low) || !keys.includes(saved.high)) return fallback;
  return diatonicStep(saved.low) <= diatonicStep(saved.high)
    ? { low: saved.low, high: saved.high }
    : { low: saved.high, high: saved.low };
}

// The notes actually in play: the current clef's pool cropped to the range of
// the current difficulty. Cropping (rather than listing a pool per clef per
// difficulty) keeps a new clef working at every level as soon as its notePool
// is filled in.
function activeNotePool() {
  const range = rangeFor(currentClef, currentDifficulty);
  if (!range) return currentClef.notePool;
  const low = diatonicStep(range.low);
  const high = diatonicStep(range.high);
  const pool = currentClef.notePool.filter((note) => {
    const step = diatonicStep(note.key);
    return step >= low && step <= high;
  });
  return pool.length > 0 ? pool : currentClef.notePool;
}

// "b/4" in the treble pool reads as "H4": Finnish note name, uppercase, with
// the octave number kept so two same-named notes stay tellable apart.
function noteLabel(clef, key) {
  const note = clef.notePool.find((n) => n.key === key);
  const [letter, octave] = key.split("/");
  return `${(note ? note.name : letter).toUpperCase()}${octave}`;
}

const notationEl = document.getElementById("notation");
const scoreEl = document.getElementById("score");
const mistakesEl = document.getElementById("mistakes");
const streakEl = document.getElementById("streak");
const progressEl = document.getElementById("progress");
const setupScreen = document.getElementById("setup-screen");
const gameScreen = document.getElementById("game-screen");
const resultsScreen = document.getElementById("results-screen");
const noteCountOptionsEl = document.getElementById("note-count-options");
const difficultyOptionsEl = document.getElementById("difficulty-options");
const resultsStatsEl = document.getElementById("results-stats");
const resultsFaceEl = document.getElementById("results-face");
const appSettingsToggle = document.getElementById("app-settings-toggle");
const appSettingsMenu = document.getElementById("app-settings-menu");
const appSettingsBackdrop = document.getElementById("app-settings-backdrop");
const rangeRowsEl = document.getElementById("range-rows");
const settingsResetBtn = document.getElementById("settings-reset");
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
  const pool = activeNotePool();
  return pool[Math.floor(Math.random() * pool.length)];
}

function ensureBuffer(upTo) {
  // Nothing to draw until the active clef has notes defined.
  if (currentClef.notePool.length === 0) return;
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
  stave.addClef(currentClef.id);
  // Ledger lines default to a fixed dark grey (#444) that vanishes on dark
  // themes. The muted staff color was still too faint for these short
  // segments, so use the high-contrast text ink and a bolder stroke.
  stave.setDefaultLedgerLineStyle({
    strokeStyle: ledgerColor,
    fillStyle: ledgerColor,
    lineWidth: 2,
  });
  stave.setContext(context).draw();

  // The clef is drawn, but there are no notes to place yet (e.g. an unfilled
  // pool). Show a gentle hint instead of an empty staff.
  if (currentClef.notePool.length === 0) {
    const hint = document.createElement("p");
    hint.className = "clef-empty-hint";
    hint.textContent = t("game.emptyPool");
    notationEl.appendChild(hint);
    return;
  }

  const staveNotes = visibleNotes.map((note, i) => {
    // Notes sitting at or above the clef's middle line get a downward stem.
    const stemDown = diatonicStep(note.key) >= diatonicStep(currentClef.middleLine);
    const sn = new StaveNote({
      keys: [note.key],
      duration: "q",
      // Without this the note positions itself for the treble clef regardless
      // of the glyph drawn on the stave, sinking bass notes ~2 octaves too low.
      clef: currentClef.id,
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
  progressEl.textContent = t("game.progress", {
    index: noteNumber,
    total: totalNotes,
  });
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

function buildDifficultyOptions() {
  difficultyOptionsEl.replaceChildren();
  for (const d of DIFFICULTIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "difficulty-btn";
    btn.dataset.difficulty = d.id;
    const active = d.id === currentDifficulty.id;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));

    const label = document.createElement("span");
    label.className = "difficulty-name";
    label.textContent = t(`difficulty.${d.id}`);

    btn.append(label);
    difficultyOptionsEl.appendChild(btn);
  }
}

// One row per level: the level's name above a staff showing the clef's whole
// pool with the level's range highlighted. The staff is drawn by
// renderRangeStaff once the row is in the document and has a width.
function buildRangeRows() {
  rangeRowsEl.replaceChildren();

  if (currentClef.notePool.length === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = t("settings.noNotes");
    rangeRowsEl.appendChild(empty);
    return;
  }

  for (const d of DIFFICULTIES) {
    const row = document.createElement("div");
    row.className = "range-row";
    row.dataset.difficulty = d.id;

    const name = document.createElement("span");
    name.className = "range-row-name";
    name.textContent = t(`difficulty.${d.id}`);

    const staff = document.createElement("div");
    staff.className = "range-staff";
    staff.dataset.difficulty = d.id;

    row.append(name, staff);
    rangeRowsEl.appendChild(row);
  }

  renderRangeStaves();
}

// Draws every note of the pool on a staff of its own, in-range notes in the
// current-note color and the rest faded, then lays a transparent button over
// each note's column so the whole height of the staff is clickable — hitting a
// notehead exactly would be hopeless on a phone.
//
// Both the height and the note spacing are computed rather than fixed: a pool
// reaching two ledger lines above and below needs more vertical room than one
// that stays on the staff, and the notes are placed at even intervals of our
// own choosing so the tail of a long pool cannot bunch up past the stave's
// right edge the way an auto-justified voice does.
function renderRangeStaff(staffEl) {
  const difficulty = findDifficulty(staffEl.dataset.difficulty);
  const range = rangeFor(currentClef, difficulty);
  const pool = currentClef.notePool;
  if (!range || pool.length === 0) return;

  // A hidden dialog gives its staves no width. Drawing one at a made-up width
  // is worse than not drawing it: the over-wide SVG widens the grid track it
  // sits in, and the re-render when the dialog opens then measures that
  // inflated track instead of the dialog. Leave it until it has a width —
  // setAppSettingsOpen draws the staves once the dialog is on screen.
  const width = staffEl.clientWidth;
  if (width === 0) return;

  staffEl.replaceChildren();

  // VexFlow's staff lines sit 10px apart, so one diatonic step is 5px.
  const STEP_PX = 5;
  const steps = pool.map((note) => diatonicStep(note.key));
  const middle = diatonicStep(currentClef.middleLine);
  const aboveTop = Math.max(0, Math.max(...steps) - (middle + 4));
  const belowBottom = Math.max(0, middle - 4 - Math.min(...steps));
  // The clef glyph itself overhangs the staff, which sets the minimums.
  const padTop = Math.max(20, aboveTop * STEP_PX + 18);
  const padBottom = Math.max(30, belowBottom * STEP_PX + 18);
  // A Stave draws its top line four line-spaces below the y it is given —
  // room it reserves for ledger lines — so the y we want is that much higher.
  const STAVE_TOP_RESERVE = 40;
  const staveY = Math.max(0, padTop - STAVE_TOP_RESERVE);
  const height = staveY + STAVE_TOP_RESERVE + 40 + padBottom;

  const renderer = new Renderer(staffEl, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();

  const styles = getComputedStyle(document.documentElement);
  const staffColor = styles.getPropertyValue("--staff-color").trim();
  const ledgerColor = styles.getPropertyValue("--text").trim();
  const inColor = styles.getPropertyValue("--note-current").trim();
  const outColor = styles.getPropertyValue("--note-future").trim();
  context.setFillStyle(staffColor);
  context.setStrokeStyle(staffColor);

  const staveX = 2;
  const staveWidth = width - 4;
  const stave = new Stave(staveX, staveY, staveWidth);
  stave.addClef(currentClef.id);
  stave.setDefaultLedgerLineStyle({
    strokeStyle: ledgerColor,
    fillStyle: ledgerColor,
    lineWidth: 2,
  });
  stave.setContext(context).draw();

  const low = diatonicStep(range.low);
  const high = diatonicStep(range.high);

  // Whole notes: no stems to clutter a staff that is a control, not music.
  const staveNotes = pool.map((note, i) => {
    const inRange = steps[i] >= low && steps[i] <= high;
    const sn = new StaveNote({
      keys: [note.key],
      duration: "w",
      clef: currentClef.id,
    });
    const color = inRange ? inColor : outColor;
    sn.setStyle({ fillStyle: color, strokeStyle: color });
    sn.setContext(context).setStave(stave);
    // Each note gets a tick context of its own so its x is ours to set; the
    // x we hand it is measured from where the stave's notes begin.
    new TickContext().addTickable(sn).preFormat().setX(0);
    return sn;
  });

  // Where a note placed at x = 0 actually lands, i.e. just past the clef.
  const baseX = staveNotes[0].getAbsoluteX();
  // Insets keep the first and last noteheads — and their ledger lines — clear
  // of the clef and of the stave's right edge.
  const first = 10;
  const last = Math.max(first, staveX + staveWidth - 24 - baseX);
  const gap = pool.length > 1 ? (last - first) / (pool.length - 1) : 0;

  staveNotes.forEach((sn, i) => {
    sn.getTickContext().setX(first + i * gap);
    sn.draw();
  });

  const xs = staveNotes.map((sn) => sn.getAbsoluteX());

  // The band spanning the range. Drawn before the hit areas so their hover
  // highlight still reads on top of it, and positioned before it is in the
  // document so its first paint doesn't animate in from nowhere.
  const band = document.createElement("div");
  band.className = "range-band";
  positionRangeBand(
    band,
    pool.map((note, i) => ({ key: note.key, x: xs[i] })),
    gap,
    range,
  );
  staffEl.appendChild(band);
  // Kept for the drag, which repositions the band without redrawing the staff.
  staffEl.dataset.noteGap = String(gap);

  // Column boundaries sit halfway between neighbouring noteheads, so every
  // pixel of the staff belongs to exactly one note.
  pool.forEach((note, i) => {
    const left = i === 0 ? 0 : (xs[i - 1] + xs[i]) / 2;
    const right = i === pool.length - 1 ? width : (xs[i] + xs[i + 1]) / 2;

    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = "range-hit";
    hit.dataset.difficulty = difficulty.id;
    hit.dataset.key = note.key;
    hit.dataset.x = String(xs[i]);
    hit.style.left = `${left}px`;
    hit.style.width = `${right - left}px`;
    hit.setAttribute(
      "aria-pressed",
      String(steps[i] >= low && steps[i] <= high),
    );
    hit.setAttribute(
      "aria-label",
      `${t(`difficulty.${difficulty.id}`)}: ${noteLabel(currentClef, note.key)}`,
    );
    staffEl.appendChild(hit);
  });
}

function renderRangeStaves() {
  rangeRowsEl.querySelectorAll(".range-staff").forEach(renderRangeStaff);
}

// The band is drawn from the noteheads rather than from the column
// boundaries: a column at either end of the pool runs to the edge of the
// staff, and a band that ran out under the clef would read as a mistake.
function positionRangeBand(band, columns, gap, range) {
  const lowIdx = columns.findIndex((col) => col.key === range.low);
  const highIdx = columns.findIndex((col) => col.key === range.high);
  if (lowIdx < 0 || highIdx < 0) return;
  const pad = Math.max(8, Math.min(16, gap / 2));
  band.style.left = `${columns[lowIdx].x - pad}px`;
  band.style.width = `${columns[highIdx].x - columns[lowIdx].x + pad * 2}px`;
}

// Which end of the range a note grabs: the nearer one, so a note outside the
// range pulls that end outward and one inside pushes it inward. A range
// collapsed onto a single note has no nearer end — there the note itself
// decides which way the range opens.
function edgeNearest(range, key) {
  const step = diatonicStep(key);
  const low = diatonicStep(range.low);
  const high = diatonicStep(range.high);
  if (low === high) return step >= low ? "high" : "low";
  return Math.abs(step - low) <= Math.abs(step - high) ? "low" : "high";
}

// The range with one end moved to a note. The moved end stops at the other
// rather than crossing it, so the range can shrink to a single note but never
// inverts.
function rangeWithEdgeAt(range, edge, key) {
  const step = diatonicStep(key);
  if (edge === "low") {
    return {
      low: step > diatonicStep(range.high) ? range.high : key,
      high: range.high,
    };
  }
  return {
    low: range.low,
    high: step < diatonicStep(range.low) ? range.low : key,
  };
}

// Saves a range and redraws the one staff it belongs to. An edit that changes
// nothing is dropped here rather than at each call site: the click that
// follows a tap re-applies the same edit, and redrawing for it would flicker.
function commitRange(difficulty, range) {
  const current = rangeFor(currentClef, difficulty);
  if (current && current.low === range.low && current.high === range.high) {
    return;
  }
  noteRanges[rangeKey(currentClef.id, difficulty.id)] = { ...range };
  localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(noteRanges));
  const staffEl = rangeRowsEl.querySelector(
    `.range-staff[data-difficulty="${difficulty.id}"]`,
  );
  if (staffEl) renderRangeStaff(staffEl);
}

// The click path, which after the drag handlers below is left serving the
// keyboard: Enter or Space on a focused note.
function setRangeFromNote(difficultyId, key) {
  const difficulty = findDifficulty(difficultyId);
  const range = rangeFor(currentClef, difficulty);
  if (!range) return;
  commitRange(difficulty, rangeWithEdgeAt(range, edgeNearest(range, key), key));
}

// --- Dragging an end of the range ---
// At phone widths a note's column is only ~15px wide, far too small to aim a
// finger at. So the whole staff is the control: a press anywhere grabs the
// nearer end of the range, and sliding drags it from note to note while the
// band tracks the finger — you steer by the band, not by hitting a column.
// Only the band moves during the drag; the staff is redrawn once, on release.
let rangeDrag = null;

// How far a press has to travel sideways before it counts as a drag. Below
// this it is still a tap, and a vertical swipe that started on a staff is left
// to scroll the dialog (see touch-action: pan-y on .range-staff).
const RANGE_DRAG_SLOP = 6;

function staffColumns(staffEl) {
  return [...staffEl.querySelectorAll(".range-hit")].map((hit) => ({
    key: hit.dataset.key,
    x: Number(hit.dataset.x),
    left: hit.offsetLeft,
    right: hit.offsetLeft + hit.offsetWidth,
  }));
}

// The note under a point on the staff. A finger that has slid off either end
// keeps dragging the outermost note rather than losing the drag.
function columnKeyAt(columns, offsetX) {
  const column = columns.find(
    (col) => offsetX >= col.left && offsetX < col.right,
  );
  if (column) return column.key;
  return offsetX < columns[0].left ? columns[0].key : columns.at(-1).key;
}

function offsetXOf(staffEl, event) {
  return event.clientX - staffEl.getBoundingClientRect().left;
}

function drawDragBand() {
  positionRangeBand(
    rangeDrag.band,
    rangeDrag.columns,
    rangeDrag.gap,
    rangeDrag.range,
  );
}

function endRangeDrag() {
  if (
    rangeDrag.moved &&
    rangeDrag.staffEl.hasPointerCapture(rangeDrag.pointerId)
  ) {
    rangeDrag.staffEl.releasePointerCapture(rangeDrag.pointerId);
  }
  rangeDrag = null;
}

rangeRowsEl.addEventListener("pointerdown", (event) => {
  // Left button / primary touch only: a right-click shouldn't move the range.
  if (event.button !== 0) return;
  const staffEl = event.target.closest(".range-staff");
  if (!staffEl) return;

  const columns = staffColumns(staffEl);
  if (columns.length === 0) return;

  const difficulty = findDifficulty(staffEl.dataset.difficulty);
  const range = rangeFor(currentClef, difficulty);
  const band = staffEl.querySelector(".range-band");
  if (!range || !band) return;

  const key = columnKeyAt(columns, offsetXOf(staffEl, event));
  const edge = edgeNearest(range, key);

  rangeDrag = {
    pointerId: event.pointerId,
    staffEl,
    band,
    columns,
    gap: Number(staffEl.dataset.noteGap) || 0,
    difficulty,
    // Kept so a gesture the browser takes over can be put back.
    committed: range,
    range: rangeWithEdgeAt(range, edge, key),
    edge,
    startX: event.clientX,
    moved: false,
  };
  drawDragBand();
});

// On the window rather than the staff: the first move has to be seen before
// the pointer is captured, and by then the finger may already be elsewhere.
window.addEventListener("pointermove", (event) => {
  if (!rangeDrag || event.pointerId !== rangeDrag.pointerId) return;

  if (!rangeDrag.moved) {
    if (Math.abs(event.clientX - rangeDrag.startX) < RANGE_DRAG_SLOP) return;
    rangeDrag.moved = true;
    // From here the drag owns the pointer, so it keeps tracking even when the
    // finger wanders off the staff.
    rangeDrag.staffEl.setPointerCapture(rangeDrag.pointerId);
  }

  const key = columnKeyAt(
    rangeDrag.columns,
    offsetXOf(rangeDrag.staffEl, event),
  );
  rangeDrag.range = rangeWithEdgeAt(rangeDrag.range, rangeDrag.edge, key);
  drawDragBand();
});

window.addEventListener("pointerup", (event) => {
  if (!rangeDrag || event.pointerId !== rangeDrag.pointerId) return;
  const { difficulty, range } = rangeDrag;
  endRangeDrag();
  commitRange(difficulty, range);
});

window.addEventListener("pointercancel", (event) => {
  if (!rangeDrag || event.pointerId !== rangeDrag.pointerId) return;
  // The browser took the gesture over to scroll: leave the range alone and put
  // the band back where the saved one is.
  const { band, columns, gap, committed } = rangeDrag;
  endRangeDrag();
  positionRangeBand(band, columns, gap, committed);
});

function applyDifficulty(difficultyId) {
  currentDifficulty = findDifficulty(difficultyId);
  difficultyOptionsEl.querySelectorAll("[data-difficulty]").forEach((btn) => {
    const active = btn.dataset.difficulty === currentDifficulty.id;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
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

// The closing emoji reacts to how clean the round was. Accuracy is the right
// signal here: since a note can't be passed until it's answered correctly, the
// only thing that varies is how many wrong guesses it took. Tiers are checked
// top-down — the first one whose `min` accuracy is reached wins — so keep them
// ordered high to low. Tweak the thresholds or swap the emoji to taste.
const FACE_TIERS = [
  { min: 100, emoji: "🥳" }, // flawless
  { min: 90, emoji: "😄" }, //  great
  { min: 80, emoji: "🙂" }, //  good
  { min: 70, emoji: "😐" }, //  neutral
  { min: 55, emoji: "😕" }, //  shaky
  { min: 0, emoji: "😢" }, //   rough
];

function faceForAccuracy(accuracy) {
  return FACE_TIERS.find((tier) => accuracy >= tier.min) ?? FACE_TIERS.at(-1);
}

// Kept so the results can be redrawn in the other language while they are
// still on screen.
let lastAccuracy = 0;

function renderResults(accuracy) {
  resultsFaceEl.textContent = faceForAccuracy(accuracy).emoji;

  const stats = [
    [t("game.correct"), correct],
    [t("game.wrong"), wrong],
    [t("results.accuracy"), `${accuracy} %`],
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
}

function endGame() {
  gameActive = false;

  const total = correct + wrong;
  lastAccuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  renderResults(lastAccuracy);
  showScreen(resultsScreen);
}

window.addEventListener("keydown", (event) => {
  // The settings dialog owns the keyboard while it is open, so a stray letter
  // there is not counted as an answer.
  if (!appSettingsMenu.hidden) return;
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

difficultyOptionsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-difficulty]");
  if (!btn) return;
  localStorage.setItem("difficulty", btn.dataset.difficulty);
  applyDifficulty(btn.dataset.difficulty);
});

// Mouse and touch are served by the drag handlers, so what is left here is the
// keyboard: Enter or Space on a focused note. A press has already applied
// itself by the time the click it leaves behind arrives, and re-applying it
// would not even be a no-op — where the press had to stop the dragged end at
// the other one, the click would read the clamped range and move the far end
// instead. detail is 0 only for a keyboard activation; every pointer-derived
// click, tap included, counts at least one.
rangeRowsEl.addEventListener("click", (event) => {
  if (event.detail !== 0) return;
  const hit = event.target.closest(".range-hit");
  if (!hit) return;
  setRangeFromNote(hit.dataset.difficulty, hit.dataset.key);
});

settingsResetBtn.addEventListener("click", () => {
  // Only this clef's levels are cleared: the panel edits one clef at a time,
  // so resetting all of them would be a surprise.
  for (const d of DIFFICULTIES) {
    delete noteRanges[rangeKey(currentClef.id, d.id)];
  }
  localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(noteRanges));
  buildRangeRows();
});

playAgainBtn.addEventListener("click", showSetup);

notePadEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-note]");
  if (!btn) return;
  handleGuess(btn.dataset.note);
});

window.addEventListener("resize", () => {
  renderNotation();
  if (!appSettingsMenu.hidden) renderRangeStaves();
});

// --- Language picker (a section of the settings menu) ---
const langMenu = document.getElementById("lang-menu");

function buildLangMenu() {
  langMenu.replaceChildren();
  for (const lang of LANGUAGES) {
    const btn = document.createElement("button");
    btn.className = "lang-menu-item";
    btn.dataset.lang = lang.id;
    btn.setAttribute("role", "option");
    btn.classList.toggle("active", lang.id === currentLanguage.id);

    // A two-letter badge rather than a flag emoji: flags render as bare
    // letter pairs wherever the emoji font lacks them.
    const code = document.createElement("span");
    code.className = "lang-code";
    code.textContent = lang.code;
    btn.appendChild(code);

    // Language names are never translated: someone hunting for Swedish looks
    // for "Svenska", whatever the page currently speaks.
    btn.appendChild(document.createTextNode(lang.label));
    langMenu.appendChild(btn);
  }
}

// The markup holds the Finnish text plus a data-i18n key naming its string;
// data-i18n-aria does the same for labels that are only read out.
function translateStaticText() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
}

// Everything drawn from JS carries a translated label somewhere, so switching
// language simply rebuilds it — the builders re-mark the active entries, which
// keeps the selections intact. A running game is deliberately left running:
// only the words change.
function applyLanguage(langId) {
  currentLanguage = findLanguage(langId);
  document.documentElement.lang = currentLanguage.id;
  // <title> carries a data-i18n key like every other static string.
  translateStaticText();
  buildLangMenu();
  buildThemeMenu();
  buildClefMenu();
  buildDifficultyOptions();
  buildRangeRows();
  renderNotation();
  if (gameActive) updateStatus();
  if (!resultsScreen.hidden) renderResults(lastAccuracy);
}

langMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-lang]");
  if (!btn) return;
  const id = btn.dataset.lang;
  localStorage.setItem(LANG_STORAGE_KEY, id);
  applyLanguage(id);
});

// `chip` is the palette the picker's miniature staff is drawn in: the theme's
// --notation-bg, --notation-border, --staff-color and --note-current. They are
// repeated here because the chip is built in JS, while the palettes live in CSS
// where only the theme in use can be read.
const THEMES = [
  { id: "parchment", group: "light", chip: { bg: "#ece5da", border: "#d4cabb", line: "#6b5e50", note: "#b86a3e" } },
  { id: "arctic", group: "light", chip: { bg: "#edf3f9", border: "#d0dce8", line: "#5a7a94", note: "#d45d5d" } },
  { id: "espresso", group: "dark", chip: { bg: "#1d150e", border: "#3e3125", line: "#bca387", note: "#ec9a44" } },
  { id: "midnight", group: "dark", chip: { bg: "#151d30", border: "#2a3654", line: "#8098c0", note: "#e0884a" } },
  { id: "storm", group: "dark", chip: { bg: "#353b49", border: "#4c566a", line: "#a0aec0", note: "#bf616a" } },
];

// A three-line staff carrying one note, in place of a plain colour dot: it
// shows what the theme does to the notation rather than just its paper colour,
// and it does not read as an empty radio button the way a circle did.
function buildThemeChip({ bg, border, line, note }) {
  const chip = document.createElement("span");
  chip.className = "theme-chip";
  chip.innerHTML = `
    <svg viewBox="0 0 30 22" width="30" height="22" aria-hidden="true">
      <rect x="0.5" y="0.5" width="29" height="21" rx="4.5"
            fill="${bg}" stroke="${border}" />
      <g stroke="${line}" stroke-width="0.9" opacity="0.7">
        <line x1="5" y1="6.5" x2="25" y2="6.5" />
        <line x1="5" y1="11" x2="25" y2="11" />
        <line x1="5" y1="15.5" x2="25" y2="15.5" />
      </g>
      <ellipse cx="13" cy="13.2" rx="3" ry="2.3" fill="${note}"
               transform="rotate(-20 13 13.2)" />
      <line x1="15.9" y1="12.8" x2="15.9" y2="5.5" stroke="${note}"
            stroke-width="1.1" stroke-linecap="round" />
    </svg>`;
  return chip;
}

const themeMenu = document.getElementById("theme-menu");

// Rebuilt from scratch on a language change, so the active entry is marked
// from the attribute already on <html> rather than passed in.
function buildThemeMenu() {
  themeMenu.replaceChildren();
  const activeId = document.documentElement.getAttribute("data-theme");
  for (const [groupKey, groupId] of [
    ["theme.groupLight", "light"],
    ["theme.groupDark", "dark"],
  ]) {
    const section = document.createElement("div");
    section.className = "theme-menu-section";
    section.dataset.group = groupId;

    const header = document.createElement("div");
    header.className = "theme-menu-group";
    header.textContent = t(groupKey);
    section.appendChild(header);

    for (const theme of THEMES.filter((entry) => entry.group === groupId)) {
      const btn = document.createElement("button");
      btn.className = "theme-menu-item";
      btn.dataset.themeId = theme.id;
      btn.setAttribute("role", "option");
      btn.classList.toggle("active", theme.id === activeId);

      btn.appendChild(buildThemeChip(theme.chip));

      btn.appendChild(document.createTextNode(t(`theme.${theme.id}`)));
      section.appendChild(btn);
    }
    themeMenu.appendChild(section);
  }
}

function applyTheme(themeId) {
  const theme = THEMES.find((entry) => entry.id === themeId) || THEMES[0];
  document.documentElement.setAttribute("data-theme", theme.id);
  themeMenu.querySelectorAll(".theme-menu-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeId === theme.id);
  });
  renderNotation();
  // Note colors are read from CSS at draw time, so the picker staves have to be
  // redrawn for the new palette.
  if (!appSettingsMenu.hidden) renderRangeStaves();
}

buildThemeMenu();

// Theme ids that are no longer in THEMES but may still be saved in someone's
// browser: "dark" and "light" predate the named themes, and "storm" was called
// "nord" while it still wore the name of the palette it was drawn from. The
// resolved id is written back, so an entry here only has to survive until
// everyone using it has opened the page once.
const LEGACY_THEME_IDS = {
  dark: "espresso",
  light: "parchment",
  nord: "storm",
};

const savedTheme = localStorage.getItem("theme");
const migratedTheme = LEGACY_THEME_IDS[savedTheme] ?? savedTheme;
const initialTheme = THEMES.find((entry) => entry.id === migratedTheme)
  ? migratedTheme
  : "parchment";
if (migratedTheme !== savedTheme) localStorage.setItem("theme", initialTheme);
applyTheme(initialTheme);

themeMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-theme-id]");
  if (!btn) return;
  const id = btn.dataset.themeId;
  localStorage.setItem("theme", id);
  applyTheme(id);
});

// --- Clef picker (a second section of the same settings menu) ---
const clefMenu = document.getElementById("clef-menu");

function buildClefMenu() {
  clefMenu.replaceChildren();
  for (const c of CLEFS) {
    const btn = document.createElement("button");
    btn.className = "clef-menu-item";
    btn.dataset.clef = c.id;
    btn.setAttribute("role", "option");
    btn.classList.toggle("active", c.id === currentClef.id);

    const glyph = document.createElement("span");
    glyph.className = "clef-glyph";
    glyph.textContent = c.glyph;
    btn.appendChild(glyph);

    btn.appendChild(document.createTextNode(t(`clef.${c.id}`)));
    clefMenu.appendChild(btn);
  }
}

function applyClef(clefId) {
  currentClef = CLEFS.find((c) => c.id === clefId) || CLEFS[0];
  clefMenu.querySelectorAll(".clef-menu-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.clef === currentClef.id);
  });
  // A single staff can only carry one clef, so switching mid-game would mix
  // incompatible note positions — restart the round with the new clef instead.
  // Ranges are per clef, so the panel has to be redrawn for the clef that is
  // now showing.
  buildRangeRows();
  if (gameActive) {
    startGame();
  } else {
    renderNotation();
  }
}

buildClefMenu();

const savedClef = localStorage.getItem("clef");
applyClef(CLEFS.find((c) => c.id === savedClef) ? savedClef : CLEFS[0].id);

clefMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-clef]");
  if (!btn) return;
  const id = btn.dataset.clef;
  localStorage.setItem("clef", id);
  // The dialog stays open — applyClef rebuilds the range rows below for the
  // clef that is now showing, and that is worth seeing.
  applyClef(id);
});

// --- Settings dialog ---
// Clef, theme and note ranges are all set once and then forgotten, so none of
// them sit on screen for the whole game: the gear button opens them together.
function setAppSettingsOpen(open) {
  appSettingsMenu.hidden = !open;
  appSettingsBackdrop.hidden = !open;
  appSettingsToggle.setAttribute("aria-expanded", String(open));
  // A hidden dialog has no width, so the range staves can only be laid out
  // once it is on screen.
  if (open) renderRangeStaves();
}

function closeAppSettings() {
  setAppSettingsOpen(false);
}

appSettingsToggle.addEventListener("click", () => {
  setAppSettingsOpen(appSettingsMenu.hidden);
});

appSettingsBackdrop.addEventListener("click", closeAppSettings);

document
  .getElementById("app-settings-done")
  .addEventListener("click", closeAppSettings);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAppSettings();
});

buildNoteCountOptions();
buildDifficultyOptions();
buildRangeRows();
applyDifficulty(currentDifficulty.id);
buildNotePad();
// Last, so it can rebuild every menu above in the saved language.
applyLanguage(currentLanguage.id);
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
