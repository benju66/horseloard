/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * While the 3D migration is in flight this config ships BOTH builds:
 * `/` is the Phaser game, `/game3d.html` is the Three.js one. That is what
 * lets the 3D build be installed and judged under real PWA conditions —
 * standalone display, safe-area insets, offline, production bundle — none of
 * which `vite dev` reproduces.
 *
 * MG.7 collapses this: index.html becomes the 3D build, game3d.html and the
 * phaser chunk both go away, and `start_url` returns to '/'.
 */
const MIGRATION_START_URL = '/game3d.html';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Horse Lord',
        short_name: 'Horse Lord',
        description: 'Ride. Shoot. Loot. Build.',
        orientation: 'portrait',
        display: 'standalone',
        background_color: '#1a2618',
        theme_color: '#1a2618',
        // Branch-local: an install from this build lands on the 3D game.
        // MG.7 reverts this to '/'.
        start_url: MIGRATION_START_URL,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,woff2}'],
        // Phaser is a single large chunk; raise the precache ceiling above it.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // Both entry points during the migration. The smoke test is deliberately
      // NOT here — it is a dev diagnostic and has no business in the bundle.
      // Relative to project root — avoids needing @types/node here.
      input: { main: 'index.html', game3d: 'game3d.html' },
      output: {
        // Split the two engines so neither build pays for the other's weight.
        manualChunks: { phaser: ['phaser'], three: ['three'] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
