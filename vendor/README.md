# Vendored code

Third-party code the app loads, kept in the repository so the page depends on
no CDN.

| File         | What                                                     | Licence                  |
| ------------ | -------------------------------------------------------- | ------------------------ |
| `vexflow.js` | [VexFlow](https://www.vexflow.com) 4.2.5, the `cjs` build | MIT (`vexflow.LICENSE`) |

`vexflow.js` is the file jsDelivr serves at
`npm/vexflow@4.2.5/build/cjs/vexflow.js`, unmodified
(`sha384-hTp5EB4x3B2hpyg2cOUxiLQjsEiWr0zbn6ABKZvaJm4hMThks7+F9ruInnkC3Vse`).
To upgrade, replace it with the same build of the new version and update the
version here and in `CLAUDE.md`.
