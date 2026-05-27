<script lang="ts">
  import { VERSION, COMMIT } from '$lib/version';
</script>

<svelte:head>
  <title>Ring</title>
</svelte:head>

<main>
  <h1>Ring</h1>
  <p>Version: {VERSION}</p>
  <p>Commit: {COMMIT}</p>
  <p>skeleton OK</p>
</main>

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
