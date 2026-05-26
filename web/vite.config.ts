import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// Build alongside the existing static app. The data files (maqam-compact.json,
// i18n.json) live at the repo root and stay the single source of truth — we
// alias `@data` to the parent dir and allow Vite to read it.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      // SW would cache aggressively during dev; keep it to production builds.
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icons/*.svg'],
      manifest: {
        name: 'Maqam Notes Player',
        short_name: 'Maqam',
        description: 'Explore Arabic maqamat — play their notes and hear the intervals.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#15110d',
        theme_color: '#15110d',
        icons: [
          { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Bundled JSON ships inside the JS chunk, so precaching the build = full offline.
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@data': fileURLToPath(new URL('..', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
})
