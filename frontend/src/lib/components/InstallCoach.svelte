<script lang="ts">
  // Install-first coaching (US2). Two variants per contracts/onboarding-ui.md:
  //  - 'native'  → a captured beforeinstallprompt is available; show an Install
  //                button that triggers the browser's install flow.
  //  - 'ios'     → manual Share → "Add to Home Screen" (same path on all iOS browsers).
  import { promptInstall } from '$lib/pwa/install';
  import AddToHomeScreenIcon from '$lib/components/AddToHomeScreenIcon.svelte';
  import RingAppIcon from '$lib/components/RingAppIcon.svelte';
  import ShareActionIcon from '$lib/components/ShareActionIcon.svelte';

  let { variant }: { variant: 'native' | 'ios' } = $props();

  async function install() {
    await promptInstall();
  }
</script>

<section data-testid="install-coach">
  <header class="brand">
    <RingAppIcon />
    <h1>Install Ring</h1>
  </header>
  {#if variant === 'native'}
    <p>Install Ring on your device for the full, offline-capable experience.</p>
    <button data-testid="install-native" type="button" onclick={install}>Install</button>
  {:else}
    <p>Add Ring to your Home Screen to install it:</p>
    <ol data-testid="ios-steps">
      <li>
        Tap the
        <span class="action-ctl">
          <ShareActionIcon />
          <span class="action-label">Share</span>
        </span>
        button in the toolbar.
      </li>
      <li>
        Scroll down and tap
        <span class="action-ctl">
          <AddToHomeScreenIcon />
          <span class="action-label">Add to Home Screen</span>
        </span>.
      </li>
      <li>
        Tap <span class="action-label">Add</span> to finish.
      </li>
    </ol>
  {/if}
</section>

<style>
  section {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 1rem;
    line-height: 1.6;
    padding: 2rem;
    color: var(--ring-fg);
    background: var(--ring-bg);
    text-align: center;
    max-width: 30rem;
    margin-inline: auto;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  .brand {
    text-align: center;
    margin-bottom: 1.25rem;
  }

  .brand :global(.ring-app-icon) {
    margin-inline: auto;
    margin-bottom: 0.75rem;
  }

  h1 {
    font-size: 1.75rem;
    line-height: 1.25;
    margin: 0;
  }

  p,
  ol {
    font-size: inherit;
    color: var(--ring-fg);
  }

  ol {
    /* Centre the list as a block, but keep the steps themselves left-aligned. */
    display: inline-block;
    text-align: left;
    padding-left: 1.25rem;
    margin: 0;
  }

  li {
    margin: 0.5em 0;
  }

  .action-ctl {
    display: inline;
    white-space: nowrap;
  }

  .action-ctl :global(svg) {
    display: inline-block;
    width: 1em;
    height: 1em;
    vertical-align: -0.15em;
    margin-right: 0.2em;
  }

  .action-label {
    font-size: inherit;
    font-weight: 600;
  }

  button {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    font-size: inherit;
    border: none;
    border-radius: 0.5rem;
    background: var(--ring-btn-bg);
    color: var(--ring-btn-fg);
  }
</style>
