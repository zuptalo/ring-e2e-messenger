<script lang="ts">
  // Install-first top-level view selection (US2, contracts/onboarding-ui.md).
  // The capability profile is UA/standalone-derived and only meaningful in the
  // browser, so it is computed after mount. Until then (and in the prerendered
  // HTML) we render the shell markers so the static payload still carries
  // "skeleton OK"/version/commit (FR-013, 001 marker contract) — but WITHOUT the
  // app-shell test id, since install-first means the real shell is reachable
  // only in standalone mode.
  import { onMount } from 'svelte';
  import { getCapabilityProfile } from '$lib/pwa/capability';
  import { installPromptEvent } from '$lib/pwa/install';
  import { runFirstStandaloneOnboarding, requestPersistentStorage } from '$lib/pwa/onboarding';
  import { logEvent } from '$lib/pwa/log';
  import InstallCoach from '$lib/components/InstallCoach.svelte';
  import IOSVersionGate from '$lib/components/IOSVersionGate.svelte';
  import { VERSION, COMMIT } from '$lib/version';

  let mounted = $state(false);

  // Recomputes when the captured install prompt arrives/clears (store dependency).
  const profile = $derived(mounted ? getCapabilityProfile($installPromptEvent !== null) : null);

  // iOS <16.4 has no Web Push (US3) — warn, composed with the install coach.
  const showVersionGate = $derived(
    !!profile && profile.isIOSSafari && !profile.isStandalone && !profile.pushCapable,
  );

  // 'standalone' | 'coach-native' | 'coach-ios' | 'unavailable' | null (pre-mount)
  const view = $derived.by(() => {
    if (!profile) return null;
    if (profile.isStandalone) return 'standalone';
    if (profile.installPromptAvailable) return 'coach-native';
    if (profile.isIOSSafari) return 'coach-ios';
    return 'unavailable';
  });

  onMount(() => {
    mounted = true;
    // First-launch durable storage request (US3); guarded to run once, app
    // proceeds regardless of the outcome (SC-006).
    requestPersistentStorage();
  });

  // Emit observability + run the post-install step exactly when the view settles.
  let lastLogged: string | null = null;
  $effect(() => {
    if (!profile || view === lastLogged) return;
    lastLogged = view;
    if (view === 'standalone') {
      runFirstStandaloneOnboarding(profile.pushCapable);
    } else if (view === 'unavailable') {
      logEvent('install.unavailable', profile.platform);
    } else {
      logEvent('coach.shown', view === 'coach-native' ? 'native' : 'ios');
    }
  });

  // The version gate is composed onto the coach view (US3); log it once shown.
  let gateLogged = false;
  $effect(() => {
    if (showVersionGate && !gateLogged) {
      gateLogged = true;
      logEvent('versiongate.shown', 'ios');
    }
  });
</script>

<svelte:head>
  <title>Ring</title>
</svelte:head>

{#snippet shell(testid: string | null)}
  <main data-testid={testid}>
    <h1>Ring</h1>
    <p>Version: {VERSION}</p>
    <p>Commit: {COMMIT}</p>
    <p>skeleton OK</p>
  </main>
{/snippet}

{#if view === 'standalone'}
  {@render shell('app-shell')}
{:else if view === 'coach-native'}
  <InstallCoach variant="native" />
{:else if view === 'coach-ios'}
  {#if showVersionGate}
    <IOSVersionGate />
  {/if}
  <InstallCoach variant="ios" />
{:else if view === 'unavailable'}
  <main data-testid="install-unavailable">
    <h1>Install Ring</h1>
    <p>Ring is a mobile app. Open this page in a supported mobile browser to install it.</p>
  </main>
{:else}
  <!-- Prerendered / pre-hydration: carries the markers (FR-013) but is not the
       gated app shell. -->
  {@render shell(null)}
{/if}

<style>
  main {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    padding: 2rem;
  }

  h1 {
    font-size: 2rem;
    margin: 0 0 1rem;
  }

  p {
    margin: 0.25rem 0;
  }
</style>
