<script lang="ts">
  // In-app launch splash shown on standalone launch (the native iOS
  // apple-touch-startup-image can carry neither dynamic text nor controlled
  // timing). Fades in, holds a random ~1–2s, fades out, then removes itself.
  // Decorative: aria-hidden, and it respects prefers-reduced-motion.
  import { onMount } from 'svelte';
  import RingAppIcon from '$lib/components/RingAppIcon.svelte';
  import { VERSION } from '$lib/version';

  let visible = $state(true);
  let hiding = $state(false);

  onMount(() => {
    const total = 1000 + Math.random() * 1000; // total visible time, 1–2s
    const fadeOut = 450;
    const t1 = setTimeout(() => (hiding = true), Math.max(0, total - fadeOut));
    const t2 = setTimeout(() => (visible = false), total);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  });
</script>

{#if visible}
  <div class="splash" class:hiding aria-hidden="true" data-testid="splash">
    <RingAppIcon />
    <div class="wordmark">Ring</div>
    <div class="version">{VERSION}</div>
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: var(--ring-bg);
    color: var(--ring-fg);
    animation: splash-in 0.35s ease-out both;
  }

  .splash.hiding {
    animation: splash-out 0.45s ease-in forwards;
  }

  .splash :global(.ring-app-icon) {
    width: 6rem;
    height: 6rem;
    border-radius: 1.35rem;
  }

  .wordmark {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 1.75rem;
    font-weight: 700;
  }

  .version {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 0.85rem;
    color: var(--ring-muted);
  }

  @keyframes splash-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes splash-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .splash,
    .splash.hiding {
      animation: none;
    }
  }
</style>
