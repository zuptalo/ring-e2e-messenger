<script lang="ts">
  import { onMount } from 'svelte';
  import { initInstallCapture } from '$lib/pwa/install';
  // Generated PWA head links (apple-touch-icon + the iOS apple-touch-startup-image
  // splash set). Sourced from the build's pwaAssets config so the hrefs match the
  // emitted PNGs exactly (SC-009). Rendered into <svelte:head> so they land in the
  // prerendered HTML and iOS shows the launch image on first install.
  import { pwaAssetsHead } from 'virtual:pwa-assets/head';

  let { children } = $props();

  onMount(() => {
    // Capture beforeinstallprompt as early as possible (US2) so the install-first
    // gate can offer a native Install button when the browser supports it.
    initInstallCapture();

    // Register the generated service worker on first load (FR-002). Manual
    // registration (rather than the plugin's injected script) is the reliable
    // path with SvelteKit's prerendered output. registerType:'autoUpdate'
    // makes the SW skipWaiting + clientsClaim, so it controls the page.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Unsupported or insecure context — the app still renders; install-gating
        // and offline simply don't engage. (FR-011 handles the messaging.)
      });
    }
  });
</script>

<svelte:head>
  {#each pwaAssetsHead.links as link (link.href)}
    <link rel={link.rel} href={link.href} media={link.media} sizes={link.sizes} type={link.type} />
  {/each}
</svelte:head>

{@render children()}
