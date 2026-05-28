<script lang="ts">
  // iOS push-capability gate (US3). Web Push on iOS requires 16.4+; below that
  // there is no background push, so notifications degrade to foreground polling.
  // Shown alongside the install coach (it does not block installing) so the user
  // knows what to expect before adding Ring to the Home Screen.
</script>

<aside data-testid="ios-version-gate">
  <strong>Heads up:</strong> push notifications require iOS 16.4 or later. On your iOS version Ring will
  still work, but new messages only arrive while the app is open (foreground polling) — not in the background.
</aside>

<style>
  aside {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    margin: 1rem 2rem 0;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: #fff4e5;
    color: #663c00;
    line-height: 1.5;
  }
</style>
