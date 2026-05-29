<script lang="ts">
  // Home-screen / manifest icon (generated from static/icon.svg).
  let { class: className = '' }: { class?: string } = $props();
</script>

<img
  src="/apple-touch-icon.png"
  alt=""
  width="90"
  height="90"
  class="ring-app-icon {className}"
  decoding="async"
/>

<style>
  .ring-app-icon {
    display: block;
    width: 5rem;
    height: 5rem;
    border-radius: 1.125rem;
  }
</style>
