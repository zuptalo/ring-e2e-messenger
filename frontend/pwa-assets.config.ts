import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Single source of truth: every install icon, the maskable icon, the Apple
// touch icon, and the iOS launch/splash image set are generated from
// static/icon.svg at build time by the pwaAssets integration (see
// vite.config.ts), output at the web root so the manifest's root-relative icon
// paths resolve. FR-001 / FR-017 / SC-009.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // iOS home-screen launch (splash) images. A representative set of current
    // iPhone/iPad device sizes (logical CSS px + device scaleFactor); the
    // generator emits portrait + landscape PNGs at the physical resolution
    // (width*scaleFactor) plus the media-query apple-touch-startup-image <link>
    // tags (injected into app.html). AppleDeviceSize requires width/height/
    // scaleFactor objects — bare [w,h] tuples are silently ignored.
    appleSplashScreens: {
      padding: 0.3,
      sizes: [
        { width: 320, height: 568, scaleFactor: 2 }, // iPhone SE (1st)
        { width: 375, height: 667, scaleFactor: 2 }, // iPhone 8 / SE 2-3
        { width: 414, height: 736, scaleFactor: 3 }, // iPhone 8 Plus
        { width: 375, height: 812, scaleFactor: 3 }, // iPhone X/XS/11 Pro/12-13 mini
        { width: 414, height: 896, scaleFactor: 2 }, // iPhone XR/11
        { width: 414, height: 896, scaleFactor: 3 }, // iPhone XS Max/11 Pro Max
        { width: 390, height: 844, scaleFactor: 3 }, // iPhone 12/13/14
        { width: 393, height: 852, scaleFactor: 3 }, // iPhone 15/16
        { width: 428, height: 926, scaleFactor: 3 }, // iPhone 12-14 Pro Max
        { width: 430, height: 932, scaleFactor: 3 }, // iPhone 15/16 Plus/Pro Max
        { width: 768, height: 1024, scaleFactor: 2 }, // iPad mini/Air
        { width: 834, height: 1194, scaleFactor: 2 }, // iPad Pro 11"
        { width: 1024, height: 1366, scaleFactor: 2 }, // iPad Pro 12.9"
      ],
      linkMediaOptions: { log: false, addMediaScreen: true, basePath: '/', xhtml: false },
      png: { compressionLevel: 9, quality: 60 },
      // Pin the filename so the emitted PNGs and the generated head links agree.
      // The default name includes a `light-`/`dark-` segment only when `dark` is a
      // boolean; the file emitter passes `undefined` (omits it) while the head-link
      // builder passes `false` (includes it) — the mismatch 404s the prerender.
      // Dropping the segment entirely (no dark variant configured) keeps both sides
      // consistent.
      name: (landscape, size) =>
        `apple-splash-${landscape ? 'landscape' : 'portrait'}-${size.width}x${size.height}.png`,
    },
  },
  images: ['static/icon.svg'],
});
