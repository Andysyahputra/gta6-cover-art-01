# Vice Cover Studio

[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/c/gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Andysyahputra/gta6-cover-art-01/rank.svg)](https://make.fun/c/gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Andysyahputra/gta6-cover-art-01/reward.svg)](https://make.fun/c/gta6-cover-art-01)

A web app that turns your photo into GTA-style cover art: multi-panel poster
layouts, bold caption lettering, Vice City sunset and neon colour grades, and
a one-click PNG export in 1080×1080, 1080×1350 or 1920×1080.

Built for the [make.fun GTA 6 Cover Art bounty](https://make.fun/c/gta6-cover-art-01).

## How it works

Open `app/index.html` in a desktop browser (or serve `app/` with any static
server). No network, no build step, no upload — photos are read on your own
machine.

1. **Photos** — upload up to 3 photos, or tap *Use demo photos* to try the
   two AI-generated sample portraits.
2. **Layout** — Sunset Grid (3 panels), Neon Split (2 panels) or Solo
   Spotlight (1 panel).
3. **Colour grade** — Sunset, Neon Nights or Vice Duotone. Each grade applies
   a poster treatment: saturation, a warm/cool wash and halftone dots.
4. **Caption** — title and subtitle, position (top/bottom) and title colour.
5. **Photo position** — click a panel, drag its photo to reposition, scroll
   or slide to zoom, fit or swap panels.
6. **Export** — pick a post size and download the cover as a PNG.

## Files

- `app/index.html` — the editor page
- `app/styles.css` — dark neon editor UI
- `app/app.js` — the poster engine (canvas layouts, grades, lettering, export)
- `app/samples/` — two AI-generated demo portraits, free to use
- `main.ts` — entry program: copies `app/` and `screenshots/` to `/output`
  and writes `dossier.json`
- `screenshots/` — 3–4 screenshots of the app and covers it exported

## Notes

An original work: no Rockstar Games logo, artwork or fonts. Lettering uses
system fonts (Impact / Arial Black) with hand-drawn canvas effects. Demo
portraits are illustrations of fictional people made with an image model.
