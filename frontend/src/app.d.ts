// Ambient types. The reference pulls in the `virtual:pwa-assets/head` module
// declaration (vite-plugin-pwa) so +layout.svelte can inject the generated
// apple-touch-icon + iOS apple-touch-startup-image link set with filenames that
// match the build output (SC-009). tsconfig pins an explicit `types` list, so
// this reference is needed to surface the ambient declaration.
/// <reference types="vite-plugin-pwa/pwa-assets" />

declare global {
   
  namespace App {}
}

export {};
