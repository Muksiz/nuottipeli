# Nuottipeli

A note reading trainer in Finnish and Swedish. Notes appear on a staff and you
name them by pressing the letter key — the Nordic way, so B is `h`. There is a
second game for key signatures, card decks and reference charts for both, and
seven out-of-copyright melodies to read instead of a plain count of notes.

## Running it

There is no build step and no package manager. Open `index.html` in a browser.
Nothing is loaded from a CDN: VexFlow is in `vendor/` and the fonts in `fonts/`.

The instrument sounds are recordings fetched from `sounds/`, which a browser
only allows over HTTP — opened straight off the disk the app still works, but
plays a synthesised tone instead. `vite .` or any static file server will do.

## Credits

The piano, guitar and clarinet notes are from the FluidR3_GM soundfont by Frank
Wen, licensed CC BY 3.0. See `sounds/README.md`.

Notation is drawn by [VexFlow](https://www.vexflow.com) (MIT, `vendor/`). The
typefaces are DM Sans and DM Serif Display (SIL OFL 1.1, `fonts/`).

## Deployment

Pushes to `main` deploy to Cloudflare as a static-asset Worker; `wrangler.jsonc`
serves the repo root and `.assetsignore` keeps everything that is not the site
out of the upload.

CI/CD test
