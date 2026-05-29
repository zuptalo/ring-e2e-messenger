<script lang="ts">
  import { onMount } from 'svelte';
  import '$lib/theme.css';
  import { initInstallCapture } from '$lib/pwa/install';
  import { VERSION } from '$lib/version';

  let { children } = $props();

  onMount(() => {
    // Fill the launch-splash version (the shield lives in app.html, before hydration).
    const v = document.getElementById('ring-shield-version');
    if (v) v.textContent = VERSION;

    // Capture beforeinstallprompt as early as possible (US2) so the install-first
    // gate can offer a native Install button when the browser supports it.
    initInstallCapture();

    // Register the generated service worker on first load (FR-002). Manual
    // registration (rather than the plugin's injected script) is the reliable
    // path with SvelteKit's prerendered output. registerType:'autoUpdate'
    // makes the SW skipWaiting + clientsClaim, so it controls the page.
    // In dev (make dev-remote, PWA devOptions) vite-plugin-pwa serves a dev
    // service worker at /dev-sw.js?dev-sw; production serves the precache SW at
    // /sw.js. With strategies:'generateSW' BOTH are classic workers (the dev SW
    // uses Workbox's importScripts/self.define shim) — registering the dev SW as
    // a module throws "Module scripts don't support importScripts()" on its first
    // activation, which breaks the page after the next reload.
    if ('serviceWorker' in navigator) {
      const swUrl = import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js';
      navigator.serviceWorker.register(swUrl, { scope: '/', type: 'classic' }).catch(() => {
        // Unsupported or insecure context — the app still renders; install-gating
        // and offline simply don't engage. (FR-011 handles the messaging.)
      });
    }
  });
</script>

{@render children()}

<style>
  :global(body) {
    margin: 0;
    background: var(--ring-bg);
    color: var(--ring-fg);
  }
</style>
