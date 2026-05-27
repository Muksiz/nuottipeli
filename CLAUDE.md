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

**Note naming**: Finnish convention — the note B is called "h" (accepts both "h" and "b" as correct input).

**Theme system**: 8 themes (4 light, 4 dark) defined as `[data-theme="name"]` CSS blocks. JS sets the attribute on `<html>`. Theme choice persists in `localStorage` under key `"theme"`. Backward-compatible with legacy `"dark"`/`"light"` values.

**Input**: Keyboard only — single letter keypress triggers `handleGuess()`. No on-screen buttons for note input.
