# Nuottipeli

A note reading trainer in Finnish and Swedish. Notes appear on a staff and you
name them by pressing the letter key — the Nordic way, so B is `h`. There is a
second game for key signatures, card decks and reference charts for both, and
seven out-of-copyright melodies to read instead of a plain count of notes.

## Running it

There is no build step and no package manager. Open `index.html` in a browser.
VexFlow is loaded from a CDN, so the first load needs a network connection.

## Deployment

Pushes to `main` deploy to Cloudflare as a static-asset Worker; `wrangler.jsonc`
serves the repo root and `.assetsignore` keeps everything that is not the site
out of the upload.
