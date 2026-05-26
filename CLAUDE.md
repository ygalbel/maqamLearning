# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A maqam (Arabic scale) notes player. Two layers, deployed together to GitHub Pages at **https://ygalbel.github.io/maqamLearning/**:

1. **Landing pages** — static `index.html` (EN), `he.html` (HE), `ar.html` (AR) at the repo root, embedding Remotion-rendered videos from `public/videos/`. These are the site homepage; their "enter" links point into the app at `app/#…` (e.g. `app/#/he`, `app/#/exercises`).
2. **The app** — a **Vite + Svelte 5 (runes) + TypeScript** SPA in `web/`. This is the rebuilt player (it replaced the old vanilla `app.html`/`app.js`, which were removed). It is served under `/app/` on the published site.

The old root-level player files (`app.html`, `app.js`, `audio.js`, `config.js`, `data.js`) are gone. The root `service-worker.js` is now a **kill-switch** that unregisters the stale worker old visitors may still have — do not turn it back into a caching worker.

## Commands

The app lives in `web/` (run all of these from there):

```bash
cd web
npm install
npm run dev      # Vite dev server (http://localhost:5173)
npm run build    # production build -> web/dist
npm run check    # svelte-check + tsc — run this before committing; keep it at 0 errors
```

There are no automated tests; `npm run check` is the gate. Validate behavior manually in the dev server.

Remotion landing videos are a separate npm project in `remotion/` (`npm start` for studio, `node render.mjs` to render). See `remotion/README.md`.

## Architecture (the `web/` app)

- **Data is the single source of truth and unchanged.** `maqam-compact.json` and `i18n.json` stay at the **repo root** and are imported into the build via the `@data` Vite alias (`vite.config.ts` aliases `@data` → `..`, with `server.fs.allow: ['..']`). They are bundled into the JS — there is no runtime fetch. Editing them changes both the (now-removed) expectations and the new app.
- **`src/lib/` — framework-agnostic core:**
  - `audio.ts` — Web Audio; sampled soundfont (npm `soundfont-player`) with a synthesized oud-like fallback; `installAudioUnlock()` for mobile.
  - `maqam.ts` — pure music theory: interval-in-cents, tonic index, jins grouping (`getUpperGroupData` etc.), `buildNoteSections()` (returns render data, not HTML), and the sequencing helpers (`buildScaleList`, `buildDefaultSelectionSet`, `getUpperGroupForIndex`).
  - `i18n.svelte.ts` / `router.svelte.ts` — reactive global state via Svelte 5 `$state` exported from `.svelte.ts` modules. `t()` resolves flat keys with `{var}` substitution, falling back to English. Hash router preserves the scheme `#/`, `#/he`, `#/ar/maqam/<key>`, `#/exercises|quiz|looper`.
- **Routing/layout:** `App.svelte` is the hash-routed shell (header, nav, language switch, RTL via `<html dir>`). Each `routes/*.svelte` page replaces the others; `{#key}` remounts on route change so page-local timers/audio are torn down via `onDestroy`.
- **The Explore page (`routes/Maqam.svelte`) is intentionally minimal:** tap a note to hear it, no sticky selection — only a transpose control. All sequencing (selection, loops, patterns) lives in **Exercises / Looper**. Don't reintroduce note-selection on the Maqam page.
- **`components/NotePad.svelte` + `NoteGrid.svelte`** are shared; NotePad has optional `selectable`/`active` modes used by Exercises and Looper.

### Data shapes (`maqam-compact.json`)
Keyed by lowercase maqam name. Each: `tonic`, `lower_jins`, optional `lower_jins_groups`, `upper_jins` (a **string OR an array of `{name, scale}` groups** — handle both), and `scale` (array of `{note, frequency, jins?}`). Note names may carry a quarter-tone suffix like `B4-Koron`; intervals are computed from frequency ratios, not stored. `i18n.json` has per-language flat keys plus nested `maqamNames` / `jinsNames`.

## Deployment

GitHub Pages via **GitHub Actions** (`.github/workflows/deploy.yml`), triggered on push to `main`. The workflow builds `web/`, then assembles `_site/`: landing pages + `public/` + `favicon.svg` + `manifest.json` + `icons/` + the kill-switch `service-worker.js` at the root, and `web/dist` under `/app/`. Pages is configured with `build_type: workflow`. The app uses Vite `base: './'`, so it is path-agnostic and works under `/maqamLearning/app/`. The app's own PWA service worker (vite-plugin-pwa) is scoped to `/app/`.

When changing published assets, no manual cache bumps are needed — vite-plugin-pwa regenerates the precache manifest each build.
