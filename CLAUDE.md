# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nuottipeli ("note game") is a music note recognition trainer. It displays notes on a treble clef staff and the player identifies them by pressing the corresponding letter key. The app is entirely in Finnish.

## Development

No build step, no package manager. Open `index.html` in a browser to run. The entire app is three files:

- `index.html` — markup, loads VexFlow from CDN
- `script.js` — game logic, audio synthesis, theme system
- `styles.css` — themes (via CSS custom properties + `data-theme` attribute), layout, animations

## Architecture

**Notation rendering**: Uses VexFlow 4.2.5 (CDN) to draw notes on an SVG staff. The visible window scrolls forward as the player progresses, keeping a few past notes visible for context (`CONTEXT_BEHIND`). Note colors (past/current/future) come from CSS custom properties read at render time.

**Audio**: Web Audio API piano synthesis — layered sine oscillators with harmonics and exponential decay envelopes. No audio files. Error feedback uses a dissonant sawtooth pair.

**Note naming**: Nordic convention — the note B is called "h" (accepts both "h" and "b" as correct input). Shared by both UI languages, so note names are never translated.

**Language**: Finnish (default) and Swedish. Every user-visible string lives in `STRINGS` in `script.js`, keyed identically per language, and is read through `t(key, vars)` (`{index}`-style placeholders; a missing key falls back to Finnish). Static markup keeps its Finnish text plus a `data-i18n="key"` (textContent) or `data-i18n-aria="key"` (aria-label) hook. `applyLanguage()` translates the static text and rebuilds every JS-drawn menu; the builders mark their own active entry, so selections survive the rebuild and a running game is not restarted. The choice persists in `localStorage` under `"language"`. Clef, difficulty and theme entries carry no `label` field — their names are looked up as `clef.<id>`, `difficulty.<id>`, `theme.<id>`.

**Difficulty**: Three levels (`DIFFICULTIES` in `script.js`) that only change the range of notes drawn. Each level's `spread` gives a *default* range: the active clef's `notePool` cropped to a band of diatonic steps around the clef's middle staff line — easy stays on the staff, medium allows one ledger line either side, hard uses the whole pool. Chosen on the setup screen and persisted in `localStorage` under `"difficulty"`.

**Note ranges**: The settings dialog's "Nuottialueet" section overrides any level's range with an explicit lowest/highest note picked from the current clef's pool. Overrides are stored per clef and per level in `localStorage` under `"noteRanges"` as `{ "<clefId>:<difficultyId>": { low, high } }`; anything missing or naming notes the clef lacks falls back to the `spread` default. The reset button clears only the current clef's levels. The range is shown by the highlighted notes on each level's staff and by `.range-band`, a band drawn across them — no textual "C4–F5" labels anywhere.

**Setting a range**: the whole staff is the control. A press grabs whichever end of the range is nearer (a range collapsed onto one note opens toward the pressed note instead), and sliding drags that end from note to note; it stops at the other end rather than crossing it. Only the band moves during a drag — the staff is redrawn once, on release, by `commitRange`, which also drops an edit that changes nothing. This matters on a phone, where a note's column is only ~15px wide: the player aims with the band, not with the column. `.range-staff` is `touch-action: pan-y` so a vertical swipe still scrolls the dialog, and a gesture the browser takes over arrives as `pointercancel` and is rolled back. The `.range-hit` buttons remain one per note for the keyboard and for screen readers; the click handler behind them takes only keyboard activations (`event.detail === 0`), since a press has already applied itself by the time its click arrives.

A staff is drawn only once it has a width. Drawing one at a fallback width while the dialog is still `hidden` widened the grid track it sits in, and the redraw on open then measured that inflated track instead of the dialog — which pushed the staves off the side of a phone screen.

**Settings dialog**: The gear button in the toolbar is the only always-visible control. It opens a centered modal (`#app-settings-menu`, with a backdrop) holding the language list, the clef list, the theme list and the note-range editor — all of them are set once and then forgotten, so none take up room during play. The first three sit side by side in `.app-settings-cols`. The clef and theme lists keep their `.clef-menu` / `.theme-menu` class names from when they were dropdowns of their own, and `.lang-menu` shares the clef list's rules. The sections have no visible headings — their names live on as `aria-label`s. The reset and "Valmis" buttons sit in `.app-settings-bar`, a sticky header at the top of the dialog, so they stay reachable without scrolling past the note-range rows.

**Theme system**: 5 themes (2 light, 3 dark) defined as `[data-theme="name"]` CSS blocks. JS sets the attribute on `<html>`. Theme choice persists in `localStorage` under key `"theme"`. Ids that are no longer in `THEMES` are mapped through `LEGACY_THEME_IDS` and the resolved id is written back, so each entry only has to outlive the browsers still holding it: `"dark"`/`"light"` predate the named themes, and `"nord"` was the id of `storm` (Myrsky / Storm) while it still carried the name of the palette it was drawn from.

**Input**: Keyboard only — single letter keypress triggers `handleGuess()`. No on-screen buttons for note input.
