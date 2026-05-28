import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

const RING_VERSION = process.env.RING_VERSION || 'dev';
const RING_COMMIT = process.env.RING_COMMIT || 'unknown';

// Remote live-dev (make dev-remote): serve through a home reverse proxy at
// https://<RING_REMOTE_HOST> while keeping HMR. The proxy terminates TLS and
// forwards plain HTTP to this laptop, so the browser sees a secure context and
// the PWA (manifest + service worker) works. When RING_REMOTE_HOST is unset,
// everything below is inert — plain `make dev`, CI, and builds are unchanged.
const REMOTE_HOST = process.env.RING_REMOTE_HOST?.trim();
const DEV_PORT = Number(process.env.RING_DEV_PORT ?? 5173);
const PREVIEW_PORT = Number(process.env.RING_PREVIEW_PORT ?? 4173);
// Develop the PWA (live manifest + dev service worker) whenever we serve
// remotely, or on demand via RING_PWA_DEV=1.
const PWA_DEV = process.env.RING_PWA_DEV === '1' || !!REMOTE_HOST;

export default defineConfig({
  server: REMOTE_HOST
    ? {
        host: true, // bind 0.0.0.0 so the LAN / home proxy can reach the dev server
        port: DEV_PORT,
        strictPort: true,
        // The proxy may forward either the public Host or a rewritten upstream
        // Host; allow any for this opt-in, self-controlled dev tunnel.
        allowedHosts: true,
        // The page is served over HTTPS on 443 by the proxy, so the HMR client
        // in the browser must dial wss://<host>:443; the proxy upgrades that
        // websocket and forwards it back to this dev server.
        hmr: { host: REMOTE_HOST, protocol: 'wss', clientPort: 443 },
      }
    : undefined,
  preview: REMOTE_HOST
    ? { host: true, port: PREVIEW_PORT, strictPort: true, allowedHosts: true }
    : undefined,
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
      // In remote live-dev the PWA runs in dev so the manifest is live and the
      // app is installable with HMR. The dev service worker approximates — it is
      // not the byte-identical production Workbox precache (use dev-remote-prod
      // for that). Off by default so plain `make dev` stays SW-free.
      devOptions: { enabled: PWA_DEV, suppressWarnings: true, navigateFallback: '/' },
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
