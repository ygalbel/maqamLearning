# Maqam Notes Player

Static, client-only maqam notes player with loop controls, pitch display, and multi-language UI (EN/HE/AR).

## Structure
- `index.html` — landing page (with Remotion-rendered videos)
- `app.html` — the player app shell + inline CSS (was previously `index.html`)
- `app.js` — routing, playback, UI logic
- `maqam-compact.json` — maqam data (notes + frequencies)
- `i18n.json` — translations (UI strings + maqam/jins names)
- `remotion/` — Remotion source for the landing-page videos
- `public/videos/` — rendered MP4s shown on the landing page

## Run Locally
You must use a local server (fetch for JSON will not work with `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`. The landing page links into the app.

Alternative (Node):

```bash
npx serve .
```

## Language Routes
The app lives at `app.html`:
- English: `app.html#/`
- Hebrew (RTL): `app.html#/he`
- Arabic (RTL): `app.html#/ar`

## Landing-page videos
The landing page (`index.html`) embeds four MP4s rendered with Remotion.
See `remotion/README.md` for how to edit and re-render them.

## Editing Translations
Update `i18n.json`:
- `header.*`, `controls.*`, `live.*` for UI text
- `maqamNames` for maqam display names
- `jinsNames` for lower/upper jins display names

## Notes
- Mic module is currently disabled in code (`MIC_ENABLED = false` in `app.js`).
- GA4 is enabled via `G-7823BS2G20` in `app.html` and `index.html`.
