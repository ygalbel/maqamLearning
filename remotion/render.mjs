#!/usr/bin/env node
// Renders all four compositions to ../public/videos/*.mp4
// Usage: node render.mjs   (run from the remotion/ directory)

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "public", "videos");

const COMPOSITIONS = ["Hero", "ScaleDemo", "Exercises", "Languages"];

const FILE_NAMES = {
  Hero: "hero.mp4",
  ScaleDemo: "scale.mp4",
  Exercises: "exercises.mp4",
  Languages: "languages.mp4",
};

(async () => {
  await mkdir(outDir, { recursive: true });

  console.log("Bundling Remotion project...");
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, "src", "index.ts"),
    webpackOverride: (c) => c,
  });

  for (const id of COMPOSITIONS) {
    console.log(`\nRendering ${id}...`);
    const composition = await selectComposition({ serveUrl, id });
    const outputLocation = path.join(outDir, FILE_NAMES[id]);
    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation,
      overwrite: true,
    });
    console.log(`  -> ${outputLocation}`);
  }

  console.log("\nDone.");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
