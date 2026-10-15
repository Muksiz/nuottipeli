# Nuottipeli

A note reading trainer in Finnish and Swedish. Notes appear on a staff and you
name them by pressing the letter key — the Nordic way, so B is `h`. There is a
second game for key signatures, a third for intervals and a fourth for telling
instruments apart by ear, card decks and reference charts, and seven
out-of-copyright melodies to read instead of a plain count of notes.

## Running it

There is no build step and no package manager. Open `index.html` in a browser.
Nothing is loaded from a CDN: VexFlow is in `vendor/` and the fonts in `fonts/`.

The instrument sounds are recordings fetched from `sounds/`, which a browser
only allows over HTTP — opened straight off the disk the app still works, but
plays a synthesised tone instead. `vite .` or any static file server will do.

## Credits

Every recorded note is from the FluidR3_GM soundfont by Frank Wen, licensed
CC BY 3.0. See `sounds/README.md`.

The instrument photographs are from Wikimedia Commons, each under its own
licence — public domain, CC BY or CC BY-SA. `images/README.md` lists every
one with its author, source and licence.

Notation is drawn by [VexFlow](https://www.vexflow.com) (MIT, `vendor/`). The
typefaces are DM Sans and DM Serif Display (SIL OFL 1.1, `fonts/`).

## Deployment

Pushes to `main` deploy to Cloudflare as a static-asset Worker; `wrangler.jsonc`
serves the repo root and `.assetsignore` keeps everything that is not the site
out of the upload. It is served at `nuottipeli.janix.fi` only: the config
turns the `workers.dev` addresses off, since wrangler turns them on when the
setting is absent.

CI/CD test
