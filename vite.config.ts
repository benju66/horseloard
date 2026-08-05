/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * MG.7 collapsed the dual-build setup the migration ran on. `/` is the
 * Three.js game; game3d.html, the phaser chunk and the branch-local start_url
 * are all gone. Phaser was 1,208 KB of a 2,071 KB precache and the 3D build
 * never touched a byte of it.
 *
 * smoke3d.html and world3d.html survive as dev diagnostics. They are
 * deliberately not build inputs — they have no business in the bundle.
 */

export default defineConfig({
  // Stamped into the map select footer. A PWA behind a service worker can run
  // code that is days older than what main serves, and "is my phone on the new
  // build" must be answerable by looking at the screen, not by deduction.
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
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
        start_url: '/',
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
        // three is the largest chunk now, well under the 2 MB default, but a
        // .glb roster grows over time — keep headroom rather than discover the
        // ceiling as a silently unprecached asset.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // three is ~585 KB raw and irreducibly so; the 500 KB default would warn on
    // every build and train the warning out of meaning anything. 700 still
    // flags genuine bloat in the app chunk.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // three stays its own chunk: it is stable across releases, so a game
        // code change does not invalidate 148 KB of cached vendor bundle.
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
