const { Renderer, Stave, StaveNote, Voice, Formatter, TickContext } = Vex.Flow;

// --- Piano audio synthesis ---
// Frequencies are derived from the note key (e.g. "c/4") in equal temperament
// rather than stored in a table, so any note added to any clef gets audio for
// free. A4 ("a/4") = 440 Hz is the reference; each semitone multiplies by
// 2^(1/12). MIDI note 69 is A4, which anchors the formula.
const SEMITONE_FROM_C = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function noteFrequency(noteKey) {
  const [name, octaveStr] = noteKey.split("/");
  // The note pools are all naturals, but a key's tonic can be sharp or flat
  // ("f#/4", "bb/4"), so any accidentals after the letter shift the semitone.
  const letter = name[0];
  let semitone = SEMITONE_FROM_C[letter];
  for (const mark of name.slice(1)) semitone += mark === "#" ? 1 : -1;
  const midi = (parseInt(octaveStr, 10) + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

// One struck string. `delay` schedules it that many seconds ahead on the audio
// clock rather than on a timer, so the notes of a chord sound together; `gain`
// is turned down for those, since three of them play at once.
function playTone(freq, duration = 1.2, delay = 0, gain = 0.5) {
  if (!Number.isFinite(freq)) return;

  const ctx = getAudioContext();
  const now = ctx.currentTime + delay;

  const harmonics = [
    { ratio: 1, gain: 0.4 },
    { ratio: 2, gain: 0.15 },
    { ratio: 3, gain: 0.06 },
    { ratio: 4, gain: 0.03 },
  ];

  const master = ctx.createGain();
  master.gain.setValueAtTime(gain, now);
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

function playPianoNote(noteKey, duration = 1.2, delay = 0) {
  playTone(noteFrequency(noteKey), duration, delay);
}

// --- Triads ---
// A key is heard as its tonic chord, and a signature belongs to two keys — the
// major and the relative minor sharing it. So both are sounded, one after the
// other, in the order the name reads: C major, then A minor.
//
// Built from semitone offsets off the major tonic's frequency rather than from
// note keys, because the spellings would be the awkward part: the third of a
// Cis major triad is Eis, and of an Ais minor one a plain Cis. What is being
// taught here is the sound of the chord, not how it is written.
const MAJOR_TRIAD = [0, 4, 7];
const MINOR_TRIAD = [0, 3, 7];
// Where the relative minor's tonic sits: a minor third below the major's.
const RELATIVE_MINOR_SEMITONES = -3;
// Long enough that the first chord is heard as a chord rather than as the front
// of the second one.
const TRIAD_GAP_SECONDS = 1.1;

function playTriad(rootFreq, offsets, delay = 0) {
  for (const semitones of offsets) {
    playTone(rootFreq * 2 ** (semitones / 12), 1.5, delay, 0.3);
  }
}

function playKeyTriads(key) {
  const root = noteFrequency(key.tonic);
  if (!Number.isFinite(root)) return;
  playTriad(root, MAJOR_TRIAD);
  playTriad(
    root * 2 ** (RELATIVE_MINOR_SEMITONES / 12),
    MINOR_TRIAD,
    TRIAD_GAP_SECONDS,
  );
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
    "settings.done": "Valmis",
    "settings.language": "Kieli",
    "settings.clef": "Nuottiavain",
    "settings.theme": "Teema",
    "settings.ranges": "Nuottialue",
    "settings.noNotes": "T\u00e4ll\u00e4 avaimella ei ole viel\u00e4 nuotteja.",
    "menu.groupNotes": "Nuotit",
    "menu.groupKeys": "S\u00e4vellajit",
    "menu.notes": "Tunnista nuotit",
    "menu.notesNote": "Nime\u00e4 nuotit yksi kerrallaan.",
    "menu.cards": "Nuottikortit",
    "menu.cardsNote": "Selaa nuotteja kortteina ja k\u00e4\u00e4nn\u00e4 nimi esiin.",
    "menu.noteChart": "Nuottitaulukko",
    "menu.noteChartNote": "Kaikki nuotit yhdell\u00e4 silm\u00e4yksell\u00e4.",
    "menu.keyChart": "S\u00e4vellajitaulukko",
    "menu.keyChartNote": "Kaikki s\u00e4vellajit yhdell\u00e4 silm\u00e4yksell\u00e4.",
    "chart.sharps": "Ylennysmerkit",
    "chart.flats": "Alennusmerkit",
    "menu.keyCards": "S\u00e4vellajikortit",
    "menu.keyCardsNote": "Selaa s\u00e4vellajeja kortteina ja k\u00e4\u00e4nn\u00e4 nimi esiin.",
    "menu.keys": "Tunnista s\u00e4vellaji",
    "menu.keysNote": "P\u00e4\u00e4ttele s\u00e4vellaji etumerkinn\u00e4st\u00e4.",
    "nav.back": "Takaisin",
    "setup.title": "Valitse nuottien m\u00e4\u00e4r\u00e4.",
    "setup.titleKeys": "Valitse s\u00e4vellajien m\u00e4\u00e4r\u00e4.",
    "setup.played": "{label} \u2014 pelattu l\u00e4pi",
    "keys.prompt": "Mik\u00e4 s\u00e4vellaji?",
    "keys.progress": "S\u00e4vellaji {index} / {total}",
    "key.cf": "Ces",
    "key.cf.minor": "as",
    "key.gf": "Ges",
    "key.gf.minor": "es",
    "key.df": "Des",
    "key.df.minor": "b",
    "key.af": "As",
    "key.af.minor": "f",
    "key.ef": "Es",
    "key.ef.minor": "c",
    "key.bf": "B",
    "key.bf.minor": "g",
    "key.f": "F",
    "key.f.minor": "d",
    "key.c": "C",
    "key.c.minor": "a",
    "key.g": "G",
    "key.g.minor": "e",
    "key.d": "D",
    "key.d.minor": "h",
    "key.a": "A",
    "key.a.minor": "fis",
    "key.e": "E",
    "key.e.minor": "cis",
    "key.b": "H",
    "key.b.minor": "gis",
    "key.fs": "Fis",
    "key.fs.minor": "dis",
    "key.cs": "Cis",
    "key.cs.minor": "ais",
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
    "cards.title": "Nuottikortit",
    "cards.hint": "Paina v\u00e4lily\u00f6nti\u00e4 tai napauta korttia. Kortti vaihtuu itsest\u00e4\u00e4n.",
    "cards.order": "Korttien j\u00e4rjestys",
    "cards.inOrder": "J\u00e4rjestyksess\u00e4",
    "cards.random": "Satunnainen",
    "cards.titleKeys": "S\u00e4vellajikortit",
    "cards.position": "Kortti {index} / {total}",
    "cards.empty": "T\u00e4ll\u00e4 avaimella ei ole viel\u00e4 nuotteja.",
    "clef.treble": "G-avain",
    "clef.alto": "C-avain",
    "clef.bass": "F-avain",
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
    "settings.done": "Klar",
    "settings.language": "Spr\u00e5k",
    "settings.clef": "Klav",
    "settings.theme": "Tema",
    "settings.ranges": "Notomr\u00e5de",
    "settings.noNotes": "Den h\u00e4r klaven har inga noter \u00e4nnu.",
    "menu.groupNotes": "Noter",
    "menu.groupKeys": "Tonarter",
    "menu.notes": "K\u00e4nn igen noter",
    "menu.notesNote": "Namnge noterna en i taget.",
    "menu.cards": "Notkort",
    "menu.cardsNote": "Bl\u00e4ddra bland noterna som kort och v\u00e4nd fram namnet.",
    "menu.noteChart": "Nottabell",
    "menu.noteChartNote": "Alla noter p\u00e5 en g\u00e5ng.",
    "menu.keyChart": "Tonartstabell",
    "menu.keyChartNote": "Alla tonarter p\u00e5 en g\u00e5ng.",
    "chart.sharps": "H\u00f6jningstecken",
    "chart.flats": "S\u00e4nkningstecken",
    "menu.keyCards": "Tonartskort",
    "menu.keyCardsNote": "Bl\u00e4ddra bland tonarterna som kort och v\u00e4nd fram namnet.",
    "menu.keys": "K\u00e4nn igen tonarten",
    "menu.keysNote": "Lista ut tonarten utifr\u00e5n f\u00f6rtecknen.",
    "nav.back": "Tillbaka",
    "setup.title": "V\u00e4lj antal noter.",
    "setup.titleKeys": "V\u00e4lj antal tonarter.",
    "setup.played": "{label} \u2014 genomspelad",
    "keys.prompt": "Vilken tonart?",
    "keys.progress": "Tonart {index} / {total}",
    "key.cf": "Cess",
    "key.cf.minor": "ass",
    "key.gf": "Gess",
    "key.gf.minor": "ess",
    "key.df": "Dess",
    "key.df.minor": "b",
    "key.af": "Ass",
    "key.af.minor": "f",
    "key.ef": "Ess",
    "key.ef.minor": "c",
    "key.bf": "B",
    "key.bf.minor": "g",
    "key.f": "F",
    "key.f.minor": "d",
    "key.c": "C",
    "key.c.minor": "a",
    "key.g": "G",
    "key.g.minor": "e",
    "key.d": "D",
    "key.d.minor": "h",
    "key.a": "A",
    "key.a.minor": "fiss",
    "key.e": "E",
    "key.e.minor": "ciss",
    "key.b": "H",
    "key.b.minor": "giss",
    "key.fs": "Fiss",
    "key.fs.minor": "diss",
    "key.cs": "Ciss",
    "key.cs.minor": "aiss",
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
    "cards.title": "Notkort",
    "cards.hint": "Tryck p\u00e5 mellanslag eller p\u00e5 kortet. Kortet byts av sig sj\u00e4lvt.",
    "cards.order": "Kortens ordning",
    "cards.inOrder": "I ordning",
    "cards.random": "Slumpm\u00e4ssig",
    "cards.titleKeys": "Tonartskort",
    "cards.position": "Kort {index} / {total}",
    "cards.empty": "Den h\u00e4r klaven har inga noter \u00e4nnu.",
    "clef.treble": "G-klav",
    "clef.alto": "C-klav",
    "clef.bass": "F-klav",
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

// Resolved before anything is drawn: the clef and theme labels are all looked
// up through t() while their menus are built.
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
    // Mirrors the treble and alto pools' geometry on the bass staff: 5 steps
    // below the bottom line (G2) through 4 above the top line (A3), i.e. b/1 to
    // e/4, centered on D3 with two ledger lines either side. Middle C (c/4)
    // sits on the first ledger line above.
    notePool: [
      { key: "b/1", name: "h" },
      { key: "c/2", name: "c" },
      { key: "d/2", name: "d" },
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

// --- Note ranges ---
// Which notes can appear is the player's to set: the active clef's pool,
// cropped to a range dragged out in the settings dialog. The choice is stored
// per clef — a range that makes sense in the treble clef would be nonsense in
// the bass one — under localStorage key "noteRanges", as
// { "<clefId>": { low, high } } note keys.
const RANGE_STORAGE_KEY = "noteRanges";

// Ranges used to be kept per clef *and* per difficulty level, keyed
// "<clefId>:<difficultyId>". With the levels gone each clef keeps one range:
// the one saved for the level that used to be the default, or failing that
// whichever level was saved. The migrated shape is written back, so this only
// has to outlive the browsers still holding the old one.
const LEGACY_RANGE_LEVEL = "medium";

// Returns whether the entry was an old-shape one.
function migrateRange(ranges, key, value) {
  const [clefId, level] = key.split(":");
  const legacy = level !== undefined;
  if (!legacy || !(clefId in ranges) || level === LEGACY_RANGE_LEVEL) {
    ranges[clefId] = value;
  }
  return legacy;
}

function loadRanges() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(RANGE_STORAGE_KEY));
  } catch {
    // Corrupt or hand-edited storage shouldn't take the game down with it.
    return {};
  }
  if (!saved || typeof saved !== "object") return {};

  const ranges = {};
  let migrated = false;
  for (const [key, value] of Object.entries(saved)) {
    if (!value || typeof value !== "object") continue;
    if (migrateRange(ranges, key, value)) migrated = true;
  }
  if (migrated) localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(ranges));
  return ranges;
}

let noteRanges = loadRanges();

// Where a clef starts before the player touches it. A staff spans 4 diatonic
// steps either side of its middle line (see diatonicStep), so a half-width of 6
// reaches one ledger line above and below: a range worth reading, and a clear
// place to drag out from.
const DEFAULT_SPREAD = 6;

// That default as a pair of notes: the clef's pool cropped to a band centered
// on the middle staff line. Pools are listed low to high, so the band's ends
// are its first and last entries.
function defaultRange(clef) {
  const pool = clef.notePool;
  if (pool.length === 0) return null;
  const middle = diatonicStep(clef.middleLine);
  const inBand = pool.filter(
    (note) => Math.abs(diatonicStep(note.key) - middle) <= DEFAULT_SPREAD,
  );
  // A clef whose pool sits entirely outside the band would leave nothing to
  // draw; fall back to the full pool rather than an empty staff.
  const band = inBand.length > 0 ? inBand : pool;
  return { low: band[0].key, high: band.at(-1).key };
}

// The range in force for a clef: the saved one when it still names notes this
// clef has, otherwise the default. Reversed ends are swapped rather than
// rejected, so an out-of-order pick still yields a playable range.
function rangeFor(clef) {
  const fallback = defaultRange(clef);
  const saved = noteRanges[clef.id];
  if (!fallback || !saved) return fallback;
  const keys = clef.notePool.map((note) => note.key);
  if (!keys.includes(saved.low) || !keys.includes(saved.high)) return fallback;
  return diatonicStep(saved.low) <= diatonicStep(saved.high)
    ? { low: saved.low, high: saved.high }
    : { low: saved.high, high: saved.low };
}

// The notes actually in play: the current clef's pool cropped to its range.
// Cropping (rather than listing a pool per clef per range) keeps a new clef
// working as soon as its notePool is filled in.
function activeNotePool() {
  const range = rangeFor(currentClef);
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
const menuScreen = document.getElementById("menu-screen");
const setupScreen = document.getElementById("setup-screen");
const setupTitleEl = document.getElementById("setup-title");
const gameScreen = document.getElementById("game-screen");
const resultsScreen = document.getElementById("results-screen");
const noteCountOptionsEl = document.getElementById("note-count-options");
const resultsStatsEl = document.getElementById("results-stats");
const resultsFaceEl = document.getElementById("results-face");
const toolbarBack = document.getElementById("toolbar-back");
const appSettingsToggle = document.getElementById("app-settings-toggle");
const appSettingsMenu = document.getElementById("app-settings-menu");
const appSettingsBackdrop = document.getElementById("app-settings-backdrop");
const rangeRowsEl = document.getElementById("range-rows");
const keysScreen = document.getElementById("keys-screen");
const keysNotationEl = document.getElementById("keys-notation");
const keyOptionsEl = document.getElementById("key-options");
const keysProgressEl = document.getElementById("keys-progress");
const keysScoreEl = document.getElementById("keys-score");
const keysMistakesEl = document.getElementById("keys-mistakes");
const keysStreakEl = document.getElementById("keys-streak");
const noteChartScreen = document.getElementById("note-chart-screen");
const noteChartRowsEl = document.getElementById("note-chart-rows");
const keyChartScreen = document.getElementById("key-chart-screen");
const keyChartEl = document.getElementById("key-chart");
const cardsScreen = document.getElementById("cards-screen");
const noteCardsEl = document.getElementById("note-cards");
const cardsTitleEl = document.getElementById("cards-title");
const cardsPositionEl = document.getElementById("cards-position");
const cardOrderEl = document.getElementById("card-order");
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
// Which game the round in progress belongs to. The two share the counters, the
// results screen and the setup screen, so almost everything that touches a
// running game has to know which one is running.
let gameMode = "notes";

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

function triggerFeedback(type, target = notationEl) {
  target.classList.remove("anim-correct", "anim-wrong");
  void target.offsetWidth;
  target.classList.add(type === "correct" ? "anim-correct" : "anim-wrong");
}

for (const area of [notationEl, keysNotationEl]) {
  area.addEventListener("animationend", () => {
    area.classList.remove("anim-correct", "anim-wrong");
  });
}

// The two games keep a status block each — same three counters, on their own
// screen — so the one being played is the one written to.
function statusElements() {
  return gameMode === "keys"
    ? {
        score: keysScoreEl,
        mistakes: keysMistakesEl,
        streak: keysStreakEl,
        progress: keysProgressEl,
        progressKey: "keys.progress",
      }
    : {
        score: scoreEl,
        mistakes: mistakesEl,
        streak: streakEl,
        progress: progressEl,
        progressKey: "game.progress",
      };
}

function updateStatus() {
  const status = statusElements();
  status.score.textContent = String(correct);
  status.mistakes.textContent = String(wrong);
  status.streak.textContent = String(streak);
  status.progress.textContent = t(status.progressKey, {
    index: Math.min(currentIndex + 1, totalNotes),
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

// The round's notes are drawn as it goes: allNotes starts empty and ensureBuffer
// fills it in as the player works through it.
function startGame() {
  allNotes = [];
  currentIndex = 0;
  correct = 0;
  wrong = 0;
  streak = 0;
  renderNotation();
  updateStatus();
}

// Which round lengths have been played to the end, per game — a round that was
// abandoned partway does not count, so the marks say what was finished rather
// than what was attempted. Stored under "playedCounts" as
// { "<gameMode>": [count, ...] }.
const PLAYED_STORAGE_KEY = "playedCounts";

function loadPlayed() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PLAYED_STORAGE_KEY));
  } catch {
    // Corrupt or hand-edited storage shouldn't take the game down with it.
    return {};
  }
  if (!saved || typeof saved !== "object") return {};

  const played = {};
  for (const [mode, ids] of Object.entries(saved)) {
    // A round is identified by its length. Anything else is left over from an
    // older shape of this key and is dropped rather than carried forward.
    if (Array.isArray(ids)) played[mode] = ids.filter(Number.isFinite);
  }
  return played;
}

let playedCounts = loadPlayed();

function markPlayed(mode, id) {
  const ids = playedCounts[mode] ?? [];
  if (ids.includes(id)) return;
  playedCounts[mode] = [...ids, id];
  localStorage.setItem(PLAYED_STORAGE_KEY, JSON.stringify(playedCounts));
}

function hasPlayed(mode, id) {
  return (playedCounts[mode] ?? []).includes(id);
}

// Rebuilt whenever the picker is shown, so the round just finished is marked
// by the time the player is back here — and so are the marks for the other
// game when the picker is entered from the other menu entry.
function buildNoteCountOptions() {
  noteCountOptionsEl.replaceChildren();
  for (const n of NOTE_COUNT_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "note-count-btn";
    btn.dataset.count = String(n);
    btn.classList.toggle("played", hasPlayed(gameMode, n));

    const label = document.createElement("span");
    label.className = "note-count-label";
    label.textContent = String(n);
    btn.appendChild(label);

    if (hasPlayed(gameMode, n)) {
      // A tick rather than a colour alone: the marked and unmarked states have
      // to be tellable apart without relying on seeing the difference.
      const mark = document.createElement("span");
      mark.className = "note-count-mark";
      mark.textContent = "✓";
      mark.setAttribute("aria-hidden", "true");
      btn.appendChild(mark);
      btn.setAttribute("aria-label", t("setup.played", { label: n }));
    }

    noteCountOptionsEl.appendChild(btn);
  }
}

// The note range is edited on a staff of its own: the clef's whole pool drawn
// out, with the range highlighted and draggable. The staff is drawn by
// renderRangeStaff once it is in the document and has a width.
function buildRangeEditor() {
  rangeRowsEl.replaceChildren();

  if (currentClef.notePool.length === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = t("settings.noNotes");
    rangeRowsEl.appendChild(empty);
    return;
  }

  const staff = document.createElement("div");
  staff.className = "range-staff";
  rangeRowsEl.appendChild(staff);

  // A sibling rather than a child of the staff: the band and the hit areas are
  // absolutely positioned across the staff's full height, and letters inside
  // it would be swept under both. It shares the staff's width, so the same
  // note x-positions line up in it.
  const letters = document.createElement("div");
  letters.className = "range-letters";
  rangeRowsEl.appendChild(letters);

  renderRangeStaff(staff);
}

// How tall a staff has to be to hold a set of notes, and where its top line
// goes: notes reaching above or below the five lines need room for their
// ledger lines. Shared by the range editor and the note cards, which draw the
// same clef at different sizes and must agree on where the staff sits.
function staffGeometry(clef, steps) {
  // VexFlow's staff lines sit 10px apart, so one diatonic step is 5px.
  const STEP_PX = 5;
  const middle = diatonicStep(clef.middleLine);
  const aboveTop = Math.max(0, Math.max(...steps) - (middle + 4));
  const belowBottom = Math.max(0, middle - 4 - Math.min(...steps));
  // The clef glyph itself overhangs the staff, which sets the minimums.
  const padTop = Math.max(20, aboveTop * STEP_PX + 18);
  const padBottom = Math.max(30, belowBottom * STEP_PX + 18);
  // A Stave draws its top line four line-spaces below the y it is given —
  // room it reserves for ledger lines — so the y we want is that much higher.
  const STAVE_TOP_RESERVE = 40;
  const staveY = Math.max(0, padTop - STAVE_TOP_RESERVE);
  return { staveY, height: staveY + STAVE_TOP_RESERVE + 40 + padBottom };
}

// Draws a clef's whole pool across one staff: whole notes at even intervals of
// our own choosing, sized so ledger lines fit, each in whatever colour the
// caller asks for. Returns the noteheads' x positions and the spacing between
// them, which is what the range band, the hit areas and the letters underneath
// are all placed from.
//
// Shared by the range editor, where the colour says which notes are in range,
// and the note chart, where every note is drawn in plain ink.
//
// columns is how many note-slots the width is divided into, which is the pool's
// own length everywhere but the last row of a multi-row chart: a row holding
// fewer notes than the ones above it should keep their spacing and stop early,
// not spread three notes across the whole staff.
// The stave's own inset from the element it is drawn in, and how far short of
// the stave's right edge the last notehead's left edge stops. Together they say
// how much room there is to the right of the last note — which is what the band
// spreading into the gaps has to stay inside of.
const STAVE_INSET = 2;
const POOL_STAFF_TRAILING = 24;

function drawPoolStaff(staffEl, pool, colorFor, columns = pool.length) {
  const width = staffEl.clientWidth;
  staffEl.replaceChildren();

  const steps = pool.map((note) => diatonicStep(note.key));
  const { staveY, height } = staffGeometry(currentClef, steps);

  const renderer = new Renderer(staffEl, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();

  const styles = getComputedStyle(document.documentElement);
  const staffColor = styles.getPropertyValue("--staff-color").trim();
  const ledgerColor = styles.getPropertyValue("--text").trim();
  context.setFillStyle(staffColor);
  context.setStrokeStyle(staffColor);

  const staveX = STAVE_INSET;
  const staveWidth = width - STAVE_INSET * 2;
  const stave = new Stave(staveX, staveY, staveWidth);
  stave.addClef(currentClef.id);
  stave.setDefaultLedgerLineStyle({
    strokeStyle: ledgerColor,
    fillStyle: ledgerColor,
    lineWidth: 2,
  });
  stave.setContext(context).draw();

  // Whole notes: no stems to clutter a staff that is a control or a table,
  // not music.
  const staveNotes = pool.map((note, i) => {
    const sn = new StaveNote({
      keys: [note.key],
      duration: "w",
      clef: currentClef.id,
    });
    const color = colorFor(i);
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
  const last = Math.max(
    first,
    staveX + staveWidth - POOL_STAFF_TRAILING - baseX,
  );
  const gap = columns > 1 ? (last - first) / (columns - 1) : 0;

  staveNotes.forEach((sn, i) => {
    sn.getTickContext().setX(first + i * gap);
    sn.draw();
  });

  return { xs: staveNotes.map((sn) => sn.getAbsoluteX()), gap, width };
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
  const range = rangeFor(currentClef);
  const pool = currentClef.notePool;
  if (!range || pool.length === 0) return;

  // A hidden dialog gives its staves no width. Drawing one at a made-up width
  // is worse than not drawing it: the over-wide SVG widens the grid track it
  // sits in, and the re-render when the dialog opens then measures that
  // inflated track instead of the dialog. Leave it until it has a width —
  // setAppSettingsOpen draws the staff once the dialog is on screen.
  const width = staffEl.clientWidth;
  if (width === 0) return;

  const low = diatonicStep(range.low);
  const high = diatonicStep(range.high);
  const steps = pool.map((note) => diatonicStep(note.key));

  const styles = getComputedStyle(document.documentElement);
  const inColor = styles.getPropertyValue("--note-current").trim();
  const outColor = styles.getPropertyValue("--note-future").trim();

  const { xs, gap } = drawPoolStaff(staffEl, pool, (i) =>
    steps[i] >= low && steps[i] <= high ? inColor : outColor,
  );

  // The band spanning the range. Positioned before it is in the document so
  // its first paint doesn't animate in from nowhere.
  const band = document.createElement("div");
  band.className = "range-band";
  positionRangeBand(
    band,
    pool.map((note, i) => ({ key: note.key, x: xs[i] })),
    gap,
    range,
  );
  staffEl.appendChild(band);

  // The hover preview, placed by updateRangeGhost once there is a pointer to
  // place it under.
  const ghost = document.createElement("div");
  ghost.className = "range-ghost";
  ghost.hidden = true;
  staffEl.appendChild(ghost);

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
    hit.dataset.key = note.key;
    hit.dataset.x = String(xs[i]);
    hit.style.left = `${left}px`;
    hit.style.width = `${right - left}px`;
    hit.setAttribute(
      "aria-pressed",
      String(steps[i] >= low && steps[i] <= high),
    );
    hit.setAttribute("aria-label", noteLabel(currentClef, note.key));
    staffEl.appendChild(hit);
  });

  renderNoteLetters(
    rangeRowsEl.querySelector(".range-letters"),
    pool,
    xs,
    (i) => steps[i] >= low && steps[i] <= high,
  );

  // A redraw usually follows an edit made with the mouse still on the staff,
  // and the preview has to answer for the range as it now stands rather than
  // wait for the pointer to move again.
  updateRangeGhost(staffEl);
}

// A pool's note names spelled out under its staff, each centred on its own
// notehead, the lit ones in the colour their noteheads wear. In the range
// editor "lit" means in range — reading a range off noteheads alone asks the
// player to name the notes first, which is the very skill they came here to
// practise; on the note chart every letter is lit, since the whole point is
// the naming, and there they are ink rather than accent, like the notes above
// them. No octave numbers either place: the staff says which octave.
//
// Aria-hidden. In the editor the .range-hit buttons above already carry every
// note's name, and on the chart the staff is decoration around a list a screen
// reader is given in text.
// getAbsoluteX reports a note's left edge, not the middle of its head, so a
// letter centred on it sits half a notehead to the left of the note it names.
// Measured rather than guessed: a whole note's head is ~17px across at the
// size the staff is drawn, which puts its middle here.
const NOTEHEAD_HALF_WIDTH = 8.5;

// The middle of the head drawn at a column's x, which is what everything laid
// over the staff — the letters, the band's edges, the ghost — is placed from.
function noteCentreX(x) {
  return x + NOTEHEAD_HALF_WIDTH;
}

function renderNoteLetters(lettersEl, pool, xs, isLit) {
  if (!lettersEl) return;

  lettersEl.replaceChildren();
  lettersEl.setAttribute("aria-hidden", "true");

  pool.forEach((note, i) => {
    const letter = document.createElement("span");
    letter.className = "range-letter";
    letter.classList.toggle("lit", isLit(i));
    letter.style.left = `${noteCentreX(xs[i])}px`;
    letter.textContent = note.name.toUpperCase();
    lettersEl.appendChild(letter);
  });
}

// Redraws the staff wherever it is called from — a theme change, a resize, or
// the dialog opening on staves that had no width to lay out in while hidden.
function redrawRangeStaff() {
  const staffEl = rangeRowsEl.querySelector(".range-staff");
  if (staffEl) renderRangeStaff(staffEl);
}

// The band is drawn from the noteheads rather than from the column
// boundaries: a column at either end of the pool runs to the edge of the
// staff, and a band that ran out under the clef would read as a mistake.
function positionRangeBand(band, columns, gap, range) {
  const lowIdx = columns.findIndex((col) => col.key === range.low);
  const highIdx = columns.findIndex((col) => col.key === range.high);
  if (lowIdx < 0 || highIdx < 0) return;
  const pad = bandPad(gap);
  band.style.left = `${noteCentreX(columns[lowIdx].x) - pad}px`;
  band.style.width = `${columns[highIdx].x - columns[lowIdx].x + pad * 2}px`;
}

// How far past the outermost noteheads' centres the band's edges reach: half
// the gap, so an edge falls midway between the note it holds and the next one
// along — the same line the hit columns divide on, and the reason both ends sit
// the same distance from their note. The floor keeps the edge clear of the head
// itself where the columns are drawn narrower than the heads standing in them,
// which is every phone.
function bandPad(gap) {
  // Room to the right of the last notehead's centre: past that the band would
  // hang off the staff, and the dialog would grow a sideways scrollbar for it.
  const room = STAVE_INSET + POOL_STAFF_TRAILING - NOTEHEAD_HALF_WIDTH;
  return Math.max(NOTEHEAD_HALF_WIDTH + 3, Math.min(gap / 2, room));
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
function commitRange(range) {
  const current = rangeFor(currentClef);
  if (current && current.low === range.low && current.high === range.high) {
    return;
  }
  noteRanges[currentClef.id] = { ...range };
  localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(noteRanges));
  redrawRangeStaff();
  redrawCards();
}

// The click path, which after the drag handlers below is left serving the
// keyboard: Enter or Space on a focused note.
function setRangeFromNote(key) {
  const range = rangeFor(currentClef);
  if (!range) return;
  commitRange(rangeWithEdgeAt(range, edgeNearest(range, key), key));
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

  const range = rangeFor(currentClef);
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
    // Kept so a gesture the browser takes over can be put back.
    committed: range,
    range: rangeWithEdgeAt(range, edge, key),
    edge,
    startX: event.clientX,
    moved: false,
  };
  drawDragBand();
  // The band itself is now the thing to watch; a preview beside it would only
  // be a second answer to the same question.
  updateRangeGhost(staffEl);
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
  const { range } = rangeDrag;
  endRangeDrag();
  commitRange(range);
});

window.addEventListener("pointercancel", (event) => {
  if (!rangeDrag || event.pointerId !== rangeDrag.pointerId) return;
  // The browser took the gesture over to scroll: leave the range alone and put
  // the band back where the saved one is.
  const { band, columns, gap, committed } = rangeDrag;
  endRangeDrag();
  positionRangeBand(band, columns, gap, committed);
});

// --- Where a press would land ---
// The band wears a grip at each end; hovering draws that grip again in the
// faded colour the out-of-range notes wear, at the note the pointer is over.
// So a press is aimed rather than guessed at: the ghost says both which end
// would move — the nearer one, as ever — and where it would come to rest,
// including where it stops short because the other end is in the way.
//
// Mouse only. A finger has nowhere to hover, and the styles keep the preview
// out of touch devices whatever this code does.

// Mirrored from .range-ghost in styles.css: the ghost is as wide as the band's
// corner radius, since that is the room its curve needs, and carries its border
// down one side only. Lining that side up with where the band's edge would be
// is what makes the ghost land on the same pixels as the edge it stands in for.
const RANGE_GHOST_WIDTH = 10;

// Where the pointer last was, as an offset into the staff. Null whenever there
// is nothing hovering it — which is also what a redraw reads to decide whether
// to put a preview back.
let rangeHoverX = null;

// Which end the ghost stands for and where it belongs, or null when there is
// nothing to show: no pointer on the staff, a drag already under way — the band
// is the thing to watch by then — or a press that would leave the range exactly
// as it is.
function ghostPlacement(staffEl) {
  if (rangeDrag || rangeHoverX === null) return null;

  const range = rangeFor(currentClef);
  const columns = staffColumns(staffEl);
  if (!range || columns.length === 0) return null;

  const key = columnKeyAt(columns, rangeHoverX);
  const edge = edgeNearest(range, key);
  const moved = rangeWithEdgeAt(range, edge, key);
  if (moved.low === range.low && moved.high === range.high) return null;

  const column = columns.find((col) => col.key === moved[edge]);
  if (!column) return null;

  // The band's edge sits bandPad from the notehead's centre. The ghost's
  // bordered side goes where that edge would be: for the low end its left side,
  // so the box starts there; for the high end its right side, so it ends there.
  const pad = bandPad(Number(staffEl.dataset.noteGap) || 0);
  const centre = noteCentreX(column.x);
  const left =
    edge === "low" ? centre - pad : centre + pad - RANGE_GHOST_WIDTH;
  return { edge, left };
}

function updateRangeGhost(staffEl) {
  const ghost = staffEl.querySelector(".range-ghost");
  if (!ghost) return;
  const placement = ghostPlacement(staffEl);
  if (placement) {
    ghost.dataset.edge = placement.edge;
    ghost.style.left = `${placement.left}px`;
  }
  ghost.hidden = placement === null;
}

// Forgets the pointer and takes the preview down with it: on the way out of
// the staff, and whenever the dialog opens or closes on a stale position.
function clearRangeHover() {
  rangeHoverX = null;
  const staffEl = rangeRowsEl.querySelector(".range-staff");
  if (staffEl) updateRangeGhost(staffEl);
}

rangeRowsEl.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse") return;
  // The letters under the staff are a label rather than a target, and passing
  // over them is leaving the control.
  const staffEl = event.target.closest(".range-staff");
  if (!staffEl) {
    clearRangeHover();
    return;
  }
  rangeHoverX = offsetXOf(staffEl, event);
  updateRangeGhost(staffEl);
});

rangeRowsEl.addEventListener("pointerleave", clearRangeHover);

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

// --- Note cards ---
// A deck of the notes actually in play — the active clef's pool cropped to the
// chosen range. One card fills the screen at a time: the front is the note on
// a staff, the back its name, and a press flips it over. No score and no
// clock: this is the side of the app you read rather than play.

// Nordic H is the international B. The back carries both, so whichever naming
// the player was taught is on the card. Nothing else joins them — the card
// answers "which letter is this", so an octave number would be a second
// question the game never asks.
const INTERNATIONAL_NAMES = { h: "B" };

function cardNoteName(note) {
  const nordic = note.name.toUpperCase();
  const international = INTERNATIONAL_NAMES[note.name];
  return international ? `${nordic} / ${international}` : nordic;
}

// One card's front for the note deck: the clef and a single whole note. Cards
// are laid out by CSS rather than measured, so this draws correctly even while
// the screen is still hidden.
function renderCardStaff(faceEl, note, geometry) {
  const { staveY, height } = geometry;
  const WIDTH = 150;

  const renderer = new Renderer(faceEl, Renderer.Backends.SVG);
  renderer.resize(WIDTH, height);
  const context = renderer.getContext();

  const styles = getComputedStyle(document.documentElement);
  const staffColor = styles.getPropertyValue("--staff-color").trim();
  const ledgerColor = styles.getPropertyValue("--text").trim();
  const noteColor = styles.getPropertyValue("--note-current").trim();
  context.setFillStyle(staffColor);
  context.setStrokeStyle(staffColor);

  const staveX = 2;
  const staveWidth = WIDTH - 4;
  const stave = new Stave(staveX, staveY, staveWidth);
  stave.addClef(currentClef.id);
  stave.setDefaultLedgerLineStyle({
    strokeStyle: ledgerColor,
    fillStyle: ledgerColor,
    lineWidth: 2,
  });
  stave.setContext(context).draw();

  // A whole note, as on the range staff: no stem to place, and nothing that
  // reads as a rhythm on a card that is only about pitch.
  const staveNote = new StaveNote({
    keys: [note.key],
    duration: "w",
    clef: currentClef.id,
  });
  staveNote.setStyle({ fillStyle: noteColor, strokeStyle: noteColor });
  staveNote.setContext(context).setStave(stave);
  new TickContext().addTickable(staveNote).preFormat().setX(0);

  // Centred between the clef and the stave's right edge, using the same insets
  // the range staff keeps clear at either end.
  const baseX = staveNote.getAbsoluteX();
  const first = 10;
  const last = Math.max(
    first,
    staveX + staveWidth - POOL_STAFF_TRAILING - baseX,
  );
  staveNote.getTickContext().setX((first + last) / 2);
  staveNote.draw();

  scaleCardSvg(faceEl, WIDTH, height);
}

// --- Key signatures ---
// The major keys around the circle of fifths, seven flats through seven
// sharps. `vf` is VexFlow's key spec, which is what actually draws the
// signature (and places it correctly for whichever clef is showing);
// `accidentals` is the signed count, which the distractor picker measures
// distance with; `tonic` is what a right answer sounds.
//
// The names are translated, unlike the plain note letters: Finnish and Swedish
// spell the altered degrees differently (Es/Ess, Fis/Fiss), so they live in
// STRINGS under `key.<id>` rather than in this table.
const KEYS = [
  { id: "cf", vf: "Cb", accidentals: -7, tonic: "cb/4" },
  { id: "gf", vf: "Gb", accidentals: -6, tonic: "gb/4" },
  { id: "df", vf: "Db", accidentals: -5, tonic: "db/4" },
  { id: "af", vf: "Ab", accidentals: -4, tonic: "ab/4" },
  { id: "ef", vf: "Eb", accidentals: -3, tonic: "eb/4" },
  { id: "bf", vf: "Bb", accidentals: -2, tonic: "bb/4" },
  { id: "f", vf: "F", accidentals: -1, tonic: "f/4" },
  { id: "c", vf: "C", accidentals: 0, tonic: "c/4" },
  { id: "g", vf: "G", accidentals: 1, tonic: "g/4" },
  { id: "d", vf: "D", accidentals: 2, tonic: "d/4" },
  { id: "a", vf: "A", accidentals: 3, tonic: "a/4" },
  { id: "e", vf: "E", accidentals: 4, tonic: "e/4" },
  { id: "b", vf: "B", accidentals: 5, tonic: "b/4" },
  { id: "fs", vf: "F#", accidentals: 6, tonic: "f#/4" },
  { id: "cs", vf: "C#", accidentals: 7, tonic: "c#/4" },
];

// A signature belongs to two keys, so it is named as both: the major, then the
// minor a minor third below it, which the same accidentals spell. Major
// uppercase and minor lowercase is the Nordic convention and the whole of the
// distinction — "C-a" is C major and A minor, "Des-b" is Des major and B minor
// (Nordic B being B flat). Both halves are translated, since Finnish and
// Swedish spell the altered degrees differently.
function keyName(key) {
  return `${t(`key.${key.id}`)}-${t(`key.${key.id}.minor`)}`;
}

// Staff left past the signature, so it reads as a staff carrying one rather
// than as a signature cropped out of one.
const KEY_STAVE_TRAILING = 44;

// How many answers a question offers. Also the highest number key that answers
// one, so keep it in single digits.
const KEY_CHOICES = 4;

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// The wrong answers are drawn from the signatures nearest the right one on the
// circle of fifths. Picked from the whole circle they would mostly be a
// giveaway — telling four sharps from six flats needs no reading — where
// neighbours differ by an accidental or two and have to be counted.
function keyChoices(answer) {
  const near = KEYS.filter((key) => key.id !== answer.id)
    .sort(
      (a, b) =>
        Math.abs(a.accidentals - answer.accidentals) -
        Math.abs(b.accidentals - answer.accidentals),
    )
    .slice(0, (KEY_CHOICES - 1) * 2);
  return shuffled([answer, ...shuffled(near).slice(0, KEY_CHOICES - 1)]);
}

// One entry per question, built on demand and kept: a question the player is
// still getting wrong must keep the same four answers underneath them.
let keyQuestions = [];

function ensureKeyQuestion(index) {
  while (keyQuestions.length <= index) {
    const key = KEYS[Math.floor(Math.random() * KEYS.length)];
    keyQuestions.push({ key, choices: keyChoices(key) });
  }
  return keyQuestions[index];
}

// The signature on a staff of its own. Only the clef and the accidentals are
// drawn — there is no note to name here, so nothing else belongs on it.
function renderKeySignature() {
  const question = keyQuestions[currentIndex];
  if (!question) return;

  keysNotationEl.replaceChildren();

  const available = keysNotationEl.clientWidth || 700;
  const height = 120;

  const renderer = new Renderer(keysNotationEl, Renderer.Backends.SVG);
  const context = renderer.getContext();

  const styles = getComputedStyle(document.documentElement);
  const staffColor = styles.getPropertyValue("--staff-color").trim();
  context.setFillStyle(staffColor);
  context.setStrokeStyle(staffColor);

  // How wide the clef and signature come out, measured off a stave that is
  // never drawn. A signature runs from nothing at all (C) to seven accidentals,
  // and a staff sized for the widest would leave C floating in an empty field.
  const probe = new Stave(0, 0, available);
  probe.addClef(currentClef.id);
  probe.addKeySignature(question.key.vf);
  probe.setContext(context);
  const staveWidth = Math.min(
    available - 20,
    probe.getNoteStartX() + KEY_STAVE_TRAILING,
  );
  // Only as wide as it needs to be, and centred by .notation-area's own rule.
  renderer.resize(staveWidth + 20, height);

  const stave = new Stave(10, 15, staveWidth);
  stave.addClef(currentClef.id);
  stave.addKeySignature(question.key.vf);
  stave.setContext(context).draw();

  tintKeySignature(keysNotationEl, styles.getPropertyValue("--note-current").trim());
}

// Tints a drawn key signature. In the game the accidentals are what the player
// is being asked to read, so they wear the current-note colour the way the note
// being named does in the other game; on the chart, which asks nothing, they
// are ink.
// VexFlow gives the signature its own group in the SVG, which is the handle.
function tintKeySignature(container, color) {
  container
    .querySelectorAll(".vf-keysignature path, .vf-keysignature rect")
    .forEach((el) => {
      el.setAttribute("fill", color);
      el.setAttribute("stroke", color);
    });
}

function renderKeyChoices() {
  const question = keyQuestions[currentIndex];
  keyOptionsEl.replaceChildren();
  if (!question) return;

  for (const key of question.choices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key-option";
    btn.dataset.key = key.id;

    const name = document.createElement("span");
    name.className = "key-option-name";
    name.textContent = keyName(key);

    btn.appendChild(name);
    keyOptionsEl.appendChild(btn);
  }
}

function renderKeysRound() {
  ensureKeyQuestion(currentIndex);
  renderKeySignature();
  renderKeyChoices();
}

// Mirrors handleGuess: a wrong answer costs the streak and is counted, but the
// question stays until it is answered, so accuracy measures how many tries the
// round took rather than how much was skipped.
function handleKeyGuess(keyId) {
  if (!gameActive || gameMode !== "keys") return;

  const question = keyQuestions[currentIndex];
  if (!question) return;

  if (keyId === question.key.id) {
    playKeyTriads(question.key);
    correct += 1;
    streak += 1;
    currentIndex += 1;
    triggerFeedback("correct", keysNotationEl);
    updateStatus();
    if (currentIndex >= totalNotes) {
      endGame();
    } else {
      renderKeysRound();
    }
  } else {
    playErrorTone();
    wrong += 1;
    streak = 0;
    triggerFeedback("wrong", keysNotationEl);
    updateStatus();
    const missed = keyOptionsEl.querySelector(`[data-key="${keyId}"]`);
    if (missed) {
      missed.classList.remove("wrong");
      void missed.offsetWidth;
      missed.classList.add("wrong");
    }
  }
}

function startKeysGame() {
  keyQuestions = [];
  currentIndex = 0;
  correct = 0;
  wrong = 0;
  streak = 0;
  renderKeysRound();
  updateStatus();
}

keyOptionsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-key]");
  if (!btn) return;
  handleKeyGuess(btn.dataset.key);
});

keyOptionsEl.addEventListener("animationend", (event) => {
  event.target.classList.remove("wrong");
});

// --- Reference charts ---
// Two lookup pages rather than games: every note of the current clef on one
// staff, and every key signature drawn in that clef. Both follow the clef
// picked in the settings, and both say which clef they are showing, since a
// chart read in the wrong clef is worse than no chart.

// How much width a note wants on the chart. Eighteen notes across a phone
// leave a column each about as wide as a notehead, so the heads run into one
// another and the letters underneath collide — measured off the drawn staff:
// a notehead is ~17px, and this is that with air either side.
const CHART_MIN_NOTE_SPACING = 30;
// What the clef glyph takes off the front of every row before the notes start.
const CHART_CLEF_ROOM = 46;

// How many staves the pool is spread over: as few as will give every note its
// spacing. One row wherever there is room for one — this only splits when the
// screen is too narrow to read a single row, which in practice means a phone.
function noteChartRowCount(width, count) {
  const perRow = Math.floor((width - CHART_CLEF_ROOM) / CHART_MIN_NOTE_SPACING);
  if (perRow >= count) return 1;
  return Math.ceil(count / Math.max(2, perRow));
}

function renderNoteChart() {
  noteChartRowsEl.replaceChildren();

  const pool = currentClef.notePool;
  if (pool.length === 0) return;

  // A hidden screen gives the staff no width to lay out in, the same trap the
  // range editor has — showNoteChart draws it once it is on screen.
  const width = noteChartRowsEl.clientWidth;
  if (width === 0) return;

  // Ink, not accent: the accent colour means "this is the note being asked
  // about", and on a lookup page there is no such note. Nothing is picked out
  // here, so every notehead and every letter is drawn the same.
  const inkColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--text")
    .trim();

  // Rows of equal length, so the spacing is the same down the whole chart and
  // a short last row simply stops early rather than spreading itself out.
  const rows = noteChartRowCount(width, pool.length);
  const perRow = Math.ceil(pool.length / rows);

  for (let start = 0; start < pool.length; start += perRow) {
    const notes = pool.slice(start, start + perRow);

    const row = document.createElement("div");
    row.className = "chart-staff-row";
    const staffEl = document.createElement("div");
    staffEl.className = "range-staff";
    const lettersEl = document.createElement("div");
    lettersEl.className = "range-letters chart-letters";
    row.append(staffEl, lettersEl);
    // In the document before it is drawn: drawPoolStaff measures the staff.
    noteChartRowsEl.appendChild(row);

    const { xs } = drawPoolStaff(staffEl, notes, () => inkColor, perRow);
    renderNoteLetters(lettersEl, notes, xs, () => true);
  }
}

// One tile: the clef and a signature, with the key's name under it. Sized like
// the key cards — one canvas for the whole chart, so the tiles are all at the
// same scale and can be compared down a column.
function buildKeyChartTile(key, staveWidth) {
  const tile = document.createElement("div");
  tile.className = "key-chart-tile";

  const staff = document.createElement("div");
  staff.className = "key-chart-staff";
  tile.appendChild(staff);

  const renderer = new Renderer(staff, Renderer.Backends.SVG);
  const context = renderer.getContext();

  const styles = getComputedStyle(document.documentElement);
  const staffColor = styles.getPropertyValue("--staff-color").trim();
  context.setFillStyle(staffColor);
  context.setStrokeStyle(staffColor);

  const staveY = 14;
  const height = staveY + 40 + 40 + 26;
  const width = staveWidth + 20;
  renderer.resize(width, height);

  const stave = new Stave(10, staveY, staveWidth);
  stave.addClef(currentClef.id);
  stave.addKeySignature(key.vf);
  stave.setContext(context).draw();

  // Ink rather than the accent colour: on a lookup page the accidentals are
  // not a question being asked, they are the entry being looked up.
  tintKeySignature(staff, styles.getPropertyValue("--text").trim());
  scaleCardSvg(staff, width, height);

  const name = document.createElement("span");
  name.className = "key-chart-name";
  name.textContent = keyName(key);
  tile.appendChild(name);

  return tile;
}

// The widest signature there is, in the clef being shown. Every tile is drawn
// on a canvas that size, so C major does not come out at the same width as
// seven sharps with its accidentals shrunk to match.
function widestKeySignature() {
  const probeHost = document.createElement("div");
  const renderer = new Renderer(probeHost, Renderer.Backends.SVG);
  const context = renderer.getContext();
  let widest = 0;
  for (const key of KEYS) {
    const probe = new Stave(0, 0, 400);
    probe.addClef(currentClef.id);
    probe.addKeySignature(key.vf);
    probe.setContext(context);
    widest = Math.max(widest, probe.getNoteStartX());
  }
  return widest + KEY_STAVE_TRAILING;
}

// Grouped the way a signature is actually looked up: the sharp keys in order
// of how many sharps they carry, then the flat ones in order of their flats.
// Both columns start at C, which carries neither — a column that opened on one
// flat would read as though the counting started at one.
function renderKeyChart() {
  keyChartEl.replaceChildren();

  const staveWidth = widestKeySignature();
  const groups = [
    ["chart.sharps", KEYS.filter((key) => key.accidentals >= 0)],
    ["chart.flats", [...KEYS.filter((key) => key.accidentals <= 0)].reverse()],
  ];

  for (const [labelKey, keys] of groups) {
    const section = document.createElement("section");
    section.className = "key-chart-group";

    const heading = document.createElement("h2");
    heading.className = "key-chart-heading";
    heading.textContent = t(labelKey);
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "key-chart-grid";
    for (const key of keys) grid.appendChild(buildKeyChartTile(key, staveWidth));
    section.appendChild(grid);

    keyChartEl.appendChild(section);
  }
}

// Both charts read their colours from CSS at draw time and both follow the
// clef, so anything that moves either redraws them — but only the one being
// looked at.
function redrawCharts() {
  if (!noteChartScreen.hidden) renderNoteChart();
  if (!keyChartScreen.hidden) renderKeyChart();
}

function showNoteChart() {
  gameActive = false;
  showScreen(noteChartScreen);
  // After the screen is up: the staff is measured, and a hidden one has no
  // width to measure.
  renderNoteChart();
}

function showKeyChart() {
  gameActive = false;
  renderKeyChart();
  showScreen(keyChartScreen);
}

document.getElementById("menu-notechart").addEventListener("click", showNoteChart);
document.getElementById("menu-keychart").addEventListener("click", showKeyChart);

// Which deck is on the cards screen: the clef's notes, or the key signatures.
// The two decks work the same way — a staff on the front, a name on the back —
// so they share the screen, the flip and the stepping, and differ only in what
// is drawn and what is named.
let cardMode = "notes";

function cardDeck() {
  return cardMode === "keys" ? keyCardOrder() : activeNotePool();
}

// The key deck runs outward from the middle of the circle of fifths: C first,
// then the one-accidental keys, and so on out to the seven. A deck that opened
// on seven flats would be teaching the hardest card first; this way each card
// adds an accidental to the one before it. Sharps come before flats at equal
// distance, arbitrarily but consistently.
function keyCardOrder() {
  return [...KEYS].sort(
    (a, b) =>
      Math.abs(a.accidentals) - Math.abs(b.accidentals) ||
      b.accidentals - a.accidentals,
  );
}

// One card's front for the key deck: the clef and a signature. Every card is
// drawn on the same canvas, sized to the widest signature there is, so a
// seven-sharp signature and a bare C major staff come out at the same scale
// instead of each being blown up to fill the card.
function renderCardKeySignature(faceEl, key) {
  const renderer = new Renderer(faceEl, Renderer.Backends.SVG);
  const context = renderer.getContext();

  const styles = getComputedStyle(document.documentElement);
  const staffColor = styles.getPropertyValue("--staff-color").trim();
  context.setFillStyle(staffColor);
  context.setStrokeStyle(staffColor);

  let widest = 0;
  for (const entry of KEYS) {
    const probe = new Stave(0, 0, 400);
    probe.addClef(currentClef.id);
    probe.addKeySignature(entry.vf);
    probe.setContext(context);
    widest = Math.max(widest, probe.getNoteStartX());
  }

  const staveWidth = widest + KEY_STAVE_TRAILING;
  const WIDTH = staveWidth + 20;
  // Room above and below the five lines for the accidentals that sit outside
  // them, plus what the clef glyph overhangs.
  const staveY = 14;
  const height = staveY + 40 + 40 + 26;
  renderer.resize(WIDTH, height);

  const stave = new Stave(10, staveY, staveWidth);
  stave.addClef(currentClef.id);
  stave.addKeySignature(key.vf);
  stave.setContext(context).draw();

  tintKeySignature(faceEl, styles.getPropertyValue("--note-current").trim());
  scaleCardSvg(faceEl, WIDTH, height);
}

// Hands the SVG over to CSS: a viewBox and no size of its own, so the card's
// width decides how big the staff comes out. VexFlow writes the size it was
// resized to as attributes *and* as an inline style, and the inline one would
// otherwise outrank the stylesheet.
function scaleCardSvg(faceEl, width, height) {
  const svg = faceEl.querySelector("svg");
  if (!svg) return;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.width = "";
  svg.style.height = "";
}

// --- The order the deck is worked through ---
// Straight through it, or shuffled. Shuffled asks the same thing of the player
// that the note game does: with no telling what is coming, there is a moment to
// name the card to yourself before turning it over. It is a shuffle rather than
// a draw, so every card still comes up once before any comes up twice — the
// deck is a deck, not a bag. The choice persists under "cardOrder", and it
// works both decks, since the control sits on the screen they share.
const CARD_ORDER_STORAGE_KEY = "cardOrder";
let cardShuffle = localStorage.getItem(CARD_ORDER_STORAGE_KEY) === "random";

// Positions into cardDeck(), in the order the cards come out: deck order
// itself, or a shuffle of it. renderCards rebuilds it whenever the deck it
// indexes into has changed length underneath it.
let cardOrder = [];

// `avoidFirst` is the position just seen, where there is one: a reshuffle that
// deals the same card again reads as the deck having stuck rather than as
// chance, so it is moved one place down.
function resetCardOrder(avoidFirst = null) {
  const positions = cardDeck().map((_, i) => i);
  cardOrder = cardShuffle ? shuffled(positions) : positions;
  if (cardOrder.length > 1 && cardOrder[0] === avoidFirst) {
    [cardOrder[0], cardOrder[1]] = [cardOrder[1], cardOrder[0]];
  }
}

// Which card of the deck is showing. cardIndex counts through the order, and
// the order is what points into the deck. It is kept across redraws — a theme
// change should not send the player back to the first card — and clamped by
// renderCards when the deck it indexes into gets shorter.
let cardIndex = 0;

function currentCard() {
  return cardDeck()[cardOrder[cardIndex]];
}

function markCardOrder() {
  cardOrderEl.querySelectorAll("[data-order]").forEach((btn) => {
    const active = (btn.dataset.order === "random") === cardShuffle;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", String(active));
  });
}

function applyCardOrder(order) {
  cardShuffle = order === "random";
  localStorage.setItem(CARD_ORDER_STORAGE_KEY, order);
  markCardOrder();
  // The new order starts at its own first card: a position counted through an
  // order that no longer holds would point at nothing in particular.
  cardIndex = 0;
  resetCardOrder();
  redrawCards();
}

cardOrderEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-order]");
  if (!btn) return;
  applyCardOrder(btn.dataset.order);
});

function renderCards() {
  noteCardsEl.replaceChildren();
  cardsPositionEl.textContent = "";

  // Only the note deck can come out empty — the key signatures are a fixed
  // list, not something a clef has to have notes for.
  if (cardMode === "notes" && currentClef.notePool.length === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = t("cards.empty");
    noteCardsEl.appendChild(empty);
    return;
  }

  const deck = cardDeck();
  // The deck can have changed length since the order was dealt — a narrowed
  // range, or the other deck entirely.
  if (cardOrder.length !== deck.length) resetCardOrder();
  cardIndex = Math.min(Math.max(cardIndex, 0), deck.length - 1);
  const entry = deck[cardOrder[cardIndex]];

  const card = document.createElement("button");
  card.type = "button";
  card.className = "note-card";
  card.setAttribute("aria-pressed", "false");

  const inner = document.createElement("span");
  inner.className = "note-card-inner";

  const front = document.createElement("span");
  front.className = "note-card-face note-card-front";

  const name = document.createElement("span");
  name.className = "note-card-name";

  if (cardMode === "keys") {
    card.setAttribute("aria-label", keyName(entry));
    renderCardKeySignature(front, entry);
    name.textContent = keyName(entry);
  } else {
    card.dataset.tonic = entry.key;
    // The drawing on the front is out of a screen reader's reach, so the
    // card's name is the note's — the answer, which is what the front says to
    // everyone who can see it.
    card.setAttribute("aria-label", noteLabel(currentClef, entry.key));
    // The geometry is measured across the whole deck rather than this one
    // note, so the staff keeps the same size and the same middle line from
    // card to card — otherwise a note with ledger lines would shift the staff
    // under the player as they step through.
    renderCardStaff(
      front,
      entry,
      staffGeometry(
        currentClef,
        deck.map((note) => diatonicStep(note.key)),
      ),
    );
    name.textContent = cardNoteName(entry);
  }

  const back = document.createElement("span");
  back.className = "note-card-face note-card-back";
  back.appendChild(name);

  inner.append(front, back);
  card.appendChild(inner);
  noteCardsEl.appendChild(card);

  cardsPositionEl.textContent = t("cards.position", {
    index: cardIndex + 1,
    total: deck.length,
  });
}

// Moves on through the deck, wrapping at the end: a deck worked through with
// one key has no last page to be stranded on, and the position line says where
// you are. The card is rebuilt, which turns it back face-up — the next one is
// a new question, not the previous answer.
function stepCard(delta) {
  const total = cardDeck().length;
  if (total === 0) return;
  const next = cardIndex + delta;
  // Off the end and round again. A shuffled deck is dealt afresh at that point,
  // so a second pass is a second order rather than a rerun of the first.
  if (cardShuffle && (next >= total || next < 0)) {
    resetCardOrder(cardOrder[cardIndex]);
  }
  cardIndex = (next + total) % total;
  renderCards();
}

// Note colours are read from CSS at draw time and the deck follows the clef
// and the range, so anything that moves those redraws the cards — but only
// while they are the screen being looked at.
function redrawCards() {
  if (!cardsScreen.hidden) renderCards();
}

// How long the answer stays up before the deck moves on. Long enough to read a
// name and hear the note under it; a second press cuts it short.
const CARD_REVEAL_MS = 1600;
let cardAdvanceTimer = null;

function clearCardAdvance() {
  if (cardAdvanceTimer === null) return;
  clearTimeout(cardAdvanceTimer);
  cardAdvanceTimer = null;
}

// The whole deck is worked through with one key. A press turns the card over
// and sounds it, and the deck moves on by itself a moment later; a press while
// the answer is up skips that wait, so reading fast is never held up by the
// timer.
function revealOrAdvance() {
  const card = noteCardsEl.querySelector(".note-card");
  if (!card) return;

  clearCardAdvance();

  if (card.classList.contains("flipped")) {
    stepCard(1);
    return;
  }

  card.classList.add("flipped");
  card.setAttribute("aria-pressed", "true");
  // Hearing the card alongside its name is half of what the deck is for: the
  // note itself, or — since a key card names two keys — the two chords built on
  // the tonics it names.
  if (cardMode === "keys") {
    playKeyTriads(currentCard());
  } else {
    playPianoNote(card.dataset.tonic);
  }
  cardAdvanceTimer = setTimeout(() => {
    cardAdvanceTimer = null;
    stepCard(1);
  }, CARD_REVEAL_MS);
}

noteCardsEl.addEventListener("click", (event) => {
  if (!event.target.closest(".note-card")) return;
  revealOrAdvance();
});

window.addEventListener("keydown", (event) => {
  if (cardsScreen.hidden || !appSettingsMenu.hidden) return;
  if (event.key !== " " && event.code !== "Space") return;
  // Stops the page scrolling — and stops a card that has the focus being
  // activated a second time by the click a Space on a button leaves behind.
  event.preventDefault();
  revealOrAdvance();
});

function showScreen(screen) {
  // Leaving the cards screen cancels an advance that has not fired yet.
  clearCardAdvance();
  // One way out, in the same place on every screen. The menu is the one screen
  // there is nothing behind, so it is the one screen without it.
  toolbarBack.hidden = screen === menuScreen;
  for (const s of [
    menuScreen,
    setupScreen,
    cardsScreen,
    noteChartScreen,
    keyChartScreen,
    gameScreen,
    keysScreen,
    resultsScreen,
  ]) {
    s.hidden = s !== screen;
  }
}

// The start screen: one entry per thing the app can do. Everything else is
// reached from here, and every other screen has a way back to it.
function showMenu() {
  gameActive = false;
  showScreen(menuScreen);
}

// The note-count picker is shared: which game it starts is whichever one led
// here. The title names that game, and it names it through data-i18n rather
// than by being written directly, so a language change re-translates the right
// string.
function showSetup(mode = gameMode) {
  gameActive = false;
  gameMode = mode;
  setupTitleEl.dataset.i18n =
    mode === "keys" ? "setup.titleKeys" : "setup.title";
  setupTitleEl.textContent = t(setupTitleEl.dataset.i18n);
  buildNoteCountOptions();
  showScreen(setupScreen);
}

// The heading names the deck being shown, and it names it through data-i18n
// rather than by being written directly, so a language change re-translates
// the right string. The hint is the same for both decks: it describes the one
// key that works them, not what is on the cards.
function showCards(mode = "notes") {
  gameActive = false;
  cardMode = mode;
  cardsTitleEl.dataset.i18n =
    mode === "keys" ? "cards.titleKeys" : "cards.title";
  cardsTitleEl.textContent = t(cardsTitleEl.dataset.i18n);
  cardIndex = 0;
  // A shuffled deck is dealt afresh every time it is opened.
  resetCardOrder();
  renderCards();
  showScreen(cardsScreen);
}

function beginGame(questionCount) {
  totalNotes = questionCount;
  if (gameMode === "keys") {
    showScreen(keysScreen);
    startKeysGame();
  } else {
    showScreen(gameScreen);
    startGame();
  }
  gameActive = true;
}

// Starts the round in progress over: a clef change makes the notes already on
// screen unreadable in the new clef.
function restartRound() {
  if (gameMode === "keys") {
    startKeysGame();
  } else {
    startGame();
  }
}

// Whatever is on screen, redrawn for a new palette, a new clef or a new
// window width. Both games read their colours from CSS at draw time.
function redrawCurrentGame() {
  if (gameMode === "keys") {
    renderKeysRound();
  } else {
    renderNotation();
  }
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
  markPlayed(gameMode, totalNotes);

  const total = correct + wrong;
  lastAccuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  renderResults(lastAccuracy);
  showScreen(resultsScreen);
}

window.addEventListener("keydown", (event) => {
  // The settings dialog owns the keyboard while it is open, so a stray letter
  // there is not counted as an answer.
  if (!appSettingsMenu.hidden) return;
  // A held key auto-repeats, and every repeat would be counted as another
  // wrong answer — a leaned-on key could run the whole round out. Only the
  // first press of a key answers; releasing it and pressing again is still as
  // fast as the player can manage, which is not something to slow down.
  if (event.repeat) return;
  // On the results screen, Tab quickly replays the same round — of whichever
  // game the round that just ended belonged to.
  if (event.key === "Tab" && !resultsScreen.hidden) {
    event.preventDefault();
    beginGame(totalNotes);
    return;
  }
  // The key game is answered by 1-4, which count along the options from the
  // left; the note game by the letter naming a note. Neither is meaningful in
  // the other. The numbers are not drawn on the options — they would be four
  // more things to read on a screen that is already asking one question — so
  // this is a shortcut for whoever finds it, not the advertised way in.
  if (gameMode === "keys") {
    const choice = Number(event.key);
    if (!Number.isInteger(choice) || choice < 1 || choice > KEY_CHOICES) return;
    const btn = keyOptionsEl.children[choice - 1];
    if (btn) handleKeyGuess(btn.dataset.key);
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
  setRangeFromNote(hit.dataset.key);
});

// Wrapped rather than passed directly: showSetup takes a mode, and a listener
// hands its own first argument — the click event — straight into it.
playAgainBtn.addEventListener("click", () => showSetup());

// --- Main menu ---
// The key-signature game (#menu-keys) is in the markup but disabled: it is
// announced here rather than hidden, so the shape of the app is visible before
// the game behind it exists. Give it a click handler when it does.
document
  .getElementById("menu-notes")
  .addEventListener("click", () => showSetup("notes"));
document
  .getElementById("menu-keys")
  .addEventListener("click", () => showSetup("keys"));
document
  .getElementById("menu-cards")
  .addEventListener("click", () => showCards("notes"));
document
  .getElementById("menu-keycards")
  .addEventListener("click", () => showCards("keys"));

notePadEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-note]");
  if (!btn) return;
  handleGuess(btn.dataset.note);
});

window.addEventListener("resize", () => {
  redrawCurrentGame();
  if (!appSettingsMenu.hidden) redrawRangeStaff();
  // The note chart's staff is measured, so it has to be redrawn at the new
  // width; the key chart's tiles are scaled by CSS and look after themselves.
  if (!noteChartScreen.hidden) renderNoteChart();
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
  buildNoteCountOptions();
  buildRangeEditor();
  redrawCards();
  redrawCharts();
  redrawCurrentGame();
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
  redrawCurrentGame();
  // Note colors are read from CSS at draw time, so the range staff has to be
  // redrawn for the new palette.
  if (!appSettingsMenu.hidden) redrawRangeStaff();
  redrawCards();
  redrawCharts();
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
  // The range is per clef, so the panel has to be redrawn for the clef that is
  // now showing.
  buildRangeEditor();
  redrawCards();
  redrawCharts();
  if (gameActive) {
    restartRound();
  } else {
    redrawCurrentGame();
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
  // The dialog stays open — applyClef rebuilds the range staff below for the
  // clef that is now showing, and that is worth seeing.
  applyClef(id);
});

// --- Settings dialog ---
// Clef, theme and note ranges are all set once and then forgotten, so none of
// them sit on screen for the whole game: the gear button opens them together.
function setAppSettingsOpen(open) {
  // The staff is about to appear under, or vanish from under, a pointer that
  // has not moved: whatever it was hovering no longer holds.
  clearRangeHover();
  appSettingsMenu.hidden = !open;
  appSettingsBackdrop.hidden = !open;
  appSettingsToggle.setAttribute("aria-expanded", String(open));
  // A hidden dialog has no width, so the range staff can only be laid out once
  // it is on screen.
  if (open) redrawRangeStaff();
}

function closeAppSettings() {
  setAppSettingsOpen(false);
}

toolbarBack.addEventListener("click", showMenu);

appSettingsToggle.addEventListener("click", () => {
  setAppSettingsOpen(appSettingsMenu.hidden);
});

appSettingsBackdrop.addEventListener("click", closeAppSettings);

document
  .getElementById("app-settings-done")
  .addEventListener("click", closeAppSettings);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  // The dialog is on top, so it goes first; a second Escape then steps back
  // out of whichever screen the menu led to. A running game is left alone —
  // there is no half-finished round to walk out of by accident.
  if (!appSettingsMenu.hidden) {
    closeAppSettings();
  } else if (
    !cardsScreen.hidden ||
    !setupScreen.hidden ||
    !noteChartScreen.hidden ||
    !keyChartScreen.hidden
  ) {
    showMenu();
  }
});

buildNoteCountOptions();
buildRangeEditor();
buildNotePad();
markCardOrder();
// Last, so it can rebuild every menu above in the saved language.
applyLanguage(currentLanguage.id);
showMenu();

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
