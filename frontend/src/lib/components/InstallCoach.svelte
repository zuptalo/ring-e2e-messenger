<script lang="ts">
  // Install-first coaching (US2). Two variants per contracts/onboarding-ui.md:
  //  - 'native'  → a captured beforeinstallprompt is available; show an Install
  //                button that triggers the browser's install flow.
  //  - 'ios'     → iOS Safari, where A2HS cannot be triggered programmatically;
  //                show the manual Share → "Add to Home Screen" steps.
  import { promptInstall } from '$lib/pwa/install';

  let { variant }: { variant: 'native' | 'ios' } = $props();

  // Trigger the captured native prompt. The post-install onboarding-final step
  // (first standalone launch) emits `install.completed`; this only kicks off the
  // browser's install flow.
  async function install() {
    await promptInstall();
  }
</script>

<section data-testid="install-coach">
  <h1>Install Ring</h1>
  {#if variant === 'native'}
    <p>Install Ring on your device for the full, offline-capable experience.</p>
    <button data-testid="install-native" type="button" onclick={install}>Install</button>
  {:else}
    <p>Add Ring to your Home Screen to install it:</p>
    <ol data-testid="ios-steps">
      <li>Tap the <strong>Share</strong> button in the toolbar.</li>
      <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
      <li>Tap <strong>Add</strong> to finish.</li>
    </ol>
  {/if}
</section>

<style>
  section {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    padding: 2rem;
  }

  h1 {
    font-size: 1.75rem;
    margin: 0 0 1rem;
  }

  ol {
    line-height: 1.8;
    padding-left: 1.25rem;
  }

  button {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    border: none;
    border-radius: 0.5rem;
    background: #0f1c2e;
    color: #fff;
  }
</style>
