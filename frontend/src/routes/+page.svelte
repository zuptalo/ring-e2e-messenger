<script lang="ts">
  // Install-first top-level view selection (US2, contracts/onboarding-ui.md).
  import { browser } from '$app/environment';
  import { getCapabilityProfile } from '$lib/pwa/capability';
  import { installPromptEvent } from '$lib/pwa/install';
  import {
    enterStandalone,
    requestNotificationPermission,
    skipNotificationPermission,
    requestPersistentStorage,
    loadOnboardingState,
    type NotifPermission,
  } from '$lib/pwa/onboarding';
  import { logEvent } from '$lib/pwa/log';
  import InstallCoach from '$lib/components/InstallCoach.svelte';
  import IOSVersionGate from '$lib/components/IOSVersionGate.svelte';
  import RingAppIcon from '$lib/components/RingAppIcon.svelte';
  import { VERSION, COMMIT } from '$lib/version';

  // FR-013 markers live in a hidden block so curl/integration tests still find
  // them in the initial HTML without flashing version info pre-install.
  const markers = {
    title: 'Ring',
    version: VERSION,
    commit: COMMIT,
    marker: 'skeleton OK',
  } as const;

  // Sync on first client init (not onMount) so hydration matches ring-boot.js.
  let client = $state(false);
  if (browser) client = true;

  // Reactive standalone (display-mode) flag. Initialised synchronously so a clean
  // standalone launch paints the app shell immediately, then kept live so the
  // desktop "install reparents this tab into an app window" transition flips the
  // view to the app shell without a manual refresh.
  let standalone = $state(
    browser &&
      (window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true),
  );

  $effect(() => {
    if (!browser) return;
    const mq = window.matchMedia('(display-mode: standalone)');
    const sync = () =>
      (standalone =
        mq.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    mq.addEventListener('change', sync);
    window.addEventListener('appinstalled', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('appinstalled', sync);
    };
  });

  const profile = $derived(
    client ? getCapabilityProfile($installPromptEvent !== null, standalone) : null,
  );

  const showVersionGate = $derived(
    !!profile && profile.platform === 'ios' && !profile.isStandalone && !profile.pushCapable,
  );

  // Grace window for the "already installed" heuristic: a not-yet-installed
  // Chromium fires beforeinstallprompt shortly after load, so only conclude
  // "installed" once that window has elapsed with no prompt — otherwise we'd
  // briefly mislabel an installable browser as installed before its prompt fires.
  let promptGraceElapsed = $state(false);
  $effect(() => {
    if (!browser) return;
    const t = setTimeout(() => (promptGraceElapsed = true), 1200);
    return () => clearTimeout(t);
  });

  const view = $derived.by(() => {
    if (!profile) return null;
    if (profile.isStandalone) return 'standalone';
    if (profile.installPromptAvailable) return 'coach-native';
    if (profile.platform === 'ios') return 'coach-ios';
    // Chromium with no prompt (post-grace) ⇒ the PWA is already installed; it
    // can only be relaunched from the OS, so point there. Safari/Firefox fall
    // through to the generic install fallback.
    if (profile.isChromium && promptGraceElapsed) return 'installed';
    return 'unavailable';
  });

  // Notification permission for the standalone onboarding-final step. Initialised
  // from durable state; updated by the user-gesture handlers below. The prompt is
  // a tap (not an auto-request) because iOS Safari standalone requires a gesture.
  let notifPermission = $state<NotifPermission>(
    browser ? loadOnboardingState().notificationPermission : 'default',
  );
  const needNotif = $derived(
    view === 'standalone' &&
      !!profile?.pushCapable &&
      notifPermission === 'default' &&
      browser &&
      typeof Notification !== 'undefined',
  );

  async function enableNotifications() {
    notifPermission = await requestNotificationPermission();
  }
  function skipNotifications() {
    notifPermission = skipNotificationPermission();
  }

  $effect(() => {
    if (!browser || !client) return;
    requestPersistentStorage();
  });

  let lastLogged: string | null = null;
  $effect(() => {
    if (!profile || view === lastLogged) return;
    lastLogged = view;
    if (view === 'standalone') {
      enterStandalone(profile.pushCapable);
      // Pick up a 'skipped' recorded for push-incapable platforms so the prompt
      // card stays hidden there.
      notifPermission = loadOnboardingState().notificationPermission;
    } else if (view === 'unavailable') {
      logEvent('install.unavailable', profile.platform);
    } else if (view === 'installed') {
      logEvent('install.detected', 'installed');
    } else {
      logEvent('coach.shown', view === 'coach-native' ? 'native' : 'ios');
    }
  });

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

<div id="ring-markers" hidden aria-hidden="true">
  {markers.title}
  Version: {markers.version}
  Commit: {markers.commit}
  {markers.marker}
</div>

{#if client && profile}
  {#if view === 'standalone'}
    <main data-testid="app-shell">
      <h1>Ring</h1>
      <p>Version: {VERSION}</p>
      <p>Commit: {COMMIT}</p>
      <p>skeleton OK</p>
      {#if needNotif}
        <section class="notif-card" data-testid="notif-prompt">
          <p>Turn on notifications so Ring can alert you to new messages.</p>
          <div class="notif-actions">
            <button data-testid="notif-enable" type="button" onclick={enableNotifications}>
              Enable notifications
            </button>
            <button
              class="secondary"
              data-testid="notif-skip"
              type="button"
              onclick={skipNotifications}
            >
              Not now
            </button>
          </div>
        </section>
      {/if}
    </main>
  {:else if view === 'coach-native'}
    <InstallCoach variant="native" />
  {:else if view === 'coach-ios'}
    {#if showVersionGate}
      <IOSVersionGate />
    {/if}
    <InstallCoach variant="ios" />
  {:else if view === 'installed'}
    <main class="install-hero" data-testid="install-installed">
      <RingAppIcon />
      <h1>Ring is installed</h1>
      <p>
        Open Ring from your dock, apps, or home screen — or use your browser's "Open in app" button
        in the address bar.
      </p>
    </main>
  {:else if view === 'unavailable'}
    <main class="install-hero" data-testid="install-unavailable">
      <RingAppIcon />
      <h1>Open or install Ring</h1>
      <p>
        Already installed Ring? Open it from your dock or apps, or use your browser's "Open in app"
        button. Otherwise install it with Chrome or Edge, or add it to your Home Screen on iOS.
      </p>
    </main>
  {/if}
{:else}
  <!-- Prerender / pre-hydration: ring-boot.js + CSS show the matching block. -->
  <main class="ring-boot-shell" data-testid="app-shell">
    <h1>Ring</h1>
    <p>Version: {VERSION}</p>
    <p>Commit: {COMMIT}</p>
    <p>skeleton OK</p>
  </main>
  <section class="ring-boot-coach install-hero" data-testid="install-coach">
    <img class="ring-app-icon" src="/apple-touch-icon.png" alt="" width="90" height="90" />
    <h1>Install Ring</h1>
    <p>Add Ring to your Home Screen to install it.</p>
  </section>
  <main class="ring-boot-unavailable install-hero" data-testid="install-unavailable">
    <img class="ring-app-icon" src="/apple-touch-icon.png" alt="" width="90" height="90" />
    <h1>Open or install Ring</h1>
    <p>
      Already installed Ring? Open it from your dock or apps, or use your browser's "Open in app"
      button. Otherwise install it with Chrome or Edge, or add it to your Home Screen on iOS.
    </p>
  </main>
{/if}

<style>
  main,
  section {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    padding: 2rem;
    color: var(--ring-fg);
    background: var(--ring-bg);
  }

  h1 {
    font-size: 2rem;
    margin: 0 0 1rem;
  }

  p {
    margin: 0.25rem 0;
    color: var(--ring-muted);
  }

  main[data-testid='app-shell'] p {
    color: var(--ring-fg);
  }

  .install-hero {
    text-align: center;
    max-width: 30rem;
    margin-inline: auto;
  }

  .install-hero :global(.ring-app-icon),
  .install-hero .ring-app-icon {
    display: block;
    width: 5rem;
    height: 5rem;
    margin-inline: auto;
    margin-bottom: 0.75rem;
    border-radius: 1.125rem;
  }

  .install-hero h1 {
    margin: 0 0 0.75rem;
  }

  .notif-card {
    margin-top: 1.5rem;
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    background: var(--ring-accent);
  }

  .notif-card p {
    margin: 0 0 0.75rem;
    color: var(--ring-fg);
  }

  .notif-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .notif-card button {
    padding: 0.6rem 1rem;
    font: inherit;
    border: none;
    border-radius: 0.5rem;
    background: var(--ring-btn-bg);
    color: var(--ring-btn-fg);
    cursor: pointer;
  }

  .notif-card button.secondary {
    background: transparent;
    color: var(--ring-muted);
    border: 1px solid var(--ring-muted);
  }
</style>
