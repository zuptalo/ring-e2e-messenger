<script lang="ts">
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(() => {
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

{@render children()}
