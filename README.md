# Maqam Notes Player

Static, client-only maqam notes player with loop controls, pitch display, and multi-language UI (EN/HE/AR).

## Structure
- `index.html` — page shell + inline CSS
- `app.js` — routing, playback, UI logic
- `maqam-compact.json` — maqam data (notes + frequencies)
- `i18n.json` — translations (UI strings + maqam/jins names)

## Run Locally
You must use a local server (fetch for JSON will not work with `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

Alternative (Node):

```bash
npx serve .
```

## Language Routes
- English: `#/`
- Hebrew (RTL): `#/he`
- Arabic (RTL): `#/ar`

## Editing Translations
Update `i18n.json`:
- `header.*`, `controls.*`, `live.*` for UI text
- `maqamNames` for maqam display names
- `jinsNames` for lower/upper jins display names

## Notes
- Mic module is currently disabled in code (`MIC_ENABLED = false` in `app.js`).
- GA4 is enabled via `G-7823BS2G20` in `index.html`.
