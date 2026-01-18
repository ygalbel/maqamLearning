# Repository Guidelines

## Project Structure & Module Organization
This is a static, client-only site.
- `index.html` contains the page shell and inline CSS.
- `app.js` implements routing, audio playback, and pitch detection.
- `maqam-compact.json` is the data source for maqam metadata and note frequencies.

There is no build system or server code; changes are made directly in these files.

## Build, Test, and Development Commands
Run a local static server (required for `fetch` to load JSON):
```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080/`. There are no build or bundling steps.

If you prefer Node:
```bash
npx serve .
```

## Coding Style & Naming Conventions
- Indentation: 2 spaces in HTML/CSS/JS (match existing files).
- JavaScript: plain ES6; no framework. Prefer `const`/`let`, camelCase for functions/variables.
- DOM ids/classes are kebab-case or camelCase already in use (follow existing patterns).
- Keep UI strings short; update `index.html` for layout/styling changes and `app.js` for behavior.

## Testing Guidelines
No automated tests are set up. Validate changes manually:
- Load the list page and a maqam detail page.
- Verify audio playback and the loop controls.
- Check mic permissions and pitch display behavior.

## Commit & Pull Request Guidelines
Git history is minimal and does not define a formal convention. Use short, imperative commit messages (e.g., "Improve pitch display"). For pull requests, include:
- A brief description of the change and motivation.
- Screenshots or a short clip for UI changes.
- Notes about any data updates to `maqam-compact.json`.

## Security & Configuration Tips
- Mic access uses `getUserMedia`; test in a secure context (localhost or HTTPS).
- Keep `maqam-compact.json` values numeric and consistent (`note`, `frequency`).
