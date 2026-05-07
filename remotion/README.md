# Maqam Landing Page – Remotion

Source for the four hero videos embedded in `index.html` (the landing page).

## Compositions

| ID         | File                       | Duration | Description                                  |
| ---------- | -------------------------- | -------- | -------------------------------------------- |
| Hero       | `public/videos/hero.mp4`   | 6s       | Title, tagline, animated note row            |
| ScaleDemo  | `public/videos/scale.mp4`  | 9s       | Maqam Rast played up and down with waveform |
| Exercises  | `public/videos/exercises.mp4` | 8s    | Practice patterns animated over a note grid  |
| Languages  | `public/videos/languages.mp4` | 9s    | EN / HE / AR cards with full RTL support     |

## Develop

```bash
cd remotion
npm install
npm start          # opens Remotion Studio for live preview
```

## Render all four MP4s

The render script bundles the project and writes MP4s into
`../public/videos/`:

```bash
cd remotion
npm install
node render.mjs
```

Or render one at a time:

```bash
npm run render:hero
npm run render:scale
npm run render:exercises
npm run render:languages
```

The first render downloads a Remotion-managed copy of headless Chromium.
On systems behind a strict proxy you may need to install Chromium manually
and point Remotion at it via `REMOTION_CHROME_EXECUTABLE`.
