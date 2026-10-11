# Fonts

The app's two typefaces, as the WOFF2 files Google Fonts serves, kept in the
repository so the page depends on no CDN. Both are licensed under the SIL Open
Font License 1.1; the licence texts are alongside.

| Files                         | Typeface                         | Licence                    |
| ----------------------------- | -------------------------------- | -------------------------- |
| `dm-sans-*.woff2`             | DM Sans (variable, weights 400–600 used) | `DM-Sans-OFL.txt`  |
| `dm-serif-display-*.woff2`    | DM Serif Display                 | `DM-Serif-Display-OFL.txt` |

`-latin` covers Finnish and Swedish; `-latin-ext` is fetched only if a
character outside it appears. The `@font-face` rules are at the top of
`styles.css`.
