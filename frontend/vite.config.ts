import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const RING_VERSION = process.env.RING_VERSION || 'dev';
const RING_COMMIT = process.env.RING_COMMIT || 'unknown';

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    'import.meta.env.VITE_RING_VERSION': JSON.stringify(RING_VERSION),
    'import.meta.env.VITE_RING_COMMIT': JSON.stringify(RING_COMMIT),
  },
  test: {
    include: ['tests/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
  },
});
