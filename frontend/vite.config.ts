import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

const RING_VERSION = process.env.RING_VERSION || 'dev';
const RING_COMMIT = process.env.RING_COMMIT || 'unknown';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: false, // registered manually in +layout.svelte (SvelteKit prerender)
      pwaAssets: { config: true }, // pwa-assets.config.ts → icons + iOS splash, injected into the manifest
      manifest: {
        name: 'Ring',
        short_name: 'Ring',
        description: 'Ring — encrypted messenger',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0f1c2e',
        background_color: '#0f1c2e',
      },
      workbox: {
        // Precache the prerendered shell + immutable client assets (offline, SC-002).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff,woff2,json}'],
        // Take control of open pages as soon as the SW activates so the page is
        // controlled after the first reload (FR-002).
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  define: {
    'import.meta.env.VITE_RING_VERSION': JSON.stringify(RING_VERSION),
    'import.meta.env.VITE_RING_COMMIT': JSON.stringify(RING_COMMIT),
  },
  test: {
    include: ['tests/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
  },
});
